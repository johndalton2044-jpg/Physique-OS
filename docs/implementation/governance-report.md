# Governance report

Build 5a9867b410 · generated 2026-10-12T04:22:29.409Z

**0 hard** (fail the build) · **0 soft** (tracked) · **34 passing**

## Passing

- **undeclared-reference** — every typeof guard probes a name some module declares
- **duplicate-system** — no name pairs suggesting a second version of a system
- **function-declared-twice** — every top-level function is declared once
- **action-registered-twice** — every action is registered once
- **chart-without-renderer** — every chart type a surface draws has a renderer (37 renderers)
- **hard-coded-count** — release counts are derived from the registries
- **system-authority** — every authority named in SYSTEM_AUTHORITY.md exists in the build (41)
- **action-before-registry** — no file uses a registry before the file that defines it
- **goal-ownership** — every goal read goes through canonicalGoal()
- **energy-density-literal** — every kcal-per-lb conversion goes through the one energy-density service
- **prose-as-data** — no logic reads a value out of a why, reason, basis or other sentence written for people
- **sheet-defined-twice** — no sheet is silently redefined
- **registry-without-consumer** — every registry is read somewhere or classified with a reason (1 classified)
- **audit-never-run** — 50 audit functions, every one invoked
- **registry-id-unique** — every registry id is unique in the running app (21 registries)
- **registry-key-twice** — no keyed registry is given a key twice in the source (14 registries)
- **heuristic-contracts** — every threshold and curve behind a decision or goal has a complete contract (21)
- **claim-registry** — every evidence entry carries a claim with grade, population, limitations and review date (26)
- **decision-grounds** — every decision code has declared grounds (15 codes)
- **view-requirements** — every view’s declared models and observations are exactly what it reads (12 views)
- **current-state** — docs/CURRENT_STATE.md generated from the running registries (99 lines)
- **catalogue** — catalogue generated from the running registries — 0 change(s) since the previous run
- **entity-contracts** — all 29 entity contracts hold, and every store in the record is owned or explained
- **model-without-version** — 50 models, each versioned
- **model-without-provenance** — every model result carries provenance
- **model-without-uncertainty** — every model result carries the full uncertainty contract
- **registered-but-unimplemented** — every registry entry resolves to an implementation
- **implemented-but-unsurfaced** — every capability is surfaced
- **surfaced-but-untested** — every navigable surface is exercised by a gate
- **consumer-without-registry-entry** — every reference resolves to a registry entry
- **view-without-canonical-model** — every widget reads a registered model or a declared source
- **unused-model** — every registered model has a consumer
- **missing-test** — every registered model is named by a test
- **field-read-never-written** — every field read on a stored record exists on some record of its type
