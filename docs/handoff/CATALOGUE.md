# The two work-and-direction catalogues: where each item stands

Two catalogues were written against build ed2073643a (commit 4587d95): the *Work & Direction Catalogue* (W-001 to W-046)
and the *Current Build Work & Direction Catalogue* (P0 to P2). Both put proof before breadth: release integrity first,
then verification, then analytical correctness, then durability. Each item was checked against the build before it was
worked on. An item that was already true is marked so, with where it lives; an item done in this round names the build
whose release (every gate in `tests/gates.mjs`, release check 24/24) carries it. Details are in
`docs/architecture-roadmap.md` under each build.

Status words: **done**, **in place** (true before this round), **partly**, **blocked** (needs an account, a key or a
decision only the person can make), **deferred** (later in the catalogues' own order).

## Work & Direction Catalogue

### Phase A: release integrity

| Item | Status | What and where |
|---|---|---|
| W-001 root CI | done, 7dd314744b | `.github/workflows/ci.yml` at the root runs every gate and the release check, and keeps `docs/release/` as an artifact. CI is green on GitHub. A failed run *blocking a merge* needs a branch-protection rule in the repository's settings, which only the owner can set. |
| W-002 runtime contract | done, 7dd314744b | `engines.node` is the range every locked dependency accepts; `.nvmrc` pins 22.23.3; the deploy gate checks both against `package-lock.json`. |
| W-031 release environment | done, 7dd314744b / 4fecf793ba | `docs/release-environment.md`; one gate list with runtime ceilings (`tests/gates.mjs`); one browser build, the one the locked playwright-core drives. |
| W-032 clean room | done, 7dd314744b / 4fecf793ba | `scripts/clean-room.mjs` builds `git archive HEAD` and records the runtime; byte-identical locally and in CI. |

### Phase B: analytical correctness

| Item | Status | What and where |
|---|---|---|
| W-003 energy arithmetic | done, 4fecf793ba | One energy-density service, a registered model; no kcal-per-lb literal outside it (governance detector). |
| W-010 epistemic classes | done, 78c311cc38 | `EPISTEMIC_CLASSES` mapped onto `causalSupport()`; Responses carry their class; `acceptClaim()`; the assistant may not state an unsupported cause. |
| W-036 executable failure conditions | done for the six consequential models, f1ecf89ed2 | `FAILURE_CONDITION_HANDLING`; three unchecked conditions now refuse or degrade. `failureConditionCoverage()` reports the other models, whose conditions are declared but not yet classified. |
| W-037 missingness | in place | `insufficient()` with what is needed; no model reads a missing value as zero in the paths checked this round. Not re-audited model by model. |
| W-038 observation time vs knowledge time | in place | As-of replay, knowledge-time filtering, the `timezones` and `spine` gates; the independent gate replays the log. |
| W-039 dependency invalidation | partly | A typed dependency graph from the registry (`registryDependencyGraph`); invalidation is one global memo flush, not per dependency. |
| W-040 decision arbitration | in place | The decision lattice's priority order; goal conflicts report their trade-offs as values (0dbd06b359). |

### Phase C: durability

| Item | Status | What and where |
|---|---|---|
| W-004 photo durability | done (option B), 6da68267d3 | Each image an encrypted attachment with a content hash and a synced manifest; an encrypted copy in the vault (restores a lost device), carried by encrypted backups; retraction, orphans, duplicates, failed uploads, partial restore and quota handled; every backup says whether it holds the complete visual history. Black-box workflow V-016. |
| W-005 sync idempotency | done, f1ecf89ed2 | Second device, replayed batch, partly stored retry; the ledger stays set-like and ordered. |
| W-006 one persistence authority | done, f1ecf89ed2 | The record's shape must equal `PERSIST_COLLECTIONS` and `PERSIST_SCALARS`; every collection was already walked through the whole lifecycle. |
| W-007 event/document boundary | in place | The engine gate checks every save against its own log; the independent gate replays the log with its own reducer. |
| W-035 security boundary | in place | Ciphertext-only server, signed devices, limits and restore safeguards, with the server and adversarial gates. |

### Phase D: scientific calibration

W-011 (forecast calibration), W-012 (Bayesian validation), W-013 (causal validity), W-014 (response calibration), W-021
(adherence calibration), W-022 (optimizer validation): **partly**. The machinery is in place: hold-out validation,
forecast track records and bias, interval calibration, model competition, causal grading, and (this round) epistemic
classes and derived maturity, which already downgraded forecasting from a typed "statistically validated" to the
operational grade its record shows. What none of this can do is *prospective* validation: that needs months of real use,
recorded before the outcomes. No demo record can stand in for it.

At 0dc41f684f, three more parts of that machinery:
- **Execution probability (W-021).** It is now backtested: fitted on the older half of the recorded days, scored on the
  newer half, with its Brier score against the base rate's and reliability bins. It is also recorded prospectively:
  each day's planned items are stamped with their probability before the day, and scored after it.
- **What a confidence label means.** Every confidence label says whether it is a rating or calibrated, and a calibrated
  one gives its measured coverage.
- **The optimiser (W-022).** The changes an applied option makes are scored as Responses against the personal-response
  prediction, which is already calibrated. The option's combined, execution-weighted effect is not scored on its own.

### Phase E: external certification

W-024 (AI providers), W-025 (wearable and food providers), W-026 (off-host backups): **blocked** on accounts and a key
(TRANSITION item 11). Every gate that touches them runs against a protocol-checking mock. W-027 (observability): **in
place** on the server (metrics, health, tracing); not extended this round.

### Phase F: product refinement

W-045 (why am I seeing this): **done**, 0dc41f684f. Every decision answers the catalogue's eight questions from its
structured explanation, with a trace from the screen through the decision and its models to the observations (black-box
workflow V-017).

W-044 (presentation authority): **done**, abd4ef4b01. The state and each of the 12 views declare the models and
observation types they read (`STATE_REQUIREMENTS`, `VIEW_REQUIREMENTS`). The governance gate renders every view with
the model functions and observation readers instrumented, and fails on an undeclared read or a declared one never made.
A read that depends on the day is declared as conditional, with its reason.

W-019 (recovery): **partly**, abd4ef4b01. Its definition of done is that readiness and recovery outputs show measurable
incremental value over simple baselines. The measurement is built: `readinessValidity()` rebuilds the three recovery
scores as the record stood the evening before each session. It scores them out of sample against the session, beside
sleep alone, fatigue alone and no information. On the demo record all three predict the sessions but none beats fatigue
alone, and that is the verdict shown (both recovery sheets, the assistant's answer, black-box workflow V-018). Whether a
score adds value for a real person is for their own record to show. At e0ce259ce6: how readiness moves from day to day. Each rated day's
state, as the record stood that day, gives the chance a day below normal is followed by another (each row weighed
against no carry-over), back to normal within two days, and spells of known length. Walking forward, it is checked
whether today's state forecast tomorrow better than the base rate (both recovery sheets, the assistant, workflow V-025).
At fd6e597ef7, the rest of its list:
- what each lift has cost the person the next day, beside the ontology's index (workflow V-027);
- the person's own sleep need and the debt against it, where the record shows where more sleep stops helping
  (workflow V-028);
- the NEAT response's weekly predictions scored and calibrated (workflow V-027).

W-017 (cardio): **done**, abd4ef4b01. Dose, capacity, expenditure, recovery cost and strength interference each have
their own measure and unit (`CARDIO_CONCEPTS`). A cardio change is evaluated on all five over a period before and after
it (`cardioInterventionEvaluation`), and the cardio experiment's protocol, template and picker show them. Energy
availability now costs each session at its own MET, not MET 5.

W-016 (mobility): **done**, abd4ef4b01. `mobilityRecommendation()` explains the seven parts the definition of done
names: the limitation, the measurement's quality, the intervention, the expected change, the retest condition, the
observed response and the uncertainty. It works from the knee-to-wall and sit-and-reach tests, their response model,
and a working reference that is a heuristic contract, not validated. It is shown on the mobility sheet (black-box
workflow V-019). The shoulder and hip assessments have no response model yet, so they are reported but not
recommended on.

W-015, W-018 and W-020 give directions rather than a definition of done, so each was given one a test could hold, from
its own list of high-value work:

- W-015 (training): **done**, e82ecf3367. A stalled lift's likely causes are named from the record, in a stated order: an
  unapplied progression, sets far from failure, low readiness, loss faster than the band, a rise in volume. Each has
  its evidence, threshold, action and what would settle it, on "What to change next week" (workflow V-020). No screen
  turns computed stimulus into predicted growth. At 847a6961b4: a substitute exercise starts from the person's own last
  top set of it, and with no record no load is invented (workflow V-023). At e0ce259ce6: each lift's next session is
  forecast with an 80% range checked on the lift's own past sessions, calibrated by its own factor once ten are scored
  and by all its lifts' before that (workflow V-024). At fd6e597ef7: whether a stalled lift is limited by skill or by
  strength, from the other lifts for the same muscles (workflow V-026).
- W-018 (nutrition): **done**, e82ecf3367. Two records of one food that disagree are settled by a declared rule: each
  checked against its own macros, the first of your own entry, USDA laboratory analysis, the branded label and Open
  Food Facts that agrees with itself, the other kept visible. A barcode scan meeting your own entry uses it (external
  gate). Entity resolution was already in place. At 847a6961b4: protein across meals is judged at 0.4 g/kg per meal
  once the day reaches 1.6 g/kg, a heuristic contract citing a registered finding, the daily total first. At 21dda51c45:
  - protein quality from the amino acids of the foods eaten, as one mix, against the FAO 2013 pattern (workflow V-029);
    the shipped corpus carries no amino acids until its next build;
  - whole almonds, walnuts and cashews counted at the energy feeding studies measured (workflow V-030);
  - each meal's and the day's glycaemic load from the international tables, the person's own response not measured
    (workflow V-030).
  Not built: bioavailability.
- W-020 (body composition): **done**, e82ecf3367. Each circumference site's change is set against the tape's error (your
  own repeats or a 1 cm working assumption), and read with the weight and strength trends for what it is consistent
  with, saying what the tape cannot separate (workflow V-021). At 847a6961b4: photos are compared only in matching
  conditions. Each keeps when it was taken and, optionally, its fed state, and the latest pairs with the earliest in
  matching conditions. This fixed a check that graded every pair "too little was recorded" and a Body tab that never
  showed a comparison (workflow V-022). At 21dda51c45: a body fat estimated by eye is read through the person's own bias
  against their measured readings (workflow V-031).

Mobility, conditioning and power responses (TRANSITION item 4) were done before this round.

### The rest

| Item | Status | What and where |
|---|---|---|
| W-008 unique registry ids | done, 106152bbde | 21 registries audited; registrations that find their id taken are recorded, not dropped; keyed duplicates caught in the source. |
| W-009 reproducible model runs | partly | Run identity, version vectors and provenance per run; verification entries bind model versions. No parameter-set versioning. |
| W-023 digital twin boundary | in place | Kept a bounded state and scenario model; nothing added. |
| W-028 contained errors | in place | Severities, P0 escalated; the engine gate fails a run that contains any error (it caught this round's own test probes). |
| W-029 derived maturity | done, 78c311cc38 | The typed table is gone; every grade derived from a model or a tested function. |
| W-030 separate documents | done, 0dc41f684f | `docs/CURRENT_STATE.md` is generated by the governance gate from the running registries: live counts, every capability with its maturity, and the known limitations. Architecture (`ARCHITECTURE.md`), history (`docs/architecture-roadmap.md`), roadmap (`docs/future-architecture-plan.md`) and release evidence (`docs/release/`) keep their own documents. |
| W-033 deployment footprint | partly, e82ecf3367 | Measured by `scripts/deploy-footprint.mjs` against `vercel.json`'s rules (`docs/deployment-footprint.md`): 97.8 MB raw, 24.0 MB with brotli; 1.42 MB on a first visit, 0.28 MB on a first food search, nothing on a return visit. It found a duplicate page download (2.87 MB, now 1.42 MB) and two cache rules on the food manifest; both fixed, and the deploy gate holds the budgets. The platform's own record (stored size, edge compression, cold starts) needs the owner's account. |
| W-034 offline semantics | in place | Service worker as before; not changed this round. |
| W-041 personal knowledge | done, 0dc41f684f | Each finding has one of six states (established, established in context, probable, unknown, needs testing, contradicted), decided in order from its decayed confidence, freshness, contexts and conflicts; each finding is also a claim in the one claim structure. |
| W-043 experiment methodology | done, 0dc41f684f | `experimentProtocol()` gives every single-person experiment its hypothesis, comparator, outcome, window, confounders, measurement plan, stopping rule, result and applicability. Its inference is bounded by its design: an A-B design shows at most a response, an A-B-A or a crossover can support a causal claim, and a confounder brings it down to an association. `exp.open`, used by the timeline and search but never registered, now opens it. |
| W-042, W-046 | in place / partly | The personal response matrix exists (TRANSITION items 5 to 8); unit checks guard the energy conversions; the general semantic contract is not executable everywhere. |
| O-001 to O-010 | not built | As the catalogue directs. |

## Current Build Work & Direction Catalogue

| Item | Status | What and where |
|---|---|---|
| P0.1 verification evidence | done, 78c311cc38 | `runVerification()` records frozen entries per capability and suite (build, schema, model versions, record revision, result, duration, expiry), numbered per run. Kept in memory, rebuilt by any reader that needs it. |
| P0.2 capability matrix | done, 78c311cc38 | Reads the entries and executes nothing: about 5 s to about 1 ms. |
| P0.3 self-test decomposition | partly, d0e36650b6 | Every check is filed under one of 19 suites, with counts, time, first failure and a 45 s ceiling per suite, printed by the engine gate. Running a suite *alone* needs each suite to build its own fixture; the blocks still share one sequence. |
| P0.4 gate runtime budgets | done, 7dd314744b | A ceiling per gate in `tests/gates.mjs`; a timeout is recorded as a failure, with the time taken. |
| P0.5 independent verification | done, 78c311cc38 | The `independent` gate recomputes checksums, the build identity, the persisted record, a log replay, the weight trend and its provenance hash, without asking the app about itself. |
| P0.6 food artifact | done | The corpus is pinned and content-verified; the clean room uses the archive or the commit's own copy. |
| P0.7 documentation alignment | done, 7dd314744b | `docs/release-environment.md`; README requirements corrected. |
| P1.1 to P1.3 structured explanations | done, 0dbd06b359 | `explanationClaim()`, `explainDecision()` and `compileExplanation()` (`src/58-explanation.js`): a decision's reasons are claims built from the values its rule read, rendered simple, analytical or scientific by the person's detail level; reversal conditions are values; black-box workflow V-015. |
| P1.4 no prose as data | done, 106152bbde | Three sites that read values out of sentences now carry fields; a governance detector fails on the pattern. |
| P1.5 claim registry | done, 0dbd06b359 | The evidence registry extended in place: 24 entries, each with a proposition, outcome, population, scope, applicability, limitations, grade (A to E), confidence and review date; `claimRegistry()` reports domain gaps (hydration), claims due for review, and the policies citing each finding. Evidence and policy are separate: findings support heuristic contracts, never validate them. |
| P1.6 AI semantic control | done, 0dbd06b359 | The context pack carries the decision's claim set; replies are rejected for certainty beyond a claim's confidence, a change to a lever the decision does not move, an unheld quantitative relation, a phase the claims do not apply to, or a medical interpretation, besides figures, actions and causal class (78c311cc38). |
| P1.7 goal heuristics formalised | done, 0dbd06b359 | 18 heuristic contracts (rate band zones, six decision rules, six curves, five goal tensions), each with parameter source and version, rationale, evidence basis, calibration and validation status, applicability and failure conditions; the engine reads its thresholds from them. |
| P1.8 goal arbitration | done, 0dbd06b359 | Each conflict reports affected outcomes, competing objectives, the trade-off's magnitude against its threshold, the person's priority, the chosen objective or none (then it favours neither, and says so), alternatives set aside, expected consequence and confidence. |
| P1.9 browser and integration certification | done for the repository's gates | Locally and in CI. The live chain (host, rewrite, server, providers) needs a deployment. |
| P1.10 release certification | in place | The release check's 24 items and `verify-dist`. |
| P2.11 verification performance | partly | The capability matrix reads recorded verification (P0.2); explanations, calibration and audits are memoised per record revision. |
| P2.12 formal test runner | partly | Suites with time and ceilings (P0.3). Definitions that can run one at a time need each block to build its own fixture. |
| P2.13 calibration | partly, 0dc41f684f | Every confidence label says whether it is a rating or calibrated. Interval calibration covers four models; execution probability is backtested and recorded prospectively. Prospective validation needs real use. |
| P2.14 champion/challenger | in place | Model competition with promotion only on a better score (`58-model-competition.js`). |
| P2.15 Response | in place | The Response entity with expected and observed outcomes, confounders and attribution. |
| P2.16 individual state as projection | in place | `getCurrentState()` is derived from the record, never stored. |
| P2.17 personal knowledge | done, 0dc41f684f | Six states, and each finding as a claim (see W-041). |
| P2.18 N-of-1 | done, 0dc41f684f | `experimentProtocol()`, inference bounded by design (see W-043). |
