# Physique OS — transition to Claude Code

Starting point: the delivered `physique-os-repo.tar.gz` (build f8ea4c9780) and `physique-os-food-data.tar.gz`.
Everything below is to be executed in order. The rules for every change are in `CLAUDE.md` at the repository root.

## 0. Set up (once)

1. Make the repository match the delivered archive:
   - Extract `physique-os-repo.tar.gz` over a clean checkout.
   - Delete the stale nested `physique-os-repo/` folder if your repository still has it.
   - Delete the stale built files at the root (`index.html`, `sw.js`, `version.json`, `BUILD-MANIFEST.json`, `SHA256SUMS`, `manifest.webmanifest`), but only if `vercel.json` builds and serves `dist/`, as it does in this archive.
   - Install the food data with the verifying script, not by extracting the archive by hand (its files sit at its top level, not in a `food/` folder): `node scripts/food-fetch.mjs --url /path/to/physique-os-food-data.tar.gz`. It checks the archive and every file against `data/food.lock.json`.
   - `dist/` is ignored by `.gitignore`; Vercel builds it.
2. The archive contains `.gitattributes`, which forces LF line endings. Run `git add --renormalize .` once.
   - Build identities hash source bytes, so a CRLF checkout builds a different ID and fails the `reproducible` gate.
3. Install and build:
   ```
   npm ci
   npx playwright install --with-deps chromium
   node scripts/food-fetch.mjs --url /path/to/physique-os-food-data.tar.gz   # if data/food is not already present
   node build.mjs
   ```
   The build must print `"build":"f8ea4c9780"`. Any other ID means the source differs; usually line endings.
4. Keep a local copy of `physique-os-food-data.tar.gz`. The `reproducible` gate needs `PHYSIQUE_FOOD_ARCHIVE=<path to it>`.
5. In CI (`.github/workflows/ci.yml`), set the repository secret `FOOD_DATA_URL`.
6. Commit and push. Vercel builds `dist/`.

## 1. Release procedure (after every change)

```
node build.mjs
rm -f docs/release/gate-results.json
for g in build authority layers maturity dictionary engine adversarial audit conformance governance shipped test browser visual persistence spine parity adapt integration intelligence external voice direction inputs blackbox ai deploy server connect timezones; do node tests/gate-record.mjs $g || break; done
PHYSIQUE_FOOD_ARCHIVE=/path/to/physique-os-food-data.tar.gz node tests/gate-record.mjs reproducible
for g in perf cloud:e2e yields:gate baseline verify; do node tests/gate-record.mjs $g; done
npm run -s audit
node tests/release.mjs --from-results     # must end: 24/24 verification items pass
```

- **Slow gates:** `test`, `browser`, `shipped`, `timezones` and `reproducible` take about 2–5 minutes each.
- **On failure:** fix the cause; never loosen the gate.
- **Build ID and results:** the build ID covers the application's source. A change only to `tests/` or `docs/` keeps it, so results already recorded for it stay valid.
- **Finish:**
  - record the change in `docs/architecture-roadmap.md` (newest at the end);
  - update the status tables in `docs/future-architecture-plan.md`;
  - commit with the build ID in the message, then push.

## 2. State at f8ea4c9780

- **Gates and tests:** all 36 gates pass, none skipped. 1,650 in-app self-tests, 399 interface tests, 7 black-box workflows (V-001 to V-005, V-009/V-010, V-011), and the AI, server and reproducibility suites.
- **Done:**
  - **The engineering-control audit:** release control, the authority and layer gates, canonical Response/Intervention/IndividualState, plan authority, AI-012, production server mode with verified off-host backups.
  - **Future architecture:**
    - Stage A (data dictionary, ontology lock), Stage B (exposure, outcome, plan linkage, regimes, state and capability vectors) and Stage C (marginal returns, goal conflicts, seven-dimension arbitration);
    - multidimensional maturity (§211);
    - Stage D: the personal training dose-response, the frequency response and the sleep response.
- **The parallel branch** (pull requests #1 and #2) is merged in.

## 3. Backlog, in order

Each item is done only when every common acceptance criterion holds:
- the contracts, dictionary and maturity ledger are updated;
- it has at least one real consumer;
- it has self-tests with independently computed expectations, including one that was seen to fail;
- it has a black-box workflow when it changes what a person does on screen;
- all 36 gates pass;
- the roadmap entry and the plan table are updated.

### Stage D — physiology (remaining)

1. **NEAT (everyday non-exercise activity) response:**
   - The personal change in non-exercise steps against deficit size, a signal of adaptive thermogenesis.
   - Inputs: steps, calories, weight trend, phase.
   - Prior: centred on a small NEAT decline in a deficit.
   - Output: the change in steps a day per 10% deficit, with an interval.
   - Consumers: the energy-expenditure estimate and the optimiser's steps lever.
2. **Body-composition latent state:**
   - Combine the weight trend, waist, body-fat measurements by method (each method's error is in `src/64-physique.js`) and strength retention into fat and lean trajectories with uncertainty.
   - Use the existing Bayes engine (`src/96-bayes-engine.js`); no new uncertainty system.
   - Consumers: the physique card and the state vector.
3. **Cardio fitness latent state:**
   - From cardio sessions (modality, minutes, and heart rate where logged), estimate an aerobic-capacity trend with uncertainty.
   - Consumer: the capability vector's endurance entry.
4. **Mobility response, conditioning response, power and speed:** only once observation types measure them. Each needs a new observation type (CLAUDE.md rule 7) and a logging path first.
   - Done at build 7dd314744b. The measurements chosen are field tests anyone can repeat without a laboratory: sit-and-reach and
     knee-to-wall (cm), one-minute heart-rate recovery (bpm), countermovement jump height (cm) and a 20 m sprint (s),
     logged as Fitness tests in the quick log.

### Stage E — learning

5. **Hierarchical personalisation:** pool the personal models' scales across regions and outcomes through `src/96-bayes-engine.js` instead of each model's own prior.
6. **Causal estimation:** matched periods and interrupted time series on Responses, through `src/94-causal.js` and `src/86-identification.js`, reported alongside the before/after estimate.
7. **Knowledge versioning, conflict and decay:**
   - Responses and negative knowledge carry a version.
   - Conflicting findings are surfaced.
   - Old findings are down-weighted by age.
8. **Experiment portfolio:** choose the next test by expected information gain across levers. Extend `nextTest()` in `src/58-learning-loop.js`.

### Stage F — simulation

9. **Policy simulation:** simulate the optimiser's options forward with the forecast competition's winning model and the personal response model, with an interval.
10. **Counterfactuals:** a "what if I had not changed X" trajectory from the Response counterfactual trend.

### Stage G — reality (needs credentials or real accounts)

11. **Validate against real providers:**
    - S3 backups (any S3-compatible bucket);
    - Fitbit, Withings and Oura OAuth (developer apps);
    - one real model provider (`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`).

    Record each as evidence in `docs/capabilities.json`. Only then may the evidence axis say "real-world" for that capability; update the maturity gate's rules accordingly. This item can run in parallel with the others as soon as credentials exist.
12. **Sensor fusion:** reconcile duplicate sources by provenance and quality, extending the existing source reconciliation.

### Stage H — autonomy

13. **User-approved automation:** extend the automation templates with an approval policy and an audit log. Nothing changes important state without both (§213).
14. **Self-calibration:** extend the competition's calibration to every model that makes interval predictions.

## 4. Known limits (state them; never hide them)

- **Associations, not causes:** the personal dose, frequency and sleep models compare regions or days with each other, not changes over time. The mobility, conditioning, power and speed responses relate each field test to the dose of the four weeks before it, so practice at the test itself, and anything else that changed with the dose, moves them too.
- **Fatigue per exposure:** fatigue per training exposure is not measured, so "response per unit fatigue" is not claimed.
- **Mock-tested only:** the AI providers, wearable connections and S3 backups are tested against protocol-checking mocks only.
- **Synthetic demo:** the demo record is synthetic. No capability may claim real-world evidence until item 11.

## 5. Trajectory

Stage D (items 1–4) → Stage E (5–8) → Stage F (9–10) → real-provider validation (11) as soon as credentials exist → Stage G (12) → Stage H (13–14).

Never start an item before what it depends on is in place.

## 6. State at ed2073643a (after the Stage D–H session)

- **Gates and tests:** all 36 gates pass, none skipped, and the release check passes 24/24 at every item's build. There
  are 1,753 in-app self-tests, 399 interface tests and 8 black-box workflows (V-012 is new: user-approved automation).
- **Done, each released on its own build** (see `docs/architecture-roadmap.md` for each entry):
  - **Stage D:** items 1–3 (the NEAT response, body-composition latent state, aerobic capacity with its trend).
  - **Stage E:** items 5–8:
    - hierarchical pooling across regions and phase contexts;
    - causal estimates on Responses: an interrupted series (with the projection defect fixed), matched periods, and
      deliberate changes as an identification strategy;
    - knowledge versioning, conflict and decay;
    - the experiment portfolio by expected information gain.
  - **Stage F:** items 9–10 (policy simulation; counterfactual paths).
  - **Stage G:** item 12 (sensor fusion, on the measurement model's per-source parameters, used by `dailySeries`).
  - **Stage H:** items 13–14:
    - an approval policy and audit for every automated action;
    - one calibration rule for every model that makes interval predictions.
- **Waiting:**
  - item 4 needs new observation types (CLAUDE.md rule 7) and a logging path;
  - item 11 needs S3, Fitbit, Withings and Oura developer accounts and one model provider's key.
- **Carried from earlier work, needing a decision rather than code:**
  - whether undo should reach back across a restore merge;
  - whether new users start in the Casual detail level.
- **New limits to state:**
  - the matched-periods estimate needs about nine weeks without a change per period, four periods at least, so short
    records report what they need instead of an estimate;
  - the demo's weight comes from one source, so sensor fusion changes nothing in it;
  - the aerobic filter's demo intervals were too wide and are now narrowed by its own record.

## 7. State at 7dd314744b (after item 4 and the carried decisions)

- **Gates and tests:** all 36 gates pass, none skipped, and the release check passes 24/24 at every item's build. There
  are 1,773 in-app self-tests, 400 interface tests and 10 black-box workflows (V-013: a new record opens at Casual;
  V-014: logging fitness tests and reading them back).
- **Done since §6, each released on its own build:**
  - **Item 4:** four personal responses (mobility, conditioning, power, speed), on five new observation types, a length
    dimension and seconds in the one unit table, and a Fitness tests entry in the quick log. Each starts from a
    population prior per unit of weekly dose and reports its personal weight. Consumers: the capability vector and the
    Learn → Physiology card.
  - **Casual by default:** a new record starts at Casual. A stored record keeps its level, and one stored before the
    level existed gets Insightful, which is what it was showing. The audit and the interface tests check the rail
    contract at Insightful and check Casual for what it drops.
  - **Undo across a restore merge:** it already worked; self-tests now prove it durable across a restart and on another
    device.
- **Waiting:** item 11 needs S3, Fitbit, Withings and Oura developer accounts and one model provider's key.
- **Open decision:** undoing a sync merge of another device's changes is not durable: the next sync brings them back.
  Making it durable would revoke that device's events, which removes them on every device.
