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

**Continuing in H4:** calibration by context, the experiment and knowledge surfaces made consumer-friendly (MK W13, W14),
causal and Bayesian validation on accumulating real data, the copilot's evidence-linked answers, and the chart types
still without a renderer — each built as the capability it serves is surfaced.

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
