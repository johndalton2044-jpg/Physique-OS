> **This is a development history, not the current inventory.** Statements here ("still open", counts, "not yet gated")
> describe the moment they were written. For what the system is now, see docs/SYSTEM_AUTHORITY.md and the generated
> catalogue (docs/implementation/baseline.json).

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
emits an event describing what happened rather than what the record became: 44 event types (43 active, 1 deprecated) across
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

**537 verified yield factors now ship** in `dist/data/reference/yields.json`, covering pages 20–72, reachable
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

### The loop is now domain-general (expansion catalogue A–Z)

A later catalogue proposed twenty-six engines — sleep, recovery, cardio, injury, cost, inventory, schedule,
meal planning, and so on. Building twenty-six of anything by hand produces twenty-six slightly different
conventions, and the catalogue's own closing argument says why that is the wrong move:

> The domain currently surrounding that loop is primarily physique. **But the loop itself is domain-general.**

So what was built is the **domain registry**, not another engine beside the loop. A domain declares what it
observes, what state it computes, what it concludes, what it would advise, and what it cannot answer yet. The
loop runs it. Adding cardio, cost or inventory now costs a declaration rather than a subsystem, and each one
inherits — without asking — the epistemic classes, uncertainty discipline, temporal replay, knowledge decay,
attention queue and value-of-information ranking that already exist.

Two rules are enforced rather than documented:

* **A domain cannot write.** It returns findings and proposals; the existing mutation primitives and the user
  decide. The contract test fails a domain that declares a mutation hook, and the gate asserts that running
  the whole loop leaves the record and the event log untouched. This is the catalogue's own rule ("do not
  allow arbitrary direct mutation", "AI should produce a proposal, then a registered action") applied to
  every domain including the ones I wrote.
* **A domain that observes a type which does not exist fails registration**, loudly. That is the failure
  mode hardest to notice otherwise: a domain that silently never fires.

**Ten domains now run on it** — injury, recovery, sleep, activity, cardio, composition, equipment,
schedule, cost and supplies — and eight of them fit in a single file, because none re-implements
uncertainty, replay, knowledge decay, the attention queue or value-of-information ranking. That ratio is the
whole argument for building the registry before the engines.

Priorities encode judgement rather than taste: injury runs at 10, recovery at 20, optimisation-type domains
at 40–80. Pain outranks rate.

Two domains prove the contract, chosen because the catalogue calls them out specifically:

**Sleep (E)** stops being an observation and becomes a model: debt against *your own* target or average
rather than a population figure, consistency as distinct from mean, and a lagged within-person analysis of
short nights against long nights. On the demo record it finds next-day fatigue running about a point higher
after short nights across 41 paired days (d≈0.7). It reports that as a **correlation and says why** —
nobody randomises their own sleep, and a short night and a hard day often share a cause. A window with no
variation in sleep is refused rather than fitted.

**Injury and load (J)**, which the catalogue calls "a major missing domain", records where and how much, then
matches it against the movements in your plan through the patterns the exercise ontology already declares,
counts loading exposure from your own session log, and proposes substitutions that avoid the region. It runs
at a higher priority than optimisation, because pain outranks rate. It **will not name a condition**, grade a
severity medically, or estimate a healing time — the gate asserts no clinical condition name appears
anywhere in its output. The one thing it says about the world beyond the record is that six weeks of pain is
long enough to be looked at by somebody qualified.

### What the further domains each refuse to do

The pattern that matters is not what they compute, it is what they decline to claim:

* **Recovery** judges against your own middle for each signal, because a 6 out of 10 means nothing until the
  system knows what your 6 usually is.
* **Activity** reports volume, consistency and drift, and says plainly that steps cannot distinguish useful
  activity from restless activity. The finding worth having is the one it can support: activity quietly
  falling while the deficit runs.
* **Cardio** states that the record holds no heart rate or pace, so nothing it says describes intensity. Where
  volume is high and strength is falling it calls the timing *consistent with* interference — and with
  several other things.
* **Composition** reports the offset between two measurement methods on overlapping dates, which is the
  difference between "I gained fat" and "I changed calipers". It will not mix methods.
* **Cost** reports its own coverage and refuses to extrapolate: a daily figure from a fifth of your food is a
  guess with a decimal point on it.
* **Equipment** translates the profile's setting into the ontology's vocabulary, and where it cannot,
  reports **unknown rather than absent**. This one was a real bug first: comparing the stored setting
  ("commercial gym") against implement names ("barbell") declared 26 movements impossible in a fully
  equipped gym. Claiming you lack equipment you never said you lacked is worse than saying nothing.
* **Schedule** reports planned days and actual days separately rather than averaging them, because adherence
  measured against a schedule that never fitted describes the schedule.
* **Supplies** forecasts depletion from the rate you have actually been consuming, and says that this is only
  as good as the logging behind it.

### Generation (B1, B2, C1, C3, C4, T)

Five generators, all of which **propose and never write**. A generated plan or meal day is a candidate the
user accepts through the ordinary registered action.

The discipline they share: a generator that always returns something is useless, because it cannot tell you
when your constraints are impossible. Seven training days on bodyweight alone returns **impossible** with the
reason, rather than a plan you cannot perform.

* **Program generation** builds candidate weeks from the days you actually train (taken from the session log,
  not from intention), the equipment you have, and the movements a sore region rules out. Candidates are
  scored on movement coverage and weekly sets, and the score is shown — a plan you cannot audit is a plan
  you have to trust.
* **Adaptive progression** judges each lift against **its own noise floor**. A slope smaller than the
  week-to-week noise of that lift is not a trend, and progressing into it is how people accumulate fatigue
  and call it training. Two global brakes — depressed readiness, or a plan being completed under 60% of the
  time — hold everything, because progressing into a depressed baseline measures the baseline.
* **Meal planning** builds days against the phase targets from foods already in your list, weighted towards
  what you actually eat, because familiarity predicts adherence better than macros do.
* **Grocery generation** aggregates a chosen day across a week, reports how much of it is priced, and states
  that the quantities assume perfect adherence — an upper bound.
* **Plan search** explores 74 combinations of calorie, step and cardio changes and returns the **Pareto
  frontier**: every plan where nothing else is better on both expected outcome and burden. It returns a
  frontier rather than a winner because weighting outcome against burden is the user's trade, not the
  system's. Plans outside the rate band are excluded rather than listed with a warning — putting something
  on a recommended list and then warning about it invites choosing it.

Three real bugs surfaced here, all found by reading the output rather than the code: progression silently
produced no reasons at all (the rows carry a slope and a noise floor, not a `direction`, so every branch fell
through); the meal planner returned **352 g of protein against a 195 g target and called it a hit**, because
each portion was sized to a fixed maximum rather than to the remaining need; and the calorie fill drew from
the same protein-ranked list, so it either overshot protein or left 1,400 kcal unfilled.

### Knowledge graph, causal grading, experiment library and discovery (A1, A4, W, X)

**The graph (A1)** makes explicit what the record already contained implicitly. Every edge is derived from
something recorded — an experiment naming a variable, an intervention sharing a date with a decision —
never because two things look related. The result is walkable in reverse:

```
what it learned   steps: supported
  outcome         supported
  experiment      Add steps, hold calories
  observation     20 body weight readings during it
  intervention    steps 7500 → 9500
  decision        Add steps, hold calories
  findings        trend, waist, intake coverage, step average
```

**Causal grading (A4)** answers the catalogue's demand that this must not be "AI says X causes Y". It grades
what the record can support — contradicted, unknown, confounded, correlated, weakly supported, supported —
and the **ceiling is "supported", never "proven"**: nothing in a personal record is randomised, so a
repeated, clean, unconfounded response is the most that can honestly be claimed. A variable never changed on
its own reads *unknown* rather than being scored from correlation.

**The experiment library (W)** carries the things people forget: a washout, the confounders to avoid, and a
reversal condition. A template is explicitly *not a protocol* until its duration is computed from this
person's own measurement noise.

**Discovery (X)** finds the questions worth asking rather than evaluating the ones already started, ranked by
what each would resolve against what it costs. The highest-value question is usually where the record is
**confounded** rather than where it is silent — a confound can be designed away.

Four bugs surfaced here, all from reading output: the graph declared an `observation` node kind it never
populated, because an experiment's `metric` is a human label ("weight trend (lb/week)") and was being passed
to `obsOf()` where it matched nothing; discovery led with questions that could not be run; a design with no
effect estimate fabricated a minimum detectable difference of zero and then declared the experiment "not
worth running", blaming the experiment for a gap in the system's own knowledge; and a non-runnable question
was listed with no reason because the blocker read a field that insufficient designs do not have.

### The Movement Engine

The specification for this was emphatic about the architecture, and correct:

> I would NOT make these six separate engines... That would fragment the architecture. Instead: one
> underlying Movement Engine with specialised domains.

So there is no stretching engine, yoga engine or warm-up engine. There is **one ontology in which a movement
has roles**, and the same physical movement carries different roles depending on why it is being done. A leg
swing is preparation before a squat session and mobility work on a rest day; the movement is identical and
the meaning is not. Fourteen roles across four phases — prepare, perform, recover, adapt.

**Dose is not one number.** Thirty minutes of restorative yoga and thirty minutes of hard calisthenics are
both half an hour and nothing else about them is alike, so every record carries five separate dimensions —
stimulus, fatigue, mobility, skill, cardiovascular — which are **never summed**. Collapsing them is exactly
what makes the two look interchangeable.

**Preparation is derived, not prescribed.** It reads the session about to be performed, what is sore, and how
you have been feeling, and every block states why it is there. On an ordinary day it is three blocks and nine
minutes; with a sore shoulder and readiness two standard deviations down it becomes thirteen minutes, adds
activation for the sore region, and the ramp goes from four steps to six at lower jumps. When nothing warrants
more, it says so — a warm-up that is the same every day is a ritual rather than preparation.

**Observation is not diagnosis.** The engine records that a measurement fell. It will not conclude that a
structure is deficient, and the gate asserts that no diagnostic vocabulary appears in its output. The
assess → intervene → reassess loop reports a change **alongside the work recorded between**, and where no
work was recorded it says the change is not evidence that anything worked.

**Progressions are graphs with a stated limiter**, because the useful question is not "what is next" but
"what is holding me here" — and strength and practice are reported separately rather than merged.

### A serious bug this uncovered

Testing backdated movement records exposed a flaw in the event architecture itself. A snapshot fold
**replaces** the document, so an event stamped earlier than a snapshot was discarded by it. Logging
yesterday's weigh-in produces an event stamped yesterday; a demo load, restore or compaction snapshot taken
today then wiped it. **Backdated entries were silently vanishing from the projection**, and the app supports
backdating everywhere.

Snapshots are now barriers: an event emitted after one is folded after it whatever its own timestamp says,
while replay continues to use the entry's own knowledge date. Timestamp ordering is untouched elsewhere, so
cross-device merge is unaffected.

Two smaller ones in the same pass: readiness read a `median` field that `personalBaselines` does not expose,
so every z-score was null — and a null score was still being labelled "about your normal", a confident
statement assembled from nothing.

### The assistant layer (P, Q, R)

The catalogue draws the boundary and it is the right one: *the deterministic engine computes, the AI
explains, mutations go through registered actions.* Three things were built and a fourth deliberately was
not.

**Q — questions answered from the record.** No model is involved. "What is my trend", "what is my
maintenance", "does steps work", "what should I test next" all return a value with the same epistemic class,
basis and trace as anything else in the app. An unanswerable question says what it would need; an unmatched
one offers what *can* be answered rather than improvising. This is most of what people actually want from
asking their data a question.

**P — a context packet and a contract.** The packet is bounded and honest about what it withholds: no
identifiers, no free-text notes, no food names unless explicitly requested, with the redactions listed. The
contract states what a model may do (explain a figure already present, point at an offered action, say it
does not know) and may not (compute a number, state a figure not in the context, assert causation beyond the
grade the record supports, give medical advice, write to the record).

**The validator is what makes attaching a model defensible.** Every reply is checked against the packet
before display: a figure that is not in the context is **rejected rather than corrected**, because a
plausible wrong number is worse than no answer. A lying adapter was tested — it claimed a maintenance of
9,999 kcal and that something was "proven" — and was discarded in favour of the deterministic answer.

**R — evidence linking** against the citation registry already shipped, including the part usually left out:
which general claims have nothing behind them. Claims about your own record need no citation and are not
asked for one.

**No model is wired in, and nothing pretends one is.** An adapter can be registered; until one is, the app
answers from the record or says it cannot.

Three bugs from this pass, each the same shape as ones found earlier: the clinical guard used `tendin\b`,
which does not match "tendinitis" — the exact word it existed to catch; the maintenance answer called a
different function than the interface, so the same person could get two different figures on the same day;
and the packet offered 41 "actions" that were palette closures rather than registered actions, so a model
could have proposed something the app cannot dispatch.

### The reconstruction boundary

An external review found the sharpest remaining temporal defect, and its framing was exactly right: *a
snapshot should establish a boundary, not manufacture knowledge before it.*

`record.snapshot` is written when a record is **adopted** — restored, imported, demo-loaded, or migrated
from a version with no event log. It is a baseline rather than a change, so the projection folds it whatever
the replay date. For observations that is harmless: each carries its own date and `createdAt`. For the
**profile** it is not, because a profile has no effective date per field. A record adopted in September
therefore made September's height and age appear to have been known in February — and height feeds BMR feeds
maintenance feeds the calorie target feeds the decision.

The previous fallback made this worse by design. `profileAsOf()` ended with "if the projection yields nothing,
return the current profile", and the comment beside it argued that a slightly stale profile beat an empty
one. That was wrong: an empty profile makes `bmrPrior()` report insufficient, which is true, while a stale
one produces a confident historical energy figure that is false.

Now:

* `recordBaseline()` reports the date a record entered the event history, and whether it was adopted.
* Before that date the profile resolves to **unavailable**, so every model downstream reports insufficient
  rather than a fabricated number.
* Observations before the baseline stay visible — only state that cannot be reconstructed is withheld.
* The replay banner says so plainly, naming the date and the reason.
* A record whose log genuinely covers earlier ground is **not** restricted; the baseline moves back to the
  first real event.

The demo needed a change rather than an exemption: it now seeds a `profile.changed` event on its first day,
so it is a record that *grew* rather than one adopted today, and its replay works throughout.

**Auxiliary state joined the same rule.** Photos, skills and inventory were read from current settings, so a
photo added today appeared in last month's replay and an item removed today vanished from it. All three take
an as-of date now. One subtlety worth recording: the skills accessor had an early return guarded by
`on >= todayISO()`, and `todayISO()` is itself as-of aware — inside a replay it equals `on`, so the shortcut
returned today's states every time.

### Quick Log is transactional

Fields were written straight through `addObservation`, which pushes to the record **and** emits an event. A
later field failing validation rolled the record back with a splice and left the events behind, so the live
record and the projection disagreed inside the session, and persisting the log could resurrect an entry the
user had abandoned. Fields are staged now and nothing is written until every one has passed.

### The yield table satisfies its own check

Five of the 542 shipped factors failed the `yield + loss ≈ 100` test that every row's own `verification`
field asserts — the original cross-check tolerance was looser than the claim printed beside each row.

They were **dropped rather than repaired**. Repairing means choosing which of the two numbers to believe, and
only the source images can settle that. The app already refuses to invent a yield of 1.0 for a missing item;
shipping a row that fails its own stated check is the same error wearing a number. 537 factors ship, the gate
runs in `npm run check`, and coverage now describes what shipped (33 distinct pages spanning 20–70) rather
than the span that was read.

Documented counts are audited against the build, because both the roadmap and the external review had the
event-type count wrong, in different directions.

### The model contract is a typed graph

The last open finding from the external review: contract validation matched **vocabulary**, not wiring. A
consumer passed if its string merely contained one of a handful of words — "view", "profile", "trend",
"training" — so a model could name a consumer that does not exist and still be declared contract-clean.

Every declared input and consumer now has to resolve to a concrete node: another model, a declared
observation type, a real view, a function that genuinely exists, a named profile field, a known record
collection, or a known session field. 80 nodes, 184 edges, nothing unresolved, no orphan models.

Declarations carry both halves in one string — `today|Today vitals` — so the prose people read cannot drift
away from the reference the machine checks. A parallel documentation field would have drifted.

Migrating 25 models surfaced 94 references that resolved to nothing, and one instructive self-inflicted bug:
the bulk rewrite that mapped prose to references also rewrote the **vocabulary lists themselves**, so
`PROFILE_FIELDS` briefly contained `'profile.age|age'` and every profile reference failed. A validator whose
own vocabulary has been corrupted reports confident, uniform failure — which looks exactly like a real
finding.

### Resistance depth (continued-work catalogue §3)

The catalogue names its own rule — *do not build each item as an isolated feature* — and its own ordering,
which puts Resistance Depth first. So §3.1–§3.12 are one ontology with models layered on it, not twelve
features.

The honesty problem specific to this domain decides how much of it can be believed, and it is stated in the
module rather than buried: **almost every quantity here derives from three numbers a person typed** — load,
reps, and a subjective effort rating. Estimated 1RM is a population formula. "Effective sets" is a modelling
convention whose evidence base is contested. Fatigue is an accounting scheme, not a biopsy. Each carries the
class that reflects that, and none is dressed as MEASURED.

* **Biomechanics** (§3.2) come from the movement pattern, overridden per exercise where the exercise really
  differs, with the implement overriding the curve where it should — a band makes a lengthened-biased
  pattern shortened-biased. Override keys are validated against the ontology at load, because an override
  that silently never matches is worse than none: it reads as covered.
* **The resistance curve** (§3.3) says where a lift is hardest and *where that claim came from*. Curve
  coverage reports when a muscle is only ever trained shortened — reported as an imbalance, not a
  prescription, because the evidence for lengthened-biased work is suggestive rather than settled.
* **The set ontology** (§3.4) is what makes volume mean anything: twenty kinds, each declaring whether it
  counts toward volume and what it costs. A warm-up single tallied as a working set is how weekly totals
  become fiction.
* **Effort** (§3.5) treats RPE and RIR as one axis and widens the interval as reps-in-reserve rise, because
  people are good at telling 0 from 2 and poor at telling 4 from 6.
* **Strength** (§3.8) inverts rep maxes from e1RM and **refuses above fifteen reps**, where the formula
  stops meaning anything. Fixed-path implements are reported as not comparable to free weights.
* **Effective sets** (§3.9) shows raw counts beside the weighted ones so the weighting can be disagreed
  with, and reports how many sets had no recorded kind or effort.
* **Progression** (§3.12) names the scheme it used and why, and a depressed readiness holds everything.

**The ontology needed capture or it would be decoration.** Every set row now carries a set-kind selector, and
the save path carries kind, ROM and tempo through — the first attempt recorded the kind in the edit buffer
and dropped it on save, so the control worked and changed nothing.

### Mobility, flexibility and practice depth (catalogue §5–§9)

Built as depth underneath the existing movement engine rather than beside it — the roles, phases and
five-dimension dose already existed. Two distinctions from the catalogue change what can honestly be claimed:

**Flexibility is not mobility.** Passive range is what a joint permits when something else moves it; active
range is what you can produce yourself. The gap between them is the useful number, because it says which
lever applies: a large gap is strength at length, not tightness. They are reported separately and never
averaged, and an unmeasured joint reads as **unknown rather than fine**.

**A pose is not a stretch.** A yoga sequence carries strength, balance and skill demands as well as range, so
a sequence answers "what did this actually train" across four demands and carries the same five-dimension
dose as anything else. A strength-oriented flow reads as strength work, not as stretching.

Eleven joints, seven mobility dimensions, eleven stretch kinds each with a starting dose and a stated effect,
ten poses with sanskrit aliases, and three sequences. Ballistic stretching is **discouraged rather than
merely listed**. Anything whose guidance is not plainly "appropriate" before lifting is warned about — the
first implementation matched a few phrases and let "better after" pass as fine, which is the opposite of what
it says.

Flexibility response pairs measured range change with recorded exposure, and where no exposure was recorded
it says the change is not evidence that anything worked.

### Skill graph and session composition (catalogue §4, §12, §14)

**The limiter is the point of a skill graph.** "Next: handstand" is not actionable; "you are strong enough
for this pattern but have never measured the mobility it needs" is. Eleven families now, each step declaring
demands across strength, balance, mobility and technique, and each axis reporting the evidence behind it or
saying there is none. The axis with a real demand and nothing behind it is named — and the engine states
that naming it is **not the same as proving it is the cause**. Depressed readiness vetoes a skill attempt
outright rather than joining the ranking, because a skill attempted tired teaches the compensation.

**Composition is about what to leave out.** Ten block types, and the generator decides which belong today:
assessment only when something is genuinely due, skill only before fatigue, conditioning only when the week's
cardiovascular exposure is low and readiness allows, practice never on a lifting day because it competes with
recovery from it. Every excluded block is listed with its reason.

It also **fits its own budget**. The first version reported "65 minutes of a 60-minute session", which is not
a composition — it is a list with the arithmetic left to the reader. Optional blocks are now dropped in
reverse priority, each removal recorded with what it cost, and the session and its preparation are never
dropped.

**Movement quality observes without diagnosing** (§14): it records that range was reduced and refuses to say
whether a joint, a muscle or a decision caused it.

One bug worth recording: widening the progressions sheet to all eleven families made `progressionStatus()`
return null for the seven it had never heard of, because it read only its own four. The fix was at the source
rather than in the caller.

### Conditioning, cardio and interference (catalogue §16–§18)

**Conditioning and cardio are different questions.** Cardio asks how much aerobic work was done; conditioning
asks what you can repeat and how fast you recover between efforts. Separated because they progress
differently — work capacity is a property you build, aerobic minutes are a dose you accumulate — and
because conflating them hides the one that matters for training.

**A session with no heart rate, pace or effort rating cannot be placed in a zone**, and the engine says so
rather than inferring intensity from duration. It also reports how much of the record has no intensity at
all: on the demo, eleven of eleven sessions, so any claim about intensity distribution would be invented.

§18 is the one with teeth, and the catalogue's instruction decides it: *use personal evidence rather than
generic assumptions.* The interference effect is real in the literature and routinely overstated in practice.
An app announcing "your cardio is killing your gains" from a textbook would be doing the opposite of what
this system is for. So it compares **your own higher-cardio weeks against your own lower-cardio weeks**,
names the confounds (a deficit suppresses strength independently of cardio), and reports "no detectable
difference" as the absence of an effect large enough for your record to see — **not as proof there is none**.
Where the answer is confounded it says what would settle it.

Timing is checked before anything is recommended, because moving cardio off lifting days is the cheapest
thing to try and is often the whole answer.

One modelling bug worth recording: the first version averaged estimated one-rep maxima **across different
lifts**, so a week containing more squats read as a stronger week and the resulting "effect" measured the
schedule rather than the person. It reported +54 lb; comparing within a single lift gives +12. Averaging a
squat max and a bench max into one number is not a smaller error than the effect being measured.

### Nutrition intelligence (catalogue §25.2–§25.4, §59, §60)

The food layer was already strong on provenance and basis. What sat above it was missing: substituting one
food for another while preserving what the meal was FOR, scaling and costing a recipe, and reconciling a
shopping list against the cupboard.

**Meal role is the thing a substitution must preserve.** Swapping a protein anchor for something of matching
calories and a quarter of the protein preserves the arithmetic and destroys the meal. So substitutions come
from the same role, similarity is computed per 100 kcal (the comparison that survives portion size), and the
suggested portion is the one that preserves the nutrient the food was there for.

**Frequency is reported as frequency.** A log says what somebody ate, which is a function of habit, price,
convenience and what was in the fridge. Calling that preference and optimising against it would quietly
narrow a diet to whatever was eaten most in the last two months, so nutritional fit ranks first and
familiarity only breaks near-ties.

**Recipe optimisation changes one ingredient at a time** and reports every macro, not just the objective —
an optimisation that reports only what it improved hides what it cost.

Three bugs, each found by reading output:

* A boiled vegetable at 28 kcal per 100 g was classified as an **energy base**, because it is mostly
  carbohydrate by share. An energy base now has to carry energy.
* The substitution list printed scores running 0.965, 0.960, 0.969. The comparator was **intransitive** —
  "within a tolerance, prefer the familiar one" means A ties B and B ties C while A and C do not, which makes
  the result of a sort undefined. Similarity is bucketed into bands first, so fit decides the band and
  familiarity orders within it.
* Foods whose measurement basis cannot be converted are excluded and counted rather than silently converted,
  which is the same rule the food layer already applied to millilitres and grams.

### Cross-domain integration (catalogue §19, §20, §42)

Every domain until now answered its own question. This answers the one none of them can alone: given sleep,
soreness, fatigue, stress, motivation, appetite, activity, performance and accumulated load **together**,
what state is this person in, how confident can that be, and what is limiting it?

**A single recovery number is the wrong output**, and the reason is not aesthetic. Sleep debt, a deficit,
accumulated load and low motivation all depress the same composite, and none of them responds to the same
intervention. So the composite exists and is reported **alongside** the limiting factors, each carrying its
own remedy, rather than instead of them.

**Confidence follows coverage.** A state assembled from two of nine signals is a guess wearing a percentage,
and it refuses rather than producing one.

Training load counts lifting, movement work and cardio through **one** dose model, which is the payoff for
having built five dimensions rather than a minutes counter. The acute-to-chronic framing is reported as a
description of what changed, not as a risk score — its predictive value for injury is contested.

§42 asks whether knowledge still applies. "Increasing steps helped during a 190 lb cut" is not "increasing
steps helps", so each item is compared across phase, weight zone, calorie level, training volume and sleep
state. Knowledge that may not transfer is called **unproven here** rather than wrong.

**The bug worth a permanent test:** injecting a week of fatigue at nine and sleep at five made the recovery
score go *up*. The baseline was being computed from the same days being judged, so a sustained shift was
absorbed into its own reference — latest equals baseline, deviation zero. The fallback baseline now comes
from a longer history with the recent week excluded, and where that does not exist the signal is dropped
rather than compared against itself. A self-test asserts that worsened signals lower the score.

### Optimisation, the state model and adaptive capture (catalogue §32–§34, §38)

The last three, and the three most able to mislead, so each carries a constraint.

**§32 states its own rule**: never collapse the dimensions into one score. Plans are compared across expected
outcome, burden, time, cost, fatigue and equipment feasibility, and the output stays a frontier — weighting
outcome against time against money is the user's trade. A dimension with no data is **left out of the
comparison rather than filled with a default**, because a default would make the frontier look richer than
the evidence behind it. On the demo, two of seven dimensions are unavailable and are named.

**§34 is the convergence point, and its honest limit is its own fidelity.** A simulation is only as good as
the response estimates underneath it, and most of those are population priors until a personal experiment
replaces them. So the state model reports the share resting on the person's own evidence, and that share
governs how far it should be trusted. Below it, `simulateChange()` refuses outright when nothing personal
underpins it: projecting the literature onto someone and calling it their forecast is the specific failure
this whole system exists to avoid.

**§38 gives one answer rather than a list.** Asking for everything every day is how logging becomes a chore
and then stops, so the single most decision-relevant missing measurement is chosen by value against burden —
and it admits that it can only ask about what it can see is missing.

Three phrasing bugs, all in the honesty layer rather than the arithmetic: outcomes printed to fifteen
decimals; a fidelity sentence reading "100% rest on your own evidence; **the rest** are population starting
points"; and a 100% share computed from a single measured response being treated as equivalent to one
computed from five. The last is the substantive one — 100% of one is not 100%, and trustworthiness is now
downgraded when the base is that narrow.

### Gap closure — the thirteen missing sub-features

A coverage probe against the catalogue found 104 of 110 sections implemented (the other six are process and
documentation), but sampling the sub-features underneath eight of them found 29 of 42 present. Those thirteen
are now closed. Two deserved more care than the rest, and the care is the implementation rather than a
disclaimer bolted on:

**§24 — a photo comparison must not tell someone their body changed.** Two photographs differ from lighting,
posture, time of day, hydration, camera distance and lens long before anything about the person has. So the
system standardises capture conditions and judges whether two photos are **comparable** — it never renders a
verdict on the body. Matched conditions read as comparable; a change of lighting is called out as changing
the picture more than a fortnight of training does; different views are refused outright. Beside the pictures
it puts what the tape and the scale did over the same interval, so there are numbers rather than an opinion.

**§65 — a streak counter is a guilt mechanic when it is built to be defended.** Breaking a long run makes
people abandon the record entirely, which is the worst outcome available, since a record that stops is worth
nothing. Consistency is a proportion, a run is shown because it is interesting and explicitly not as
something to protect, and the drop-off signal exists to suggest a **smaller target** rather than to say
anything about somebody's discipline.

**§73 produced a genuine design finding rather than a bug.** The guard written to enforce "background jobs
do not write" immediately caught one stamping new forecasts — the system committing to predictions the
person never saw, then later grading itself on them. The rule is now precise: a background run may record the
outcome of a commitment already shown, and may not make a new one. Stamping happens when a decision is
actually put in front of someone.

The remaining ten: power, distance and pace on cardio records; recovery and behaviour experiment templates;
candidate explanations beside detected anomalies; logging-habit coverage with the weakest day named;
user-authored rules kept as evidence of their own kind and never overwritten by a model output.

### Two mathematical defects found by external audit

Both were real, both reproduced exactly as described, and both sat in the **population fallback** — the path
that fires precisely when there is no personal evidence to contradict it.

**Counterfactual sign inversion.** Steps encoded expenditure as positive; cardio and training encoded it as
negative. The conversion `effect = -kcal * 7 / 3500` therefore flipped for two of the four levers, so the
system told people that **adding cardio or training would make them gain weight**. One sign convention now
governs all four: positive kcal means additional expenditure or reduced intake, and therefore a more negative
trend. A test asserts that no energy lever can ever project slower loss when it is increased.

**Monte Carlo goal direction.** The goal-reached condition keyed off the sign of the current trend rather
than the position of the goal relative to current weight. A goal of 180 while weighing 200 and gaining was
scored as `x >= 180` — true in essentially every draw — and reported as near-certain success. The condition
now follows `goal < current → end <= goal`, and a trend moving away from the goal is **stated outright**
rather than left to be inferred from a small probability.

### Gate status

Browser and iOS capability, and the device checklist, are **certified externally**. The three rows previously
marked UNVERIFIED for layout, touch-target geometry, VoiceOver, Dynamic Type, safe areas and the standalone
PWA lifecycle are closed by that certification rather than by anything in this environment — jsdom resolves
the cascade but does no layout, and no browser binary is obtainable here.

What remains genuinely unverified here is **production-origin cloud sync**: proven against a real server over
localhost, not over HTTPS behind a reverse proxy.

### Estimator rigour (audit §7, §9, §10)

The three model-rigour findings I had previously deferred. Each was a defensible method applied with more
confidence than it earned, and **every fix reduces the app's apparent certainty rather than increasing it**.

**§7 — 3,500 kcal/lb was applied as an exact constant.** That is the energy density of *adipose tissue*,
not of the mixture a person actually loses; lean tissue is mostly water and runs nearer 700. So the
conversion is now composition-aware: the fat share moves with body-fat level, rate of loss, protein
adherence and whether resistance training is happening, and the result carries a range. On the demo it
returns **3,108 kcal/lb (2,688–3,444)** against the naive 3,500 — an 11% difference that propagates directly
into every maintenance estimate, which is exactly why it should not be quoted as a constant. The bare literal
is gone from every energy path; only the definition remains.

**§10 — a personal response from one observation was passed downstream at face value.** The correct
treatment of a single noisy estimate is neither to believe it nor to discard it, but to **shrink it toward
the prior** in proportion to how much it can carry. On the demo, a single steps observation of −0.366
lb/week per unit shrinks to −0.189 at 33% personal weight. No estimate is ever allowed past 95% personal,
because a personal record is not a randomised trial however many observations accumulate.

This is the honest answer to the "response matrix with one entry" problem I raised earlier: the entry still
counts, it just does not get to speak as though it were five.

**§9 — change detection used a t threshold of 1.2 with no autocorrelation correction.** Consecutive daily
weights are strongly correlated, so treating them as independent inflates the statistic. The lag-one
correlation on the demo series is **0.90**, which means a nominal n of 45 is an effective n of **2.4** —
roughly 80% of the apparent sample is redundant. Applying the standard first-order correction and a
threshold of two rather than 1.2, the one detected change point falls from t=1.83 to t=0.42 and **correctly
disappears**. Points that only cleared the old threshold are reported as downgraded rather than dropped
silently.

### Conformance audit: the architecture outran its own models

A mechanical audit against the project's two stated pipelines found exactly the asymmetry it was built to
look for. The **cognitive loop was satisfied end to end globally — 14 of 14 stages** — while **no domain
conformed fully to the plugin pipeline**. The best managed 8 of 11, and every single domain failed at the
same stage: **decision**.

Domains produced proposals and nothing consumed them. The pipeline said *domain → decision* and that arrow
did not exist. That is the difference between an architecture and a diagram.

Three kinds of gap came out of it, and they needed different answers:

**The arrow was genuinely missing**, so it was built. `domainDecisionInputs()` ranks proposals by the domain's
own declared priority — injury at 10 outranks optimisation at 70, because a sore knee is a better reason to
change course than a trend being slightly off band — and `decisionWithDomains()` shows domain reasoning
beside the rate decision rather than merged into it. Merging them would hide which one moved.

**Some failures were data absence wearing the costume of an architectural gap.** `cost` has no prices on the
demo record, so its state is `insufficient` and carries no class, and the first version of the audit scored
that as a missing uncertainty stage. A state that resolves must carry a class; a state that cannot resolve
must say what it needs. Both are uncertainty-aware, and confusing an empty record with a shallow estimator is
the precise error this audit exists to avoid.

**Some stages were inapplicable rather than forgotten.** `activity` derives entirely from step observations
and owns no mutable state, so inventing an `activity.changed` event to satisfy a checklist would be ceremony
pretending to be rigour. Domains now DECLARE that they derive, and the auditor only accepts a declaration it
can verify against the build. Likewise `inventory` declares itself inexperimentable with a reason — how fast
a tub empties is arithmetic, not a hypothesis about a body — and an undeclared gap and a justified exclusion
no longer look the same.

All eleven domains now conform 11/11, and `npm run conformance` runs in the check chain.

**Model depth was the other half.** Eleven engines carried a class but no interval and no stated sample size.
The composites were the worst of them: a readiness score is a weighted mean of z-scores, and eight signals
agreeing is a different claim from three pulling in opposite directions. Both now carry an interval derived
from how much their parts disagree, and say which case you are looking at.

One of those fixes immediately told an uncomfortable truth. Movement dose reported 100% intensity coverage
because it counted only movement records — while the week's dose came almost entirely from lifting sessions
entering at an *assumed* intensity. Counted honestly across everything contributing, coverage is **0%**.

### Ontology → physiology propagation (Work.md)

Work.md states its own thesis better than a summary would: *"the ontology is ahead of the physiological
model"*, and *"information exists → information is classified → information is not fully operationalized."*

The exercise ontology already carried pattern, muscles, equipment, skill, ROM, stability, biomechanics,
resistance curve, set type, RIR/RPE, tempo, load and reps. Downstream, nearly everything collapsed back to
sets, load, reps and e1RM. The chain the document asks for is built now, once, so the engines above stop
re-deriving thin versions of it:

```
exercise mechanics → joint/muscle exposure → mechanical demand → stimulus → fatigue → recovery cost
```

A set now yields four separable demands — **mechanical** (force-time, scaled by range and tempo),
**neural** (stability and skill, which is why a heavy free-weight single costs more than a machine set at the
same relative load), **connective** (end-range and long-muscle-length stress), and **metabolic**. Those land
on the muscles and joints the ontology declares, with indirect muscles taking half.

**Fatigue stopped being one number.** Four compartments with different half-lives — local 2 days, neural 3,
systemic 4, connective 7 — because that difference is the entire reason to separate them. A set eight days
ago still counts against connective and barely against local. A single fatigue figure averages those and
cannot tell you which one is limiting you.

**Recovery cost is now per exercise as the person performs it** — their range, their tempo, the effort they
take it to. Ranked as stimulus against cost, with the ratio described as comparative within one programme and
explicitly meaningless as an absolute. A lift low in the list is not a bad exercise; it is one currently
taking more out than it puts in.

**Effort uncertainty survives the multiplication.** Work.md notes it stopped at the first one. An RIR of 5
carries ±2.5 reps, and that now propagates into both the estimated maximum and the stimulus index — and the
output states which errors it does *not* propagate.

Four things this deliberately does not do: claim to measure stimulus, compartmentalise finer than the record
can distinguish, convert stimulus into predicted hypertrophy, or hide how much of the input was assumed. On
the demo it reports **100% effort coverage and 0% tempo coverage** — every time-under-tension figure is a
three-seconds-a-rep assumption, and it says so.

### Latent states, governance and the remaining domains (Work.md)

**Latent states.** Work.md asks repeatedly for quantities the app derived on demand to be carried as states
that persist, update on evidence, and decay in silence. A derivation answers "what does the last fortnight
imply"; a state answers "what do I believe, how confident am I, and when did I last learn anything". The
estimator is a one-dimensional Kalman update: a noisy observation moves the belief less than a clean one, and
with no observations the variance GROWS, so **confidence decays with silence** rather than persisting.

Built on it: cardio fitness, conditioning capacity (a separate state, because aerobic fitness and what you
can repeat are different things), lean mass, water/glycogen, adaptive thermogenesis, NEAT compensation with
lag and effect size, circadian measurement consistency, performance normalised against the state it was
produced in, nutrient absorption context, and a **generalised distributed-lag engine** — each domain had been
writing its own one-day version.

That lag engine immediately caught the app contradicting itself. The Learn panel asserted *"shorter sleep is
associated with higher hunger, r=−0.30"* while no lag survived correction for autocorrelation. A claim the
system's own stricter test rejects does not belong on a panel headed "What we think", so it is now gated and
demoted to what is not known.

**Governance.** Fifty models with no governance is not more intelligent than five — it is harder to tell when
it is wrong. Added: a canonical data dictionary whose owners are checked to exist, champion/challenger
registration (an uncontested estimator is reported as uncontested, **not** as validated), ten **domain
invariants** — two of which encode defects an external audit found — fragility probes, a lineage graph
checked for cycles, stated decision arbitration, idempotent job execution, referential integrity reported
rather than repaired, and reliability-weighted sensor fusion.

The invariant suite caught a live bug on its first run: `effectiveN` returned **60.9 from 35 observations**,
because negative autocorrelation inflates the standard correction. Mathematically real, never right for this
purpose — claiming more independent information than there are observations. Capped at n.

**Remaining domains.** Recovery resource allocation (what is *spending* recovery, ranked, with whether each
can actually be changed), motor learning tracked as falling variability rather than rising load, hydration
context that flags a distorted weigh-in while stating plainly that it cannot assess hydration, and a
supplement review that separates general efficacy from personal efficacy.

A note on the scan that found these: it flagged twenty-seven sections, several falsely — "fatigue is not yet
compartmentalized" is built, under the spelling "compartmentalised". That is vocabulary matching rather than
capability checking, the same failure the model contract had before it was made to resolve references. The
scan narrows what to look at; it does not decide.

### Input focus (reported bug)

A text field bound to the `input` event triggered a re-render, which replaced the node and dropped focus — so
the keyboard closed after every character and typing a word meant tapping the field once per letter.

Fixing the offending handlers one at a time would leave the next one to be written broken, so **focus and
caret are preserved around every re-render**: the element is re-found by id or by the data-act/data-arg pair
it is addressed by everywhere else, and its selection restored. An audit check now types into every text
field the app renders and fails if any loses focus.

### Rail alignment and pill overflow (reported bugs)

The two rails had different bottom offsets (78px against 88px), different insets and different z-indexes,
which put the two sides of the screen at visibly different heights. Now identical.

A pill was being handed a whole sentence — "flat within your own session-to-session noise" — and overflowed
its container. A pill is a label, so it carries "flat" and the sentence moved to the explanatory line, which
is where it belonged. Both got CSS guards so neither can recur.

### Two competing energy conversions (ConWork.md)

An external review found TDEE still using a hard-coded **3200 kcal/lb** while the counterfactual and scenario
paths used the composition-aware `tissueEnergyDensity()`. Two conversions meant the same weight change could
be read as different amounts of energy in different parts of the app.

**The verification failure is worse than the bug.** This document previously claimed the constant was gone
from every energy path. It was not: the check grepped for `3500` and never looked for `3200`, so a search
that felt thorough confirmed only what it happened to look for. That is the same defect shape recorded three
times already in this file — a check narrower than the property it verifies.

Every energy path now resolves through one accessor, and the uncertainty comes from that model's own interval
rather than a parallel hard-coded ±500. On the demo: density 3108 kcal/lb, derived SD 378, and the
counterfactual path implies 3107 — the same source.

The gate that would have caught it now exists: the audit scans every 3000–4000 literal appearing in
per-pound conversion context, and separately proves the live paths agree numerically, because a text scan
alone cannot establish that. Its first version flagged its own explanatory comment, so it strips comments
first — scanning prose is not scanning code.

### Multiple testing, missingness and the inference runtime

**Multiple testing.** The lag engine tested six lags and reported the best, at a threshold chosen for one.
With six tests the chance of at least one false positive is about **26%**, not 5%. Both Benjamini-Hochberg
and Bonferroni are now applied, because they answer different questions, and the sleep–hunger claim is gated
on the corrected engine — having already been demoted once for failing the autocorrelation test, it now also
has to clear correction for having searched several lags. It clears neither.

**Missingness.** Coverage was reported and called a caveat. Whether data is missing at random decides whether
an analysis is biased or merely underpowered, and the record can often tell: if readings resume
systematically different from where they paused, missingness depends on the unobserved value, which is the
one case more data does not fix. Reported as a signal, never as proof — by definition the evidence is in
what is missing.

**Inference runtime.** Models were called directly by other functions, so freshness, applicability and
provenance were each model's own business. One runtime now wraps execution: unknown models are refused, a
model outside its applicable context declines rather than returning a number, and stale inputs mark a result
**degraded rather than withheld** — a stale answer with its staleness stated is more useful than silence.

**Per-source bias.** Fusion weighted sources by fixed reliability; a systematic offset needs measuring and
removing, which is a different operation from trusting a source less. Measured from same-day pairs only, and
an offset is reported as disagreement rather than as identifying which source is right.

### Bayesian maintenance and a machine-enforced type system (ConWork.md)

**Maintenance is now a posterior.** The previous estimator was a point estimate with a variance assembled
from three error terms — defensible arithmetic that could not answer the questions people actually ask: how
likely is it that my maintenance is above 2,700, and what should next week's weight do given everything I
know.

The prior is the population equation, which is exactly what a prior is for. The likelihood is the energy
balance relationship. The posterior is conjugate normal, exact here and needing no sampling. On the demo:
prior 2985 ± 298, likelihood 2825 ± 95, posterior **2840 ± 91** — narrower than either input, which is what
combining evidence should do.

**Partial pooling is not a switch that gets thrown.** It falls out of the precision arithmetic: 91% of this
posterior comes from the person's own data because that is what the relative precisions justify. With a
fortnight it would sit near the population estimate; with no intake logged at all it returns
**prior-only**, and says that is the correct answer rather than a failure — it is what you should believe
before evidence arrives.

The posterior predictive carries scale noise as well as model uncertainty, because a prediction using only
the best estimate of maintenance is narrower than the truth and wrong more often than it admits.

**The type system is machine-checked.** The data dictionary described ten quantities in prose, and a prose
dictionary catches nothing. Fifteen quantities now carry dimension, unit, temporal semantics, aggregation,
population and epistemic class. Combining `tdee` with `intake` is refused — same dimension, different
temporal semantics, an aggregate over a window against one value per day. Converting kcal to pounds is
refused as incommensurable rather than returning a number.

Two bugs, one caught by the system auditing itself: the prose dictionary said RIR was in "reps" while the
type said "count". And the unit conversion was **inverted** — 70 kg came out as 31.75 lb, a factor-squared
error that a unit system exists precisely to prevent, sitting inside the unit system. Both now round-trip
exactly, with a test asserting it.

### Causal inference (ConWork.md)

The distributed-lag engine with false-discovery control had been standing in for this, and it is a weaker
instrument: it finds association at a lag honestly, but it cannot separate a confounded association from a
causal one because it never encodes what could confound it.

**Adjustment requires a graph.** No statistical test identifies confounders from data. Which variables to
adjust for is a claim about causal structure, so the claim is written down — sixteen nodes, thirty-one
edges — explicit, arguable and revisable, and declared as a claim rather than something derived.

**The validator caught two real errors in my own graph on its first run.** `calories → hunger → adherence →
calories` and `motivation → training → fatigue → motivation` are both genuine feedback loops, and a DAG
cannot hold one. The resolution is that they are **temporal**: hunger today affects tomorrow's adherence,
not the intake already logged. Five lagged edges now live outside the contemporaneous graph, and the
validator rejects any that duplicate a simultaneous edge.

**Adjustment sets come from the backdoor criterion**, not from "control for everything available" — which is
the most common way observational analysis goes wrong. Mediators are excluded because conditioning on them
removes part of the effect being measured; descendants of the treatment likewise. Conditioning on a collider
*creates* association where none existed, so the search returns a minimal blocking set rather than a maximal
one. On the demo: `calories → weight` needs only motivation; `steps → weight` needs motivation, cardio and
training.

**Propensity analysis reports overlap before it reports an effect.** Where treated and untreated days differ
materially on the covariates, the groups are not comparable and the adjusted figure is stated as untrustworthy
rather than footnoted.

**Negative controls test the method, not the hypothesis.** Finding an effect where none can exist is evidence
about the analysis. The demo's steps-versus-prior-night's-sleep-quality control fires at r=0.31, which
correctly warns that apparent step effects there should be treated as confounded.

Throughout: none of this beats randomisation. A randomised sequence of self-experiments answers what these
methods approximate, and every output says so.

### Universal Bayesian engine, exact t, real propensity scores (ConBWork.md)

**The p-value was approximate.** `_pFromT` used a normal-style approximation, which is defensible at n=200
and wrong at n=20 to 40 — the range this app actually works in. Understating a p-value is precisely how a
multiple-testing correction changes a conclusion by accident, which is the opposite of its purpose. Replaced
with an exact Student-t CDF via the regularised incomplete beta function. It now returns **0.0500** for
t=2.086/df=20, t=2.042/df=30 and t=2.228/df=10 — the published two-sided critical values, to four decimals.

**The Bayesian machinery was written once for maintenance.** It is now a general engine: any quantity that
can state a prior and a likelihood gets a posterior, partial pooling, a probability-above query and a
posterior predictive that carries observation noise as well as parameter uncertainty. Maintenance is now a
*caller* rather than the implementation, and a test asserts the two agree.

**`propensityAnalysis` did not estimate propensity scores.** It thresholded a continuous treatment and
compared strata — a useful diagnostic wearing the wrong name. It keeps doing exactly that under
`treatmentAssignmentBalance()`, and a real `propensityScoreModel()` now fits treatment assignment by logistic
regression on the backdoor adjustment set, then applies stabilised inverse-probability weighting with
positivity checks, trimming to common support, balance **after** weighting, and an effective sample size from
the weight variance.

Running it surfaced something more useful than an estimate: the graph says `calories → weight` is only
identifiable by adjusting for motivation, **and motivation is not tracked**. That is a capability gap rather
than a shortage of days — no amount of waiting fixes it — and reporting nothing is the correct output, since
an estimate skipping that covariate would be confounded by exactly the thing the graph identified.

**Capability maturity is now explicit on every engine.** Five grades, and the distribution is the finding:
ten engines are INFRASTRUCTURE_GRADE (the plumbing is tested, which says nothing about whether the model is
right), nine are OPERATIONAL_ANALYTICAL, one is STATISTICALLY_VALIDATED, and **zero** are experimentally or
prospectively validated. The training-demand layer sits at infrastructure grade, correctly. That ceiling is
stated in the interface rather than left for a user to infer.

**Run identity is reproducible.** It was an execution counter, so two identical analyses got different ids
and two different ones could not be told apart. It is now a hash over model, version, input snapshot,
parameters, reference version, dependencies, seed and as-of date.

### Causal universe, model competition and invalidation (ConBWork.md)

**The graph was sixteen nodes against an application reasoning about forty.** That is not merely an
omission: a variable absent from the graph is silently asserted to confound nothing, which is a strong claim
made by accident. Expanded to **44 nodes and 76 edges**, still acyclic, with eight lagged edges holding the
feedback a DAG cannot. Coverage is reported alongside it: 33 of 44 variables are actually obtainable from
the record, and the other eleven — caffeine, hydration, sodium, meal timing, motivation — are named because
leaving them out would be the stronger and falser claim.

**The adjustment search was bounded at three**, which made real effects look unidentifiable purely because
the search stopped early. Raised to five with a combinatorial budget, and when the budget is hit it reports
**"not found" rather than "does not exist"** — a distinction that matters, since the second is a claim about
the world and the first is a claim about the search.

**Champion/challenger was registration; now it is competition.** Three estimators for maintenance — the
intake-balance model, the Bayesian posterior, and the population equation alone as the baseline any personal
model must beat. Each is replayed AS OF past dates and scored against what actually happened, on error, bias
and interval coverage. Comparing their outputs on today's data would compare opinions rather than accuracy.

Two findings came straight out of it, and both are uncomfortable in the right way. The registered champion
**produced no usable prediction at any replay point**, so "keep the current champion" would have rested on
nothing — it now says so. And the **population baseline had the lowest error**, which means the personal
estimators are not yet earning their complexity on this record. The Bayesian posterior scored a bias of
−0.98 against a mean error of 0.98, which is systematic rather than noisy.

**Dependency invalidation did not exist.** A food-database correction now propagates through recipes, intake,
energy balance, maintenance, forecasts and the decision, in dependency order, and reports which values
actually changed — including when nothing did, which is worth knowing rather than assuming.

### Universal typing, formal missing-data inference, measurement model (ConBWork.md)

**Fifteen typed quantities against hundreds in traffic.** A type system covering a tenth of the traffic
catches a tenth of the errors and creates a false sense that the problem is handled. Now 38 declared types,
and — more usefully — an audit that scans what the engines actually emit rather than trusting the list:
**26 of 39 cross-model fields typed (67%)**, with the remaining thirteen named individually. Eleven internal
diagnostics are excluded, because a window length never crosses a model boundary as a measured value and
counting it made the coverage figure describe something nobody was trying to achieve.

**Missing data stopped at diagnosis.** Knowing an analysis is biased is better than silence and worse than
correcting it. Three things now exist: inverse-probability weighting (days less likely to be logged count
for more, with an effective sample size and an instability warning when weights run extreme), multiple
imputation with Rubin's rules (mean-substitution gives the same point estimate and a falsely narrow interval,
which is exactly why it is not used), and — the one that matters — **MNAR sensitivity analysis**.

There is no test for MNAR and no correction for it. The only honest treatment is to show how far the answer
moves across assumptions the data cannot check. On the demo, intake moves 44 kcal across ±2 SD assumptions
about the unobserved days, which is inside the noise, so the conclusion survives. A robust result there does
not prove the data are missing at random — it shows the conclusion would hold even if they were not, which
is a weaker and more useful claim.

**Fusion weighted sources by a reliability constant.** A real measurement model separates the latent true
value from each source's bias, spread and drift, all estimated from same-day overlap rather than asserted.
Bias is explicitly relative to a chosen reference — the source with the most readings — and that choice is
flagged as a decision rather than a measurement, because a biased reference makes every other bias wrong by
the same amount.

### Analytical materialization (ConBWork.md)

The canonical policy completed: **raw event log → historical projection → analytical materialization →
dependency invalidation.** Seven views materialise, keyed by a run identity that includes the as-of date —
so a replay cannot read a present-day cache entry, which would be the worst possible staleness bug in a
system built around replay.

**Built with a benchmark attached, because a cache that is never measured is a bet that recomputation is
expensive.** On this record that bet loses: recomputing every view costs **5.6 ms**, and the store saves
5.6 ms while adding a staleness failure mode recomputation does not have. The layer reports that about
itself rather than hiding it.

**What justifies it regardless of speed is restatement.** When a correction changes an input, every
historical output derived from the old value is wrong, and without materialization there is no record of
what was previously concluded — only silent recomputation. Stale views are therefore **marked, not deleted**,
because the previous value is what makes restatement possible, and the output says whether the chain reaches
a decision the person was actually shown.

Two defects surfaced while building it, both by machinery rather than by reading:

* The module was **silently dropped from the build**. The include pattern is `NN-name.js` and the file was
  named `98b-materialize.js`, so it was written, saved, and never ran. The build now **refuses** when any
  `.js` file in `src/` would be silently excluded — a whole module vanishing without a warning is a worse
  failure than a broken build.
* A self-test asserting the cache is never exported **failed**, because it lived in `DB.settings` and was
  serialised with everything else. The documentation claimed one thing and the code did another. Per-device
  working state is now explicitly excluded from export, listed by name so the exclusion is visible.

### A stale cache, a plug-in posterior and an unnamed estimand (WorkConC.md)

**The materialization bug was real and I reproduced it before fixing it.** The cache identity used record
COUNTS, so correcting a weight from 200 to 190 left every count identical, the identity unchanged, and the
cache served −1.74 when the truth was −2.10. Counting rows tells you how many there are, not what they say.

Identity is now content-addressed: a hash of the fields that actually enter each calculation, scoped per
view so a food-log change invalidates adherence and leaves the weight trend alone. Manual invalidation still
exists and still helps; it is no longer what correctness depends on.

**My first attempt at that fix reintroduced the same bug one level up.** I memoised the content hash on
`_EVENTS.length` — and an in-place edit emits no event, so the counter never moved, so the stale hash came
back and the stale value was served again. A content hash memoised on something that is not the content is
not a content hash. It is computed for real now; the benchmark says the whole cache saves about six
milliseconds, so correctness plainly outranks the saving.

**`hierarchicalBayes` was empirical Bayes wearing the name of a posterior.** Method-of-moments tau, plugged
in, intervals conditioned on a point estimate of the very thing that is uncertain. `hierarchicalPosterior()`
now integrates over tau on an 80-point grid with a half-Cauchy hyperprior, giving a marginal posterior for
the hyper-mean and **a credible interval for tau itself** (0.013–0.713 on the worked example) rather than a
single number. It comes out wider than the empirical-Bayes answer, and that extra width is the honest part.

**`iptwEstimate` named the method and left the reader to assume the quantity.** Stabilised IPTW over the
trimmed sample targets the **ATE**, not the ATT. Both are now named, with what the difference means.

**Median binarisation answers "high versus low", not "what does one more unit do".** `doseResponse()` uses a
generalised propensity score: the dose is modelled on the covariates and the outcome regressed on the part
the covariates do not explain, with a curve over the observed range so non-linearity stays visible and an
explicit refusal to extrapolate past it.

### One registry, and multiple imputation that deserves the name (WorkConC.md)

**Two registries for one concept is how they drift.** `DATA_DICTIONARY` described quantities in prose and
`TYPES` described them for the machine, and the RIR unit mismatch found earlier was exactly that — caught
only because an audit happened to compare them. The dictionary now DERIVES from the types, so drift is
structurally impossible rather than merely detectable, and a drift check stays in place to catch a second
registry creeping back in.

**Multiple imputation was imputation in name only.** Three faults, all fixed:

* Values were drawn from the **marginal** distribution, so every imputed day was pulled toward the grand
  mean. A Tuesday in a deficit is not an average day. The model is conditional now — local level plus
  day-of-week — and draws carry the residual spread after the model rather than the raw spread, which
  includes the variation the model just explained.
* **Within-imputation variance reused one marginal spread for every completed dataset**, which is not a
  within-imputation variance at all. It is now the sampling variance of the estimate in each dataset, with
  each dataset drawing its own residual scale — the step that makes between-imputation variance mean
  anything.
* The interval used **1.96**. It now uses Student-t at Rubin's degrees of freedom, computed from the
  fraction of missing information via the exact CDF. On the demo, missingness is low, FMI is 0.058, df is
  large and the critical value correctly converges back to 1.96 — which is the right answer arrived at for
  the right reason rather than by assumption.

`_tCrit` matches published tables exactly: 2.228 at df=10, 2.042 at df=30.

### Contract-derived dependencies, and a surface for the inference layer

**The derivation graph was hand-enumerated**, which drifts the moment a model changes what it reads and
nobody updates a table in another file. Every model already declares its inputs in the contract the
conformance audit checks, and those declarations are the authoritative statement of what depends on what.
The graph is now built from them: **63 contract-derived nodes, zero unresolved**, merged with a declared
fallback for the handful of quantities that are plain functions rather than registry entries.

**The larger gap was that almost none of this statistical layer had a surface.** Identification, missingness
mechanisms, model competition and maturity all existed and none of it could inform anyone who was not
reading the source — which is a strange definition of an app that exists to tell someone what is knowable.

`What can be known` now answers four questions in one place:

* **Which questions your record could actually answer.** Each candidate effect shows whether it is
  identifiable at all, and where it is not, precisely what blocks it — on the demo, `calories → weight` is
  identifiable but blocked because motivation and phase are not recorded. That is a shopping list, not an
  error message.
* **What is missing and whether it biases anything**, with the MNAR sensitivity verdict beside it.
* **Which estimate to believe**, with the backtest error, bias and interval coverage for each competing
  estimator — including the finding that the population baseline currently wins.
* **How far any of it has been validated**, with the zero-experimentally-validated ceiling stated rather
  than left to be inferred.

### Identification beyond the backdoor (WorkConC.md)

The backdoor criterion fails in exactly the case that matters here: an effect confounded by something nobody
records. Three further strategies, plus the honest answer for when none applies.

**Front door.** If the whole effect passes through an observed mediator, it is identified even when the
treatment is hopelessly confounded. It must intercept EVERY directed path — on this graph nothing does for
`calories → weight`, and the engine says so rather than picking a mediator that leaks.

**Instrumental variables**, with the weak-instrument problem treated as the first-order concern it is. A
first-stage F is reported against the conventional minimum of 10, and a weak instrument is refused with the
reason stated: it is biased **toward** the confounded estimate, which is the failure mode people forget.

**E-values.** When nothing identifies the effect, the answerable question stops being "what is it" and
becomes "how strong would unmeasured confounding have to be to explain this away" — computable without
knowing what the confounder is, which turns "there might be confounding" into a quantity.

**A correction I had to make to my own first version.** It reported `calories → weight` as identified by a
day-of-week instrument at 0.217 standard deviations — scraping past a 0.2 threshold I had set — while
day-of-week plainly reaches meals, sleep and stress directly. A marginal instrument with a doubtful exclusion
restriction is not an identification strategy, it is a number. The bar is now a first-stage F of 10 (that
instrument scores **0.6**), and the untestable assumption travels with the verdict instead of sitting in a
caveat nobody reaches. Both effects now correctly report that no strategy is available.

**Governance walks forward** at weekly spacing rather than sampling six points, and promotion follows a
written rule — twenty replay points minimum, a margin beyond the noise, no systematic bias, calibrated
intervals. On this record it refuses, listing which conditions failed. A rule written before the result is
the only version of this that is not preference.

The build guard added last session caught this module's own filename (`79b-identification.js`) before it
could be silently dropped, which is the second time that guard has paid for itself.

### The presentation layer, with a contract (visual system document)

The document puts one rule above the other fifty-eight:

```
ANALYTICAL TRUTH → PRESENTATION MODEL → VISUAL SEMANTICS → DESIGN TOKENS → COMPONENT → RENDERER
never   CSS → analytical meaning
never   chart → new analytical calculation
```

The second prohibition is the substantive one. **A chart that computes its own smoothing, rebases its own
axis or fills its own gaps has quietly become a model** — one with no contract, no epistemic class, no
uncertainty and no trace. So this is built the way the model contract system is built, because the same
discipline that stopped models inventing figures should stop views inventing them.

* **Design tokens are data.** CSS reads them; nothing reads CSS to decide meaning. Roles are semantic —
  "attention", not "amber" — so a theme change cannot change what a colour means.
* **Every epistemic class has a declared visual**, and every one carries a pattern and a weight as well as a
  colour, so meaning survives when colour does not. A class with no declared treatment is marked
  **undeclared** rather than silently styled as normal, which would make an unclassified number look
  authoritative.
* **A presentation model is built FROM a canonical result** and computes nothing. It carries the value,
  class, interval and provenance forward. An unresolved result presents as unresolved — a chart drawing
  zero there would be asserting a measurement that does not exist.
* **Five visualization contracts** declare input dimensions, temporal semantics, displayable classes,
  mandatory elements, sanctioned transforms and — most usefully — what is forbidden. A validator rejects a
  view that would misrepresent what it was given, and refusing to draw is always compliant.
* **Contrast is computed, not judged**: 28 pairings across both themes and both surfaces, at 4.5:1 for text
  and 3:1 for non-text.

**The contract check found a real gap on its first run.** `weightTrend()` resolved without declaring an
epistemic class, so the presentation layer could not style it honestly and it would have rendered as
authoritative by default — the quiet version of overclaiming. It declares DERIVED now, and the audit checks
every presentable model for the same omission.

`npm run audit` now includes the presentation contract, so the rule is enforced rather than aspirational.

### Presentation: fonts, chart types, self-audit (visual spec §7, §18, §55)

A scan of all 67 sections of the visual specification against the source found **64 already implemented** —
tokens, semantic and epistemic colour, contrast, visualization contracts and semantic validation were built
earlier and pass. Three had nothing behind them.

**Font registry** (§7). A stack is a fallback CHAIN, and the fallback is what most readers actually see: the
first entry is often absent. Every stack must end in a generic family and carry a fallback, checked rather
than assumed. Accessibility faces are first-class — and the dyslexia-oriented face states that the evidence
for it is mixed, because it is offered on the grounds that some readers report it helps rather than that it
is established.

**Chart types** (§18). Eleven types, each declaring what it encodes, what it requires, and — the part nobody
writes down — **how it misleads**. A stacked bar misleads for every series but the bottom one; a bubble
misleads when radius is scaled instead of area; a forecast fan that does not widen implies the future is as
certain as the past. Selection reads from the type registry, so the chart follows from what the quantity IS.

**Self-audit engine** (§55). Five named audits — theme, visual, ui, ux, responsive — returning findings
rather than a score, because a score is comforting and hides which thing is wrong.

Two defects, both caught by the new code on its first run:

* The responsive check flagged `min-width:768px` as a fixed width. Both `min-width` and `max-width` end in
  "width", so the pattern was broader than the property it meant to verify — the same defect shape recorded
  several times already in this file, this time in a check I had just written to find defects.
* A self-test asserting safe-area insets passed in the browser and failed headless, because the audit cannot
  read a stylesheet there. It now reports **inconclusive** rather than `ok`. A pass earned by having checked
  nothing is the least useful kind, and it was about to become a green tick.

### Correcting my own verification of the visual specification

I previously reported the visual specification as "64 of 67 sections implemented". That was wrong, and the
way it was wrong is worth recording: the scan matched loose keywords rather than the identifiers each
section actually names. Re-run strictly, only **eighteen** sections were complete and fifty had gaps.

A check looser than the property it verifies reports success it has not established — the same defect shape
this file has recorded several times in the code, this time in my own verification of it.

Closed since: the shape engine and shape languages, elevation including the two the spec names and this app
refuses (glass costs contrast, neomorphic fails it outright), the spacing scale, five named breakpoints where
columns deliberately stop growing past desktop, numeric typography, the font loading and accessibility
policy, seven further chart types, ten further components, the renderer registry, and the image policy —
which ships no illustration, because illustration in a measurement app decorates a claim it cannot support.
Strictly re-verified: **zero sections below 70%**, down from nine.

**The colour-blind audit found a real defect on its first run.** Success and danger collapsed under
protanopia at a contrast ratio of 1.24 — green "this is fine" and red "this is wrong" indistinguishable,
which is the single worst pair in a health app. They differed in hue and barely in LIGHTNESS. Separated on
lightness the ratio is now **2.64**, and the categorical chart palette is clean.

Three lesser collisions remain, and are reported as advisories rather than chased: four semantic colours
mutually separable across all three simulations is not achievable in a usable gamut. Every epistemic class
already carries a pattern and a weight, so colour is never the only channel.

Two further defects, both caught by the new code:

* `formatNumeric(950,'calories')` printed **"950.00"** kcal. The log calls it `calories` and the type
  registry calls it `intake`, and nothing linked them, so formatting fell through to a default. Aliases now
  close the gap, with a coverage audit — which then had to be taught that `note` and `context` are prose
  and demanding a dimension for them is the same error as demanding a unit for a name.
* The empty-state component declared one state. It has two, and they need different words: "start logging"
  is useless advice to someone whose search returned nothing.

### A namespace collision that blanked the app

Declaring `var RENDERERS` in the presentation layer **replaced the view system's registry of the same name**,
and every screen rendered empty. No error, no warning. The build concatenates modules, so a top-level `var`
is a global, and a global is a shared namespace whether or not anyone treats it as one. Nothing caught it
until an interface gate crashed three steps later on a missing element.

The guard now scans every top-level declaration across all modules for a name declared twice, and it found
**two more collisions that predate this session**:

* `storageEstimate` existed twice. The richer version won concatenation, so the thinner one was dead code
  that merely looked like a definition. Removed rather than renamed — two functions answering one question
  is how they drift apart.
* `photoPairs` existed twice with **different return shapes**: one an array of pose pairs, the other an
  object. The photos sheet calls `pairs.length` and `pairs.map`, and had been receiving the object, so
  `.length` was `undefined`, the block was falsy, and **the photo comparison section has silently never
  rendered**. A whole feature absent from the interface, with every gate green.

That is the most instructive defect in this session. Every check that existed asked whether things worked;
none asked whether two modules had quietly agreed to disagree about a name.

### Implemented is not the same as reachable (§43)

Asked to verify the visual specification, the useful question turned out not to be whether the code existed
but whether a user could operate it. **It is a CUSTOMIZATION system, and almost nothing was customisable.**
Text size, density, contrast, motion and units were reachable; theme, accent, typeface, edge treatment and
appearance profiles were five registries a user could not touch. A customization system nobody can operate
is a set of constants.

Four **appearance profiles** now exist as named bundles — standard, reading, dense and accessible — because
"make this readable" is one decision, not eight switches. Every individual control is exposed beside them,
and changing one clears the profile name, since a profile with one thing changed is not that profile.

**Every option is contrast-checked before it is offered.** A combination that fails is withheld rather than
offered with a warning nobody reads, and the withheld ones are named so the omission is visible rather than
silent.

That gate immediately caught two things in my own work:

* The **reading profile was withheld** — its clay accent on a paper surface gave 2.64 against the 3:1 a
  non-text indicator needs.
* On a light theme, **not one of the five accents passed**. They had all been chosen against dark surfaces.
  A colour picker where nothing is pickable would have shipped if the check had come after the UI instead of
  before it. Accents now carry a variant per surface lightness; every one passes on every theme, and all
  four profiles are offerable.

### A real browser gate (correcting a long-standing claim)

This document has said since the first external audit that a real-browser gate was impossible because no
Chromium could be obtained. **That was stale.** Chromium 141 is installed at `/opt/pw-browsers`, and
`playwright-core` drives it without downloading anything — the browser was already there and nobody checked.

The claim mattered, because jsdom resolves the cascade and does **no layout**: every box it reports is zero
by zero. So every geometric assertion in this project — touch targets are 44px, the rails align, nothing
clips, the page does not scroll sideways — was written in CSS and verified nowhere. Two of the bugs actually
reported by a human were precisely this class.

`npm run browser` now measures the built app in headless Chromium across **five real viewports × twelve
tabs**: touch-target geometry, clipped content, horizontal overflow, computed-colour contrast, and rail
alignment.

Its first run produced 228 findings. Triaging them honestly, most were my own checks being broader than the
property they verified — `.sr-only` elements are *supposed* to be 1×1 and clipped, and the tab bar is
*supposed* to scroll horizontally. Excluding those left **67 real defects**, none of which any existing gate
could see:

* The header info button was **35px wide**, the date steppers **28px**, the range pills **37px** — all with
  padding that looked adequate in the stylesheet and was not adequate in pixels.
* `.lk-tag` and `.lk-why` measured **4.19:1**. The token audit passed because it checked the pairs it was
  given; those classes sit on an *elevated* card surface the tokens were never checked against. The browser
  measured the pairs that actually occur.
* A citation line with no spaces to break on ran **3px past a 393px viewport**.

All fixed; the gate now reports **zero findings** and runs in the check chain.

One consequence worth stating: the gates now need `jsdom` and `playwright-core` installed. The **build** still
needs nothing but Node, which is the portability claim that actually matters, and the audit now enforces that
distinction rather than treating any dependency as a violation.

### Reconciling v12 — a branch that regressed what it could not see

v12 arrived as a visual-architecture branch and had to be judged against the tree here. It was forked from
v5 **before** the merge and **before** the browser gate existed, and that shows precisely.

**What v12 added, and kept:** skin application wired into appearance, presentation provenance carried on
every card, sealed presentation models. Sound work, and v12 is the correct base.

**What v12 lacked:** the real-browser gate and its `playwright-core` dependency, the `76-visual-complete.js`
module and its uncertainty-style join, the audit's build-versus-gate dependency distinction, seventeen
self-tests — and the **measured CSS corrections**.

That last one is the instructive part. Run through the browser gate, v12 reproduced **all 67 defects** that
gate had found and fixed: the 35px info button, the 28px date steppers, the 4.19:1 text on elevated cards.
v12's own gates were green, because every one of them runs in jsdom, which does no layout. A branch that
focused on visual architecture regressed every measured visual defect, and nothing it carried could see it.

It also brought one defect of its own: a `data-personalization="active"` attribute set on every load.
`personalizationModel()` returns `status:'ok'` unconditionally, so the flag read "active" whether or not
anything had been personalised — and no stylesheet rule read it. It carried no information to nothing.
Removed, rather than given a CSS rule just to silence the dead-toggle audit, which would have hidden it.

Three unreferenced scratch scripts (`debug1.mjs`, `dump.mjs`, `dump-empty.mjs`) removed.

Merged: 66 modules, every gate green including five viewports by twelve tabs in Chromium. That tree is
authoritative. The lesson for future branches: **the browser gate must travel with the code**, because a
branch without it cannot tell that it has undone the fixes it was never shown.

### A layout regression caused by an accessibility fix

A screenshot showed the tab labels running into each other — "Progress", "Diagnose", "Experiments" and
"Learn" overprinted. Reproduced in Chromium: tab boxes were narrower than their own text, Progress 58px
holding 65px of text and Experiments 69px holding 85px.

**The cause was the touch-target fix from two passes earlier.** Flex items default to `min-width:auto`, and
`auto` is precisely the thing that stops a flex item shrinking below its content. The rule
`button[data-act]{min-width:44px}` replaced `auto` with `44px`, which *permitted* every tab to be squashed to
44px. A fix for one measured defect caused another.

**The browser gate missed it**, and the reason is worth recording: it checked clipped content and overflow
past the viewport, but nothing was clipped — the text simply overflowed into its neighbour. That was a
blind spot, not a failure to run. The gate now detects text spilling into a sibling, and it now measures at
660px, the width where the bug appeared: wider than a phone, narrower than a tablet, so the tab bar neither
scrolls far nor has room to spare. Missing sizes are where layout bugs live.

Validated the way a new check should be: with the fix removed the gate reports **60 overlap findings**,
with it restored, zero.

### P0 foundation (implementation direction, steps 1, 2, 6, 7, 8, 9)

**Step 6 — run identity was a 32-bit checksum.** The direction says in terms: do not use FNV-1a as content
identity. At 32 bits, two different computations are expected to collide after roughly 77,000 runs. Run
identity is now **SHA-256** over a key-sorted serialisation, verified against Node's own crypto across eight
cases including the 55/56/64-byte padding boundaries where hand-written implementations usually break.
Key order no longer changes the id; any material change does.

**Step 8 — seven version identities that were one.** Application, schema, ontology, model, reference data,
food database and adapter are now separate, with what each invalidates written down. An application change
invalidates nothing on its own; collapsing them meant every release invalidated everything, which is the
same as invalidating nothing precisely.

**Step 2 — three quantity registries.** `TYPES`, `TYPES_EXTENDED` and `TYPE_ALIASES` were the arrangement
the direction forbids. `QUANTITY_REGISTRY` is now the single object, and `TYPES` is **the same reference**,
not a copy, so the two names cannot disagree. Every quantity gains the nine fields specified; unknown
quantities, wrong units and dimensional mismatches are rejected at the boundary; a missing value is
declared a gap, never a zero.

**Step 7 — provenance generated during execution.** `infer()` now builds the DAG as it runs — observation
nodes identified by content, the model at its version, the run with its version vector and digest, and the
output with its class and interval — rather than reconstructing lineage afterwards from UI metadata.

**Step 9 — capability status derived, never assigned.** Eighteen capabilities, each status computed from
evidence the build can check. Result: ten integrated, six surfaced, two validated, **zero production-ready**,
because nothing has been experimentally validated — and four capabilities detected as implemented but
unreachable.

**Step 1 — the baseline is generated, not written.** `docs/implementation/` holds baseline, capability
matrix, dependency map and an appended log, all regenerated by `npm run baseline` in the check chain, so a
hand-kept inventory cannot drift from the code.

**Not done in this pass, stated plainly:** steps 3–5 are partial rather than complete (the model registry
exists but is not yet the single authoritative description; production models are not all migrated through
`infer()`; the dependency graph is contract-derived but invalidation is not yet keyed to it end to end), and
steps 10–20 — Presentation, Dashboard and Visualization Studios, the anatomy, movement and program
renderers, and the remaining model families — are not started. The immediate-actions document lists well
over two hundred items; this pass built the foundation the direction says must come first.

### Steps 3–5 completed, and step 10 (Presentation Studio)

**Step 3 — the registry described models but could not run one.** All 25 entries in `MODELS` said what
they computed and none said which function computed it, so the inference gateway could not resolve a model
by id at all. It took raw function names and bypassed the registry — the arrangement the direction
forbids. Every entry is now bound to its implementation and all 25 resolve. `modelContract()` produces the
direction's full description by deriving each field from registries that already exist, so no field can
disagree with what it describes.

The registry audit then found a second gap: **23 of 25 models had no maturity grade**. The maturity table
had been built around the newer engines and keyed by their function names, so it never met the original
model registry — two registries describing overlapping things with disjoint keys. Grades are now derived
by rule: heuristics, priors and policies are infrastructure; arithmetic with a declared uncertainty is
operational; only a model scored against later outcomes rises to statistically validated. Result: 16
operational, 8 infrastructure, 1 statistically validated, none experimentally validated.

**Step 4 — `infer({modelId})` resolves through the registry**, checks applicability before running, and
returns version, maturity, uncertainty, provenance and a SHA-256 run id. The old call shape still works for
migration and every such call is counted, so the remaining direct callers can be found rather than guessed.

**Step 5 — the dependency graph is built from the registry** with typed edges (data, model, configuration,
derived-state). A change to weight walks outward to 16 models, 3 cached views and 6 decisions.

**Step 10 — the Presentation Studio edits a specification, never a style.** Appearance is plain data,
validated against the same registries the runtime uses and applied through the existing path. It adds what
the actions list asked for: an arbitrary custom colour (accepted only at 3:1 or better, refused with the
measured ratio and a hint otherwise), saved profiles that can be duplicated and deleted while built-ins
stay protected, a token inspector with measured contrast, and import/export.

Import follows the direction's pipeline stage by stage and reports **which** stage rejected an input —
parse, schema or semantic — rather than a single failure. Names are `appearance*` rather than
`presentation*`, because `presentationSpec` already exists and means report layout.

One false alarm worth recording: the focus-while-typing check reported two Studio fields as unable to take
focus. They could. The check collected element references once and then re-rendered after each keystroke,
which detached the rest, and a detached element cannot take focus. It had never tripped because no sheet
before had three text fields. The check now collects identities and re-finds each field after every render.

### Step 11: one dashboard system, an editor for it, and three mistakes of my own

**Two dashboard systems had already arrived from two branches.** `WIDGETS` + `DASHBOARD_LAYOUTS` +
`dashboardCompose()` in one module, `WIDGET_REGISTRY` + `composeDashboard()` + `applyLayoutOperation()` in
another. No widget id in common, and neither rendered by any view. The direction forbids duplicating a
subsystem, so `WIDGET_REGISTRY` — the richer schema, and the one the renderer bridge reads — is canonical,
the other six widgets were migrated into it, and the older compose path now delegates.

A dashboard is data in the shape the direction specifies: sections of widget placements. Fourteen
operations each return a **new** specification, validated before it is kept, so an invalid edit leaves the
original untouched. Adding a widget twice, an unsupported size, removing a section that still holds widgets
and an unknown operation are all refused with the reason. A narrow screen composes every widget at its
smallest supported size — responsiveness is a property of composition, not a second layout. Editing a
built-in forks it, so the original is always there to go back to.

Three mistakes made while building it, each caught by a gate rather than by reading:

* **The attention tile showed NaN.** It read `attentionQueue().length`, but the queue returns
  `{items, counts}`. It now reads the same field the header badge reads, and a test asserts the tile and
  the queue agree — a dashboard contradicting the header is worse than one showing nothing.
* **The migration overwrote an existing widget.** `body.weightTrend` was a contract-validated line chart;
  merging over it replaced its renderer with a metric tile and broke it. The engine gate caught it. A
  migration now refuses to redefine an existing id, and the new tile has its own.
* **The dashboard dispatched to renderers directly**, bypassing `renderWidget()` — whose own comment says
  it is the single widget-to-renderer bridge and that views must not grow parallel dispatch tables. That
  also skipped its contract validation. Everything now goes through the bridge, and a widget the bridge
  declines is shown as declined, with the reason.

**The browser gate had never opened a sheet.** It swept twelve tabs, so every control inside a sheet was
unmeasured. It now opens eight. On its first run it found the Presentation Studio's inputs **19px tall** —
wrapped in `class="fld"`, a class with no stylesheet rule at all. Five sheets use that class; I first
claimed all five were broken. Measured with the fix removed, only two were: the Studio and the older label
scan. The other three are styled by other rules. The note now records what was measured rather than what I
assumed.

### Step 12: one chart catalogue, the visualization pipeline, and a Studio

**The same duplication again.** Two catalogues of chart types had arrived from two branches:
`CHART_TYPES` (18 types, each saying what it encodes, what it needs and how it misleads) and
`VISUALIZATION_REGISTRY` (28 types, each saying its data dimensions and minimum observations). Sixteen in
common. They are now one object — `CHART_TYPES` is the same reference, as `TYPES` is to
`QUANTITY_REGISTRY` — and every entry carries both halves. `VISUALIZATION_CONTRACTS` is a different kind
of thing, contracts for particular uses, and correctly stays separate.

The catalogue now holds **37 types**, including all 32 the actions list names, and every one says what it
encodes and how it misleads — a stacked area misleads for every series but the bottom one; a sunburst
exaggerates its outer rings by their radius; a calendar heatmap misleads when missing days are coloured as
zero.

**Only 9 of the 37 can actually be drawn.** The renderer draws four series kinds — line, band, bars and
dots — and the renderable types are the ones composable from those. The other 28 are catalogued and
contracted but have no renderer, and the catalogue says so: a type is renderable if and only if a renderer
for it exists, which a test asserts. Presenting all 37 as working would have been the easiest thing to
build and the least honest.

**The pipeline runs the direction's stages in order** — model, presentation, spec, validation, renderer —
and a failure names the stage that stopped it: an unknown type fails at *spec*, a catalogued type with no
renderer fails at *renderer* rather than drawing something wrong. Every chart carries the run id of the
model output it drew, and all chart rendering goes through one bridge.

**The Visualization Studio** builds a chart from any registered model, offering only the types that both
fit the model and can be drawn, shows each type's failure mode, and saves a working chart as a dashboard
widget — rendered through the same single widget bridge as every other widget. A chart that cannot render
cannot be saved.

One gap caught before it shipped: saved chart widgets lived in settings but nothing restored them into
the widget registry on load, so a saved chart would have vanished on reload. They are restored in
`applySettings()`. The reload test itself first showed no chart after reloading — that turned out to be
the harness swapping the record in without clearing the model cache, not the app, and was confirmed as
such before anything was changed.

### Step 13: one anatomy, and a body map built on it

No body map existed, but three things describing muscles did, and **they did not agree on what the muscles
were called**. The exercise ontology (`MUSCLE_GROUPS`) and every model that reads it — `exposureOf()`,
the fatigue compartments — speak of `upperback` and `erectors`. The muscle coverage visual carried its own
private list instead: `traps`, `rhomboids`, `lowerBack`, `obliques`. Four of those do not exist in the
ontology, and the models never emit them.

So the coverage visual looked for "traps" and "rhomboids", found nothing, and reported them as **none
recorded** — while the upper back was the second most-trained region in the record at 22.5 effective sets a
fortnight. It told the person they were neglecting muscles they train. That private list was mine, from an
earlier pass.

There is now one anatomy, keyed by the ontology, and the old map is the same object. The coverage visual
reads the vocabulary the models write. The ontology's own `back` entry turned out to be orphaned — no
exercise emits it, because every back movement lands on lats, upper back or erectors — so it is kept as an
aggregate rather than drawn as a region, which would always be empty and would itself read as neglect.

**The body map** draws that anatomy front and back, coloured by the fatigue model and never by its own
arithmetic, with three states that are deliberately never alike: a muscle carrying load is filled, with
opacity by its share of the highest load; a muscle with none in the window is a dashed outline, a measured
zero; and with no training record at all the whole map is hatched — a gap, because nothing was measured.
Every region carries a title and a text table follows the drawing, so colour and position are never the
only way to read it. It was inspected as a rendered image, not only measured: every region sits on the
right part of the body, and the brightest region, the glutes, is the highest-load muscle in the record.

An audit asserts the anatomy matches the ontology exactly and that every muscle training can load has a
place on the map, so load can never land somewhere invisible.

### Step 13 completed: movement, mobility, program and nutrition renderers

**A correction first.** Last pass reported Step 13 done after building only the body map. Re-reading the
direction, Step 13 is "anatomy / movement / mobility / program / nutrition renderers" — four were missing.
Step 8 had also been mis-described earlier as the version vector; it is the materialisation rewrite around
dependency identity, which is only partly done.

**§27 body renderer.** The body map mixed geometry into the anatomy mapping; the spec requires them apart.
Shapes now live in `ANATOMY_GEOMETRY`, meanings in `ANATOMY`, and load arrives only as an overlay.

**§28 movement.** Every one of the 16 movement patterns in the exercise library is drawn from joint positions
in a body coordinate system — origin at the feet, one unit one body height — that knows nothing about pixels.
A separate transform maps positions onto a viewBox, fitted to the union of the start and end frames so the
two are drawn at the same scale and a range of motion is never exaggerated by refitting. Segments, joints,
range-of-motion arcs, force vectors and labels are independent layers. The range is computed from the
positions, not drawn.

**§29 mobility.** The ten poses draw through the same skeleton and the same joint ontology — no separate yoga
anatomy — each carrying target regions, joints, positions, constraints, sequence position, duration and
intensity.

**§30 program.** Program, mesocycle, microcycle, day, read only: the plan from `trainingProgram()`, what was
done from the session log, nothing rescheduled. The program has no explicit block structure, so the window
is one mesocycle declared as implicit rather than invented.

Five defects surfaced while building these, all caught before shipping:

* **The drawability audit checked nothing.** It read `EXERCISE_LIBRARY`, which does not exist — the library
  is `EXERCISES` — found zero patterns, and passed. A coverage check with nothing to cover now fails.
* **The program reported 12 of 14 sessions missed** in a record that trained 13 times in the window — on
  Wednesday, Thursday, Saturday and Sunday against a Monday/Tuesday/Thursday/Friday plan. Matching by exact
  weekday counted every moved session as skipped. Adherence is now judged per week (9 of 14), with how many
  fell on the planned day reported separately.
* **Nutrition called ten of fourteen days unlogged** — days whose calorie totals the energy balance model was
  using. It read only itemised food logs; intake is also recorded as daily totals. A renderer contradicting
  the model beside it is worse than none. Both sources are used now, each day says which, and a macro that
  was never recorded is unknown rather than zero.
* **The welcome toast outlived its premise.** Screenshotting the movement renderer showed "set up a profile,
  or load the demo" covering every drawing — after the demo had loaded. It could fire in the 200ms after the
  demo loaded, and nothing dismissed it once shown. It re-checks at display time and loading the demo
  dismisses it.
* **A weekday list was redeclared**, caught by the namespace guard. Identical this time, so nothing broke —
  but a differing copy would have silently changed every weekday name in the app.

Every renderer was inspected as an image, not only measured: the squat pushes knees forward and hips back,
the bridge lifts the hips, downward dog forms an inverted V with the head between the arms, and the program
calendar makes a moved session visible as training rather than absence.

### The shipped file stopped working in inline previews

Reported: the index file, opened in the file preview, was no longer interactive, where earlier builds had
been. Loaded in a sandboxed iframe with scripts allowed and same-origin denied — the usual way a preview
isolates HTML — the app booted, switched tabs and ran without error, so the sandbox itself was not the
cause, and the preview's exact behaviour cannot be observed from here.

What changed was size. The file measured **2,225,673 bytes**, and it crossed **2 MiB (2,097,152)** during
step 11 — every build before that, the ones that worked, was under it. 2 MiB is a common limit for inline
rendering, and this file is unusually exposed to one: its Content Security Policy pins the single inline
script by SHA-256 hash. A preview that truncates the file, or alters any byte of the script, leaves a page
that still displays but whose script the browser refuses to run — which is exactly "not interactive". The
cause is inferred from the timing and that mechanism rather than observed directly, and the note says so.

Of the file, **267 KB were comments** — 12% of the script, none of the behaviour. The build now ships a
script without whole-line comments or indentation, and the commented source is unchanged. It ships at
**1,875,171 bytes, 222 KB under the limit.** Three guards keep the transform from changing what runs: a
comment is removed only if it occupies whole lines and its body cannot contain a closing marker (so a
comment, code, and another comment can never be matched as one span with the code inside deleted);
indentation is only stripped if no string literal spans lines; and the result is compiled with Node's own
parser before it is written. The first draft of the build note describing that hazard quoted such a line
— and its closing marker ended the note itself and broke the build, which is the hazard demonstrated.

**A new gate runs the whole self-test suite inside the shipped file.** Until now the suite ran against the
source; once the build transforms the script, the file a person opens is not byte-for-byte what was
tested. Its first run: 1,092 of 1,093 — the failure a test that assumed no welcome was showing, true in
the headless engine and false in the real page, which shows a welcome on boot. Fixed; 1,093 of 1,093. The
same gate fails the build if the file reaches 2 MiB again.

### Step 14: uncertainty, forecasting, causal, Bayesian and measurement (§10–14)

Read from the direction before building, which paid for itself: each section named a defect the code had.

**§13 — an approximation wearing the name of the full method.** `hierarchicalBayes` did empirical Bayes: it
estimates the between-unit variance once and conditions on it, so its intervals are too narrow. The
direction reserves exactly that name for the full method and says never to expose an approximation as a
full posterior. Renamed `empiricalBayesPool`; every Bayesian result now declares its method and whether its
posterior is full or approximate, and an audit exercises nine real return paths to enforce it.

**§14 — an invented uncertainty and a second fusion path.** With one scale — the usual case — the reference
source's variance was defaulted to 1 and the fused estimate reported ±1 lb that nobody measured. A single
source's noise is measurable as its scatter around its own trend: 0.785 lb here. All seven properties are
now measured or reported as unmeasurable with the reason; a lone scale is reported as uncalibrated, because a
systematic error in it would be invisible. Validated by adding a second scale reading 1.5 lb heavy: the
model recovered +1.48 lb and zero drift. `fuseObservations` still weighted sources by a fixed table — the
approach an earlier pass had replaced — so the same day could be fused two ways; it now uses the
measurement model. Raw readings are never overwritten.

**§10 — one taxonomy, and uncertainty built at execution.** Four places named uncertainty kinds and none used
the direction's names (`reference-data`, `missing-data`, no `userInput` at all). The ten are canonical, old
spellings are accepted as aliases, every kind has a drawing, and `infer()` now assembles sources,
distribution, interval, confidence, calibration, propagation and limitations when a model runs.

**A field nothing ever wrote.** The calibration report said the weight forecast had a hit rate of **0** —
none of 42 outcomes inside its interval. Computed from the ledger it was **76%** (32 of 42). Six places read
`p.hit`; the scorer writes `p.covered`; `hit` was never set anywhere. The knowledge graph therefore labelled
every forecast "outside the range", the recall summary said every one "missed", and the activity timeline
said the same. One missing field, a false statement in four features.

**Validation for being checked, not for being right.** Last step graded the forecast statistically
validated because it is scored against outcomes. Its ledger shows a mean error of +1.70 lb across 42
forecasts (t = 4.3), growing with horizon: +0.38 lb at a week, **+5.01 lb at four weeks**, with 50%
coverage there. A straight line keeps projecting a cut's early rate after the cut slows. Validation now
requires enough scored forecasts and no significant bias, so it is graded operational, with the reason on
its contract. The interval also has no nominal level — its half-width is a heuristic — so its track record
is the only honest statement of what it means, and that is what it now carries.

**§11 — a forecasting family.** Naive, linear and damped-trend candidates, each refit at every origin using
only readings up to it, scored at 7, 14 and 28 days, with residual bias, lag-1 autocorrelation and 80%
coverage per candidate per horizon, and a choice made per horizon. Three corrections on the way: my first
selection said "no significant bias" when every 28-day candidate was biased and the choice had silently
fallen back to lowest error; bias was tested against the raw count of overlapping origins when their errors
correlate at about 0.5, which overstated significance — the effective sample is now used, and at 14 days
the linear and damped verdicts changed; and intervals were widened by a flat 1.25× when coverage was 29%
against 80%, so they are now sized from the backtest error itself. The damped trend removes the 14-day bias
the ledger found in the production forecast; at 28 days every candidate is still biased and the forecast
says so — "the least wrong, indicative only". `_lag1` also collided with a function of the same name in
another module, which silently replaced mine; the namespace guard caught it.

**§12 — the causal pipeline** runs DAG, estimand, identification, treatment model, estimator, balance,
effect, uncertainty and sensitivity in order over the existing pieces — not a second framework — and stops
at the first failing stage. Its first run showed identification choosing a day-of-week instrument and the
pipeline then running the backdoor estimator anyway; the estimator now follows the chosen strategy, with the
instrument case estimating the local effect it actually identifies. And identification had approved that
instrument on strength alone while its own estimator rejects anything with a first-stage F under 10 — this
one scores 1.3 — so the two used different tests. They use the same one now.

### Step 15: recovery, cardio, nutrition and adherence (§15–18)

**Three versions of one bug.** Nutrition reported 7,681 kcal and 582 g of protein "per day" for someone eating
about 2,400 and 190: it divided by `daysBetween(logs[0].date, today)+1`, assuming oldest-first order, and the
logs are newest-first, so the divisor was 1. Searching for the pattern found the cost report doing the same
thing. Cardio reported 267 minutes and seven sessions a week against about 105 and 2.8: it divided by the
number of days that HAD cardio rather than the calendar. The right divisor differs by meaning — an unlogged
food day is unknown intake, an unlogged cardio day is a day without cardio — and each now uses the right one.

**§15 — recovery as a latent state.** Three recovery measures existed, and all averaged z-scored self-reports,
so the reports were the score. Recovery is now a Kalman-filtered latent state pushed down by training load and
sleep debt, with each report a noisy reading of it, weighted by its own measured scatter; one extreme report
moves the estimate without redefining it. My first forecast projected −2.7 and −3.8 standard deviations on
the next two lifting days when the history never left ±0.3 — it ran on a declared coefficient and the
template's prescribed sets. The load effect is now estimated from this person's history (−0.08 ± 0.09,
indistinguishable from zero, so not projected) and planned days use the sets actually done. Its band also
narrowed from day one to day two because the forecast used signed load while the filter used only load above
usual; all three now agree, and the band widens.

**§16 — cardio through a normalisation layer.** Every session becomes absolute intensity (METs, from power,
pace or a labelled reference table) and, where recorded, relative intensity; relative load and MET-minutes are
never added together, and relative load is not reported when nothing records intensity. A recorded zone first
came out as intensity 0 — the zone table carries no numbers — so zones now take midpoints from the same
heart-rate bands used to assign them.

**§17 — nutrient layers.** Database, consumed, absorbed and available are separate, with portion and
absorption uncertainty; deriving them never touches a stored value. Available energy runs about 6% under the
label figure, consistent with the Atwater overstatement stated elsewhere.

**§18 — adherence as a probability.** A completion probability from friction features, each day predicted
only from earlier days and scored against the base rate. The friction features beat the base rate for protein
only; for calories, steps and sleep the model says they do not help rather than claiming they do. Against the
adherence view it first disagreed — steps 25% against 62%, sleep 27% against 64% — because it used the full
step target where the other used 90%, and read `sleepTarget`, which does not exist (the field is
`sleepTargetH`). Both now read one definition and one daily series, and agree to the percent. One user-facing
line framing adherence as "a discipline problem" was reworded.

### Step 16: experiments, knowledge graph, digital twin and optimization (§19–22)

**A false finding.** The knowledge graph held "trend −3.9 lb/wk is within −2.5 to −1.5 lb/wk". The decision
engine's hold-steady fallback asserted "within the band" whenever a band existed, without checking — and
there is no branch for losing faster than the band while recovery is fine, so that case fell through and was
recorded as in range. The claim is now tested ("faster than −2.5 to −1.5"), and a hold with the trend outside
the band is shown for attention rather than as reassurance. The missing branch itself is a decision-logic gap
beyond this step and is recorded as such.

**§19 — experiments.** Plan and results lived in one record and nothing would notice a hypothesis edited after
its outcome was known. The plan is now fingerprinted with SHA-256 at registration; plan and results are read
as separate views; a revision before results is appended to a history; after results the original is left
untouched and the revision becomes a new, linked experiment. A changed plan with results present is reported
as untrustworthy. My first revision only emitted an event and reported "revised" while nothing changed — the
event log here is for replay, and the live change must be applied by the caller.

**§20 — knowledge graph.** It used its own edge vocabulary, none of the eight the direction names, and findings
carried a label and a date. A canonical view now maps each relation by what it actually connects, adds model
and source nodes, and gives every finding evidence, provenance, uncertainty, applicability, creation version
and a review state. "contributed to" becomes associatedWith, never causes; forecast outcomes support or
contradict their prediction according to whether the actual value fell inside the range.

**§21 — digital twin.** Simulations never touched the record, as required. But the do-nothing scenario had an
interval of zero width — exactly 231.7 lb in twelve weeks — because only the change's effect carried
uncertainty, not the trend beneath it. Both now combine, and a projection past the four weeks forecasts are
checked to is flagged as extrapolation.

**§22 — optimization.** Already a Pareto frontier with no silent weighting. Added: objectives and constraints
declared separately, an outcome range on every plan, a feasibility account of all 74 plans searched, and
trade-offs. Comparing outcomes with their ranges, overlapping ranges count as ties — which shrank the demo
frontier from three plans to one, correctly: the higher-effort plans' faster expected loss is not resolvable
from the data. The two plans dropped only for that reason are listed as bets on a faster result, not hidden.

### Built to be verified elsewhere

The build is now verified outside the environment it was written in, so every assumption about this machine
was removed. The real-browser gate hard-coded `/opt/google/chrome/chrome`; it now finds Chrome, Chromium or Edge
on Linux, macOS and Windows, or Playwright's browser cache, and fails with instructions if there is none — never
passing by absence. Skipping it takes an explicit `PHYSIQUE_SKIP_BROWSER=1`, and the run then says the browser
checks did not happen. The sync gate wrote to `/tmp`, which Windows does not have. Node 20 or later is now
declared, and the README says what to install. The 2 MiB size check became a warning: that limit belonged to
one preview environment, which is no longer where the build is judged.

Rerunning the chain after those changes, the browser gate reported three findings that had been exiting
successfully — it only failed on P0. They were real: `svgChart` centres bars on their x position and the first
and last positions sit on the plot's edges, so those bars were drawn half outside the chart and clipped. The
current week in the program chart showed at half width, which reads as half the training. The x-range is now
padded half a slot each side for bar series. The gate now fails on P1 too, and it no longer prints
`[object SVGAnimatedString]` for SVG elements, which had hidden which element was at fault.

### Step 17: copilot orchestration

The copilot's foundation was already sound: a written contract of what an assistant may and may not do,
validation that rejects any reply containing a figure not in its context, and a deterministic answer beneath.
Added against the actions list:

* **Context.** Goal, model, provenance and evidence context. Model context matters most: an assistant explaining
  the forecast now knows it is graded operational, not validated. The goal context first carried null — it read
  `goalWeight`, and the field is `goalWeightLb` — and a test citing it passed only because null is not a number.
  It now reads the goal model. The new context also had to be made citable: the figure collector read five fixed
  sections, so a correct quotation of the goal would have been rejected as invented.
* **Proposals and validation.** Proposals come from the decision engine and the optimizer's frontier, and are
  refused if their action is unregistered, if they lack evidence or an outcome range, if they break a
  constraint, or if they claim not to write while naming an action that does.
* **Authorization.** A proposal that would change the record is held pending and runs only on the person's
  confirmation. The assistant cannot confirm — it never receives the functions, and a confirmation not made by
  the person is refused. Each confirmation is recorded as a `copilot.authorized` event.
* **Explanation traces.** Any answer can be traced to its model, the run that produced it, the readings behind it
  and its uncertainty.
* **The question people ask most.** "Why is my weight not dropping" had no answer. It now goes to the plateau
  diagnosis — and when the premise is false, as in the demo (−1.7 lb/wk), the answer says so first rather than
  inventing a reason for something that is not happening.

### Step 18: export/import and advanced rendering

**One registry for every export.** Exports had grown one at a time — backup JSON, a CSV exporter, a calendar
file, an appearance export, a report exporter — each with its own shape and none with a version check, and
seven kinds on the actions list had no export at all. There is now one registry: dashboard layouts,
appearance profiles, saved chart presets, experiments, programs, provenance and data, in JSON, CSV and Markdown
as each allows. Every JSON export carries its kind, schema version and the app version that made it.

**Every import passes the same stages** and reports which one stopped it: parse, schema, version, semantic,
then canonical. A file from a newer schema is refused rather than half-read; an older one is migrated, and an
appearance file saved before envelopes existed is recognised and migrated rather than refused. Nothing is
imported into interface state: each import is applied only through the function that owns that object. Two
choices are deliberate. A dashboard imports under its own name and never replaces one already here. An
experiment imports as a new plan only — importing another record's results as this person's would be a false
finding, so results always come from the record itself. Every importable kind round-trips intact.

**Charts export as SVG and PNG, and look the same outside the app.** A chart's colours come from CSS custom
properties that exist only inside the app, so a copied SVG renders with invisible lines. The export writes each
element's computed style inline; opened on a blank page with no app styles, every element is visible, and the
PNG is rasterised from that SVG at twice the size.

**Advanced rendering: three of the 28 undrawable chart types,** chosen because they fit data the app holds,
each built against the failure mode its own catalogue entry declares. A calendar heatmap draws an unlogged day
as an empty cell, never as a low value, and draws nothing before the record began. A box plot does not draw a
week with fewer than five readings, and labels the gap. A horizontal bar is sorted by value. Twelve of 37 types
are now drawable.

Looking at the rendered horizontal bar caught a problem the checks did not. Bars need a zero baseline, which the
catalogue requires, and on body weight that draws 255.5 and 256.9 lb as identical bars — the chart was
honest to its rule and useless. Subtracting the trend to fix it would compute a new analytical quantity in the
presentation layer, which is not allowed. So bar and area charts — area also fills from zero, as its own
entry says — are refused where a zero baseline would hide the variation, decided from the data, and the refusal
is enforced at validation so a saved preset or an import cannot route around it.

### Step 19: governance automation (§34)

`npm run governance` reads the same registries the runtime uses, generates `docs/implementation/governance-report`
(JSON and Markdown) from code on every run, compares it with the previous report for drift, and fails the build
on hard findings. Every one of the ten §34 detections is implemented, plus the ones the actions list adds.

The detectors were built around the defect families this project actually shipped and then found by hand, so
that the next instance is caught without anyone looking: a field read that no code ever writes (`p.hit`,
`sleepTarget`, `goalWeight`), a `typeof` guard on a name declared nowhere (`EXERCISE_LIBRARY`), duplicate systems
(`cardioState` beside `cardioState2`), and audits that no gate runs. The never-written detector wraps every stored
record in a recording proxy and exercises the whole application over the demo record. Each detector was then
checked the way a new check should be: reintroducing `p.hit`, `typeof EXERCISE_LIBRARY` and a model without a
version each fails the gate, and restoring them passes it.

**Its first run found real defects.** The knowledge graph attributed observations to an experiment up to
`e.endDate` — a field experiments never have — so the bound was always missing and every reading from the start
onward was credited to the experiment, including readings long after it ended. It now uses the experiment's real
end. `visualAudit` called `visualContractAudit()` behind a `typeof` guard, and that function was never written — my
own, from the presentation work, where the file meant to hold it already existed and the write was refused — so
that part of the audit had checked nothing since the day it was written. `visualCompleteAudit` existed and nothing
ran it; it runs in the self-tests now. `cardioState` and `cardioState2` still read cardio separately; the summary
now takes its sessions from the detailed record, renamed `cardioSessions`.

**It also produced false findings, twice, both mine.** The first name check reported 51 undeclared names, nearly
all local variables: a check broader than its property. Refining it to count names assigned anywhere then
widened the set the duplicate-system check used, which jumped from 1 to 48 pairs of local variables — a fix to one
detector that broke another. The system-level checks now use top-level declarations only. The field detector
first reported fields absent from this data that code does write (a session correction, a phase ending); it now
reports only fields nothing writes, and separately lists absent-by-data fields so the demo's coverage is visible.

Tracked, not failing: 22 registries declared and never read, 4 capabilities with no surface, 4 structural
navigation actions no gate opens, 6 registered models no test names directly, and the two absent-by-data fields.

### Step 20: full verification and release

`npm run release` runs every gate and then the 24-item final verification list, mapping each item to something
that actually runs and recording its evidence; an item with no check is reported NOT VERIFIED rather than ticked.
It also runs one concrete check for each of the eleven §33 adversarial cases, follows a new observation through all
fourteen stages of the §38 chain, and generates `docs/release/`: the release record, a manifest hashing every
shipped file, the capability maturity report and the §37 definition-of-done matrix.

Two gates were missing and were built for this step. **Visual regression** pins the browser clock — the demo is
generated relative to today, so nothing was comparable run to run — and records chart output, design tokens,
typography, layout and chart semantics against a committed baseline. **Model reproducibility** loads the app twice,
independently, and requires every model to give the same result and the same run identity.

**Building them found real defects.**

* **A race in loading.** The maintenance baseline read 2,662 kcal in most loads and 2,606 in some, from identical
  data at an identical moment: boot captures today's snapshot on a timer, and whether it fired before or after the
  record loaded decided whether that snapshot existed. Loading now ends by capturing it, and twelve loads with
  deliberately varied timing give one answer.
* **Environment in the picture.** The dashboard's attention count read 6, 7 or 8 between loads, because two
  platform jobs — the update check and the food-database version fetch — add an item when they fail, and whether
  they had failed yet depended on timing and network. That would have made the baseline fail on any other machine.
  The capture fixes job state; the jobs are tested elsewhere.
* **Impossible dates were valid.** `isValidISO` accepted 2026-13-45, February 30 and February 29 of non-leap years,
  because `Date` rolls impossible dates over and "it parses" was the test. It now requires a round trip.
* **Implausible readings still counted.** A 9,999 lb weigh-in was flagged and still moved the weekly trend by 0.54
  lb. Flagged readings now stay in the record and out of the models.
* **Run identity did not include the data.** It hashed `request.inputs`, which is empty for a registry call, so a new
  weigh-in left the id unchanged — and the reproducibility check passed only because nothing in the id could differ.
  Step 6 claimed any material change produces a new id; that was tested against `runIdentity` directly and never
  through `infer()`. The record's content hash is now part of it.

**The gates' own first versions were wrong four times**, and each is recorded where it happened: reproducibility
compared raw JSON including random record ids and key order; the release helper read a migration count as a problem
count; the impossible-value check passed a flagged value that still moved the model; and a first diagnosis of the
attention-count variation (order dependence) was ruled out before the real cause was found.

**Result: 24 of 24 verification items, 11 of 11 adversarial cases, 14 of 14 traceability stages.** That is a verified
release, not a finished one. By §37 no capability is complete: of eighteen, two reach four of five boxes, and none is
production-ready. No model is statistically or experimentally validated — the weight forecast lost that grade in
step 14 for a bias its own ledger shows. The release documents state both.

### Step 21: requested fixes and features

**Appearance did not persist — because data did not.** Two defects, both on reopening. Startup loaded the localStorage
mirror (rewritten only at checkpoints), queued its first saves, then flushed that queue over the newer IndexedDB record
the moment the database opened — before reading it. A record at revision 66 came back at revision 8: every change since
the last checkpoint, not only appearance, was destroyed by opening the app. Separately, the startup sync merge gave a
projection's DEFAULT settings precedence over the person's, so the theme, text size and density reset while accent and
font (which have no defaults) survived. Startup now reconciles before it writes and applies the winning record's
settings; settings merge per key. A new persistence gate reopens the app three times against the same storage, and
fails with either bug reintroduced.

**Charts clipped on the left.** The floating thumb rails covered each chart's first 37 px — its y-axis — at every
width up to 1024 px. Charts are inset by the rails' measured intrusion, recomputed on every layout change; 3,299 chart
positions across widths, sizes, densities and scroll positions show none under a rail, and the browser gate now checks
it. Three errors of mine on the way: an assumed card padding, rails measured mid-animation, and a hidden tab's card
used as the reference. On a 375 px phone charts are narrower (264 px); a new setting hides the rails and restores 325.

**Progress photos could never be added.** The gallery existed and `addPhoto()` existed, but nothing called it. Photos
can now be taken with the camera or chosen from the library, are resized on the device (an 11.7 MB camera image became
806 KB), keep the view and lighting they were taken with — which the first version validated and then dropped — and
show immediately, persist, and can be deleted.

**Casual · Insightful · Developer.** One setting, wired through the shared building blocks so nothing is missed:
method notes, classification badges and advanced sections hide in Casual; every command and tab carries a level, so
menus, palette and tab bar follow it; Developer adds model, version, maturity and run id to every widget and a trace
line to every card — including, for the 54 cards without one, that they have no presentation contract. Every page
shows strictly more at each level, and the browser gate checks that. A pinned command stays visible at any level.

**Colour.** The existing custom accent had never been applied — validated, saved, exported, and listed by the token
inspector as in use, while the page ignored it. It is applied now. New: state colours with a colour-blind-safe and a
high-contrast preset, and a background tint. Every choice is validated against the theme it is shown on; good and
negative must stay distinct under all three colour-blindness simulations. My first presets failed that validation
under tritanopia — hue without lightness separation — and were replaced by values found with the validator itself.

**Validation, honestly.** The capability matrix's "validated" box read a hand-assigned grade table while the release
documents said every status was derived from evidence; two capabilities were "validated" on a grade someone had typed.
Now infrastructure is validated only by a live check of its behaviour, and analytical capabilities only by a derived
grade of statistically validated or better. Five infrastructure capabilities reach four of five boxes; the two that
were previously reported at four fall to three. Five capabilities had no surface and now have real ones. The forecast
procedure is validated on hold-out forecasts it never saw: on the demo's 70 days there is too little evidence at every
horizon, and that is what it says; on a 240-day record it validates at 7 and 14 days, so the validator can say yes.
The forecast family's predictions are now recorded — all of them, reliable or not, since recording only confident ones
would flatter the record — so a validated grade can be earned against real outcomes.

### Step 22: the missing decision rule

Losing faster than the band with recovery fine had no rule. It fell through to "hold steady" — which for a while
recorded the trend as inside the band — and loss faster than planned is exactly when muscle is at risk. There is now
a branch for it. In the first two weeks of a cut it holds and extends the window, saying why: early loss is mostly
water and glycogen. After that it eases the deficit by half the gap (about 500 kcal/day per lb/week, in 50 kcal
steps between 100 and 400) and rechecks in two weeks. Replayed at the demo moments that used to say "hold steady":
day 12 at −4.4 lb/wk now waits with a recheck date; day 19 at −3.3 lb/wk now raises intake by 200 kcal/day.

The rapid-water fixture expected HOLD and now receives WAIT — the specific answer for early water loss instead of the
generic fallback. Neither changes intake, and a test now asserts that for the scenario. The visual gate had been
snapshotting run ids, which hash the record's content, so any change to the demo record failed it for reasons that
were not visual; they are excluded, after confirming against the previous release that nothing else changed.

### Step 23: which forecast is shown

The displayed forecast was the straight-line `weightForecast()`; the forecast family was built, backtested and
recorded, but never shown. The two now meet head-to-head on the hold-out origins — the later 40%, which the family's
procedure never saw when choosing its method — using the forecast actually displayed, not the backtest's simplified
linear candidate. The family is shown at a horizon only if its error is at least 10% lower and its bias no larger, on
three or more hold-out forecasts. What is shown is exactly the procedure that was evaluated.

Two corrections to my first version: it promoted the 7-day forecast on 1.28 against 1.30 lb over six forecasts — a
tie that would have switched the display on noise — and it evaluated one method while showing another (the
full-sample ensemble). On the demo nothing is switched: a tie at 7 days, the family worse at 14, too little evidence at
28, and each reason is stated. On a 240-day cut that slows, the family wins at 28 days — half the error (0.93 against
1.85 lb) with the bias gone — and only there, which is where damping should matter. The forecast card now says which
forecast is shown at each horizon and why; both forecasts keep being recorded under their own ids.

The release gate then failed on performance, and it was right to. Routing the displayed forecast through the
head-to-head made current state run a backtest over every origin in the history: 2,043 ms on a five-year record against
an 1,800 ms budget, with decide and replay over theirs too. The backtest is now bounded to the most recent 240 days —
a regime from years ago says little about the present one — and memoised per record state: current state is about
480 ms, decide 690 and replay 810 at five years. Packaging is now conditional on the release passing; before, a failed
release could still be packaged.

### Step 24: text and colour without codes

**Fonts.** Tools had three overlapping controls. "Web fonts" fetched Fraunces, Inter and JetBrains Mono from Google, so
it failed offline and turning it off applied only after a reload; the Typeface list named Atkinson Hyperlegible and
OpenDyslexic but never loaded them, so choosing either silently showed Verdana or Comic Sans; and the base stylesheet
named the Google faces directly, so headings and figures fell back to whatever the system had. Now one Text card: nine
faces in plain words, each shown in itself, eight of them bundled in the build (SIL OFL 1.1, fonts/ with licences) and
verified to render with the network off; plus text size, line spacing, letter spacing and weight, all live. The policy
no longer allows any font origin but the document itself. Old face ids map to new ones.

**Colour.** Themes are picture previews; accents are swatches plus a rainbow slider. A custom accent is stored as a
hue and derived for the active theme with its lightness adjusted to stay readable — every hue on every theme stays
above 3:1 — so it survives a theme change. A background tint too strong to read is capped at the most readable level
rather than refused. Colour-blind-friendly colours are one toggle. Hex values appear only at the Developer level.

**Widest text.** Offering wider faces exposed layout that could not stretch: at OpenDyslexic, extra-large, widest
spacing, every page scrolled sideways (the header's actions) and Plan and Diagnose worst (a chip grid on 1fr columns,
which cannot shrink below their longest word). The header wraps only when it must, every grid column can shrink, and
the browser gate now sweeps every page at the widest settings. Fixing the header first made it wrap at default size
too, 22 px taller on an ordinary phone; the name now shrinks first. Hints, which were styled only inside form rows and
rendered as body text almost everywhere, now have one quiet style. My colour sliders were 14 px tall and failed the
touch check on every screen; they are 44 px with the rainbow on the track.

### Step 25: detail levels by audit, and a casual-first pass

**Every panel classified.** An inventory of the running app found 99 panels on 12 tabs, and at the Casual level the
Tools tab alone showed 25 — System health, Storage and integrity, Event log and sync, Interaction matrix, the data
dependency graph, self-tests. Each panel now has a rule: Casual is logging and following the plan; Insightful adds
forecasts, diagnosis, experiments, learning and replay; Developer adds sources, provenance, models, ledgers and every
tool and check. Casual shows 33 panels, Insightful 77, Developer 99. Levels are applied by a mutation observer to
any panel the moment it appears, whatever code built it — tagging at the end of renderAll missed every panel a tab
rendered on arrival, so Insightful first showed all 99. A panel with no rule is reported, not defaulted. Two errors
of mine on the way: hiding every collapsible section in Casual hid casual ones (favourites, recipes, profile), and a
phase-name rule caught "Recovery and deload" because Recovery is also a phase.

**Casual reads plainly.** A scan of every page Casual shows found 16 technical phrases — classification badges
(DERIVED, MEASURED, HEURISTIC), "derived from the food log", methodology subtitles, "Backup (JSON)", an About text
that opened with "offline-first, single-file adaptive body-composition operating system". Each was reworded or moved
to Insightful or Developer. Casual keeps the quick-log button and undo and drops the position rail and command-palette
button, which covered content at the screen edges. The browser gate now checks that every panel appears exactly at
its levels and that Casual pages carry no badges, hex codes, raw ids or file-format names.

### Step 26: movement, mobility, progressions and after the session

**The library.** 33 exercises on 16 patterns and 8 kinds of equipment — no carries, no core patterns beyond a crunch, no
jumps or throws, no rotator-cuff work, no kettlebells, bands, trap bar, landmine, rings or sled. Now 160 exercises on 28
patterns across 19 kinds of equipment, each with a level (88 beginner, 49 intermediate, 23 advanced) and plain cues, and
a searchable library screen with filters, an animation of the movement, what it works, and its easier and harder
versions. Four muscles were added so the new patterns load something drawable — obliques, inner thighs, rear shoulders,
traps — and the hip thrust moved from hinge to hip extension. The original 33 keep their ids and names.

**Progressions.** Seventeen ladders, easiest to hardest, each with a plain rule for moving up and down, merged into the
existing progression registry: existing families keep their step ids, so recorded skill states still resolve, and every
step now links to its library exercise.

**Mobility.** Ten yoga poses became 43 stretches and drills over thirteen body areas, six named routines, a warm-up built
from a session's movements and a cool-down built from the muscles it trained (never fewer than three stretches — a chest
day first produced one).

**After the session.** Saving a session now opens a summary: exercises, sets and hard sets, new records (heaviest weight or
best reliable estimated max against every earlier session), muscles worked, how hard it felt and how you feel (stored on
the session, with its duration the standard session-load measure), what to do next time — including "ready for the
harder version" when every set cleared a ladder's target — and the cool-down.

**What I got wrong, and what it found.** I built the new screens beside an existing movement system my inventory had
missed — a second Mobility sheet, a second After-the-session sheet, a second warm-up and cool-down — and the older
definitions silently replaced the new ones, so the new Mobility screen never opened. The existing screens are now the
canonical ones and are expanded; the new items joined the existing library; the ladders joined the existing registry.
Looking for how that happened found an older instance: in step 21 my Recovery-state sheet and an older one shared a name,
and one silently replaced the other. Governance now fails the build on any sheet defined twice unless the later one
wraps the earlier, and it was checked by reintroducing a silent redefinition.

### Step 27: session load, mobility history, programmes and a welcome setup

**Session load in recovery.** Training stress was hard sets per day. It is now effort × duration (session-RPE) once
three or more sessions carry a rating, with unrated sessions estimated from the person's own load per hard set (about 50
units in the test) and the number estimated reported; with fewer rated sessions it stays on hard sets and says why.

**Mobility history.** Completed routines and cool-downs are logged as mobility minutes with the routine's name, appear in
the log history, and are summarised for the week on the Mobility screen; the new type's consumer is bound to the
function that reads it, as the data contracts require.

**Programmes from the expanded library.** Templates never asked for core, carries or power, so no generated programme
could contain them and coverage was capped at 5 of 8 groups. Every day now has core work; lower and full-body days end
with a carry and, for intermediate and advanced lifters with the equipment, open with a jump or throw; exercises are
chosen at or below the person's level; doses follow the exercise — metres for carries, seconds for holds (a wrist curl
was first prescribed in metres). Coverage reaches 7–8 of 8.

**Welcome setup.** A first visit showed a six-second toast. It now opens an eight-step setup — welcome, about you, goal,
training, detail level, look and feel, how it works, done — skippable at every step, reopenable as Setup guide. Every
choice goes through the setters the rest of the app uses: the profile write was extracted from the Profile sheet into one
function both use, experience lives in the profile field it already had, and finishing opens the existing phase sheet
with its own target recommendations.

**Defects found on the way.** Fourteen new exercises resolved to older ones — the originals carried catch-all aliases
("plank" on Abdominal movement, "chin-up" on Pull-up) — so a logged plank counted as abdominal work; exact names now win
and colliding aliases are dropped at load. Two of my additions duplicated originals whose names were already Walking
lunge and Bulgarian split squat, and the cues I had written for those originals described different exercises. The
pull-up bar was an alternative rather than a requirement, so a pull-up could be prescribed to someone with no bar — in
the original library too. Equipment the library gained (kettlebells, bands and others) was unknown to the equipment
check. The setup reappeared after being completed, because first run read the quick-start copy before the stored record
loaded. And the persistence gate exposed a latent loss in my step-21 fix: a startup merge rebuilt the record at revision
0, so which stored copy won the next startup depended on timing; the revision now never goes backwards, and the gate
asserts it directly.

## H0 — architecture integrity (complete)

The roadmap was restructured into five horizons with hard gates (H0 integrity, H1 product spine, H2 market-parity
execution, H3 adaptive integration, H4 intelligence maturation). H0's gate: one canonical owner for each core concept
and clean boundaries before any new product object is built.

**Ownership.** The goal had four owners — trajectory took the phase's weight first, the protein suggestion only the
profile's, scenarios and the copilot their own fallbacks. canonicalGoal() is now the only reader: the goal belongs to the
individual, and a phase's weight and date are a milestone. Governance fails the build on any other read (checked by
planting one). Eleven entity contracts — Individual, Goal, Constraint, Phase, Plan, Intervention, Execution,
Observation, Response, Decision, Adaptation — state identity, lifecycle, owner, temporal semantics, provenance,
correction, events, read model, registry and layer; each claim is checked against the running code, and every store in
the record must belong to a contract or be listed as supporting (checked by planting an unowned store). Six are
implemented, Constraint is partial, Plan, Execution and Response are specified for H1 and Adaptation for H3.

**Governance debt closed, none by suppression.** Direct gateway tests for the six models that had none; the six
navigation paths tested through the control a person uses; 20 dead registries removed (policy write-ups moved to
docs/architecture/presentation-policies.md), one classified with its reason; the stale header corrected; four
capabilities registered with result contracts and surfaced; fixture coverage for phase outcomes, superseded sessions
and effort; the function-name inference call shape removed, with its two options carried forward as narrowing
overrides; a catalogue generated from the running registries on every run, with drift reported. Governance: 19
passing, 0 tracked, 0 failing.

**Defects found by the work.** The inference gateway labelled a model's refusal as a successful run, defeating the
minimum-evidence rule at the layer meant to enforce it. The supplement review matched creatine to an appetite study
(new RegExp(undefined) matches everything). Motor learning, called bare, asked for sets of "undefined". What is worth
measuring next never reached its panel (folds had no id); nav.section had no way in; two Tools folds shared an id and one
open/closed state. Eleven of the twelve patterns added in step 26 had no biomechanics. REF_PROTEIN was cited but never
attributed; dashboards saved before a widget rename would not load. Running the in-app self-test changed the stored
record (884 → 912 observations) through the live event log; saving is now suspended during any test or fixture. On a
phone, typing in the phase targets or the exercise search replaced the field each keystroke and closed the keyboard;
sheets now update in place and never replace the focused field. Edit phase with no id opened Start a phase.

**Durability.** Intermittent settings loss inside the full check was a real data-loss window: between checkpoints the
localStorage mirror was skipped (and marked "unchanged", though the record had changed) while IndexedDB writes were
debounced and committed asynchronously, so for a moment after every save — longer on a slow phone — the latest change
existed only in memory. Under a 6× throttled CPU a weight logged just before closing was lost. A save now also writes
the mirror whenever IndexedDB was not durable when it began; the mirror is flushed on pagehide and when hidden; a loss
that still happens is detected on reopening and reported. The persistence gate now also runs throttled, and the release
gate list, which had omitted persistence entirely, includes it. Gate results can be recorded per build
(tests/gate-record.mjs) and the release accepts them only for the identical build.

## H1 — the product spine (first increment)

Goal → Constraints → Plan → Execution → Observation → Response → Explanation → Next action now works end to end.

**Constraints** (implemented): training days, session length, equipment, cooking time, food budget and diet
restrictions, read as one model with what is missing named; the setup guide gained a session-length choice and a Food
step. **The plan** (implemented): a versioned object over the canonical goal, the phase's targets, the programme's week
and the decision lattice — no second engine. Each version records its trigger, evidence, alternatives and reason; an
edit that changes nothing creates no version; versions are hooked in the core paths (startPhase, updatePhase,
setProgram, an applied decision, a changed constraint), so every route records them. Records from before H1 adopt a plan
once and say so. **Variants**: full, reduced, minimum, recovery and travel — the same objective, smaller.
**Execution** (implemented): intended from the plan, done from what was logged, with explicit skips and versions; a
missing log is unknown, never a failure. **Response** (partial): read per week, and only when enough of the plan was done
and recorded; linking it to the adaptation it causes is H3. **Today's actions** was rebuilt on the execution model rather
than kept beside it: the next action with its reason, each item's status, and the smaller versions one tap away. **The
Plan tab** shows the plan and, at the Insightful level, why it changed.

**Defects found on the way.** The demo's own interventions fired the plan hook mid-generation, so version 1 captured a
half-built state and a later edit's explanation listed a change the person never made; hooks are off during generation.
The daily-intake read used a function that did not exist and silently summed to zero. The new weekly responseFor()
silently replaced the existing responseFor(variable), and the experiment designer sized nothing; governance now fails on
any top-level function declared twice. The build's mutation-path audit rejected tests that wrote phase targets directly,
and a silenced build had hidden that the dist was stale; builds now report their outcome.

**Second increment.** Feasibility: the plan is checked against the person before they are asked to follow it —
session length against each session's estimated time (8 minutes of warm-up plus about 2.5 per set), sessions against
the days they can train, and each exercise against their equipment — with a fix for each conflict, shown on the plan.
Food constraints: diet restrictions (vegetarian, vegan, no dairy, no gluten, no nuts, halal, kosher) filter every meal
suggestion by category and name, and the app says a match is not a certification; cooking time and budget are not yet
used to choose meals, and it says so. The plan's signals — it changed, it does not fit, a constraint is missing, a save
was lost on closing — now arrive in the one attention queue in its what / why / what-you-can-do form. A first plan
made from setup records that it came from setup.

**H1 gate met.** The spine gate (tests/spine.mjs, in the full check and the release) starts from an empty app and,
through the controls, sets a goal and constraints, starts a phase with suggested targets, receives plan version 1 made
from setup, follows Today's next action to weigh in, logs a session, reads the plan and why it exists, and sees the next
action move on. Writing it found that a person starting their first phase got no calorie suggestion (the rate band was
read only from an active phase), so setup produced a plan with no calorie target; and that its own first check passed
on the sheet's heading while the field was empty — it now checks values.

**Third increment.** One notification source: saving failing, an update being ready and being offline were separate
banners on Today (and a due experiment appeared twice); they are attention items now, and Today presents the most urgent
one from the queue. Cooking time filters meal suggestions by what each food needs, judged from name and category; the
food budget favours cheaper staples by scaling each strategy's own ranking, using rough cost tiers the app calls
estimates, not prices. The programme generator fits each day to the session length, trimming the least important work
first and stating every trim; the plan's fit conflicts offer to build a programme that fits.

## H2 — market-parity execution (in progress)

Gate: a person can plan, carry out, log, review, edit and replay ordinary training, nutrition, activity and recovery
without leaving the app.

**Workout mode.** Today's planned session with targets and a suggested load per exercise (from this person's history,
through the progression engine where it has a recommendation), sets entered and ticked off without the keyboard
dropping, a rest timer between sets (2.5 minutes for main lifts, 1.5 for accessories, 1 for core), a swap to another
exercise of the same movement that fits the equipment, a draft that survives closing the app, and a finish that saves
through the ordinary session path so the summary follows. The chosen version of the day reshapes it: reduced, minimum
(one set of each main lift), travel (bodyweight movements). A template's "variation" becomes the variation this person
actually logs. Today's next action starts it, and resumes it when a workout is under way.

**Barcode scanning.** The bundled branded database already mapped barcodes to foods and typed codes already worked;
the camera now reads them where the browser has a barcode detector, and where it has none the scanner says so and takes
the typed number. A code not found carries into the custom-food sheet.

**Defects found on the way.** The workout module first loaded before the action registry, so its first registration
threw and nothing after it loaded; it loads after. The scanner registered food.custom, silently replacing the existing
custom-food action everywhere; governance now fails on any action registered twice, which also found two old
duplicates — an identical nav.tab, and two different obs.retract actions, the winner passing a dialog option the
dialog does not read, so its button never said Retract.

**Programme versions.** What the programme was on any date, what changed and when, and what was done under each
version, from the same sources the replay already uses (switches in settings.programHistory, edits as
program.customized events). Replay itself was already correct for both; the view was missing. Shown on the Train tab
at the Insightful level.

**The exercise catalogue, completed.** Every one of the 159 exercises now resolves plane and axis, joints, load mode,
stability, range of motion, setup, general cautions and its easier and harder versions — derived from the pattern's
mechanics, the equipment and the ladders, so one correction reaches every exercise it applies to — and an audit fails
if any field is missing. Shown in the exercise library as "How it loads you" and "Take care if you have", stated as
general cautions, not medical advice. The first version flagged forearm planks for the wrists; it no longer does.

**Food entity resolution.** Every food has a canonical identity — the barcode for branded items, the database id for
reference foods, a custom food's own id unless the person says it is the same as another — and recent foods, frequent
foods and meal-suggestion familiarity count per identity. Likely duplicates (the same barcode, or a close name with
matching nutrition — a shared name alone is not enough) are suggested on the Food tab with "Same food" and
"Different"; neither changes anything already logged. The first test of it used egg-white nutrition for a "whole egg"
and the detector rightly refused the match; plurals are now folded ("egg" and "eggs").

**Logging speed.** Recent and frequent foods can be logged again at their last portion in one tap, with undo.

**H2 gate met.** The parity gate (tests/parity.mjs, in the full check and the release) plans, carries out, logs,
reviews, edits and replays through the controls, with the common logs held to a tap budget: a weigh-in in 2 taps plus
the number, a frequent food again in 2. A helper in it first dropped its argument, so every before-and-after check
compared with undefined; the spine gate had the same helper but never passed an argument.

**Still open from H2's scope:** richer programme, session and nutrition views, which the roadmap now builds as each
capability is surfaced rather than as a phase of their own.

## H3 — adaptive integration (in progress)

Gate: what a person actually does, and how their body responds, can cause a traceable, justified plan change.

**Moved sessions.** Execution matched a scheduled session only to a session on that date, so a session done on
Wednesday instead of Tuesday read as not recorded, and the demo's four weeks read almost entirely that way with 28
sessions on other weekdays. Within each week a scheduled session with nothing that day now takes a session from another
day — a same-named one first — and none is counted twice; it reads "done on Wed instead".

**Adherence analysis.** Four weeks per domain, diagnosed without blame: fits, does not fit the week (a specific day
missed most weeks), too demanding (under 70% of the planned volume), not enough recorded, or a recent change. On the
demo: the Friday session missed in 3 of 3 weeks, sessions at 49% of the planned sets, 8 moved.

**Adaptations.** Proposals follow from the diagnosis — fewer training days, a step target set just above what is
achieved — each with its evidence, the alternatives weighed, the expected effect, the trade-off and a confidence, on
the Plan tab and in the attention queue. Nothing changes until the person applies it; "Not now" is remembered for two
weeks. An applied proposal becomes a plan version recorded as an adaptation ("Adapted to what you actually do"), and a
week later reports what happened since. The Adaptation contract is implemented.

**Recovery shapes today.** When recovery reads below the person's baseline, Today suggests the reduced session, one tap
away.

**Gate.** tests/adapt.mjs (in the full check and the release) passes: the pattern is diagnosed, proposed with its
evidence, applied through the control, recorded, explained, and read a week later; low recovery shapes today's session.

**Real data sources, proven end to end.** Realistic exports (tests/fixtures, and a 35-day export generated by the gate)
found that the import had never worked from the app: the import screen's "Choose a file" was a button wired to the
backup-restore action, which expects a file input, so it did nothing — and had it worked, a health export would have
been treated as a backup. The parsers were reachable only from tests. They also carried five faults: steps from an
iPhone and an Apple Watch were summed (every walk counted twice), as was dietary energy from two food apps; sleep was
never imported (a category record, read as a number); body fat stayed a fraction (0.21%); a CSV's "Weight (kg)" was
read as pounds; and resting heart rate was emitted under a type that does not exist, so every reading was refused.
Now: a real file picker, format detection, a preview before anything is written, a single commit, and exports read in
8 MB slices through an incremental parser that gives exactly the whole-file result. Per day the most complete single
source is taken, not the sum of devices; sleep is time asleep, belonging to the morning it ended; units come from the
headers. Reconciliation is stated: an imported day total never stacks on a day already recorded — the import fills
gaps and reports what it skipped — while averaged measurements keep both readings and report disagreements. Every
imported value keeps its source, device and trust weight. The integration gate (tests/integration.mjs) imports through
the picker, checks all of this, imports twice, and shows the weight trend, the personal maintenance estimate and a plan
running on the imported data.

**H3 gate met** — adaptation (tests/adapt.mjs) and integration (tests/integration.mjs), both in the full check and the
release.

**Outside this architecture (unchanged):** live connections — HealthKit needs a native iOS app, Health Connect a native
Android app, and wearable APIs need the server hosted with vendor credentials. File imports cover the same data today.

## H4 — intelligence maturation (first increment)

Gate: the system individualises over time without claiming certainty it does not have.

**Personalisation labels (MK W24).** The headline estimates say how personal they are, in words, at every detail level:
"Starting estimate" (population-based, with what would make it yours), "Adjusted to you", "From your data", "Out of
date", "Not enough data yet". Derived from the result's own class, status and freshness, so the label cannot drift from
what the model did. The first version called a population fallback "based on people like you, not yet on you" for a
person with eight weeks of records whose recent data had stopped; that case now reads "Out of date".

**Knowledge that only ages downward (D1 §25).** Decayed confidence could rise: the starting values and the thresholds
were on different scales, so a "low" claim decayed to 0.31 read back as "medium". One scale now, with levels holding
until the midpoint to the level below, and a decayed level never above the original — checked at every age.

**Model health (D1 §15).** Forecasts are trusted according to their record: not yet proven (under ten checked),
leans high or low (a clear bias, with its size), getting less reliable (recent predictions hitting their range clearly
less often than earlier ones), ranges wider than needed (sustained over-coverage, from twenty checks), or performing as
stated. On the demo, the straight-line forecast leans about 1.7 lb high over 42 checked predictions, and says so on the
forecast card.

**Defects found on the way.** The label was first placed after its tile's closing tag, so each label became its own
cell in the tile grid; moving it, it landed in the empty-tile branch before its variable was set, where empty tiles
would have read "undefined". The browser gate now fails any tab that shows undefined, NaN or [object Object], at any
level.

**Gate.** tests/intelligence.mjs (in the full check and the release) passes.

**One answer to "is this lift improving?" (second increment).** Two rules answered it differently. The per-lift response
model called a lift flat unless four weeks of trend beat the standard deviation of all its session bests — but a
progressing lift's spread includes its own progress, so the steeper the progress the more it had to beat; and even
with the scatter taken around the trend, comparing a trend with one session's scatter asks the wrong question. It now
tests the slope against twice its standard error. The strength trend called any 2% rise "improving", with no allowance
for noise. "Improving" now needs both; a rise not yet clear of the noise reads "rising, not yet clear", and the claims
say so with the numbers ("+2.6 ± 1.7 e1RM/week") instead of "flat at +2.6". Declining keeps its early rule on purpose:
it guards muscle loss, where an early warning is worth a false alarm. Decisions read only the declining side and are
unchanged.

**Knowledge that says what would change it (MK W13).** Every claim in the Knowledge sheet names the evidence that would
overturn it; response claims have "Test it", which opens the experiment designer on that claim's variable.

**The assistant answers the question asked, or says why not (third increment).** Questions put to it on the demo found:
"Does sleep affect my hunger?" matched the sleep pattern and was answered "7.3 h, steady" — a status, not an answer,
when the app knows the relationship is not established; questions it could answer went unmatched (why the plan changed,
am I getting stronger, will I reach my goal by a date, what should I eat); a question about kidneys got a generic list.
Relationship questions now route to what is known, thought (said as an association, not a cause) or not established,
never to one variable's status; health-condition questions are declined with the reason; the others are answered from
their canonical sources. A goal-date answer follows the whole projected range — "likely" only if even the latest
projection is in time, "possibly" if the central one is. The question sheet did not render a declined answer at all,
inserted the answer's value unescaped (it can contain food names a person typed), and offered "Where this comes from"
for five trace names that do not exist; all three fixed. The knowledge sheet stated the uncalibrated maintenance
component (2,825 kcal) while every other surface stated the canonical estimate (2,662); it now reads the canonical one.

**Gates that depended on the day.** Run on a Saturday, the parity gate found no lifting session to run and failed, and
the adaptation gate's recovery check passed by skipping; both are pinned to a lifting day.

**The assistant answers the question asked (third increment).** The assistant is deterministic — it answers from the
record and says so. Asked a spread of real questions on the demo, four went wrong: "is my sleep affecting my weight?"
was answered with sleep hours (the relationship pattern matched "affect" only as a whole word); "how much protein should
I eat?" got a meal plan (it matched "eat"); "why did my weight go up yesterday?" — the commonest question — had no
answer; and "can I eat 800 calories a day?" got a list of suggestions. Now: any inflection counts as a relationship
question; protein has its own intent with the target and its basis; a day's change is compared with the person's own
scale noise and the trend; and a calorie figure is graded against two separate thresholds — at or below 800 kcal a
very-low-calorie diet, below 1,200 / 1,500 kcal the minimum generally advised without medical supervision, and below
resting energy the app's own planning floor, called a policy and not a medical line (the first version gave the
medical warning to a 252 lb man asking about 2,000 kcal). The day-change intent first caught "why is my weight not
dropping" — a plateau question with its own answer — and now takes a single day's change only; plateau phrasings
were widened. Health-condition questions are still declined, and out-of-scope ones are not guessed at.

**Charts the surfaced capabilities need (fourth increment).** 25 of the 37 catalogued chart types had no renderer —
not the 12 recorded earlier — and the catalogue did not say they were only planned; nothing chose them, so nothing
failed, but the catalogue overstated. Three are now drawn because a surfaced capability needs them, all through the one
chart bridge: a heatmap for "How the last four weeks went" (the plan against what was recorded, every state told apart
by shape as well as shade, each mark titled), a timeline for "Plan history" (plan versions, programme changes and phases
in lanes), and a stacked bar for "This week by macro" (a day with nothing logged is a dash, not a zero bar). Looking at
them rendered found two collisions the numbers did not: "today" clipped to "to" at the calendar's edge, and the target
label overlapping its line. The catalogue reports each type as available or planned (15 and 22), and governance fails
any surface that draws a type without a renderer (checked by planting one).

**Every chart type (fifth increment).** The remaining 22 renderers were built, so all 37 catalogued types can be drawn,
each enforcing the requirement its catalogue entry states: a sankey whose flows are not conserved, a violin or
ridgeline with too few values, a funnel whose stages grow, a candlestick whose high does not contain its close, a
donut, treemap or sunburst whose parts do not make their whole, a polar chart that is not a genuine cycle, a radar axis
without a stated maximum, and more — each refused with its reason rather than drawn. A chart catalogue (Developer
level, from the palette) draws each type from the person's own record. Looking at it rendered found what the numbers
did not: step counts with decimals, unnamed and clipped bubbles, a waterfall whose zero baseline hid every weekly change
(now started near the data, and said so), a donut total wider than its hole, colliding network labels, small multiples
on one axis across a 500 lb and a 55 lb lift (now % change from each lift's first session), low-contrast treemap labels,
indistinguishable sunburst segments, and clipped axis labels. Building them also found: a helper named like one in the
conditioning module, which would have silently replaced it (caught by the duplicate-function check); the catalogue's
action registered before the action registry exists — the same trap as the workout module, now a governance check; e1rm
returning an object, not a number; the knowledge graph keyed by key, not id; and a pipeline that returned "ok" around a
refused chart, which now fails at a requirements stage.

**Validation on accumulating data (sixth increment).** Calibration by context now reaches the forecast: when the
record spans more than one situation, the forecast is judged in the current one ("leans high in this situation", "not
yet proven in this situation"). Prior sensitivity is stated exactly: the maintenance estimate blends prior and data at
n / (n + 14), so 1 − w of any prior error carries in — 35% on the demo's 26 days — and a weaker or stronger prior
moves it within 2,640–2,690 kcal; the first version left out the estimate's own outcome calibration and gave a range
that did not contain the number shown. Associations carry a placebo check, trend-adjusted: a one-week "future cardio"
placebo alone let a pure trend pass, so the outcome's trend is removed before comparing. On the demo, "hunger runs 0.8
points lower on cardio days" falls to −0.35 once the trend is removed, fails, and now says it may not be the cardio.

**H4 complete.** Everything planned for it is built and gated: personalisation labels, knowledge that only ages
downward and says what would change it, model health overall and in the current situation, one answer to "improving",
an assistant that answers the question asked and knows its limits, prior sensitivity, trend-adjusted placebo checks,
and all 37 chart types. The intelligence gate (tests/intelligence.mjs) checks it in the running app.

**What remains is not code.** The models are validated on synthetic and demo records; "production-ready" for a model
means a prospective track record on real people, which only accumulates with use. The capability register still shows
0 of 22 production-ready for that reason, and says so.

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

## Usage review and external sources (after H4)

**Defects from use on a device.** Three self-test checks failed on a second run in the same page: a test left a chart in
the widget registry while the record was restored, and the compaction check assumed an empty archive. Behind that was a
real bug — a widget in the registry but not in settings was lost on reload; saving now persists either way. The
self-test restores the widget registry, and the shipped gate runs the suite twice. The target pills broke letter by
letter in a four-column table on a phone; pills no longer wrap and targets are stacked rows. "Calorie numbers carry low
confidence" never cleared because the uncertainty chain added the weight trend's error to the calorie error — treating a
second measurement of the energy gap as more noise — and converted the trend's per-week error to per-day with a factor
of seven too many. The gap is now judged by whichever estimate establishes it more precisely (the two are not pooled:
the personal maintenance estimate is fitted from the same weigh-ins), and on the demo the scale establishes it at about
−773 ± 141 kcal/day, where the old interval ran from −1,297 to +747. The alert still fires when neither can.

**Tools, alerts.** Every Tools section is collapsible and collapsed by default; a passing self-test is one line;
finished sections can be hidden and are counted under Display. Alerts snooze — a day for act-now items, three for
reviews, seven for system notices — and after three snoozes in a row must stay visible for a day; records clear when the
cause resolves.

**External sources (integration spec).** One registry (open-meteo, meteosource, open-food-facts, plus the existing file
sources and wearable adapters indexed from their tables) with validation and an audit; the spec's error vocabulary; and
provider calls only through this app's own server (/v1/ext/...), because the app's connect-src is 'self', the
Meteosource key must not reach the client, and Open Food Facts asks for a User-Agent a browser cannot set. The server
validates input, refuses a request without a location, rounds coordinates to about 1 km, never logs them, caches only
as a read optimisation, and has a fixture mode for tests. Weather: canonical environmental variables (temperature,
feels-like, humidity, precipitation and its probability, cloud cover, ET₀, vapour pressure deficit, wind speed,
direction and gusts, UV, day or night, sunrise, sunset, daylight, daily minima, maxima and sums, and air quality) from
Open-Meteo (current, hourly, daily; 7 past and 14 forecast days; ERA5 history; air quality) and Meteosource's /point
forecast (which states what it cannot supply). Every value is labelled current, forecast, recent past (model analysis)
or historical (reanalysis). Weather is re-fetchable context in a supporting store, not the event log; a workout copies
the weather it was done in into its session. The place is typed and looked up — the deployment blocks geolocation and
the location is never inferred. Open Food Facts v3 is a secondary barcode source behind the bundled database, resolved
by barcode into the existing food identity, with missing nutrients and energy-from-kJ recorded; no second food database.
All three are fixture-tested and integration-tested through the real server (tests/external.mjs); none is called
production-ready, which needs live synchronisation, provider terms and a security review.

**Schedules.** Availability was weekday names and programme sessions were keyed to weekdays, which cannot describe a
rotation that does not repeat weekly (2-2-3 on 12-hour days and nights). A schedule is now weekly (unchanged), a rotation
(a repeating cycle of day shifts, night shifts and days off, anchored to the date it started, with presets for 2-2-3,
DuPont and 4-on-4-off and a pattern editor, and a rule per shift: no training, short or full), or irregular (the free
days picked one by one). For rotations, sessions are placed in order onto available dates from the anchor, so past days
keep their assignments; no more lifting sessions in any seven days than the programme asks for, never more than three
in a row, short slots on short days, and the first day off after nights kept for sleep. The one line that mapped dates
to weekdays now asks the schedule, so Today, execution, feasibility, adherence and adaptation all follow it; adherence
groups misses by shift in a rotation, and a rotation gets "stop scheduling on day-shift days" rather than "train fewer
days a week".

**Ready-made experiments.** The eight templates existed but "New experiment" opened an open-ended form; it now opens the
ready-made options first, each saying in plain words what you would do and how long it would need for you.

**Latest photo on Today.** An optional small icon of the newest progress photo, off by default and offered only when a
photo exists.

**Movement drawings, audited.** Looking at all 38 figures found start and end frames overlaid, sideways movements drawn
side-on (the moving limb hidden on the torso line), one standing figure for every exercise in a pattern (a bench press
drawn standing, a pull-up and a pulldown identical), and crow and pigeon drawn wrongly. Now: start and end side by side
at one scale, with the range arc and load on the end panel; a front view with both arms and legs chosen from the
pattern's plane (lateral raise, overhead press and pull, shrug, hip adduction, external rotation, side plank, tree,
warrior II); each exercise's posture (lying, face down, inclined, seated, hanging); corrected crow and pigeon; and
movementVisualAudit(), which checks views against planes, that each figure visibly moves, and that a lying press pushes
up and a push-up down. The first version had every rotation sign reversed — a bench press pushing into the floor —
which is what the direction check now catches.

## Deployment repair (from use: "Something went wrong" setting a weather place)

The deployment was a static site with nothing behind /api/sync: no rewrite, and server.mjs copied into dist, which a
static host serves as a file rather than running. The code made it worse in two ways. The error text was looked up by
the raw category, so any response without the server's envelope — a static host's HTML 404 — read "Something went
wrong."; and the service worker served every same-origin GET cache-first, /api/sync included, so once connected the
first forecast would have been served forever and sync pulls could replay stale copies.

Now: failures are classified by what came back (a web page means no rewrite or no server; a proxy 502–504 means the
server behind it is down; a JSON 404 means an older server; a failed fetch means unreachable; otherwise the server's own
category), each with its stage; "Test external server" (Tools → External server, the Weather sheet, the palette) checks
the layers in order and names the broken one; the service worker never intercepts /api/; the server's rate limit can
trust X-Forwarded-For behind a proxy (TRUST_PROXY=1), which otherwise throttled everyone as one; the build records the
deployment contract in version.json and BUILD-MANIFEST.json, writes DEPLOYMENT.md and a vercel.json template into dist,
and with SYNC_DEPLOYMENT_MODE=reverse-proxy fails unless vercel.json forwards /api/sync to a real https server;
scripts/configure-deploy.mjs writes that rewrite and refuses http, localhost, placeholders and paths; and
tests/deployment-smoke.mjs checks a real deployment (--app, --sync) or, as a gate, three local production-shaped stacks
— no server (named as a missing rewrite), a working rewrite and server, and a rewrite to a stopped server.

**What stays with the operator:** running server/server.mjs on a Node host with persistent storage and HTTPS, and
pointing the rewrite at it. That cannot be done from the repository.

## Voice capture (from use: "the mic starts and nothing happens")

Four defects: a recognition error reached the sheet as {ok:false} with no transcript and rendered nothing; a recognition
that ended without a result left "Listening…" on screen for good; the recognition object lived in a local variable,
which Chrome may collect mid-session so that no event arrives; and with interim results off nothing showed until the
end. Now the object is held, every stage shows (starting, listening, the words as they are heard, heard, ended), every
browser error is explained with what to do (Chrome's recognition needs the internet; an iPhone home-screen app may not
allow it; microphone blocked; nothing heard), a safety timer ends a session that never ends, and a typed phrase goes
through the same understanding and confirmation. tests/voice.mjs plays scripted sessions through a stand-in engine.

## Where the two specifications stand (checked, not assumed)

**External data / API integration.** Implemented: one registry indexing every external source, the error vocabulary,
the server integration boundary with key custody and the Open Food Facts User-Agent, the Open-Meteo, Meteosource and
Open Food Facts adapters, per-batch provenance (source, dataset, location, retrieval time, adapter version),
reconciliation for file imports, truthful maturity labels, and fixture and integration tests through the real server.
Not implemented: live wearable and health-platform connections (OAuth token custody, per-source sync cursors and
backfill, webhooks), revocation and source-deletion workflows, a per-source reliability view, and cross-provider
deduplication beyond the file importers' rules. HealthKit and Health Connect remain native-only.

**Implementation direction (engine architecture).** Built in earlier sessions and probed against the running code:
run identity (11/11 specified fields) and version vector (7/7) match exactly; universal infer() carries 11 of 16
specified fields (the request fields context, options, requestedOutputs, subject and outputs are named differently or
absent); forecasting 6/8; sensor fusion 7/8; optimisation 3/4. The remaining sections exist as code (quantity and model
registries, dependency graph, provenance, materialisation, causal and Bayesian engines, knowledge graph, twin, renderers)
but a field-level conformance audit of each needs its entry point called with its real signature, and has not yet been
done.

## After deployment (Render + Vercel): sync, rails, voice, weather visuals, discoverability

**Sync on a free host.** Render's free plan wipes files on restart and sleeps when idle, so the server kept losing its
vaults and events while the app kept its pull position and its list of events already sent — it neither re-sent nor
re-pulled. Uploads of up to 2,000 events also met a 2 MB limit, and pulls ignored "more". Now the server writes a data
epoch into its folder and reports it (and whether its storage is likely persistent); the app compares it every sync,
re-registers a vault the server no longer has, treats a changed epoch or a server behind what was pulled as lost data,
re-sends everything and says so; uploads go in batches of 400; pulls follow "more"; a slow first answer shows as the
server waking. tests/cloud-e2e.mjs now wipes the server's folder mid-test and checks the recovery.

**Rails.** The left rail ended at the same height as the right rail, but the right column continues with the + button,
so the left stack floated about 60 px higher; it now ends level with + and flush with its edge. The lone back arrow is a
previous/next pair that flips panels. A microphone sits above +. The design rules were refined to count only the
controls that always float (undo, top and bottom appear when useful), and the rail-height rule now compares the left
rail with + rather than with the right rail's edge — the old rule had encoded the reported misalignment as correct.

**Voice across the app.** Beyond the voice sheet: a dictation button on the food search, the place search and the
assistant's question box.

**Icons and weather visuals.** One line-icon set in the movement figures' style (strokes, round ends, the theme's
colours). Conditions come from Open-Meteo's weather_code (WMO), Meteosource's condition names map onto the same codes,
and without a code a condition is derived from cloud cover and rain and labelled so. The Today card shows the condition
with its icon (night icons at night), rain now, cloud cover, wind and UV, the next hours and 14 days with icons and
chance of rain; the weather sheet's tables carry the icons too.

**Discoverability.** Setup gains a place step for weather. Today shows "Set up more" — the features not set up yet,
each with what it does and one tap to start — and "Everything this app can do" lists every feature and its state.
The latest progress photo now shows on Today once one exists (it was off by default).

**Still open:** the engine-conformance items found in the implementation-direction audit (materialize() run metadata,
dependency-edge fields, model-contract fields, quantity conversion/display fields, infer() request fields).

## Live diagnostics (physique-diagnostics-2026-09-27)

- The recurring "HTTP 404 for manifest.json" was the food database's manifest: the database (about 100 MB, built by
  scripts/food-build.mjs) was never produced by `npm run build`, so a deployment built from the repository had none.
  It now lives in the repository at data/food/ and the build copies it; without it the build warns (fails in
  production mode) and the app states once that it is missing.
- Push: the server kept its VAPID keys on a disk that Render wipes, so new keys no longer matched the browser's
  subscription ("applicationServerKey does not match"). Keys can come from PHYSIQUE_VAPID_JSON; the app drops a
  mismatched subscription and subscribes again.
- "Failed to fetch" on a second device: a server address on another site is blocked by connect-src 'self'. Such an
  address is replaced with /api/sync unless the page's policy allows it, and network failures say what was tried.
- The server's base address answers with an index instead of "no such endpoint".
- Tools: Text, Data, Learning, Layout and Navigation are folds too. Accessibility: the hidden photo inputs are named and
  the About section's heading no longer skips a level.
- Undo: visible and uncovered on every viewport after an action; it is transient by design and the undo history does
  not survive a reload.

## Implementation direction: conformance, now gated (tests/direction.mjs)

The earlier audit was partly wrong and is corrected here. It probed MODEL_CONTRACTS, a small older table, and reported
the model registry incomplete; the registry the gateway uses, modelContract(id), already carries every specified field
for all 25 models, with maturity derived from evidence. It also called infer() with a function name, which the gateway
refuses, so its infer() figures described a refusal.

What was genuinely missing, and is now in place: quantities gain conversion (the dimension table's own factors) and
display; dependency edges gain dependencyId, sourceId, targetId, dependencyType, scope and version; infer() carries the
specified request (subject, context, options, requestedOutputs), echoes it and returns outputs by name — the gateway
had accepted these in spirit and dropped them on the way to the core; materialize() returns runId, modelVersion and
asOf, with invalidateView, recomputeView and a kept restatement log when a recomputation changes a value.

The direction gate checks §2–5 and §7–10 against real calls on the demo record. Sections not yet gated
(forecasting, causal and Bayesian engines, sensor fusion, knowledge graph, twin, optimisation, renderers, navigation)
exist as code; their field lists should be added to the gate from the specification before they are called conformant.

## Physiology maturity, deployment findings, Today (build 7aeff7adaf)

**Food database 404s.** The repository held the database and the build kept it; the 404 was cached. vercel.json marked
/data/ immutable for a year, and that applied to the 404 served before the data existed, so browsers and the service
worker (which fetches through the HTTP cache) replayed it. Now the food manifest is no-cache, other data files a day
with revalidation (shard names are not content-hashed, so they must never be immutable), and a food-file 404 is retried
once with cache:'reload'.

**Server review.** The reviewed server.mjs predated fixes already in this repository: HTTPS push transport; both VAPID
formats and the separate VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY variables, validated at startup (a present but invalid or
mismatched key stops the server rather than rotating silently); retirement of subscriptions on 404/410 or five failures;
the event log as the authoritative record with the vault repaired from it on read, a crash's partial line terminated
before the next append, a kept event count and a sparse sequence index for pagination; a per-socket ceiling so a forged
X-Forwarded-For cannot pass it; Vercel builds failing without a valid rewrite; a vercel.json in dist; a food-data lock.
Snapshot compaction is not possible server-side: it holds ciphertext it cannot read.

**Physiology models** (src/61-physiology.js), each registered in the canonical model registry with an evidence class,
uncertainty, method and limits: cardio fitness as a latent state (ACSM equations and heart-rate reserve per steady
session; a Kalman filter per modality family, never pooled; FRIEND registry priors; decay; a one-step backtest), with
every session's intensity labelled known, proxy or unknown; hydration balance (EFSA intake plus sweat by intensity and
weather; food water 0.3 ml/kcal — the first version's 1 ml/kcal was the total requirement, not food's content);
supplement efficacy (N-of-1, trend-adjusted, placebo-checked); energy availability (Loucks, refused without body fat);
protein quality and digestibility (FAO 2013 group values); a learning curve per lift; photo comparison validity.
Computer-vision diagnosis from photos stays a declared limitation.

**Today** leads with a hero (photo, the decision and its confidence, three figures) and folds the explanation. Undo
shows at the top of the right rail. Sheets opened from "Set up more" close it first. Tools opens with External server
and any section can be pinned. Automatic updates reload only on an update, not on a first install (which interrupted
a first visit on a slow phone). "What is worth measuring next" is always drawn and says when nothing is.

## Supplements and vitamins at the food domain's maturity (src/62-supplements.js)

Before: free-text supplement logs, a static advice list, a partial reference table. Now the same layers food has:
a reference (NASEM adult RDA/AI by sex and age, and upper limits that say whether they bound total intake or
supplements only — magnesium, folic acid, niacin and vitamin E are supplement-only limits) for the 16 micronutrients
foods carry plus vitamins E and K, iodine and selenium; a canonical catalogue of 18 supplements with aliases, units,
usual dose ranges, nutrient content per unit, evidence graded A–D per outcome (NIH ODS 2024, ISSN position stands),
cautions and the outcome this app can test; entity resolution of free text (IU to µg, mcg, mg, scoops; "D3" is a
name, not a dose), so old text logs count; a regimen with daily or training-day schedules — training days from the
schedule itself, so rotating shifts work — adherence and one-tap logging; micronutrient coverage from food plus
supplements against reference intakes and upper limits; evidence-graded guidance that says "test first" where testing
matters; and personal efficacy driven by the catalogue.

Found on the demo before shipping: the dose parser read "Vit D3 2000 IU" as 3 µg; training-day doses were never due
(the check looked for a plan item that does not exist); food was averaged over supplement-only days, understating it
several-fold; and completeness was judged per food, not per nutrient, so a food carrying iron but no vitamin C value
reported "0% vitamin C" — no data read as a shortfall. Each nutrient is now judged only when most logged energy comes
from foods that report it, and otherwise says so. The older supplement sheet was merged into the new one.

## Automation (src/90-automation.js) and the expanded supplement catalogue

**One automation layer over the existing actions**, keeping the app's rules: nothing writes unseen (every automatic
write is announced, undoable and audited), automation runs only an allow-list of safe, reversible actions, smart
defaults are suggestions edited before saving and never guess food intake, patterns are offered and never applied
silently, and nothing runs during replay, import or the self-test.
Quick actions and one-tap actions, each knowing when it fits (time of day, what is already logged, what the schedule
plans), ranked by that fit blended with this person's own use of each action near this hour (Laplace-smoothed), shown
as "Next up" on Today. Smart defaults in the log form (last weight in display units, median sleep, usual cardio).
Carry-forward through the existing repeat paths ("same as yesterday" for the meal of the moment). Templates: a meal
replayed through the same path as repeatMeal, or a sequence of allowed one-tap steps. Patterns: a meal repeated on
4 of 7 days, a supplement taken on 5 of 7 days outside the regimen, a morning weigh-in habit — each offered with one
tap to accept. Workflow rules (after a workout, on the first meal, after weighing in), at most once a day, hooked to
the event bus after recording. Shortcuts: home-screen shortcuts in the manifest (?do=… on an allow-list, the
parameter removed after use) and Alt+1–4 for the top quick actions. Rule matching is pure (automationMatches) and
tested; running refuses during the self-test so that no automated write touches data mid-test.

**Supplements: 80 in the catalogue, 26 micronutrients.** Added copper, manganese, chromium, biotin, pantothenic acid,
choline and molybdenum to the reference, and about 60 supplements: every common vitamin and mineral, performance and
recovery products, joints, sleep, stress and focus (L-theanine, ashwagandha, rhodiola, glycine, valerian), and
products marketed for hormones, prostate and weight loss (pygeum, saw palmetto, tongkat ali, fenugreek, DHEA,
berberine, green tea extract, yohimbine) — graded honestly, with the cautions that matter most carried on each:
liver injury (green tea extract, ashwagandha, turmeric), lab-test interference (biotin), serotonin syndrome (5-HTP),
drug interactions (St John's wort, berberine), anti-doping (DHEA). An interaction checker reads the regimen: zinc
without copper, iron with calcium, 5-HTP with St John's wort (danger), stacked bleeding risk, stacked liver-injury
reports, yohimbine with caffeine, several sleep aids at once, biotin before blood tests, vitamin K with warfarin.

## Implementation direction: every section with specified fields is now gated

The direction gate now checks §2–5, §7–15, §19–22, §25–26 and §29–31 against real calls, with each section's
required fields kept in the gate. Probing with real arguments separated artefacts from gaps: the visualisation check
had probed the contract table rather than a built visualisation, the causal engine had stopped (not identifiable on
this record) and the experiment designer was called without an effect. The genuine gaps, now closed in the functions
that own them (wrappers keep every name and caller, and add parts derived from real data): the point forecast and a
calibration summary; the causal estimator and its uncertainty, stated even when the analysis stops; the Bayesian
likelihood and diagnostics, including a prior–data conflict test; the fused measurement's uncertainty; recovery's
observations, uncertainty and a declared persistence forecast; the twin's adherence, environment, resources,
intervention, forecast and uncertainty; a visualisation spec on every built chart; the specified relation vocabulary,
and model and source entities, in the knowledge graph; views' capabilities, dependencies, renderer and guards;
experiments' estimand, design, analysis and finding — set at creation before the plan fingerprint, never rewritten on
old records (that would change their hash and falsely flag their plans as changed). One part was genuinely absent:
mobility routines had no step structure; mobilitySequence() now gives each routine ordered steps with pose, regions,
joints, positions, constraints, duration and intensity. §16–18, §23–24, §27–28 and §32–38 specify behaviour
rather than fields; they are covered by the domain gates.

## Sources: identity, deduplication, preferences, deletion (src/90-sources.js)

Found by test: steps from an iPhone (9,000) and a Fitbit (11,000) on one day were added to 20,000 — dailySeries summed
every value of a summed type regardless of source — and every import counted as the one source "import", so the
provider was lost; reconcileDay also applied weight's thresholds and formatter to every type ("disagree by 2,000.0 lb").
Now each provider is its own source; device totals (steps, sleep) from two sources are one quantity measured twice, so
one source is used — the person's preferred source for the type, else the most complete record — with the others kept
on the day as alternatives and the rule stated; intake logs and cardio sessions stay summed (two drinks are two drinks,
and two workouts may be two workouts). reconcileDay judges spread in each type's own terms. "Your data sources" shows
what each source contributes, its range and last update, how it agrees with others on shared days, the connections
(weather, sync), and a per-type preference for steps and sleep. Removing a source's data previews first, then retracts
its entries like corrections (undoable, audited); derived food-log totals cannot be removed as a source.

Still open from the integration specification: live wearable and health-platform connections (OAuth token custody on
the server, per-source cursors and backfill, webhooks). They need provider accounts and credentials; HealthKit and
Health Connect need a native app.

## From use: time zones, and panels that did not switch (build 78a18ced8b)

**Time zones.** Timestamps are UTC; record dates are local. Visibility compared timestamp.slice(0,10) with a local date,
so on a phone in US Eastern time anything logged after 8 pm counted as created "tomorrow" and was hidden from today
until midnight — the reported self-test failures ("daily series sums intake streams" crashing, "correction supersedes
without rewriting"). The release checks run in UTC, where the two always agree, so they never saw it. localDateOf()
now converts every timestamp to its local date before comparing — about 80 places across visibility, corrections,
retractions, supersession, projection, predictions, injuries, equipment, inventory, experiments and history —
todayISO() always returns a local date, and a clock held at a date means local noon (noon UTC is already tomorrow east
of UTC+12). tests/timezones.mjs runs the full self-test at 9:30 pm in New York, 1 am in Kiritimati (UTC+14) and 10:30 pm
in Pago Pago (UTC−11); it passes in eight zones checked by hand.

**Panels.** A rule written for the Today reorganisation, #view-today{display:flex}, outranked .view{display:none}, so
Today stayed visible on every panel and the chosen panel rendered below it — the "random position" was Today's height.
The split layout had the same fault (.view.split-capable{display:grid}). Both are scoped to .active. The browser gate
now asserts, as a release blocker, that exactly one view is visible after every switch, at the top, in both layouts.
Rendering panels at the top exposed charts a few pixels under the wider left rail: the rail inset is now measured
against the worst case across visible cards and recomputed on every tab switch.

## Connected services: OAuth, token custody, sync, webhooks, revocation (server + src/90-connections.js)

The last open item of the integration specification, built and tested against a simulated provider since real
providers need developer accounts. Server: OAuth 2 with state and PKCE (Fitbit) or client secrets (Withings, Oura); a
provider is available only when its credentials are set; sign-in details are kept per vault, encrypted at rest with
AES-256-GCM under CONNECT_TOKEN_KEY (without it connections are off), never sent to the app, and refreshed before they
expire; syncs backfill 30 days, then run from a stored cursor with a one-day overlap for late data, within each
provider's range limits; webhooks are verified against the exact request bytes (Fitbit's HMAC-SHA1 scheme, or
HMAC-SHA256) and only mark "new data waiting"; disconnecting revokes at the provider where it can and deletes the stored
details. The dispatcher gained redirects (the callback returns to the app) and raw bodies for signed webhooks. App: the
provider's JSON goes through its existing adapter into importObservations — committed explicitly, since imports
preview by default — so records carry their provider as the source, repeats are dropped by external id, and a day
already recorded is not counted twice. tests/connect.mjs drives the whole flow over HTTP against a simulated Fitbit that
checks the PKCE proof and bearer tokens, and checks that stored sign-ins never appear in plain text. The registry labels
the three wearables integration-tested; production-validated needs real accounts, and HealthKit and Health Connect
still need a native app.

## Strava (server connections + adapter + ingestion)

Strava is workouts, not daily totals, so it needed more than a fourth provider. Server: Strava OAuth (client secret,
an absolute expiry, the athlete id kept for webhooks), activities by page within the window, per-second streams for
the fifteen newest workouts of ten minutes or more (inside Strava's default 100 requests per 15 minutes; a 429 is
reported with the usage header), deauthorisation on disconnect; webhooks by Strava's scheme — the subscription
handshake echoes hub.challenge for the right verify token, and since Strava does not sign events, an event is accepted
only for this server's subscription and a known athlete; creates and updates mark data waiting, deletions are queued
for the app, and an athlete's deauthorisation removes the connection. App: endurance activities become cardio with
modality, moving time, distance, heart rate and measured power; weight training, CrossFit, yoga and Pilates become
sessions; deletions at Strava retract, edits supersede; a hand-logged workout within 20% of an imported one on the same
day is flagged, with "keep the imported one" or "keep both". cardioSteadySegment() finds the steadiest ten minutes in
the streams (moving ≥ 95%, speed CV < 8%, heart-rate drift < 8 bpm) and the fitness model prefers it to whole-workout
averages that include the warm-up.

Two import defects surfaced on the way and were fixed for every source: imports dropped each row's method and metadata
(a workout would have arrived as bare minutes), and the day-total overlap rule would have discarded a second workout on
the same day — records carrying their own activity id now bypass it. tests/strava.mjs (in the connect gate) covers all
of it against a simulated Strava.

## Weather: fast population and automatic updates

A refresh asked for 21 days of hourly data across fifteen variables (504 rows), though the screens use hourly data
only for today and the next day or two; the 14-day view comes from daily data. Open-Meteo's past_hours/forecast_hours
limit hourly rows while daily ranges stay, so a refresh now asks for 24 hours back and 48 ahead hourly with 7 past and
14 future days: the forecast response falls from 48.6 KB to 11.3 KB (77% smaller) and the saved copy with it. Air
quality asks for a day back and three ahead, and is skipped when under an hour old. Requests end after 25 s.

The saved forecast shows at once (within about a third of a second of opening, before any network answer) and is
refreshed in the background when the app opens, comes back to the foreground or regains its connection, and every
30 minutes while open — only when older than 30 minutes, never twice at once, never while hidden, silently; the card
says "updating…". At launch the server is woken in parallel, so a sleeping free-tier server starts while the saved
forecast is on screen. A switch in the Weather sheet turns automatic updates off.

The auto-updater's interval held Node open in two scripts that relied on the event loop draining (the cloud end-to-end
test and the baseline script); both now close their simulated windows and exit, and no other such script remains.

## The reconstruction audit, phases 0–5 (build d17516adc9)

The audit (of build a75467fc29) was checked against the current source; findings already fixed (HTTPS push, time zones,
panels) were confirmed rather than redone. Phase 0: docs/SYSTEM_AUTHORITY.md names the source of truth for each
subsystem, and governance fails if it names a symbol the build lacks. Phase 1: release item 20 read "25 models", written
by hand; it now reads the live registry through the baseline written for the same build, and governance fails any
hand-written count in release tooling (both rules proved by planting a violation). This roadmap is declared history;
the documentation check covers authoritative documents and exempts only one that says so on its first line. Phase 2:
the npm prebuild step fetches the locked food archive when the corpus is missing (pure Node: zlib and a small ustar
reader), checks the archive and the per-file checksum list, and the build verifies every file; scripts/package.mjs
makes reproducible archives (sorted, fixed times, gzip without a timestamp; two runs are byte-identical), refuses a
build whose recorded gates did not all pass, and checks the food archive against the lock, which now pins that
reproducible archive and still accepts the first published one of identical content. Phase 3: health verifies the data
folder is writable and warns on low disk, vaults near their event limit and non-persistent storage; /v1/metrics
(METRICS_TOKEN); /v1/admin/backup (ADMIN_TOKEN); CONNECT_TOKEN_KEY_PREVIOUS and a rotation endpoint re-seal stored
sign-ins; tests/restore-drill.mjs backs up, restores under a rotated key and proves events, epoch, push keys and
sign-ins survive. Phase 4: the deployment smoke test certifies every layer (build, rewrite, storage, push keys, food
with a shard checked against its checksum, Open Food Facts, connections, metrics) and writes a certificate; it is run
against the local production-shaped stack on every release. Phase 5: Response is a first-class entity (DB.responses,
response.recorded): every intervention (experiment, plan change, adaptation, supplement start) evaluated the same way
— adherence, the primary outcome against the pre-change trend continued, the model's expectation, a placebo check a
week earlier, unintended effects, burden, reversibility, and the plan versions and decisions that followed —
provisional at 7 days, final at 21. Phases 6–12 and the future-state architecture remain.

## Phase 6: the personal response model (build afc6725478)

personalResponseModel() generalises the per-experiment matrix across interventions and outcomes: for each pair
(calories → weight, steps → weight, training days → weight, protein → hunger, and any pair the record produces), a
population prior per unit of dose is updated by the person's Response records (normal–normal). Each response gives an
effect per unit of dose actually carried out (adherence-adjusted, floor 30%), weighted by its standard error;
provisional responses count half. Pairs without a population figure get a wide prior centred on zero. Per-context
estimates (by phase) appear with at least two responses each, and a difference between contexts is flagged when it
exceeds twice the combined uncertainty. predictResponse() gives the expected effect of a change of a given size, with
its basis and the share resting on the person's own data; evaluateResponse() now takes its expectation from it,
leaving the change being judged out. Registered as personal_response; shown on Learn under "How you respond".

## Phase 7: friction and adherence (build d1db7b02ed)

frictionModel() asks why plan items are missed: per item (training, cardio, steps, nutrition, protein, weigh-in), a
ridge-regularised logistic regression over the last eight weeks on the burdens the record can measure — plan burden,
time burden, schedule conflict, sleep conflict, motivation, fatigue, social context (the weekend), weather for outdoor
activity, cooking burden (no saved meal) and decision fatigue (changes proposed and not applied) — reported as odds
ratios with intervals, and only called clear beyond two standard errors. Unknown days are left out; a partial item
counts as not done. interventionAdherence() gives P(execution | intervention) from past adherence to changes of that
kind (Response records), a prior that falls with the size of the change, and today's friction; rankLevers() multiplies
the personal expected effect by it. decide() records both levers with their effects and probabilities on a stall and
adds them to the evidence. Two things found on the way: population figures alone had flipped the stall fixture to
calories (energy arithmetic makes a calorie cut look better than steps for most people), so the lever now switches only
on the person's own record, and never on priors; and the decision-fatigue factor read accepted/dismissed flags that
nothing writes (governance caught it), so it now counts decisions that proposed a change nobody applied.

## Phase 8: physique by region (build c5b3d60080)

physiqueModel() follows the audit's chain without a hypertrophy equation: exposure per muscle (weekly sets, primary 1
and secondary 0.5, and frequency, over eight weeks) → regional outcome (each primary exercise's e1RM relative to its
own start, pooled by precision as % per month; the region's circumference where measured, with tape error) → status:
under-trained (too few sets to judge), lagging (at least 10 sets a week yet clearly slower than the median of the other
trained regions), over-served (above 20 sets and not a priority), on track, or unknown. A region that is slower with
6–9 sets is called under-trained, never lagging and never on track: a test found it falling through to "on track".
Up to three priorities; suggestions add 2–4 sets to priorities and lagging regions, taken from over-served ones, and
split a priority across two sessions; overlap is flagged when three or more exercises share a pattern for the same
muscle. Rate control reads the weight trend as % of body weight a week against the phase's range (cut 0.5–1%, lean
gain 0.1–0.25%, maintenance ±0.1%), worded by direction of travel. Body fat is trended per method only, with each
method's measurement error and lean and fat mass; methods are compared by their offset on near dates, never mixed; an
unspecified method is called out. Ranges cite their sources (Schoenfeld 2017; Pelland 2024). On the Body tab and in
the palette ("Physique by region").

## Phase 10: model competition (build 058f0ade05)

The working tree was reset mid-phase; it was restored from the last release's reproducible repository archive (checked
against SHA256SUMS), the food corpus through the verified fetch, and dependencies from the lock. The restored tree
rebuilt to exactly c5b3d60080 before this phase's work was reapplied.

evaluateCompetition() makes important predictions compete: weight 7 and 14 days ahead (naive baseline, the app's
14-day Theil–Sen trend as the incumbent, Holt smoothing, a damped trend) and the most-trained lift's e1RM 14 days ahead.
A rolling-origin backtest every 3 days over 90 uses only data known at each origin and reports error, bias, 80%
interval coverage, recent error, stability and simplicity. Calibration is empirical and runs both ways: each model's
interval is scaled by the factor that would have held 80% of outcomes, learned on the older half of the origins and
checked on the newer half; "calibrated" allows for sampling error (0.8 ± 2√(0.16/n)). Promotion needs the paired error
test beyond two standard errors with a Newey–West variance (overlapping forecasts are correlated) and calibration;
newer is not assumed better. A primary that does not beat the baseline is flagged; a model significantly worse than it
is deprecated, then retired on the next evaluation; a new primary whose recent error grows past the old one's is
rolled back. Lifecycle changes happen at most once a day (counting evaluations, not screen refreshes), are validated
against MODEL_LIFECYCLE_STATES, and are written to the audit log. On the demo the backtest confirms the audit's finding
that the current weight forecast is biased (−1.6 lb, too optimistic) and that every model's intervals were far too
narrow (11–41% coverage); the damped trend is promoted (3 standard errors better allowing for overlap), and the panel
says no model yet clearly beats the naive baseline. Shown on Learn under "Which forecast to trust".

## From use, batch 1: logging, supplements, the Log page (build 8fd604b278)

Switching the quick-log type now starts with empty fields (the weight typed before stayed in the buffer). Self-rated
adherence is gone from logging (the type and the food form's 1–10 scale): adherence is measured from what was done; past
entries stay readable. Water is its own log type, entered in ml, L, fl oz, US cups or US gallons (the default follows
the unit preference), stored in litres, with one-tap amounts. Undo batching: a group action records one undo step
(undoBatch); addObservation had recorded a full snapshot per entry, so undo removed a group one item at a time.
Supplements: each regimen item has a time of day; "Log morning supplements" takes only what is due now, as one undo;
each item on the card is a toggle; the quick-log form is a checklist of the regimen with editable doses, a time of day
and any catalogue item, instead of free text; a product can be entered from its label with its own nutrient amounts
(camera label reading would need offline text recognition the app does not have). The Log page hides retracted
entries, superseded corrections and the food log's derived totals behind a counted toggle, groups the rest into
collapsible sections, has search and kind filters, and lists each food with its portion and macros. Tabs always open at
the top. The self-test restores settings exactly and reapplies appearance (it reset appearance on an iOS home-screen
install). Body-fat readings saved as dexa/bia/navy are mapped to the method names whose errors are known (all had
fallen to the generic error). Remaining from the same list: alerts that land at the bottom of a page; dismissable
setup items; collapsible weather; Upcoming following schedule edits; the About pop-up; page and Tools customisation;
setup fields filled from earlier answers; context, phase criteria and other free-text fields made structured; own
schedule patterns and days off; workout steppers and timers; food search clearing and portion units; a full audit of
every input; hydration maturity; then phase 11.

## From use, batch 2: alerts, setup items, Upcoming, weather, About (build cdabd52def)

An alert whose action only switched tabs (such as "Your plan changed") now opens its own sheet (attentionItem): what
happened, why, the plan's actual changes, and Later / Show me / Done; Show me opens the page at the right section (the
plan history now has one); Done dismisses for good, except an action-level problem still present after 14 days; the
alert list has Done on each row too. The first version of the item sheet reused the name of the existing alert-list
sheet and was replaced by it (renamed). "Set up more" items can be hidden, and features that are a page to review
(automation, data sources, physique, charts) count as set up once opened. Upcoming reads the schedule (scheduledPlan)
instead of the weekly template, so shift patterns, moved sessions, days off and plan edits show, and today's session
says when it is done. Weather on Today is a glance by default (now, today's range, rain in the next six hours, UV, the
next hours) with More for the full card, remembered; the external test now checks both. The ⓘ button opens an About
pop-up built from the live registries; the About panel left Tools.

## From use, batch 3: setup and planning inputs (build 04f7b12dc2)

Setup prefills from the record, not only the profile (current weight from the latest weigh-in; session length from the
schedule). The Profile editor's equipment and diet are chips writing the lists setup writes and the advice reads
(saving the profile had turned the equipment list into one string, which the programme generator depends on); its
schedule box is the actual schedule with an Edit schedule button; profile actions act only from the profile editor.
Phase criteria are rules the app checks (58-phase-criteria.js), replacing three free-text boxes that were shown and
never evaluated: success (goal weight through canonicalGoal, rate in range, waist down, strength held or up), stop
(strength down 10%, losing over 1% or gaining over 0.5% a week, fatigue ≥ 7, too long), transition (at goal, diet
break after 10 weeks, plateau while on plan, end date); defaults per phase type, chosen as chips; each reports met,
not yet or unknown with evidence on the Plan tab; a met stop rule raises an action alert, a met success or transition
rule a review. The phase editor has Use suggested targets. Context is chips in the exact words the models match,
several at once, each saved on its own with what it affects, plus a note (free text had to happen to match a pattern).

## From use, batch 4: your own schedule (build eb82b79633)

scheduledPlan() puts the person's choice first: any of the next 14 days can be set to train, short, rest or auto
(DB.settings.schedule.overrides), and in a rotation each cycle day to train, rest or auto, applying every cycle
(cycleTrain); the automatic placement (a full-time day, under the weekly count, at most three in a row) had forced some
off days to rest with no way to say otherwise. Weekly mode now follows the schedule's training days — they were ignored,
so two places set the days and only the programme's weekday grid counted — taking the programme's lift sessions in
order and keeping its cardio and mobility days; a day chosen to train gets the next session in that order. The memo key
includes the choices. Short and full session lengths are two labelled settings (they read as one choice that could be
both). The schedule shows the session order with Edit sessions and exercises; the plan editor shows the next 7 days as
they will happen, with Change which days; its weekday grid applies only when no training days are set.

## From use, batch 5: workouts (build ecd9636511)

Steppers app-wide (uiStepper / ui.step): − and + around an ordinary field, each tap changing the field and then running
the field's own action, so steppers go through the same wiring as typing; the guided workout has them on load (5 lb or
2.5 kg), reps and reps in reserve; the session logger, too wide for a stepper per cell, has a bar acting on the number
last tapped. Timers (uiTimer): countdowns and stopwatches that vibrate when done and can write their result into a
field — a live session clock, a countdown for timed exercises (planks, holds, carries, hangs) that records seconds on
the set, a hold timer on every mobility step, and a stopwatch on the cardio log that fills in the minutes.
resolveExercise matches loosely ("Bulgarian splitsquats" became plain Squat), so the session logger now reports any
name that is not exactly an exercise or alias with what it will count as, and saves on confirmation. Found while
testing: buildWorkout read only the programme structure, which covers its current period, so a lifting day outside
it (including a day chosen to train) built an empty session; it now falls back to the schedule's session template.

## From use, batch 6: food search and portions (build 61443a15d7)

The food search has a clear button, and "Log and add another" logs and returns to an empty search without closing
(logging closed the sheet, so each food meant reopening it and clearing the last search). Logged food keeps the unit it
was logged in: entries store the chosen portion (amount and unit), food snapshots keep the food's portions (they were
dropped), and the edit sheet offers the food's own units with a stepper, resolving through portionResolve like logging
does. An edit replaced the portion label with grams even when only the meal changed; it now keeps the portion unless the
amount changes, and an amount changed in the portion's unit is labelled in it ("2 × 2 tablespoon (67.8 g)"). Entries
logged before portions travelled with them borrow the live food's portions when edited.

## From use, batch 7: every input audited (build f703397e30)

tests/inputs.mjs (the inputs gate) opens every sheet through its own opener on the demo — every quick-log type in its
own container, the food sheet with a food picked, food edit, the guided workout, an alert — and classifies each of the
157 inputs in 37 forms: own action, read by the sheet's save path (directly, under the parameter name of a function the
buffer is handed to, or through a key list read dynamically), unwired, broken, or with nowhere to go; broken, unwired
or nowhere fails the release, and docs/implementation/inputs-report.md lists every input and where it goes. Found: the
injury form's "since" and "note" called edit.field, an action that does not exist, so the start date fell back to today
and notes were lost. Free text that is free by nature (names, notes, searches, colours, a place, questions, research
notes) is named in the audit; anything else typed is reported as a candidate for choices. The phase objective became a
choice per phase type, with "In my own words" still available.

## From use, batch 8: hydration matured, the catalogue at 125 (build a83bf631d0)

hydrationModel() (hydrationBalance remains its name for existing consumers): intake is drinks plus the water in what
was eaten and drunk as food, from each food's own water content (FoodData Central carries it for all foundation foods;
entries without it fall back to 0.3 ml/kcal, and the share estimated is reported); needs are EFSA's adequate intake of
total water plus sweat per session by intensity, scaled by the weather at the time (temperature above 20 °C, humidity
above 60%), or by the person's own sweat rate from a sweat test (weight lost plus fluid drunk, per hour); sodium lost in
sweat (about 0.9 g/L) is set against sodium eaten; urine colour (1–8) and a morning drop of more than 1% after a
heavy-sweat day are status signals; training guidance (5–7 ml/kg in the four hours before; 125–150% of losses after).
New observation types urine and sweatrate, bound to the hydration model and given semantic kinds; a Hydration card on
the Food tab with intake against need in the person's unit, one-tap amounts, sweat, sodium and status. Food water is
read from each entry's snapshot rather than added to the shared nutrient keys, which would have counted it twice
through the nutrition observations. The supplement catalogue grew from 80 to 125 (cognition and mood, metabolic and
general health, joints, immune, herbs and hormonal claims, performance), graded honestly, with new interaction rules
(several liver-injury reports, cholinergic stacking, L-dopa with 5-HTP, three or more blood thinners, cod liver oil with
vitamin A, stacked stimulants); overlapping rules now say each warning once.

## From use, batch 9: every page customisable (build 25e9935f0f)

src/95-page-layout.js: one layer for every page — any section can be hidden, or moved up or down within its part of
the page, kept per page in DB.settings.pageLayout and reset per page. It sits on top of the three detail presets: the
Customize sheet marks sections the current view hides. It runs from the observer that tags panel levels, after it, so
every render path is covered; panels move only when the order differs, so the observer settles. Every page ends with
"Customize this page" (also in the palette), Tools included, alongside its existing pins. Found by the visual check:
Today lays out its parts with CSS order, and the new footer had none, so it rendered first, between the subtitle and the
first card; it now has an order that keeps it last. The browser gate hides, moves, re-renders and resets on Today and
Tools. This closes the list from use; phase 11 (the unified optimiser) is next.

## Phase 11: the unified intervention optimiser (build 919db0158d)

unifiedOptimiser() follows §81: state → candidates → effect → uncertainty → burden → adherence → risk → opportunity
cost → reversibility → robustness → Pareto set → the person's choice, across nutrition (calories, protein), activity
(steps, cardio), training (sessions a week), recovery (sleep) and schedule (minutes available). Candidates are
combinations of up to three changes; each lever's effect comes from the personal response model (population figures
where it has none) and its probability of being carried out from the friction model, computed once per lever and dose
and combined (per-candidate recomputation took 16 s; it now takes about 0.3 s, and repeat views are memoised).
Constraints: the extra time a week the schedule allows, the phase's safe rate range, and no added training while
fatigue averages 7 or more. Risk flags: too fast for the range, training added under high fatigue, a training day
dropped while a priority muscle lags. The Pareto set is over effect toward the goal, burden, time and risk, ranked by a
stated preference (balanced, least effort, least time, fastest within range), with a cost per change beyond the first
(a first version suggested three changes at once with a 21% chance of all three being done). A choice is applied
through updatePhase, so the Response entity evaluates it. Shown on the Plan tab as Options for the next two weeks.
Also: the friction and personal response models are memoised (the latter keyed by the content of the responses, after a
count-based key went stale).

## Phase 12: the learning loop (build 3b126e9944)

runLearningCycle() runs observe → understand → decide → act → measure → explain → learn → adapt → predict → test →
personalize as one recorded cycle a week (DB.cycles, cycle.recorded, a LearningCycle contract): each stage's status and
figure; the beliefs about the person (response estimates and how personal they are, clear friction, the trusted
forecast and its calibration, lagging muscles, adherence) and what changed since the last cycle; loop health (share of
changes judged, days to a verdict, open experiments, starved stages); and the next test where the personal model is
least certain, skipping a lever already being tested, with its experiment template. Shown on Learn as The learning loop.
Found while testing: anything that saves at startup must wait for the record to load — the cycle ran on a timer and,
under slow storage, wrote a partly loaded record over the stored one (data logged before closing was lost on reopen);
recording responses and the weather refresh had the same exposure. All three now run after loading completes. The
model-reproducibility check failed about one run in five: the loop returned its stored cycle with a timestamp, and the
demo's responses appeared whenever something triggered them; the registered model is now a pure view without a
timestamp, and loading the demo records its responses. "No clear response" had counted as a clear verdict.

With phases 0–12 the audit's recommended order is complete; the future-state architecture in the second half of the
reconstruction document has not been started.

## Engineering control (audit of 2026-10-04), first pass (build 8c6061a8ed)

Release control. The build fails without the food corpus unless a development build is asked for by name
(PHYSIQUE_DEV_BUILD=1, recorded in version.json); version.json and the build manifest carry the data provenance; the
release identity hashes the food lock and every reference file; SOURCE_DATE_EPOCH fixes the build time. A skipped gate
is recorded as not passed (browser gates exited 0 when they skipped). The build starts from a clean dist (stale output
was shipped), and the yields table, which existed only in dist though recipes load it, is a checksummed input in
data/reference with its provenance. scripts/clean-room.mjs (gate reproducible) copies the repository without
node_modules, dist or data, runs npm ci, fetches the locked corpus, builds, and compares every file: byte-identical.
.github/workflows/ci.yml runs the same from a clean checkout with real browsers.

Authority and layering. tests/authority.mjs (gate authority) writes docs/authority.json and fails when a store is
written outside its declared owners: it found seven stores without contracts and undeclared canonical writers; four
food-log copy paths became copyFoodLog (copying a day had recorded no events, so copies were missing from sync and
replay). 21 contracts, with reference and projection statuses. tests/layers.mjs (gate layers) declares each file's
layer in docs/layers.json (the file numbers record history, not layering), writes docs/module-graph.json, and fails on
a new engine → interface call: 37 became 18 by moving ten misplaced functions and the weather card's rendering; the
18 are a reasoned baseline that may only shrink.

Canonical objects. Every Response carries the audit's field set (exposure window, executions, expected and observed
outcome, delta, uncertainty, confounders, attribution, confidence, applicability, evidence, model version, status);
one intervention lifecycle (proposed → … → learned) is a projection for every domain; individualState() is a frozen
projection of the twelve parts.

Independent verification. tests/blackbox.mjs (gate blackbox) drives the interface only, with expectations computed in
the test: nutrition (311 kcal for 80 g at 389/100 g), training, correction and retraction, backup, erase and restore,
and phase targets on Today. It found a lifting session logged on a rest day named "Rest / walk", and "1 sets",
"1 sessions" in five places; it also corrected six wrong assumptions of its own. Maturity: docs/capabilities.json and
tests/maturity.mjs (gate maturity) require evidence for each level, keep README claims within it, and generate the
README's maturity table; the wearables claim now says the connections were tested against simulated providers only.

## Engineering control, second pass: the plan authority and the recovery workflow (build dcdbcca1ee)

A-004. changePlan(change) is the one way the plan changes from anything a person or the app's adaptive systems do: the
phase editor, ending a phase, choosing a programme, applying an experiment, a decision, an adaptation or an optimiser
choice, schedule edits and setup. The underlying mutators still do the work inside it; their notes are gathered and one
plan version is made when the plan's content actually changed (deciding from the notes missed changes while
persistence was suspended). Every change states its reason; an adaptive one (decision, adaptation, optimiser,
experiment) without an expected outcome is refused (rule 7). A person's first plan is always the setup version.
tests/authority.mjs fails on a call to an underlying plan mutator outside changePlan or a composite mutator, found by
bracket-matching spans (a planted violation was reported with its file and line).

V-004. The black-box recovery workflow found that a new person at fatigue 9 on 4.5 hours of sleep read "recovery
unknown" (recovery status needs three ratings a week) and Today did not change. acuteRecovery() acts on today's readings
alone (an autoregulation heuristic, labelled: fatigue 9+ or under 4.5 h → rest or very light; fatigue 8, under 5 h or
soreness 8+ → lighter); recovery status reports it as acute; a new safety severity ranks it above setup prompts, which
had hidden it behind "start a phase". Also: applyProfileFields, the profile's owner, moved to the engine layer (the
layers gate caught the optimiser calling into the interface for it); an unread registry was removed (governance); the
V-003 naming check was made independent of the date (on a planned lifting day the planned name is correct).

## Engineering control, third pass: production durability and temporal replay validated

Server (audit S-001, S-003, S-004, S-006, S-009–S-012). PHYSIQUE_PRODUCTION=1 refuses to start on storage not declared
persistent or inside the temp folder, without off-host backups, or with an admin or metrics token under 32 characters.
Backups go to any S3-compatible bucket, signed with AWS Signature V4 written in the server (it matches AWS's published
get-vanilla vector), every BACKUP_INTERVAL_HOURS; each is read back and its checksum and contents verified before it
counts, recorded, and pruned to BACKUP_KEEP. --restore-from-s3 restores into an empty folder after verifying. Every
request carries an x-request-id, logged with errors; metrics add errors by route, the last 20 failures and the backup
state; /v1/health says degraded with reasons, for an uptime monitor. tests/server-ops.mjs (in the server gate) runs it
against a mock bucket that checks the signature's form and the payload hash; not yet a real provider.

Temporal replay is validated by black-box workflow V-011: with only the clock controlled (a system boundary), a weight
entered three days ago and corrected today replays two days ago as the original value. Building it confirmed replay is
bitemporal — a value dated earlier but entered later is not known on the earlier day. Two date-dependent test
assumptions were corrected after the clock crossed midnight: a session on a planned lifting day correctly takes the
planned name (V-003 now checks it is never named after a non-lifting label), and the accessibility check selects the
first visible Log rows (food-derived totals are hidden by default, and on some days come first).

## Engineering control, fourth pass: no engine → interface calls (build e8bf5158ff)

The reviewed baseline of 18 engine → interface calls is empty. The record module no longer names presentation
functions: registerExportAdapter lets a layer above register its formats, and the appearance, dashboard and chart-preset
formats are registered by the presentation files that own them (each still exports and validates its own export).
exportCSV, which only builds text from the record, moved to the import module; visualizationSVG and visualizationPNG,
which use the page, its styles and a canvas, moved to the presentation layer. Recall and the copilot are interface
modules by both dependency and function — only interface files and self-tests call them, and they read interface state
and act through the command registry — so docs/layers.json classifies them as such, with the reason recorded; no
engine file depends on either. The layers gate now holds the engine to zero calls into the interface.

## AI, as the interface layer over the stable system (build 11bbf10590; audit AI-001 … AI-012)

Providers through the server only: the app's content-security policy lets it talk to its own origin and nowhere else,
so POST /v1/ai/complete (unlocked vault required, rate-limited) translates one normalised request — system, messages
with tool calls and results, tools, token limit — into Anthropic Messages, OpenAI Chat Completions (and any
OpenAI-compatible local server: Ollama, LM Studio) or Gemini generateContent, and the reply back to {text, toolCalls,
stop}. The key stays on the server; each call's size and timing is logged, never its content. Apple Foundation Models
need a native app. src/97-ai.js (interface layer): off until the person consents to a stated list of what is sent, and
per capability; six read-only tools with schemas (state from the individualState projection, plan and adaptation
explanations, evidence, food search, exercise library); one tool loop for every provider; answers validated by the
existing contract, now also accepting figures from the model's own tool results; describe-a-log-entry (types, ranges,
dates within two weeks), describe-a-meal (foods the database returned) and suggest-a-session (exercises in the library)
validated and offered as proposals that only the person's press applies, through the ordinary owners.
tests/authority.mjs fails if the AI module calls any owner, plan mutator, dispatch or save, or writes the record (a
planted violation was caught). Tested: tests/ai-proxy.mjs against mock providers that check each protocol, and
tests/ai-client.mjs with a scripted model (the transport replaced, since device signing is unavailable there); not yet
against a real provider. Found on the way: without sync, the Tools section asked for the AI status on every render and
each answer rendered again (an endless loop, caught when the adversarial suite hung; fixed by caching every answer,
with a regression check); a privacy check that read a log file the server never writes (now the real output); the
OpenAI token-limit field decided by the presence of a base URL instead of the host.

## Future architecture, Stage A complete (build 9a6da7df20)

docs/future-architecture-plan.md maps the 72 items of the reconstruction document's §210 sequence to the code: exists,
partial or missing, with where each lives, ordered by its §212 leverage tiers and bounded by §213 (no second registry,
event system, decision engine, uncertainty, provenance or dependency system; AI never the analytical authority).
Stage A had eight of ten items already; the two missing are done. The universal data dictionary
(docs/data-dictionary.json) is generated from the registries that exist — observation types, entity contracts,
events, models, semantic types — with the ten hand-written concepts kept as meanings: 34 observation types, 46 events,
19 stores with 282 fields, 40 models, 159 exercises. Building it found 17 events owned by no entity contract (food
corrections, injuries, programme changes, model stages, copilot authorisations among them); each was assigned to the
contract it belongs to. The ontology version is a hash of its ids; an id that disappears without an entry in
docs/ontology-migrations.json fails. Gate dictionary fails on an undescribed type or model, an unowned event, a persisted
field missing from the committed dictionary (schema drift), or a lost id; tampering with the committed copy confirmed
both ratchets. Next: Stage B, the longitudinal object model.

## Integration of the parallel branch (build c5ced85fff)

The deployed repository held a second line of work: commits on claude/keen-albattani-a0pi2g, merged as pull requests #1
and #2 on top of release 11bbf10590 (commit 65b16f5, whose source is byte-identical to that release). It was merged
three ways into this tree (base 11bbf10590, theirs at 9150239, ours at 9a6da7df20, which adds Stage A): 31 files
changed on their side; 19 were taken as they were (ours had not changed them, checked file by file); the entity
contracts merged cleanly; the implementation log, appended on both sides, keeps all five entries in time order; the
eight generated reports were regenerated from the merged source. Their changes: record loss fixed through snapshots,
restore-merge and cloud re-sends; immutable events, with every in-place edit its own event; replay comparing
correction and supersession dates by local date; large events synced in parts, a snapshot's events never folded twice;
undo recorded in the event log so it survives a restart; every cloud end-to-end result an assertion; the linear
front-door estimator corrected and given an interval; Vercel building the app and serving dist. The dictionary gate
found three events their work added without an owning contract: decision.applied (Decision), session.rated (Execution)
and events.revoked, owned by a new Undo contract (an undo cuts across every entity). All 36 gates pass; the engine runs
1,617 self-tests, 30 of them theirs. The repository's working tree differed from its HEAD only in line endings (CRLF);
its nested physique-os-repo folder is a stale intermediate copy that nothing builds from.

## Future architecture, Stage B complete (build b5b8519ae0)

The longitudinal object model, through the existing event log, contracts and dictionary (no new registry). Exposure
(exposures, exposure.recorded): for each Response stage, the dose actually received in the window after the change —
planned beside received, the same measure before it, coverage — for calories, steps, protein, sleep, cardio, training
and supplements; shown on each Response in Learn. Outcome (outcomes, outcome.recorded): the measured change as its own
record. Each Response refers to both and to planVersionId, the plan version in effect when the change began. Three
projections (58-state-vectors.js), each with a consumer: regimes() — phases, context periods (travel, illness,
holiday, injury), time off training and the return, weight-trend breaks — with a change inside a Response's window
listed among its confounders (on the demo, the creatine Response's window holds a weight-trend break that was invisible
before); stateVector() — each value with its standard deviation and the age of its newest data; capabilityVector() —
strength by region with its trend, work capacity, endurance and mobility over four weeks. individualState carries all
three, and the AI layer's get_state can read them. Self-tests compute their expectations from the data they write;
one of them first had my own arithmetic wrong (the third week holds 1 + 2 sets, not 2). All 36 gates pass.

## Future architecture, Stage C complete (build 2c6dfb3cbe)

Marginal returns (§7.3, §7.4): one dose-response curve per lever with its source — hard sets per muscle a week
(Schoenfeld 2017; Pelland 2024), protein (Morton 2018, breakpoint 1.62 g/kg/day), steps (Paluch 2022), cardio (WHO
2020; Wilson 2012 on interference), sleep (Watson 2015), rate of loss (Garthe 2011; Helms 2014) — rising, diminishing,
a plateau, possibly negative; marginalReturns() gives the next unit's benefit at the person's current dose, with its
range, zone, fatigue and time. They are population curves and say so; personal scaling waits for Responses to changes
in each dose. Goal conflicts (§32): five tensions detected from the person's state (a cut with a priority muscle, cardio
past 150 minutes while strength or size leads, the plan's time against the schedule's, a fast loss against high
fatigue, high volume against high fatigue), each with its evidence and trade-off; the person chooses, and the choice is
kept. Arbitration (§33): arbitrateDecision, which was computed but used nowhere, is extended in place (87-governance,
after its definition — the first version wrapped it from a file loaded earlier, which would never have applied) to all
seven dimensions; a claim that breaks a constraint is set aside and shown; safety vetoes still lead; among close claims
the chosen goal, then confidence, risk, reversibility and time decide. The Plan tab shows it as Goals and the next unit.
Found on the way: the rate-of-loss curve was identified by object identity and came out null once copied for scaling
(now a flag). All 36 gates pass; 1,636 self-tests.

## Multidimensional maturity (§211)

docs/capabilities.json rates every capability on eight axes — engineering (the existing ladder), scientific, data,
personalisation, UX, operational, evidence, calibration — with levels and an evidence rule per level, so a capability
can be solid engineering and early science at once and say so. tests/maturity.mjs (gate maturity) enforces them:
population evidence needs a cited source; backtested needs a gate that scores it; workflow-tested needs a black-box
workflow; independent evidence needs a black-box workflow or an independent gate; measured calibration only where a
gate scores interval coverage (forecasting); prospective validation, real-world evidence, data at scale and production
operations cannot be claimed yet. Injected dishonest claims (production operations for logging, calibrated for the
optimiser, workflow-tested for the AI providers) were each refused. The README's table has a column per axis. Marginal
returns and goal arbitration were added to the ledger.

## Stage D begins: the personal training dose-response (build ce34f59a4f)

personalDoseResponse() fits the scale s of the sets curve, gain = a·(1 − e^(−sets/(7s))), across the person's
regions (weekly sets from Stage B exposure, strength gain with its standard error from the physique model), weighted
by 1/SE², with a prior log s ~ N(0, 0.5²) centred on the population curve; personal weight is 1 − posterior
variance / prior variance. Data simulated from known scales are recovered inside their intervals (0.6 → 0.61,
1.0 → 1.01, 1.8 → 1.69). marginalReturn('sets') switches to the personal curve once the person's data carry a fifth
of it, and says so; on the demo they carry 14%, so the population curve stays, and the reading says the data only hint
(it first stated the hint as a finding). Limitation, stated with every result: it compares regions with each other, not
changes over time. Registered as personal_dose_response (EMPIRICAL, input physique_regions, consumer marginalReturns);
the model-contract check refused a first declaration with an undefined class and an input that did not resolve.
Marginal returns now rate "early personal" on the personalisation axis. All 36 gates pass; 1,641 self-tests.

## Stage D: the personal frequency response (build 0bdd5176aa)

personalFrequencyResponse() removes volume's effect with the dose-response curve, then regresses what is left of each
region's strength gain on its weekly exposures (weighted by 1/SE²), with a prior centred on no effect (SD 1.5% a month
per extra weekly exposure), because at equal volume frequency adds little on average (Schoenfeld 2019 for size; Grgic
2018 for strength). A known +2% effect is recovered inside its interval, no effect gives an interval around zero, and
regions trained equally often are refused. On the demo the estimate is −0.7% (−3.4 to +2.0) with 18% personal weight,
so the population statement is shown. It states what it does not measure: fatigue per exposure, so the reconstruction
document's "response per unit fatigue" is not claimed. It appears in the Plan tab's next-unit view as one more weekly
exposure at the same sets. Also found: the future-architecture plan and an older roadmap entry held literal \u escape
text instead of characters (now decoded; none remain in any markdown file), and an earlier plan update had silently
not applied because its edit carried no check.

## Stage D: the personal sleep response; the black-box suite waits for conditions; handoff (build f8ea4c9780)

personalSleepResponse() pairs each night's sleep with the same day's fatigue, hunger, steps and training performance
(each session's estimated one-rep max against the exercise's best in the prior 30 days), as the slope per hour above
or below the person's median sleep, with priors from population evidence (Watson 2015, Spiegel 2004, Fullagar 2015;
steps near no effect), at least 14 paired days and sleep that varies. A known fatigue slope is recovered; constant
sleep and missing outcomes are refused; it says it is an association, not proof of cause. On the demo: hunger −0.42
points an hour (−0.81 to −0.04, 77% personal), training performance +2.8 points (0.3 to 5.2, 34% personal), no clear
link with fatigue or steps. The next-unit view's sleep row becomes personal for outcomes the person's data carry.
The black-box gate had failed twice in recorded runs and passed when rerun; under deliberate load it failed 3 of 3
(fixed 900 ms waits: the app had not booted, the Tools section had not drawn). It now waits for conditions with a
15-second ceiling, and under the same load passes 3 of 3. .gitattributes forces LF line endings (build identities hash
source bytes; a CRLF checkout builds a different ID). CLAUDE.md (rules Claude Code loads automatically) and
docs/handoff/TRANSITION.md (set-up, release procedure, backlog with acceptance criteria, known limits, trajectory) hand
the work to Claude Code.

## Stage D: the personal NEAT response (build 6c47545fdc)

personalNeatResponse() asks whether the person moves less when they eat less. Each week's deficit is measured rather
than assumed: the energy the weight trend implies (its 14-day slope at the week's end, times the tissue's energy
density) against what was eaten, as a share of expenditure. The week's mean steps are regressed on that share, per 10
points, with a prior centred on a small decline (−250 steps a day, SD 400), because spontaneous activity falls under
energy restriction in controlled studies (Martin et al. 2007, CALERIE) by amounts that vary widely between people. It
needs six weeks and deficits that differ by 5 points or more. A known −800 is recovered inside its interval, no
response gives an interval around zero pulled toward the prior, and a steady deficit or fewer than six weeks are
refused; it states that deliberate walks look like compensation and that it is an association, not proof of cause.
Consumers: the energy balance now states the movement its deficit is expected to cost; the optimiser credits a deeper
calorie cut with that cost, applied only to the share of the calorie effect still resting on the population figure
(the person's own calorie responses are measured on the scale and already contain it); the steps lever states the pull
the current deficit puts on everyday steps; the Learn tab's physiology card shows the response. On the demo: 9 weeks,
−298 steps a day per 10% deficit (−655 to +59, 80% personal), so the interval includes no change and the reading says
so; the current deficit is expected to cost about 308 steps (18 kcal) a day. Both deliberate breakages (no offset; the
regression's sign flipped) turned the intended checks red. Steps and calories list the model as a consumer; the
ledger's optimiser entry carries the source. All 36 gates pass (reproducible included); release 24/24; 1,659 self-tests.

## Stage D: the body-composition latent state (build 1a3e16e592)

bodyCompositionState() estimates the fat-mass rate, in lb a week, through the one Bayesian engine (bayesUpdate). Its
prior is the share of the weight trend that is fat, from tissueEnergyDensity (body-fat level, rate of loss, protein,
lifting), moved toward lean by the muscle-retention risk in a cut; that model's own stated partition range (±0.15) is
taken as one standard deviation, because partitioning cannot be measured from the record. Each body-fat method's fat
mass is fitted on its own and enters as an observation weighted by that method's error (BODYFAT_METHOD_SE), so a fixed
offset between methods cannot read as change; the waist enters as one more method through the circumference equation
(now one function, navyBodyFat, which bodyComp also uses), as a change, not a level. Lean is the remainder, its interval
taken as if independent of the fat rate (wider than the truth, and said so). Masses and trajectories are given only when
a measured reading from the last 60 days anchors them, the rule bodyComp() already follows. Self-tests from stated inputs
with expectations from precision arithmetic: with no measurement the prior stands and says so; a DEXA trend moves the
estimate by exactly its precision; a 6-point offset between DEXA and a BIA scale falling at the same rate reads as the
same rate; no anchor means no masses. Removing the measurements and inventing masses each turned the intended check red.
Consumers: the physique card's "Fat and lean" row and four state-vector components (fat and lean rate; fat and lean mass
when anchored). On the demo: fat −0.86 lb a week (−1.17 to −0.55), lean −0.12 (−0.45 to +0.20), 4% from its body-fat
readings and waist, which are imprecise against a clear weight trend. A body-composition capability joins the ledger at
"early personal". All 36 gates pass (reproducible included); release 24/24; 1,667 self-tests.

## Stage D: the aerobic-capacity trend (build 8461bd89d9)

cardioFitnessModel() already estimated VO2max per modality family with a Kalman filter whose intervals are scored
against the next session; what was missing was the direction. vo2Trend() regresses each session's estimate on time
(weights 1/sd², scatter beyond those errors inflating the standard error), in ml/kg/min a month, with a prior centred on
no change (SD 1.5), because fitness moves slowly: a training block raises VO2max by a few ml/kg/min over two to three
months in someone untrained (Milanović et al. 2015). It needs four sessions spanning three weeks, and works one family at
a time, never mixing walking or running with cycling. Each family's state now carries its trend. A known +1.2 a month is
recovered inside its interval, a steady level leaves the interval around zero, and too few sessions are refused; making
the trend ignore its data, or dropping capacity from the capability vector, each turned the intended checks red. The
capability vector's endurance entry carries the capacity (level, interval, trend) beside the cardio minutes, which are a
dose, not a capacity; the Learn tab's aerobic row shows the trend. On the demo: 23 weight-bearing sessions, VO2max 47.8
(45.6 to 50.1), trend +0.57 a month (−1.97 to +3.12, 28% personal): no clear change. An aerobic-fitness capability joins
the ledger. All 36 gates pass (reproducible included); release 24/24; 1,671 self-tests. Stage D is complete except the mobility,
conditioning and power responses, which wait for observation types that measure them (TRANSITION item 4).

## Stage E: hierarchical personalisation (build 88304dc6bc)

Each personal model kept its own prior, so two estimates of the same person could not inform each other. They now pool
through the shared engine (`hierarchicalPosterior` in 96-bayes-engine), with no new uncertainty system. The engine now
returns each unit's posterior SD as well as its mean (by the law of total variance over its grid of between-unit spreads).
The strength trends of the trained regions are pooled by `poolRegionalTrends` (with an SD floor of 0.25% a month). A
region is lagging only when its pooled interval sits wholly below the shared mean. Before, the rule was below the median
by twice its own SD, so a region measured on a few noisy sessions could be called lagging from noise alone. The phase
contexts of a personal response (cut, maintenance) are pooled by `poolResponseContexts` toward the person's own estimate
once two contexts have data of their own; with one, the population prior stands, and the record says which. The checks
are properties that follow from the model, not its own numbers:
- identical units end at the shared value, narrower than their own SD;
- units far apart and precisely measured keep their values;
- a precise slow region stays lagging, while a noisy one (−0.5 ± 1.0 against four at +2) is pulled up and not called
  lagging, where the unpooled rule would have called it;
- two agreeing contexts move toward each other.

Replacing the pooling with each unit's own value, leaving contexts unpooled, and reporting each unit's own SD each turned
its intended check red. On the demo, the three pooled regions (glutes, quads, hamstrings) gain about 7.6% a month, with
pooled SDs of 1.42 to 1.53 against their own 1.93 to 3.34; none lags. The personal-response capability's note records the
pooling. All 36 gates pass (reproducible included); release 24/24; 1,678 self-tests.

## Stage E: causal estimation on Responses (build 0a3671e46f)

Each Response judged a change by its before/after estimate alone: the trend after against the trend before, continued.
It now carries two more estimates beside that one, reported and never substituted for it (`responseCausal` in
94-causal).
- **Interrupted series.** The existing `interruptedTimeSeries` had a defect. Each window's day count starts from that
  window's own first day, so the pre-change fit was projected with the post window's numbers. That evaluated the old
  trend at the start of the pre window, a month before the change, and the "level shift" was the whole drift across that
  month: a steady loss read as a clear shift. Its level after the change was also one reading rather than the fit. Both
  segments now share one axis (days from the change). The level is the fit at the boundary, and the change in rate is
  reported as well, both with standard errors widened by the AR(1) factor for carry-over (autocorrelation never taken
  below zero, so the correction only widens; before, a negative value let the effective n exceed the nominal).
- **Matched periods** (`matchedPeriods`). The same comparison, with the Response's own windows, at dates in the person's
  record with no change of any kind in the windows or the three weeks before them. They share the change's weekday and
  phase, have no new phase, context period or training break, and start from a similar trend. The caliper is half the
  spread of such periods, or twice the standard error of a difference between two trends if that is wider. The effect
  minus their average is the estimate. Their spread is its noise, never taken below the before/after standard error, and
  "clear" uses Student's t on k−1 degrees of freedom. At least four periods; fewer is reported with what is missing.
- **Deliberate changes over time** (`deliberateChangeEffect`). A person's final Responses, per unit of each change and
  pooled by inverse variance, form an identification strategy in 86-identification with its own estimator in
  `causalAnalysis`. It is listed after the backdoor, front door and instruments.

The Response records whether the estimates agree. Its details sheet shows "Allowing for carry-over", "Against comparable
periods" and "Do the estimates agree?". The Response contract notes the new fields, and the response model version is
1.2.

The known answers come from the generators' own parameters:
- the failed_intervention fixture (flat before and after) now shows no shift, where the old series called it clear
  (t −7.4);
- the successful one shows a change in rate of −1.14 lb a week (built as −1.25);
- a change made as a three-week stall ends looks like a clear response before and after (−1 lb a week), but the matched
  periods are the earlier stall ends, which did the same on their own, so the matched estimate is within their range and
  the estimates are reported as disagreeing;
- a real change (−0.5 to −1.5 lb a week) stays clear against them and every estimate agrees;
- no matched period sits near this change or another;
- with few periods the t quantile matches the published table.

The tests hold on 60 noise seeds. Restoring the original series, removing the caliper, ignoring the comparable periods,
not dividing by the size of the change, and not excluding dates near a change each turned their intended checks red.

On the demo:
- creatine has too few readings before it for the series;
- caffeine's +0.72 ± 0.40 h of sleep (before/after) is +0.16 ± 0.80 against the projected trend, so the estimates
  disagree;
- the steps experiment's −0.50 ± 0.60 lb a week is −0.52 ± 0.60 in rate, so they agree: no clear change;
- the 67-day record needs four more nine-week stretches without a change for matched periods, and says so.

The series fix also corrects its other consumers: the demo's steps change, which the old series called "a clear shift",
now reads "larger than the noise, but not decisively", and steps' causal-support grade moves from "weakly supported" to
"correlated", in line with the Response's own "no clear response yet". A causal-estimation capability joins the ledger.
All 36 gates pass (reproducible included); release 24/24; 1,692 self-tests.

## Stage E: knowledge versioning, conflict and decay (build 8c7cf50de7)

What the record had learned had no version, aged only as a label, and could contradict itself in silence.
- **Versioning.** A Response is derived again when it matures (provisional, then final) or when the method that derives
  it changes (`RESPONSE_MODEL_VERSION`). Each derivation is a new version that names the one it replaced (stage, method,
  effect, standard error) and leaves the earlier in the event log. A final Response recorded under an older method is
  re-derived once and then left alone. Negative knowledge carries the method version that judged it and its version
  among findings about the same change, with the one it follows named. It stays append-only, as its contract says. The
  Response sheet shows the version and what it replaced.
- **Conflict.** `knowledgeConflicts()` is a projection, with nothing stored. It sets side by side two responses to the
  same lever whose effects per unit differ by more than twice the standard error of their difference, and a "did not
  work" record beside a clear response to the same lever. Each side carries its age weight, and the record says what
  would settle it. Conflicts appear in the knowledge sheet ("Findings that disagree") and its open questions.
- **Decay.** In the personal response model each response's precision is multiplied by the weight personal knowledge
  already used for its labels: half every 270 days after the response's window closed, one half-life rather than a
  second one. Each row reports its effective number of responses and the age of the oldest.

The known answers:
- a response one half-life old has a standard error √2 times its own;
- two responses at three and one times the energy arithmetic, 540 days apart, give the age-weighted average,
  (0.25 × 0.6 + 0.2) / 1.25 = 0.28 lb a week per 100 kcal, and are a conflict whose newer side counts fully and whose
  older counts a quarter;
- two that agree within their noise are not a conflict;
- a "did not work" 100 days old beside a clear response is one, its side weighted 0.5^(100/270);
- repeated negatives on the same change number 1, 2;
- a finding recorded under method 1.1 becomes version 2 naming it, with one more event, and is not derived again.

Removing the decay, the conflicts, the re-derivation or the negatives' versions, or swapping older and newer, each turned
its intended checks red. On the demo every Response is version 1, there is no negative knowledge and nothing
conflicts; the steps response is days old and counts fully. A knowledge-versioning capability joins the ledger. All 36
gates pass (reproducible included); release 24/24; 1,702 self-tests.

## Stage E: the experiment portfolio (build e8c0eabd28)

`nextTest()` picked the lever with the largest (1 − personal weight) × |population effect|, among weight outcomes only.
It now takes the top of `experimentPortfolio()`, which puts every lever's ready-made test on one scale: the information
it is expected to give. A lever's effect per unit is believed normal with SD s0: the personal response model's
posterior, already discounted for age, widened by half of the largest disagreement between its findings. A test returns
a result with standard error se per unit. Its expected information gain is ½ ln(1 + s0²/se²) nats (Lindley 1956; for a
normal model it does not depend on the result), and the estimate's SD would fall to 1/√(1/s0² + 1/se²).
- **The test's noise.** se is the outcome's noise over a Response's two 21-day windows, divided by the dose likely
  carried out: the template's change times the adherence model's probability. For weight that noise is the day-to-day
  swing over two 21-day trends; for a level, its spread over two 21-day averages. Where the person has final responses
  on that outcome measured over most of both windows (14 readings a side), their median standard error replaces the
  formula. A response with a few readings on one side measures the gap in the record, not the person: the demo's
  creatine response, with 4 readings before it, would otherwise have made every weight test look worthless.
- **Ranking.** Tests are ranked by gain per week of testing, since they run one at a time. One that would narrow its
  estimate by less than 10% is not worth running.
- **On screen.** The learning loop shows the portfolio under its next test.

Checks:
- the gain and the SD afterwards match ½ ln(1 + s0²/se²) computed by hand, from the weight swing, the 770 that the
  squared day offsets of a 21-day window sum to, and the steps likely walked;
- a level outcome's noise is its sample SD × √(2/21);
- ranking is by gain per week, and the next test is the top one worth running;
- everything below 10% is "not worth it";
- after twenty precise responses, steps is not worth testing again;
- two disagreeing calorie findings widen that lever by half their 0.4 lb difference.

Restoring the old choice, dropping the adherence probability from the dose, ignoring conflicts, ignoring the person's
own noise and removing the threshold each turned its intended checks red. On the demo, protein → hunger leads (45%
narrower, 0.86 bits in 3 weeks, since nothing is known about it), then training days → weight (20%). Calories and steps
would narrow by 5%, not worth a test after the steps experiment already run. An experiment-portfolio capability joins
the ledger. All 36 gates pass (reproducible included); release 24/24; 1,709 self-tests. Stage E is complete.

## Stage F: policy simulation (build 61bea62b51)

The optimiser ranked its options by expected weekly effect; nothing carried them forward. `simulatePolicies()` does,
for 8 weeks.
- **The path with no change** is the forecast competition's winning model (`competitionForecast`: the lifecycle's
  primary, its 80% interval calibrated on its own backtest).
- **Each change in an option** adds its effect on the weekly rate from the personal response model (population figures
  where it has none), counted only if it is carried out. One lever with effect m ± s, done with probability p, adds a
  rate with mean p·m and variance p(s² + m²) − (p·m)²: a mixture of doing it and not. Levers add and are carried out
  independently, as the optimiser assumes. The effect accumulates from three days after the change.
- **Against changing nothing** the forecast's own noise is shared, so the difference carries the levers' uncertainty
  alone.
- **On screen and in the plan.** The options card shows where each option leaves you in 8 weeks and the path with no
  change. Choosing an option records the simulated outcome in the plan version's expected result.

The checks compute paths by hand:
- an effect of −0.5 ± 0.1 lb a week done with probability 0.8 moves the 4-week mean by 0.8 × 0.5 × 25/7 and widens it by
  that mixture variance;
- two levers add;
- a change never done leaves the forecast as it was, and a certain one shifts it without widening it;
- the no-change path equals the competition's forecast week by week;
- every option shown is simulated, in the optimiser's order;
- the plan's expected result names the 8-week outcome.

Ignoring the probability of doing it, dropping the mixture variance, removing the washout, letting the difference
carry the forecast's noise, and moving the baseline off the competition's forecast each turned their intended checks
red. On the demo, with no change: 237.9 lb in 8 weeks (231.9 to 243.9) from the 14-day Theil–Sen trend, the forecast that
has scored best. The suggested option (300 kcal less a day and two cardio sessions a week, a 36% chance of doing all of
it) moves that by −3.6 lb (−6.7 to −0.5). All 36 gates pass (reproducible included); release 24/24; 1,717 self-tests.

## Stage F: counterfactuals (build 48be6a5ce1)

Each Response stated its counterfactual as one number, the trend before it. `responseCounterfactual()` turns that into
a path: what the outcome would have done without the change, day by day through the Response's after-window, beside
what was measured.
- **Weight.** The before-window least-squares line's level at the change, then the before slope plus the drift matched
  periods showed on their own where they exist. Trends move without any change, and a plain continuation would credit
  the drift to the change.
- **The interval.** The line's own prediction error; or, with matched periods, the level's error plus their spread
  (never below the Response's own standard error), growing with the days. Both are widened for day-to-day carry-over.
- **A level** (sleep, hunger): the before average, plus the drift.
- **The result.** 80% bands, like the forecasts; the difference at the end of the window is what the change did by then,
  with both errors.
- **On screen.** The Response sheet says "Without the change: about … against … measured" and charts the band beside
  the readings.

The checks build their expectations from their own least-squares fits:
- on a short record, a half-pound loss that becomes a pound and a half follows the before line to the window's end,
  and the difference is about 20/7 lb;
- where three-week stalls alternate with losses and the change comes as a stall ends, matched periods carry the path on
  as they did, so the change is credited with little, inside an interval spanning zero;
- the band at day 20 is more than 1.5 times its width at the change;
- for hunger two points higher, the path is the before average and the difference about 2.

Removing the drift, using the before average for weight, and a band that does not widen each turned their checks red.
On the demo:
- the steps experiment: without it about 253.0 lb on 7 Oct (251.7 to 254.3), against 252.2 measured, a difference of
  −0.8 lb (−2.2 to +0.6);
- caffeine's sleep: +0.72 h (0.46 to 0.98);
- creatine's interval is wide, from four readings before it.

All 36 gates pass (reproducible included); release 24/24; 1,723 self-tests.

## Stage G: sensor fusion (build 37276f7eef)

Device totals (steps, sleep) already chose one source per day. Every other measured quantity with two sources was
averaged: a scale and a hand entry 1 lb apart gave a value halfway between, which jumped by half a pound whenever one
was missing. A fusion path existed beside that and nothing used it. `fuseObservations` bias-corrected and weighted one
day by `measurementModel`'s measured noise, but it lumped every import as "import" and calibrated on today's data even
for past days.

It is now the one path, and `dailySeries` uses it, so every model reads the fused value.
- **`_sourceParams`.** The measurement model's per-source parameters, computed once and shared:
  - sources are told apart by provenance (provider or device);
  - the reference is the person's preferred source for the type, else the one with the most readings;
  - each other source's bias is the mean same-day difference from it;
  - each source's noise is its own scatter, never below its resolution;
  - only readings known by the date asked about count.
- **Fusion.** A reading from a source with a measured bias is put on the reference scale even on days it alone
  measured. Readings are weighted by quality (`measurementQuality`) over noise squared. With three sources, a reading
  more than four combined standard deviations from the others' fused value is set aside.
- **Exclusion.** Body fat is not fused: its methods differ by design, and `bodyCompositionState` reconciles them.
- **On screen.** The sources sheet shows each source's correction, noise and share of the weight, and lets the person
  choose the reference.

The known answers: a scale exactly on the line, and hand entries 1 lb heavier with ±0.5 noise from day 21.
- The scale is the reference, and the entries are 1 lb heavier on the 39 shared days.
- On shared days the fused weight stays within 0.02 lb of the scale, where the plain mean was half a pound off.
- On the three days only the entries exist, they are 1 lb lighter, on the scale's footing.
- By day 30 only ten shared days are known.
- Choosing the hand entries as reference moves the series 1 lb up throughout.
- A third source's reading 20 lb off is set aside.
- An off-protocol weigh-in counts three-quarters.
- The sheet shows the scale carrying over 90% of the weight.

Not fusing, not correcting lone readings, calibrating on later readings, ignoring the preference, contradicting nothing
and ignoring quality each turned their checks red. The demo's weight has one source, so nothing in it changes. A
sensor-fusion capability joins the ledger. All 36 gates pass (reproducible included); release 24/24; 1,731 self-tests.

## Stage H: user-approved automation (build 9a390e35e2)

Automation rules ran an action when something happened: log the supplements due, add water, show today's plan. Turning
a rule on was its only consent, and a run was audited without saying what it rested on. Nothing stopped a rule from
being given an action that changes the plan. Section 213 rules out automation that changes important state without
policy and audit, so every automated action now has an approval level (`AUTOMATION_POLICY`, 58-plan.js):
- **View** (changes nothing): runs.
- **Routine** (a small record that can be undone): runs under the standing approval recorded, with its date and scope,
  when the rule is turned on. Turning the rule off withdraws it.
- **Important** (the plan, a target, the programme, the profile, or any deletion): never runs on a trigger. The trigger
  holds a proposal, which is applied only when the person approves it, through the action's own path into `changePlan`.
  A decline is kept too.
- **Undeclared:** an action with no declared level is important.

Every decision goes to the audit log with the rule, the level and the approval it rests on: ran, held, approved,
applied, declined, refused, approval granted or withdrawn. The first important rule is "When the weekly review is
recorded → propose the plan change the week suggests". The automation sheet shows what waits (Approve, Decline), what
each rule may do and on whose approval, and what automation did.

Checks:
- self-tests from the policy's definition: fail closed, standing approval granted and withdrawn with audit entries,
  holding without changing anything, no duplicates, declining and approving audited, and the sheet;
- black-box workflow V-012, on the demo:
  - turning on "After weighing in → add 0.5 L of water" shows its approval;
  - a weigh-in logs the water;
  - turning on the weekly-review rule and opening Learn (which records the week) holds "Train 3 days a week instead of
    4" instead of applying it, so the plan is unchanged;
  - Approve adds exactly one plan version;
  - the sheet shows held, approved and applied.

Letting the important action run without approval turned V-012 red. Treating undeclared actions as routine, granting
approval without an audit entry, holding the same change twice and not auditing answers turned the self-tests red. An
automation-approval capability joins the ledger as workflow-tested. All 36 gates pass (reproducible included); release 24/24; 1,743 self-tests, 8 workflow checks.

## Stage H: self-calibration (build ed2073643a)

The forecast competition calibrated its intervals: the factor that would have made the 80% interval hold 80% of the
time, learned on older forecasts and checked on newer ones, widening or narrowing the live interval. No other model did.
The aerobic filter scored its own intervals and only reported the result, and the personal response model's
predictions were never scored at all.
- **One rule.** `intervalCalibration` (58-model-competition) is now the rule; the competition uses it unchanged.
- **Every interval model.** `INTERVAL_MODELS` lists every model that makes interval predictions, with what it is scored
  against and where its factor is applied:
  - the weight and strength forecasts, against the backtest;
  - aerobic capacity, against the next session;
  - the personal response model's predictions, against the effect each change then had, now that a Response records
    when its expectation came from the model.
- **When it applies.** Once ten predictions are scored, the factor widens or narrows the live interval: in
  `competitionForecast`, in each modality family of `cardioFitnessModel`, and in `predictResponse`. With fewer,
  intervals are used as they are, and the report says so.
- **On screen.** `selfCalibration()` puts them on the forecast card under "Are the intervals honest?".

The known answers:
- 20 ratios 0.1 to 2.0 give coverage 0.6, a factor of 1.7/1.2816, and coverage 0 on the newer half with a factor from
  the older half: not calibrated;
- an interval far too wide narrows to the 0.25 floor;
- the competition's factor equals the registry's;
- nine scored responses leave the intervals alone, and twelve, landing 0.2 to 2.4 SD from their predictions, give
  2.0/1.2816, which `predictResponse` then applies;
- on the demo's sessions the aerobic filter applies the same rule.

Ignoring the response factor, checking on the data the factor came from, removing the floor, and not calibrating the
aerobic filter each turned their checks red. On the demo:
- the weight forecast's raw interval held 35% of 17 backtest forecasts; widened 1.76 times, it held on every newer one;
- the aerobic filter's held every time (too wide); narrowed to the floor, it held 75% on newer sessions, which narrows
  the VO2max interval;
- strength and the personal response model have too few scored predictions yet.

A self-calibration capability joins the ledger with measured calibration. Aerobic fitness's calibration is now measured
too, and the maturity gate lists both as scored. All 36 gates pass (reproducible included); release 24/24; 1,753 self-tests. Stage H
is complete, and with it every backlog item that does not need credentials: item 4 waits for observation types, and
item 11 for real accounts.

## New records start at the Casual detail level (build 3011e209bd)

A decision carried from earlier work, now taken: a new record starts at Casual, the answer and what to do. The
analysis tabs, method notes and badges are one setting away (Tools → Display). Nobody's existing view changes:
- a stored record keeps the level it chose;
- one stored before the level existed was showing Insightful, so the schema backfill gives it Insightful rather than
  the new default;
- a startup merge does not replace a person's level with the default its projection carries, while a level chosen on
  another device, which arrives as an event, still wins;
- loading the demo replaces the record but keeps the person's level (it used to reset it to the default).

Checks:
- self-tests from the setting's definition, covering a new record, an old record, a chosen level, both sides of the
  merge, and the demo;
- black-box workflow V-013: a new record opens at Casual, the Display card shows Casual in use, and choosing
  Insightful shows the analysis and is stored;
- V-011 and V-012 now choose Insightful through the Display card before opening Archive and Learn, as a person at
  Casual would; jsdom ignores the CSS that hides those tabs, so the workflows had been pressing buttons a Casual
  person could not see.

Starting new records at Insightful again, dropping the backfill's exception, and letting the demo reset the level each
turned their checks red. The visual baseline was updated for the intended change: at Casual the left rail (analysis
navigation) is hidden and the right rail is shorter. The audit and the interface tests checked the rail contract at
whatever level the record opened at, so they now check it at Insightful, where the rails belong, and check Casual for
what it drops (the position rail and the palette) and keeps (the action rail and the log button); removing the Casual
rule turns that check red. All 36 gates pass (reproducible included); release 24/24; 1,759 self-tests and the black-box
workflows.

## Undo reaches back across a restore merge (build 61bd73d843)

A decision carried from earlier work, checked rather than built: undo should reach back across a restore merge. It
already does, and the record now proves it. A restore merge restarts the event log from the merged record, so an undo
of it, or of anything recorded before it, restarts the log again from the record the undo put back. Self-tests apply a
restore merge exactly as Data → Restore → Merge does and then check:
- undoing it leaves the backup's entry gone and the earlier entry in place, after the record is rebuilt from its log;
- undoing it and the entry made before it removes both, and they stay removed;
- another device that syncs afterwards converges on the same record;
- a device that had already synced the restored record loses the backup's entry when it syncs the undo.

Letting an undo of a restore revoke nothing, as an undo of a sync merge does, turned the checks red. The open question
was misnamed earlier. It is about a different merge: undoing a sync merge of another device's changes is still not
durable, because making it so would delete that device's entries on every device. That remains a decision for the
person. All 36 gates pass (reproducible included); release 24/24; 1,763 self-tests.

## Stage D: mobility, conditioning, power and speed (build 7dd314744b)

TRANSITION item 4 waited for observation types that measure these capacities. Five field tests are now chosen, each one
a person can do without a laboratory, and logged in the quick log under "Fitness tests":

| Test | Unit | Measures |
|---|---|---|
| Sit-and-reach | cm past the toes, negative if short | mobility |
| Knee-to-wall | cm, the stiffer side | ankle dorsiflexion |
| Heart-rate recovery | bpm fall in the first minute after a hard effort | conditioning |
| Countermovement jump | cm, hands on hips | power |
| 20 m sprint | s | speed |

Each is an observation type with a semantic type. The one unit table gains a length dimension (cm, in) and seconds, so
there is still a single unit system.

Each test is related to the dose that should move it, averaged over the four weeks before the test (adaptations take
weeks, so the test's own day is left out):
- the mobility tests, per 30 minutes a week of mobility work;
- heart-rate recovery, per 60 minutes a week of cardio;
- jump and sprint, per 10 lower-body sets a week, each set counted once.

`capacityResponse(kind)` is a personal model like the others:
- a cited population prior per unit of dose (+1.5 cm sit-and-reach, +0.5 cm knee-to-wall, +2 bpm, +0.5 cm jump,
  −0.01 s sprint);
- updated through `bayesUpdate` by the least-squares slope of the person's results on their dose;
- five tests at least, at doses varying by half a unit;
- the personal weight reported, with "only hint" below 0.2, and limits stated: an association across tests, not proof
  of cause, and the same protocol each time.

The sprint's "better" is downward. Four models join the registry. The capability vector's mobility, endurance and new
power entries carry the latest tests and responses, and the Learn tab's physiology card shows them.

Checks:
- a posterior computed by hand from a constructed slope;
- a noisier case where the prior visibly pulls the estimate, by the precision arithmetic;
- four tests ask for one more, and a dose that barely varied asks for tests at different amounts;
- a faster sprint reads as better;
- noisy tests only hint;
- the dose window excludes the test's own day (30 min a day is 3.5 units of 60);
- three squat sets count as three lower-body sets;
- the consumers and the form;
- black-box workflow V-014: a sit-and-reach of 12.5 and a jump of 41 through the quick log appear on the Log page, are
  stored as entered, and show on the physiology card at Insightful with four more tests needed.

Including the test's own day, dropping the prior, counting sets per muscle, ignoring the sprint's direction, lowering
the minimum, and removing the quick log choice each turned their checks red. The demo has no field tests, so each
response says what it needs. A capacity-responses capability joins the ledger as workflow-tested. Stage D is complete.

The black-box harness gains `ui.waitFor` (a state reached asynchronously). V-014 waits only on conditions (CLAUDE.md
rule 12), and choosing a level through the Display card now waits until the level applies instead of a fixed 80 ms
(V-011, V-012 and V-013 use it). With the Fitness tests save disabled, V-014 times out waiting for the Log page.
All 36 gates pass (reproducible included); release 24/24; 1,773 self-tests.

## Release integrity: root CI, one gate list, the runtime contract, the clean room from the commit (build 7dd314744b)

The work-and-direction catalogues (two documents, written against build ed2073643a) put release integrity first: the
release suite must run from a clean environment before anything else is trusted. Checked against this build, four of
their findings held:
- the CI workflow sat in `data/.github/workflows/`, where GitHub never runs it (W-001);
- `package.json` promised Node 20 or later, while the locked dependencies need `^22.22.2 || ^24.15.0 || >=26.0.0`
  (jsdom) and `>=22.19.0` (undici) (W-002);
- the gate list was written out four times (the release check, CI, TRANSITION and the maturity gate's text search),
  and a gate had no time limit, so a hung gate hung the release (doc 2, P0.4);
- the clean room copied the working tree, so it proved that the files on disk rebuild, not that the commit does (W-032),
  and it turned a food archive URL into a file path.

What changed:
- **One list.** `tests/gates.mjs` holds the 36 gates in order, each with a runtime ceiling (about two and a half times its
  measured time, never under 60 s). The release check, the maturity gate, the gate recorder and CI read it.
  `node tests/gate-record.mjs --all` runs every gate and records each one, with how long it took, even after a failure.
- **Ceilings.** Each gate runs in its own process group. Past its ceiling it is stopped, with everything it started, and
  recorded as failed. A 3-second ceiling stopped the engine gate and left nothing running.
- **Root CI.** `.github/workflows/ci.yml` is at the root. It installs the Node in `.nvmrc` and the locked dependencies,
  runs every gate and the release check, and keeps `docs/release/` as an artifact. The misplaced copy is gone.
- **The runtime contract.** `engines.node` is now the range every locked dependency accepts, and `.nvmrc` pins Node
  22.23.3. The deploy gate computes the contract from `package-lock.json`, with a small range evaluator of its own:
  - every promised Node must be one each locked dependency accepts;
  - `.nvmrc` must be one exact version inside the promise;
  - the gate must itself run on a promised Node;
  - the CI workflow must be at the root, run every gate and the release check, and keep the evidence.
  Releases now run on Node 22.23.3: the container's 22.22.0 is below jsdom's floor, and the gate says so.
- **The clean room from the commit.** `scripts/clean-room.mjs` exports `git archive HEAD`, so a build that needs an
  untracked file fails. It records the commit, Node, npm and platform, and names uncommitted changes when they are why
  the trees differ. A URL for the food archive now stays a URL.
- **The environment, written down.** `docs/release-environment.md` covers both builds (development from the repository
  alone, production with the pinned corpus), the runtime, browser, operating system, food-corpus identity and sizes,
  environment variables, the mock-only external-test mode, and what fails when a part is missing. The README's "Node 20
  or later" and `npm install` are corrected.

Checks, each seen to fail:
- the old `>=20` promise fails the deploy gate and names every dependency that needs more;
- Node 22.22.0 fails the runtime check;
- moving the workflow out of the root fails four CI checks;
- the maturity gate failed 25 checks while it still searched `release.mjs` for the list, and passes now that it reads
  `tests/gates.mjs`.

The application's source is unchanged, so the build ID stays 7dd314744b. Its first release failed one gate, `external`, on
a fixture that aged on a date (the next entry). With that fixed, all 36 gates pass on build 4fecf793ba (reproducible
included) and the release check passes 24/24; in CI, 35 of the 36 pass and the browser gate's one finding there is
followed up below.

## Recorded weather replayed at its recorded time (build 7dd314744b)

The first release on the pinned Node failed one gate, `external`, and on both Node versions, so the runtime was not the
cause. Its recorded Open-Meteo forecast covers 2026-09-19 to 2026-10-09. The server's fixture mode stamped it as
retrieved now, and the app labels each day against the retrieval time, so on 2026-10-10 every day read as past and Today
had no days ahead. A test that was bound to fail on a date, not a regression.

- A recording now carries the time it was recorded (`__retrievedAt`). The server reports that time in fixture mode and
  drops the fixture's own keys from the payload.
- The gate runs the browser at the recorded time (`page.clock.setSystemTime`), as the person would have seen it.
- The stale-refresh check had compared the refreshed stamp with the test machine's clock. It now checks that the aged
  stamp was replaced by the recording's own time, which only a refresh can do.
- With the server ignoring `__retrievedAt`, two checks fail again.

The clean room also uses the corpus the commit carries in `data/food` when it is given no archive. The corpus is tracked
in git, and the build checks every file against the lock either way. So the `reproducible` gate can run in CI without the
`FOOD_DATA_URL` secret, which the earlier CI runs passed through empty.

## One energy-density service for every conversion (build 4fecf793ba)

Catalogue W-003, and a defect this project has now fixed three times. `tissueEnergyDensity()` turns a pound of scale
weight into energy by what is probably being lost (adipose about 3,500 kcal, lean about 700). Three consumers still
divided by a bare 3,500:
- a Response's expected weight change;
- the response model's population priors;
- the optimiser's cardio and training levers.

So one intervention was read as different amounts of weight depending on which part of the app did the arithmetic. An
earlier fix had removed 3,200 after a check that searched only for 3,500; this time the check is structural.

- **The consumers** convert through `tissueKcalPerLb()` / `energyDensityRef()`. Each converted result carries `density`:
  the model id (`tissue_energy_density`), its version (1.0) and the figure used. A Response is stored with its expected
  outcome, so one recorded under an earlier density keeps it and says which it was.
- **A registered model.** `tissue_energy_density` joins `MODELS`, class PRIOR, with inputs that resolve, assumptions,
  failure conditions, its range as the uncertainty and five consumers. It runs through the inference gateway with a run
  identity, provenance and applicability. `tdee_personal`'s stated assumption ("3,200 kcal/lb (±500)") now names it.
- **Unit checks.** `kcalToLb` and `lbToKcal` take a number, or `{value, unit}` in their own unit. Pounds handed to the
  kcal side, or a missing value, return `status: 'invalid'` rather than a plausible number.
- **The structural check.** A governance detector removes comments and strings, keeping line numbers, and fails on
  arithmetic with a kcal-per-lb or kcal-per-kg literal (3000–3999 except 3600, 7000–7999) anywhere but the service and the
  self-tests.

Checks, each seen to fail:
- self-tests replace the service with a known density, 3,000 kcal per lb (range 2,600 to 3,300), then 3,500. Every
  expectation is that figure and arithmetic: −500 kcal a day is −500×7/3,000 lb a week ±30%; the prior per kcal a day is
  7/3,000; two cardio sessions at 80 kg are −480/3,000; one training session is −320/3,000. The tests also check that the
  entity and the prior agree, that changing the assumption changes every consumer, and that a recorded Response keeps its
  density;
- the unit checks and the gateway run;
- restoring the three old consumers fails six of them;
- the governance detector names `58-response-entity.js:36`, `58-response-model.js:10` and the rest, by file and line.

All 36 gates pass (reproducible included); release 24/24; 1,784 self-tests.

## One browser build everywhere, and a check that waits for the page (build 4fecf793ba)

CI's browser gate failed on `nav.top` only. The button appeared, but 700 ms after the press the runner's Chrome had not
finished the smooth scroll to the top. The check now waits for the page to arrive, up to 4 s, and reports where it
stopped if it does not.

The failure showed something wider: three environments measured the page in three browsers.
- CI used the runner's preinstalled Google Chrome.
- CI's `npx playwright install` ran the latest `playwright` CLI, which installed its own build (1248), not the one the
  locked playwright-core drives (1243).
- This container used an older headless shell (1194) that sorted first in the cache.

Now the gates use the build the locked playwright-core drives, right after an explicit `CHROME_PATH`, and fall back
only where it is not installed. CI installs that build with the locked CLI (`npx playwright-core install`), and the deploy
gate checks the CI step. This container offers only build 1194, so local releases still run on it, and say so. The
recorder also prints the P1 and P2 findings a passing gate tolerates: the audit reported one in CI that is never seen
locally.

## Unique registry ids, enforced (build 106152bbde)

Catalogue W-008: no registry may silently overwrite or drop an entry. Found:
- fourteen model registrations skipped an id already taken without a word;
- `registerView` replaced an earlier view of the same id;
- the quantity registry dropped an extended type whose key a base type had.

(`registerDomain` and `registerExternalSource` already refused duplicates loudly, and `registerVisualization` refuses
unless told to replace.)

- **One record of conflicts.** `_registryTaken()` and `_registryConflict()` (10-core) keep the first definition, record
  the attempt and report it as a P1. The fourteen guards, `registerView` (now refusing unless `replace` is given) and the
  quantity fold all go through them.
- **One audit.** `assertUniqueRegistryIds(registry, name)` reports the registry, the id, where each entry sits and whether
  the definitions conflict. It covers array registries and keyed entries whose own id disagrees with their key.
  `registryIdAudit()` runs it over the 21 registries the catalogue names (`REGISTRY_ID_SOURCES`) and adds the recorded
  conflicts. This build has none.
- **The source half.** A keyed registry's duplicate keys never reach run time, because the later replaces the earlier.
  So the governance gate reads every literal of the 14 keyed registries, their `Object.assign` extensions and their
  assignments, with a small key reader (`tests/_registry-keys.mjs`: strings, templates, comments and regular
  expressions skipped). It takes the registry list from the running app, not from a copy. The gate also runs
  `registryIdAudit()` in the app.

Checks, each seen to fail:
- self-tests inject a duplicate into every array registry, expecting it reported at index 0 and at the end, and a
  differing copy as a conflict;
- an entry filed under another id is injected into every keyed registry;
- a taken model id is refused and recorded, a second view is refused, and the first stands;
- three overrides (a registration that records nothing, the old `registerView`, an audit blind to arrays) each fail
  their test;
- in governance, a reassigned `OBS_TYPES.weight` is named with both source lines, and a second energy-density
  registration fails the run-time check.

The probes' own P1 reports are cleared afterwards: the engine gate fails a run that contains errors, and caught the
first version of these tests doing exactly that.

## No prose as data (build 106152bbde)

Catalogue doc 2, P1.4: no subsystem may recover a value by reading a sentence written for people. Three did:
- **A plan version's evidence.** It was rebuilt by joining the decision's why list into one sentence and cutting it at
  commas, so "2,100 kcal" became "2" and "100 kcal". It is now the decision's own evidence list (`_decisionEvidence`).
- **The forecast view.** It read "too close" and "too few" out of a promotion's reason. The promotion now carries an
  `outcome` (promoted, tie, not better, too few), and `_promotionPhrase` speaks from it.
- **Inventory confidence.** It counted "entries over" in each row's basis. Each row now carries `rateSource` (measured,
  stated, unit mismatch).

A governance detector removes comments and strings, then fails on splitting, matching or regex-testing a why, lede,
note, basis, caveat, reason, summary, verb, tradeoff, reverseIf or rationale. Against the old files it names exactly the
three sites.

Self-tests make the sentence disagree with the field, so code that read the sentence would answer differently:
- a why sentence holding "2,100" with the evidence list beside it;
- a reason saying "too few" with an outcome of tie;
- a stated rate whose basis does not say "entries over".

Each old implementation fails its test. All 36 gates pass (reproducible included); release 24/24; 1,792 self-tests.

## Capability status reads recorded verification evidence (build 6f28264507)

Catalogue doc 2, P0.1 and P0.2. Reading the capability matrix ran the live checks: `infer()` over every model, twice
(the inference-gateway check 4.3 s, the provenance check 2.5 s), and each capability's own function, about five seconds
on the demo record every time anything asked for a status. So asking about the system changed what the system was doing,
and the matrix could not be read often.

- **A verification run.** `runVerification()` runs the checks once and records one immutable entry per capability and
  suite: live verification, result contract, and the forecast's hold-out grade. Each entry records the build, schema,
  model versions, reference data and record revision it ran against, whether it passed, what failed, how long it took
  and when it expires (7 days). Its id is derived from those.
- **Statuses read it.** `capabilityStatus()` and `capabilityMatrix()` read the latest entry for this build and never
  execute a model or a check. An entry from another build, or an expired one, is ignored, and the status says "not run".
  The matrix now takes about 1 ms.
- **The readers run it first.** The internals sheet runs its five checks when opened, as a recorded run, and shows how
  long they took. The governance gate, the release check and the baseline each run one before reading statuses.

Checks, each seen to fail:
- while the matrix is read, 26 functions a status could run are counted, and must be called zero times. A status that ran
  its check, as the old one did, made 1,229 calls;
- the matrix must take under 1 s;
- after a run, a status traces to its entry: this build, the record revision, an expiry seven days on, and frozen;
- an entry from another build or past its expiry reads as not run. An evidence reader that ignored the build fails this.

The existing "a live infrastructure check can fail" test now breaks the check and runs verification. The quantity-registry
lookup a status needs (is the output type registered?) is a lookup, not a computation, and is the one call allowed.

## Independent verification gate (build 6f28264507)

Catalogue doc 2, P0.5: the application must be able to be wrong about itself. `tests/independent.mjs` is the 37th gate.
It never calls the self-test, the capability matrix, the verification run, the governance or maturity reports, or any
function of the app that reads the store or replays the log. It acts only through the screen (Tools, the demo section,
Load, confirm) and recomputes every expectation in the test:
- every file `dist/SHA256SUMS` lists hashes to its checksum, and no shipped file is left out;
- the build identity in `version.json` and in the page is the hash of `src/`, recomputed;
- the store, read with the browser's IndexedDB API alone, holds the observations as JSON month shards, and the app's
  record is exactly what it persisted (1,067 observations on the demo);
- the event log in the store, replayed by a reducer written in the test (snapshots, additions, corrections, retractions,
  revocations), gives the same live observations as the persisted record;
- the weight trend the app reports is the Theil–Sen slope of the persisted weigh-ins' daily means, recomputed (−1.741
  lb a week over 13 days on the demo);
- the trend's provenance node is the content hash of exactly the persisted weigh-ins, recomputed with Node's SHA-256.

Seen to fail: a shipped file changed by one byte fails the checksum check, and a trend computed with 7.01 days to the week
(−1.7437 against −1.7412) fails the recomputation. The provenance check first assumed node ids named single observations;
they name the input set by its content, so the check now recomputes that hash. Docs that stated a gate count now say
"every gate in `tests/gates.mjs`", so adding one cannot make them wrong.

The W-003 self-tests wrote their known densities as literals (3,000, 3,300). The audit's own energy scan, which reads the
self-tests too, reported that as a tolerated P1, in CI and here. The densities are now derived from `ENERGY_PER_LB` in the
test, so the audit has no findings. Its first release failed the timezone gate on a defect in the verification entries (fixed below); it is released with
the entries that follow.

## Verification runs are numbered (build fe11609746)

The first release of the verification evidence failed the `timezones` gate, which runs the whole self-test under a fixed
browser clock at three awkward local times. Under a fixed clock every verification run in one self-test had the same
timestamp, so its entries had the same ids. A status then traced to an earlier, failing entry of the same id, and the
"a status traces to its entry" test failed. Each run is now numbered, and the number is part of every entry's id. A
self-test runs two verifications under one pinned instant (`_NOW_OVERRIDE`) and requires every id to be unique; resetting
the counter makes it fail. The timezone gate passes.

## Maturity is derived, never assigned (build 78c311cc38)

Catalogue W-029: removing a hand-typed maturity label must not change the truth of the maturity report. `ENGINE_MATURITY`
was such a table: twenty engines with typed grades, presented as "how far each engine has actually been validated".
- Forecasting read statistically validated whatever its scored forecasts showed.
- `modelMaturity()` let any entry override the grade the model's own evidence gave.
- Only three of the twenty names were models; most were not even functions.

It is replaced by `ENGINE_EVIDENCE`, which says what each grade is derived from:
- a registered model (five engines), graded by `modelMaturity()` from its class and, where it is scored, its track record
  (statistically validated needs 20 scored forecasts with no significant bias);
- a function plus the release gate that tests it (fifteen), which earns infrastructure grade and never more, because
  nothing scores it against outcomes.

Evidence missing from the build leaves an engine ungraded. Every row of the maturity report says what its grade came
from, model provenance names the derived grade, and the override is gone. Forecasting now reads operational, as its record
shows. The maturity gate checks that every gate the evidence cites is a release gate and every function it cites is
declared in `src/`.

Seen to fail:
- an assigned table winning again fails two tests;
- ignoring bias fails the track-record test;
- a missing function or gate fails the maturity gate.

The absence test reads the global object rather than using a `typeof` guard. The governance gate rejects guards for names
nothing declares, and caught the first version.

## Epistemic classes, enforced at the consumers (build 78c311cc38)

Catalogue W-010: separate observed, associated, responsive, causally supported and predictive, so that a response
estimated from a change over time cannot inherit causal authority from the causal machinery.

- **One ladder.** `EPISTEMIC_CLASSES` sits beside `CLASSES`: how a result was computed and what claim it supports are kept
  apart. It maps onto `causalSupport()`'s existing grades, so there is one causal grading: supported and weakly supported
  give causally supported, and correlated, confounded and contradicted give associated.
- **Responses.** Every Response now carries `epistemicClass` and `epistemicBasis`. It is responsive unless the explicit
  pathway holds: its variable is graded supported or weakly supported, and its own causal estimates agree on a clear change
  that was not already under way. On the demo every response is responsive.
- **Consumers.** `CLAIM_CONSUMERS` declares what each consumer accepts: a causal statement and a knowledge `causes` edge
  need causally supported, and a recommendation accepts any class. `acceptClaim()` refuses the rest, and refuses a class
  that is not on the ladder.
- **The assistant.** The context packet carries each changeable variable's class (`claims`) and the ladder's meanings.
  `validateAssistantReply()` refuses a sentence that states a cause ("caused", "led to", "because of", "due to" and the
  like) about a variable whose class is below causally supported. This is a check against the record, not a word list.
  "Your weight fell after you cut calories" passes.

Checks, each seen to fail:
- with `causalSupport()` set to known grades, a supported variable with agreeing estimates is causally supported;
- a correlated variable, disagreeing estimates, a change already under way, or an unclear effect each stays responsive;
- a responsive claim is refused by the causal-statement consumer and accepted by a recommendation;
- class follows kind: measured is observed, fitted is associated, a forecast is predictive, a rule is no claim;
- three causal phrasings are refused below causally supported, and accepted at it;
- making causal support follow from the machinery's presence, or accepting every class, fails its test.

1,805 self-tests pass; the full release record is in progress.
