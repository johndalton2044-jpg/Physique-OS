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
| W-040 decision arbitration | in place | The decision lattice's priority order; `goalConflicts()` shows trade-offs. |

### Phase C: durability

| Item | Status | What and where |
|---|---|---|
| W-004 photo durability | decided (A), stated, f1ecf89ed2 | Photos are local-only by design; every backup and the Data card now say a backup holds no photo images. Option B (encrypted attachment store, off-device copy) is the person's decision. |
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

### Phase E: external certification

W-024 (AI providers), W-025 (wearable and food providers), W-026 (off-host backups): **blocked** on accounts and a key
(TRANSITION item 11). Every gate that touches them runs against a protocol-checking mock. W-027 (observability): **in
place** on the server (metrics, health, tracing); not extended this round.

### Phase F: product refinement

W-015 to W-020, W-044, W-045: **deferred**, as the catalogue orders them after calibration. (Mobility, conditioning and
power responses, TRANSITION item 4, were done before this round.)

### The rest

| Item | Status | What and where |
|---|---|---|
| W-008 unique registry ids | done, 106152bbde | 21 registries audited; registrations that find their id taken are recorded, not dropped; keyed duplicates caught in the source. |
| W-009 reproducible model runs | partly | Run identity, version vectors and provenance per run; verification entries bind model versions. No parameter-set versioning. |
| W-023 digital twin boundary | in place | Kept a bounded state and scenario model; nothing added. |
| W-028 contained errors | in place | Severities, P0 escalated; the engine gate fails a run that contains any error (it caught this round's own test probes). |
| W-029 derived maturity | done, 78c311cc38 | The typed table is gone; every grade derived from a model or a tested function. |
| W-030 separate documents | partly | Architecture (`ARCHITECTURE.md`), history (`docs/architecture-roadmap.md`), roadmap (`docs/future-architecture-plan.md`), release evidence (`docs/release/`), current state (`docs/handoff/TRANSITION.md`, this file). No generated CURRENT_STATE document. |
| W-033 deployment footprint | blocked | Needs a real deployment to measure; the local `dist/` is about 101 MB, most of it the food corpus. |
| W-034 offline semantics | in place | Service worker as before; not changed this round. |
| W-041 to W-043, W-046 | in place / partly | Knowledge decay, contradiction and replication exist (TRANSITION items 5 to 8); unit checks now guard the energy conversions; the general semantic contract is not executable everywhere. |
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
| P1.1 to P1.3 structured explanations | not done | ExplanationClaim, a structured Explanation and a compiler would restructure the decision and explanation layers; the first step taken is P1.4. |
| P1.4 no prose as data | done, 106152bbde | Three sites that read values out of sentences now carry fields; a governance detector fails on the pattern. |
| P1.5 claim registry | partly | Evidence references (`66-data-reference.js`) and the knowledge graph carry evidence and applicability; a registry of every general claim with grade and review date is not built. |
| P1.6 AI semantic control | partly, 78c311cc38 | Replies are checked against the record's figures, offered actions, and now each variable's epistemic class for causal statements. |
| P1.7 goal heuristics formalised | not done | The goal system's thresholds are still constants with their reasons in comments. |
| P1.8 goal arbitration | in place | `goalConflicts()`. |
| P1.9 browser and integration certification | done for the repository's gates | Locally and in CI. The live chain (host, rewrite, server, providers) needs a deployment. |
| P1.10 release certification | in place | The release check's 24 items and `verify-dist`. |
| P2 items | deferred | After P0 and P1, as the catalogue orders them. |
