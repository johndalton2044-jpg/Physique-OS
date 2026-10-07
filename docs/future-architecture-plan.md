# Future architecture: where the build stands, and the order of work

The second half of the reconstruction document describes about 200 capabilities over five horizons. Its own guidance
governs the order: implement by dependency leverage (§212), in the staged sequence of §210, never by building "another
registry, event system, decision engine, uncertainty system, provenance system or dependency graph" (§213), and never
making AI the authoritative analytical engine. The engineering-control audit reaches the same conclusion: complete the
canonical loops before adding capabilities.

Status, per item of §210, with where it lives. **Exists**: implemented, integrated and gated. **Partial**: real code
that covers part of the item. **Missing**: nothing yet. Ratings are from the code at build 11bbf10590.

## Stage A — make the existing substrate authoritative

| # | Item | Status | Where / what is missing |
|---|---|---|---|
| 1 | Canonical data dictionary (§159) | Exists | `docs/data-dictionary.json`, generated from the existing registries (observation types, contracts, events, models, semantic types; the 10 hand-written concepts kept as meanings); gate `dictionary` fails on an undescribed type, an event without an owning contract (17 were found and assigned), or a persisted field not in the committed dictionary. |
| 2 | Ontology versioning (§160, §161) | Exists | The ontology version is a hash of its ids (observation types, events, stores, models, exercises); an id that disappears without an entry in `docs/ontology-migrations.json` fails the gate. |
| 3 | Universal provenance (§57) | Partial | Observations, model runs, plan versions and responses carry provenance; no single provenance graph across them. |
| 4 | Dependency invalidation (§58) | Partial | One global memo invalidation (`_memoInvalidate`); no fine-grained dependency graph. |
| 5 | Deterministic model-run identity (§59) | Exists | `runId` on model runs; reproduced across independent loads (visual gate). |
| 6 | Model lifecycle | Exists | `MODEL_LIFECYCLE_STATES`, promotion and rollback (58-model-competition). |
| 7 | Self-auditing (§156–158) | Exists | Gates `governance`, `authority`, `layers`, `maturity`, `inputs`, `conformance`. |
| 8 | Release governance | Exists | Fail-closed build, skipped gate = not passed, release check. |
| 9 | Reproducible food data | Exists | Locked corpus; `reproducible` gate is byte-identical. |
| 10 | Production observability | Exists | Server metrics, health, tracing, verified off-host backups. |

## Stage B — complete the longitudinal object model ("the most important structural tranche")

| # | Item | Status | Where / what is missing |
|---|---|---|---|
| 11 | Response entity | Exists | 58-response-entity, canonical field set. |
| 12 | Exposure entity | Exists | `exposures` (exposure.recorded): planned beside received, the same measure before, coverage; shown on each Response in Learn. Was: | Exposure is implicit in a Response's windows; there is no record of the dose actually received (training volume per muscle, calories eaten, steps walked) as its own object. |
| 13 | Outcome entity (§104) | Exists | `outcomes` (outcome.recorded), referred to by the Response. Was: | `observedOutcome` lives inside a Response; outcomes are not first-class, so one outcome cannot be shared by two interventions. |
| 14 | Intervention normalisation | Exists | One lifecycle projection for every domain (`interventionLifecycles`). |
| 15 | Adaptation linkage | Exists | Each Response carries `planVersionId`, the plan version in effect when the change began. Was partial: | Plan versions carry their trigger, reason and expected outcome (`changePlan`); a Response does not yet link back to the plan version it evaluates. |
| 16 | Regime and state transitions (§89) | Exists | `regimes()` (projection): phases, context periods, training breaks and the return, weight-trend breaks; a change inside a Response's window is a confounder. Was partial: | Change points (10-core, 45-baselines, 79-rigour), phases and context tags exist; no regime object (cut, maintenance, illness, travel, return to training) with entry and exit. |
| 17 | Personal state vector (§4.1) | Exists | `stateVector()`: each value with its standard deviation and the age of its newest data; part of `individualState`. Was partial: | `individualState()` composes the parts; components carry no uncertainty and no freshness. |
| 18 | Personal capability vector (§106) | Exists | `capabilityVector()`: strength by region with its trend, work capacity, endurance, mobility, each over four weeks. Was: | Strength by lift exists; no vector of capabilities (strength by region, work capacity, endurance, mobility) with uncertainty. |

## Stage C — the adaptive core

| # | Item | Status | Where |
|---|---|---|---|
| 19 | Response engine | Exists | Personal response model (58-response-model). |
| 20 | Adherence model | Exists | `adherenceState`, execution records. |
| 21 | Friction model | Exists | 59-friction. |
| 22 | Goal arbitration (§32, §33) | Exists | `goalConflicts()`: five tensions detected from the person's state, the trade-off shown, the person choosing; `arbitrateDecision` extended in place to all seven dimensions of §33 (constraints set a claim aside, visibly; safety vetoes still lead; the chosen goal breaks ties). Was: | Decision arbitration exists between decision sources; nothing arbitrates between goals (fat loss against strength, a deadline against recovery). |
| 23 | Marginal return (§7.3, §7.4) | Exists | `marginalReturns()`: one cited dose-response curve per lever (sets, protein, steps, cardio, sleep, rate of loss), the next unit's benefit at the current dose with its uncertainty, zone and costs; population curves say so. Was partial: | Doses in the optimiser; volume against gain by region (64-physique); no explicit diminishing-return curve. |
| 24–27 | Opportunity cost, robustness, reversibility, optimiser | Exists | 73-unified-optimiser (reversibility is stated, not modelled). |
| 28 | Adaptive programming | Partial | Adaptation proposals and programme changes; not driven by the response engine. |

## Stages D to H

| Stage | Exists | Partial | Missing |
|---|---|---|---|
| D — physiology | fatigue compartments; acute and weekly recovery; energy balance (personal TDEE); body fat by method; training dose-response (personal scale of the sets curve, Bayesian across regions: `personalDoseResponse`); frequency response at equal volume (`personalFrequencyResponse`, prior centred on no effect); sleep response (`personalSleepResponse`: fatigue, hunger, steps, training performance); NEAT response (`personalNeatResponse`: everyday steps a day per 10% deficit, the deficit measured each week from intake and the weight trend, prior centred on a small decline; consumed by the energy balance and the optimiser's calorie and steps levers); body-composition latent state (`bodyCompositionState`: the fat-mass rate from the partition prior and each body-fat method's own trend through `bayesUpdate`, lean as the remainder, masses only when a recent measurement anchors them; consumed by the physique card and the state vector); aerobic capacity with its trend (`cardioFitnessModel` per modality family, `vo2Trend`: ml/kg/min a month, prior centred on no change; consumed by the capability vector's endurance entry) | | mobility response; conditioning response; power and speed |
| E — learning | Bayesian personal response; experiments; negative knowledge; next-test selection; hierarchical personalisation (`hierarchicalPosterior` in 96-bayes-engine, now with each unit's posterior SD: the strength trends of the trained regions pooled by `poolRegionalTrends`, a region lagging only when its pooled interval sits below the shared mean; the personal response's phase contexts pooled by `poolResponseContexts` once two have the person's own data); causal estimation on Responses (`responseCausal` in 94-causal: beside each before/after estimate, the interrupted series, now projecting the old trend to the change on one axis with standard errors widened for carry-over, and `matchedPeriods`, the same comparison at dates in the person's record with no change; `deliberateChangeEffect` pools them per unit as the identification strategy "deliberate changes over time" in 86-identification, with its own estimator in `causalAnalysis`); knowledge versioning, conflict and decay (a Response's `version` and `previous`, derived again when it matures or its method changes; negative knowledge's `modelVersion`, `version` and `follows`; `knowledgeConflicts`, shown in the knowledge sheet and its open questions; each response's weight in the personal response model halving every 270 days); the experiment portfolio (`experimentPortfolio` in 58-learning-loop: each lever's ready-made test by expected information gain per week, the lever's uncertainty widened where its findings disagree, the test's noise from the person's own responses where measured; `nextTest` takes the top one worth running, and the learning loop shows the rest) | — | — |
| F — simulation | forecast competition (ensemble of candidates); policy simulation (`simulatePolicies` in 73-unified-optimiser: each option carried 8 weeks forward from the competition’s winning forecast with the personal response model’s effects, each counted only if carried out, 80% intervals; on the options card, and in the plan’s expected outcome when one is chosen); counterfactuals (`responseCounterfactual` in 94-causal: what each change’s outcome would have done without it, day by day, from the Response’s counterfactual trend and its matched periods, with an 80% band and the difference by the end; charted in the Response sheet) | scenarios and the state model ("twin"); robust optimisation | — |
| G — reality | weather and air; schedule model; file imports; sensor fusion (`fuseObservations` on `_sourceParams`, the measurement model’s per-source bias and noise, now by provenance and as of the date asked about: every day of a measured type with two or more sources is fused in `dailySeries`, so every model reads the fused value; the sources sheet shows each source’s correction, noise and share) | wearable connections (simulated providers only); equipment; inventory | computer vision; movement telemetry |
| H — autonomy | model challenger and retirement; continuous self-audit (gates); intervention recommendation | adaptive measurement (adaptive capture); proactive detection (anomalies, attention); user-approved automation; self-calibration | — |

## Maturity becomes multidimensional (§211)

The single ladder in `docs/capabilities.json` becomes one rating per axis — engineering, scientific, data,
personalisation, UX, operations, evidence — so that a model can be production-grade in engineering and experimental
in science, and say so.

## Order of work

1. Stage A1 and A2: done (gate `dictionary`).
2. Stage B: done.
3. Stage C: done; personal scaling of the marginal curves waits for Responses to changes in each dose.
4. Multidimensional maturity: done. Stages D to H in order, each item only when the items it depends on are in place.

Not to be built (§213): any second registry, event system, decision engine, uncertainty system, provenance system,
dependency graph, unit system, navigation architecture or presentation calculation layer; AI as the analytical
authority; visualisation as a source of physiological truth; population evidence presented as personal certainty;
adaptation to every noisy fluctuation; automation that changes important state without policy and audit.
