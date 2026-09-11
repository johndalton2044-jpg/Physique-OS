# Architecture roadmap

This document answers a full architecture audit of Physique OS 1.0. The audit's central finding is correct
and worth stating plainly:

> The sophisticated decision/learning architecture is substantially ahead of the persistence/integration
> architecture supporting it.

That framing decided what was built. The intelligence layer did not need more features; the platform under it
needed to stop being the weakest part. Everything below is organised by what is *true of the shipped build*,
not by what is planned.

---

## Implemented

### Persistence is now proportional to the change (§3)

The audit's complaint was exact: every save serialized the whole record and wrote it twice, so write cost
scaled with the database rather than the mutation.

What replaced it:

* **Collections are stored and written individually.** A weight entry writes the observation store and a
  ~1.2 KB metadata blob — not the food log, not the archive, not the prediction ledger.
* **The three unbounded collections** — observations, food logs, sessions — **are sharded by calendar
  month.** Collection-level granularity alone was not enough: at five years the observations array holds
  18,000 entries, so appending one weigh-in still rewrote all of it.
* **Which shards can have changed is decided by the save label,** which was already semantic
  (`observation:weight`, `food-log`, `phase:edit`). An append touches the current month. A correction,
  retraction or bulk operation says so in its label and re-checks every shard. An unrecognised label marks
  everything dirty, so a new label is *slow rather than wrong*.
* **A content digest suppresses writes that would change nothing,** so a pessimistic label costs a hash, not
  a write.
* **A full-document checkpoint is still written every 25 saves**, so recovery never depends on the shard
  layout being intact, and boot falls back to it when the layout is incomplete.

Measured (`npm run perf:full`), on a synthetic record of daily use:

| operation | 1 year | 5 years | 10 years |
|---|---|---|---|
| incremental save | 5.5 ms | 10.7 ms | 38.4 ms |
| whole-record write | 32.8 ms | 87.4 ms | 217.1 ms |
| serialize whole record | 13.4 ms | 77.8 ms | 254.7 ms |

The incremental write is now roughly flat where the whole-record path scales linearly. At ten years and
37,000 observations it is 5.7× cheaper.

### Performance is a gate, not an assumption (§75, §76)

`tests/perf.mjs` builds synthetic records at 1, 5 and 10 years — including corrections, retractions, phase
edits and scored predictions, so the temporal machinery is exercised rather than bypassed — and fails the
build if any of fourteen operations exceeds its budget. The budgets are deliberately generous: they catch
order-of-magnitude regressions, not machine variance.

### Adversarial testing, and the XSS it found (§77, §78)

`tests/adversarial.mjs` runs 45 checks: 27 malformed or hostile import documents, 400 structurally fuzzed
records, prototype-pollution attempts, oversized and deeply nested fields, the encrypted-backup boundary, and
audit-chain tampering.

**It immediately found a real cross-site-scripting vulnerability.** The Plan view interpolated the profile
name into a disclosure summary without escaping, so a name containing `<img src=x onerror=...>` executed on
render. Two fixes went in: the call site now escapes, and `uiFold` escapes any signal that still contains a
tag or event-handler attribute after the caller had its chance — a caller that genuinely wants markup must
now say so explicitly. That converts one bug into a closed class.

### Content Security Policy (§7)

The shipped page carries a 12-directive policy defaulting to `default-src 'none'`. **`script-src` pins the
inline bundle by SHA-256 hash** rather than allowing inline script generally, so injected `<script>` cannot
execute. `object-src`, `base-uri`, `form-action` and `frame-ancestors` are all `none`; `connect-src` is
`'self'`, so the record cannot be posted elsewhere.

The build computes the hash, verifies after writing that it matches the shipped script (a mismatch would mean
the page refuses to run its own code), and the gate re-verifies independently.

`style-src` still needs `'unsafe-inline'`, because the interface uses `style=""` attributes throughout. That
is a real and stated limitation, not an oversight.

### Encrypted backup (§5, §6)

AES-GCM-256 with a PBKDF2-SHA256 key at 310,000 iterations (OWASP's current guidance). The envelope declares
its algorithm and parameters and carries no plaintext. A wrong passphrase and a damaged file are
indistinguishable to the algorithm, so the error says both rather than guessing. A tampered ciphertext is
refused by the authentication tag. There is no passphrase recovery, and the UI says so before exporting.

Plaintext JSON export remains the default, because portability is the point of a backup.

### Storage and quota management (§62, §63)

A storage panel reports record size, the incremental-versus-whole-record write mix, the food shard cache, and
the origin quota with a pressure level. It offers writing a checkpoint, and **deleting the cached food
database** — the largest and most disposable consumer of the origin quota, and redownloadable public data
rather than anything the user logged.

### Integrity severity and invariant monitoring (§71, §72, §73)

Contained errors are now classified P0–P3. A failed write and a failed chart are no longer filed together:
P0 is escalated to the user rather than merely counted.

`integrityCheck(stage)` runs on boot and on demand, checking collection shapes, duplicate and missing ids,
non-finite values, malformed dates, retractions without a retraction date (which would leave replay unable to
place them in time), and phases without edit history. **A P0 on boot suspends saving entirely** until the
user has exported — writing a damaged record back over the durable copy turns a detectable problem into a
permanent one.

### Tamper-evident audit chain (§46, §47)

An append-only log of what happened *to the record*, distinct from the domain ledger of what happened to the
body. Each entry carries the SHA-256 hash of the previous one, so altering or removing a past entry breaks
the chain and `verifyAuditChain()` reports where. Where SHA-256 is unavailable (non-secure context) the chain
degrades to a non-cryptographic digest and **says so** rather than implying a guarantee it isn't providing.

---

### Event sourcing (§48, §49, §163) — implemented

Previously deferred as "a rewrite of every mutator". It was, and it is done. Every mutation primitive now
emits an event describing what happened rather than what the record became: 28 event types across
observations, sessions, food, phases, programs, decisions, interventions, predictions, experiments,
negatives, snapshots and profile.

The document remains the working representation, because every model and view reads it. What changed is
where the truth lives:

* `projectEvents()` folds an event sequence into a document.
* `projectionMatchesRecord()` asserts that projecting the whole log reproduces the live record, field for
  field. **This is the only honest proof that the log is complete** — a mutator that forgets to emit shows up
  immediately as a diff, and the gate runs it against the demo record on every build.
* `replayAgreement(date)` asserts that replaying through the log and replaying through knowledge dates agree
  at every date, across corrections, retractions, food-log edits and deletions.

**A snapshot is itself an event.** A record can enter the app without passing through the mutators — the demo
generator, a restore, a boot from a build predating the log. Pretending the log describes such a record would
make the log a lie, so `resetEventLog()` restarts it from a stated `record.snapshot` baseline. That keeps the
completeness proof universal instead of exempting the awkward cases from it, which is how such proofs usually
rot.

### Multi-tab and multi-device merge (§4) — implemented

With events as the unit of exchange, merging is well defined where merging snapshots was not:

* **union by event id** — a duplicate id is the same fact seen twice, never a conflict;
* **total order by (timestamp, device, sequence)**, so every participant converges on the same ordering;
* **concurrent edits to the same target are detected and surfaced**, never silently resolved.

Boot now merges the persisted log rather than adopting a rival snapshot, so a second tab can no longer
discard the first tab's work. Verified with the audit's own scenario: Tab A edits weight, Tab B edits food,
both survive. Two devices correcting the same observation within an hour produces a reported conflict with
both corrections retained.

A local device identity orders events without a server. `BroadcastChannel` carries this between tabs
automatically; between devices, a sync envelope is exported and imported as a file. A network transport would
implement the same three methods and nothing above it would change.

### Intelligence tranche (§52–§59, §111–§114, §150, §166) — implemented

* **Scenario engine** — complete plans compared under one set of model versions, ranked by *expected*
  outcome, which discounts the projected rate by how likely the person is to execute the plan. The best plan
  on paper and the best plan for you are different questions.
* **Monte Carlo forecasting** — a distribution rather than an interval, sampled from this record's own rate
  uncertainty, week-to-week variation and scale noise. Deterministic for a given record, because a forecast
  that changes when you reopen the app is not a forecast.
* **N-of-1 interrupted time series** — measured against the *projected pre-change trend* rather than the
  pre-change mean, with a washout so carry-over is not counted as effect, and an effective sample size
  discounted for autocorrelation. Daily weight is not independent day to day, and pretending it is
  manufactures certainty.
* **Experiment design and power** — duration derived from the person's own noise, and a design that cannot
  detect its own effect is **refused** rather than recommended. An experiment too short to answer its question
  produces a confident-looking null, which is worse than running none.
* **Episodes** — a phase is what you planned; an episode is what happened. Travel, illness, plateaus,
  training breaks and logging gaps, each inferred from records already kept and stating what it was inferred
  from.
* **Personal knowledge with decay** — what the record has established, the context it was learned in, whether
  it transfers, and a 270-day half-life, because a finding from a different body weight in a different phase
  is a different finding. Plus a knowledge-gap register naming the questions the record cannot yet answer.

### Integration layer (§12, §13, §21, §118, §122–§124) — implemented as far as a browser allows

No wearable API is called, because that needs platform credentials. What was built is the part that decides whether
external data is safe to accept:

* a canonical schema every source normalises into, at the boundary, once;
* **deduplication** by external id and by near-identical value, so the same weigh-in from two paths is one
  fact;
* **source reconciliation** — three devices reporting 178.4, 178.6 and 179.0 is one weight with disagreement,
  trust-weighted, with the disagreement reported rather than hidden;
* **source reliability learning** — a scale that reads consistently high against a reference is an offset
  that can be corrected for;
* working file importers for Apple Health export XML and generic CSV, because a file needs no credentials;
* every import is **previewed before anything is written**, and an imported value never loses its provenance.

Also: `BarcodeDetector` where the browser has it and manual entry where it does not; a photo vault storing
blobs outside the record document so exports stay small; and local notifications that state plainly that
without a push server delivery cannot be guaranteed once the app is closed.

## Deferred, with reasons

**Whole-record serialization on the main thread.** Sharding cut what is *written*; the digest of each shard
still costs CPU proportional to that shard. Eliminating it needs record-level dirty tracking on top of the
event log — now possible, but it is an optimisation rather than a correctness fix, and the budgets are met.

**CRDT-grade automatic conflict resolution.** The merge is a union with detection and reporting. Automatic
field-level resolution would need per-field causal metadata, and silently resolving a disagreement between
two of your own devices is exactly the behaviour the audit criticised.

---

### A sync server, accounts and hosted backup (§2, §80, §81) — built and tested

Previously listed as needing "a server and an operational security posture." The server is now written and
runs: `server/server.mjs`, zero dependencies, Node's own http and crypto so the whole trust surface reads in
one sitting.

It is a mailbox that cannot read its mail. Events are encrypted client-side with AES-GCM under a key derived
from a recovery phrase that never leaves the device. There are no passwords and no email addresses; an
account is a vault id plus device public keys, and authentication is a signature over a single-use challenge.

`npm run cloud:e2e` proves it rather than asserting it: two independent clients, a real server, real
encryption. Client A creates a vault and uploads; the test asserts the ciphertext on disk contains **no**
plaintext and the server log contains none either; client B joins with the same phrase, is refused until
authorised by A, then pulls and decrypts the actual value; both make concurrent edits and converge; the vault
is deleted. It runs in `npm run check`.

What the server still learns — vault existence, event counts, sizes and timing — is documented in
`docs/server-operations.md` rather than glossed over, along with what running it on the open internet
responsibly requires (TLS at a proxy, supervision, backups, disk monitoring, real rate limiting).

### Push while closed (§10, §11) — built

Also previously listed as impossible. The browser will not run a closed app's code, but a push service will
wake it. The server implements Web Push with VAPID; the service worker handles `push` and
`notificationclick`, and registers for `periodicsync` where Chromium offers it. Pushes are **bodiless** by
design, so neither the push service nor the sync server learns anything beyond "something is waiting".

### Voice, labels and wearable shapes (§13, §98, §99, §12) — the testable parts, built

Each of these splits into a part needing hardware or credentials and a part that does not — and the second is
where the difficulty actually lives:

* **Voice**: the microphone needs the Web Speech API; turning "log 180 grams of chicken breast for lunch"
  into a structured proposal needs a parser, which is pure and fully tested. Two real bugs surfaced there:
  stripping punctuation destroyed decimals (221.4 became 221) and a blanket pluraliser turned "lunch" into
  "lunchs". Dictation produces a *proposal* that must be confirmed — a misheard number landing unseen in the
  record is a silent corruption.
* **Nutrition labels**: reading pixels needs OCR; turning panel text into nutrients needs a parser, which is
  tested — including a consistency check that flags a panel whose macros cannot produce its stated calories.
  No OCR engine is bundled: a multi-megabyte opaque dependency inside a hash-pinned single file is a worse
  trade than accepting text from the platform that already does it well.
* **Wearables**: the OAuth handshake needs client credentials that identify the *deployment*, not the user,
  and cannot be published in a public single-file app. The response adapters — Fitbit, Withings, Oura — are
  implemented and tested against recorded fixtures, and feed the same preview-first import pipeline a file
  does. An API gets no privileges a file would not.

### AH-102 yields (§14) — extracted, verified, and shipped

My earlier claim was that the handbook's numeric columns "OCR unreliably". **That was wrong**, and the reason
matters: I had rendered it at 130 DPI. At 300 DPI the columns are legible.

So I built `scripts/ah102-extract.mjs` with dual-pass OCR (different segmentation and binarisation) requiring
exact agreement, plus structural and physical validation. It extracted values that were verified, internally
consistent — and **wrong**. Item 326 came out as a 30% yield when the true figure is 70%, because the parser
locked onto the *net-loss* column. Both passes agreed, because both read the same wrong column.

That is the real obstacle, and it is not OCR fidelity: **agreement proves transcription, not column
semantics**. Distinguishing the yield column from the loss column needs table geometry that line-based OCR
has already discarded. Successive guards (reject rows with multiple numeric groups; reject rows with a stray
number before the matched group) cut acceptance from 26% to 5% and did make the surviving *numbers*
trustworthy — but the surviving *descriptions* remain garbled, and a yield factor you cannot attach to a food
is not usable.

So I wrote the program that keeps the geometry. `scripts/ah102-geometry.mjs` reads Tesseract's TSV output,
which carries a bounding box per word, clusters numeric x-positions into columns, and works in coordinates
rather than in strings.

The decisive part is how it identifies the yield column. A geometric guess (the widest gap) picked a
temperature column on the meat pages, which have a layout the vegetable pages do not. So it does not guess:
**the table's own arithmetic identifies its columns.** Yield and loss are the pair of bands whose values sum
to about 100 across the most rows. That is invariant to layout differences between sections, and a pair that
fails it is not the pair being looked for.

That single change took acceptance from 5% to 83%. On the eight pages where the string parser had produced
wrong values, seven of eight rows with independently known truth now match exactly (items 363, 423, 448, 430,
431, 432, 433). Every shipped row is confirmed by its own loss column summing to 100.

**542 verified yield factors now ship** in `dist/data/reference/yields.json`, covering pages 20–72, reachable
from Log → Raw to cooked, and used by `applyYield()`. Where two page ranges disagreed on an item, the item was
dropped rather than a winner picked.

Pages 73–131 were extracted and then **excluded**: on those pages the item-number column is misread, producing
62 rows carrying only 17 distinct item numbers. A yield attributed to the wrong item is worse than a missing
one, so the range is left out and the reason recorded. Rows that could not be confirmed are absent, and an absent item reports that it
could not be verified — explicitly *not* the same as a yield of 1.0.

Two honest limits remain. The OCR descriptions are often partial, so `findYields()` returns candidates for a
person to choose between rather than picking one. And on pages carrying two complementary yield/loss pairs
(lean versus lean-and-fat cuts), both pairs sum to 100, so the extractor may select a different column than a
human reading the header would — item 326 comes out as 72% where the lean-meat column reads 70%. Both are
real figures from that row; which one is wanted depends on the cut. The item number and page are recorded so
the handbook can settle it.

## Not buildable in this architecture

These are not backlog items. They require infrastructure this application does not have and cannot acquire by
writing more client code, and listing them as "planned" would be dishonest:

* **Hosting.** The server is written and tested; running it publicly needs a machine, a domain, TLS and
  someone accountable for it. That is an operational commitment, not code.
* **Vendor API credentials** (§12) — a client id and secret identify the deployment and cannot be published.
  The adapters are built; the credentials are supplied by whoever runs it. Every one of these vendors also
  exports a file, and file import is complete.
* **Bundled OCR** (§98) — declined rather than impossible. The parser accepts text from any source.
* **FNDDS, DSLD, retention factors, AH-102 yields** (§14) — adapters and builder scripts ship; the data does
  not. AH-102 in particular is a scan whose numeric columns OCR unreliably, and a wrong yield factor silently
  misstates every cooked-food entry.

The intelligence proposals (§52–§59, §150, §166, and the rest) are genuinely good and mostly buildable in
this architecture. They were not built here because the audit's own priority ordering put the platform first,
and because adding more inference on top of a persistence layer that had just been shown to be the weakest
component would have repeated the mistake the audit identified.

---

## What the shipped build now asserts about itself

```
npm run check       build → engine → interface → adversarial → verify
npm run check:full  the above, plus the 1/5/10-year performance budgets
```

* engine gate — DOM-free, derives its file list from `src/`
* interface gate — boots the built artifact in jsdom
* in-app self-test — runs inside the application, in both gates
* adversarial suite — import boundary, fuzzing, injection, crypto, audit chain
* performance suite — fourteen operations against budgets at three record sizes

Counts are deliberately not written here. Each gate reports its own, because a number in prose goes stale the
moment a test is added.
