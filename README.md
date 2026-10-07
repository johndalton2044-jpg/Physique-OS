# PHYSIQUE OS 1.0.0

An offline-first, single-file adaptive body-composition operating system. It separates what was
**measured** from what was **derived**, **assumed**, **estimated** or **predicted**; it changes one variable
at a time with a prediction stamped before the outcome; and it keeps what did not work.

Not medical advice. It interprets a training and nutrition record; it does not diagnose disease.

## Capability maturity

What is finished, what is partial and what is not built, rated on separate axes so that a model can be solid engineering and early science at once (reconstruction §211). Every level is earned: the rules are in docs/capabilities.json and tests/maturity.mjs refuses a claim its evidence does not support; prospective validation, real-world evidence, data at scale and production operations cannot be claimed yet. Engineering levels: not implemented → specified → implemented → integrated → surfaced → validated → production-ready.

<!-- maturity:begin (generated from docs/capabilities.json by tests/maturity.mjs --write) -->
| Capability | Engineering | Scientific | Data | Personalisation | UX | Operational | Evidence | Calibration | Shown by |
|---|---|---|---|---|---|---|---|---|---|
| Local persistence (IndexedDB, incremental writes) | validated | — | real data path | — | surfaced | local | independent | — | gate persistence |
| Backup and restore | validated | — | real data path | — | workflow-tested | local | independent | — | workflow V-010 |
| Erase everything | validated | — | real data path | — | workflow-tested | local | independent | — | workflow V-009 |
| Food logging with portions | validated | — | real data path | — | workflow-tested | local | independent | — | workflow V-002 |
| Training sessions and sets | validated | — | real data path | — | workflow-tested | local | independent | — | workflow V-003 |
| Corrections and deletions with history | validated | — | real data path | — | workflow-tested | local | independent | — | workflow V-005 |
| Phase targets reaching Today | validated | — | real data path | — | workflow-tested | local | independent | — | workflow V-001 |
| Recovery readings changing today's training advice | validated | heuristic | real data path | population | workflow-tested | local | independent | insufficient | workflow V-004 |
| One plan authority (every plan change through changePlan, one version each) | integrated | — | real data path | — | surfaced | local | internal | — | gate authority |
| What was known on a past date | validated | — | real data path | — | workflow-tested | local | independent | — | workflow V-011, gate engine |
| Encrypted sync between devices | integrated | — | real data path | — | surfaced | server | independent | — | gate cloud:e2e, gate server |
| Verified off-host server backups, restore and health | integrated | — | simulated | — | hidden | server | internal | — | gate server |
| Adaptive plan | surfaced | heuristic | real data path | early personal | surfaced | local | internal | insufficient | gate adapt |
| Personal response model | surfaced | population evidence | real data path | early personal | surfaced | local | internal | insufficient | gate engine |
| Forecasts that compete for accuracy | surfaced | backtested | real data path | personal | surfaced | local | internal | measured | gate engine |
| Unified optimiser | surfaced | heuristic | real data path | early personal | surfaced | local | internal | insufficient | gate engine |
| Marginal returns: the next unit of each dose | surfaced | population evidence | real data path | early personal | surfaced | local | internal | insufficient | gate engine |
| Goal conflicts and arbitration on seven dimensions | surfaced | heuristic | real data path | population | surfaced | local | internal | — | gate engine |
| Body composition: fat and lean trajectories | surfaced | population evidence | real data path | early personal | surfaced | local | internal | insufficient | gate engine |
| Aerobic fitness: VO2max level and trend | surfaced | population evidence | real data path | early personal | surfaced | local | internal | measured | gate engine |
| Mobility, conditioning, power and speed: field tests and their responses | surfaced | population evidence | real data path | early personal | workflow-tested | local | independent | insufficient | gate engine, workflow V-014 |
| Causal estimates of each change: interrupted series and matched periods | surfaced | population evidence | real data path | early personal | surfaced | local | internal | insufficient | gate engine |
| Personal knowledge: versions, conflicts and decay | surfaced | heuristic | real data path | early personal | surfaced | local | internal | — | gate engine |
| Experiment portfolio: the next test by expected information gain | surfaced | population evidence | real data path | early personal | surfaced | local | internal | — | gate engine |
| Sensor fusion: one value from several sources | surfaced | population evidence | real data path | early personal | surfaced | local | internal | — | gate engine |
| User-approved automation: approval policy and audit | surfaced | — | real data path | — | workflow-tested | local | independent | — | gate engine, workflow V-012 |
| Self-calibration of every interval | surfaced | backtested | real data path | early personal | surfaced | local | internal | measured | gate engine |
| State model (the 'digital twin') | surfaced | heuristic | real data path | early personal | surfaced | local | internal | insufficient | gate engine |
| Import from Apple Health, Fitbit, Withings and Oura exports and CSV | integrated | — | real data path | — | surfaced | local | independent | — | gate integration |
| Live connections to Fitbit, Withings and Oura | implemented | — | simulated | — | surfaced | server | internal | — | gate connect |
| Garmin, WHOOP, Strava, Polar, Samsung Health, Health Connect, HealthKit | specified | — | none | — | hidden | — | none | — | — |
| LLM providers (Anthropic, OpenAI, Gemini, local OpenAI-compatible) through the server | integrated | — | simulated | — | surfaced | server | internal | — | gate ai |
| AI proposals: describe a log entry or a meal, suggest a session, explain the plan | integrated | heuristic | simulated | population | surfaced | server | internal | — | gate ai |
| OCR of labels and photos | not implemented | none | none | — | hidden | — | none | — | — |
| Body shape from photos | not implemented | none | none | — | hidden | — | none | — | — |
<!-- maturity:end -->

## Run it

* **Simplest:** open `index.html`. Everything works: logging, models, decisions, experiments, replay, exports,
  the inline Foundation food database. Branded-product search and the service worker need a server
  (browsers block `fetch` of local files and service workers under `file://`).
* **Full:** serve this folder over http(s) — `python3 -m http.server 8080` — open `http://localhost:8080/`,
  then *Add to Home Screen / Install*. The service worker caches the shell; branded food shards are cached
  as they are used, or all at once from **Tools → Food database → Download all shards**.
* **iOS:** Safari → Share → Add to Home Screen. Storage is IndexedDB (authoritative) mirrored to
  localStorage; export a JSON backup regularly (Tools → Data). Two storage regimes apply and they differ:
  in the **Safari browser tab**, Intelligent Tracking Prevention can delete script-writable storage
  (IndexedDB, localStorage) after seven days without user interaction; a **Home Screen web app** is exempt
  from that seven-day rule (WebKit documents the exception explicitly) and keeps its data until the app is
  removed or the device runs the storage-pressure eviction. Either way the exported backup is the only copy
  you control, so keep one current.

## What is in the folder

| path | purpose |
|---|---|
| `index.html` | the whole application (single file, no external dependencies, no eval) |
| `sw.js` | service worker: versioned cache, precached shell, cache-first data shards, network-first HTML |
| `manifest.webmanifest`, `icons/` | PWA metadata and generated icons |
| `data/food/` | USDA FoodData Central Branded Foods (release 2026-04-30, CC0): 455,381 products in 114 record shards, 892 search-index shards, 100 barcode shards, `manifest.json`, `SHA256SUMS` (93 MB, lazy-loaded) |
| `data/reference/compendium-2024.json` | 2024 Adult Compendium of Physical Activities, all 1,111 activities |
| `version.json`, `BUILD-MANIFEST.json`, `SHA256SUMS` | build and release identity, input list, checksums |
| `docs/` | data-adapter guide and the iOS device-test procedure |

Foundation Foods (354 foods with analytical nutrients and portions) are embedded in `index.html`.

## Keyboard

`⌘/Ctrl K` command palette and global search · `⌘/Ctrl Z` undo · `/` search · `L` quick log · `Esc` close · `1–9` views.

## Building and verifying

**Requirements.** Node 20 or later. The build itself needs nothing else. The gates need two dev dependencies
and, for the real-browser gate, a Chromium-family browser:

```
npm install                    # jsdom and playwright-core (dev dependencies only)
npx playwright install chromium   # only if Chrome, Chromium or Edge is not already installed
```

The browser gate finds a browser on its own — `CHROME_PATH` if set, then the standard Chrome, Chromium and Edge
locations on Linux, macOS and Windows, then Playwright's browser cache. If it finds none it fails with these
instructions rather than passing. `PHYSIQUE_SKIP_BROWSER=1` skips it knowingly, and the run then says that
layout, touch targets and contrast were not verified in a browser.

```
npm run build      # concatenate src/ into dist/index.html, generate icons, write the manifest and checksums, verify
npm test           # interface gate: boots dist/ in jsdom, exercises every view, sheet and shortcut
npm run engine     # engine gate: loads every src/ layer with no DOM at all and asserts the invariants
npm run adversarial# import boundary, fuzzing, injection, crypto and audit-chain attacks
npm run audit      # visibility, population, dead toggles and placeholder leakage across every surface
npm run perf       # performance budgets at 1 and 5 years of daily use (perf:full adds 10)
npm run verify     # re-read dist/ and check every hash, asset reference and data checksum
npm run conformance# every domain against the architecture contract
npm run governance # §34 detections from code metadata and the runtime registries; writes docs/implementation/governance-report.{json,md}
npm run shipped    # the full in-app self-test suite run inside the shipped file, plus its size
npm run browser    # real Chromium: touch targets, clipping, overlap, contrast and rails at six viewports
npm run baseline   # regenerate docs/implementation/ from the running build
npm run visual     # visual regression (SVG, tokens, typography, layout, chart semantics) and model reproducibility, clock pinned
npm run release    # every gate, then the 24-item final verification, the §33 adversarial matrix and the §38 trace;
                   #   writes docs/release/{RELEASE.md, release-manifest.json, capability-maturity.md, definition-of-done.md}
npm run check      # build → engine → test → adversarial → audit → conformance → governance → shipped → browser → visual → perf
                   #   → yields gate → cloud sync → baseline → verify
npm run check:full # the above, plus the full performance budgets
npm run package    # check, then produce physique-os-dist.tar.gz
```

Both gates report their own counts rather than being described here, because a number written in prose goes
stale the moment a test is added. `npm test` prints `N passed, N failed`; `npm run engine` prints the same
plus the in-app self-test total. The engine gate derives its file list from `src/` so it cannot silently stop
covering a module that was added after it was written.

Two identities are recorded. `build` hashes `src/` and answers "is the application code the same".
`release` hashes every material build input — sources, `build.mjs`, `scripts/`, `data/reference/`, `tests/`,
the package configuration and the food-database identity — and answers "is the distribution the same". The
service-worker cache is named after `release`, so changing the build pipeline invalidates the cache exactly as
a source change does.

The build refuses to emit a distribution that fails its own guards: no `eval`, no external scripts, declaration
order for the food-log aggregation override, settings attributes on `<html>` rather than `<body>`, a 44px
minimum touch target declared for every primary control, and every shipped file present at the size and hash
recorded in `BUILD-MANIFEST.json`.

Optional data adapters (FNDDS survey foods, DSLD supplement labels, USDA retention and yield factors) have
builder scripts in `scripts/`; see `docs/data-adapters.md`.

## Navigation and interaction

Every important state is navigable to, every important action has at least one visible path, and every
power-user path has a discoverable equivalent. A capability that exists only because someone might guess a
keyboard shortcut does not exist.

`interactionMatrix()` is the executable form of that rule: it projects the command register into a table of
which surfaces each command is reachable through (view control, utility rail, command palette, keyboard,
context menu) and fails the self-test if any command is reachable only by keyboard or gesture. The table is
visible in Tools → Interaction matrix.

* **Command palette (⌘K)** lists every command, its shortcut, and search results across food, exercises,
  observations, sessions, decisions, experiments, evidence and notes. Prefixes narrow the domain
  (`food:`, `exercise:`, `decision:`, `date:2026-08`).
* **Application history** (`[` / `]`, or the rail) restores tab, scroll position, selected date and filters —
  closing a sheet does not lose your place.
* **Day navigation**: arrow keys step days, `T` returns to today, and named jumps go to the previous logged
  day, weigh-in, training day, phase start or a specific date.
* **Attention queue** (`A`) replaces notifications. Every item answers what happened, why it matters and what
  can be done, and carries the action that does it. No badge counts for their own sake.
* **Missing data** and **data quality** turn uncertainty into a path: each row names what the gap limits and
  links to the affected record.
* **Timeline** traverses observation → decision → intervention → prediction → outcome → calibration.
* **Focus mode** (`F`) hides secondary detail and diagnostics. It never hides a warning, an uncertainty
  statement or a provenance mark: reducing clutter must not reduce honesty.
* **Undo history** names what each step would revert before you commit to it, and confirms beyond one step.
* **Selection and bulk operations** on observations and food entries. A batch is N of the same single-record
  operation, so it retracts rather than deletes, and the whole batch is one undo entry.
* **System health** reports storage, schema and error conditions. A save that did not persist raises a
  persistent banner offering an export — the one recovery that does not depend on storage.
* **Keyboard help** (`?`) is generated from the same map the hotkey handler uses, so a shortcut cannot exist
  without being documented.

## History is an event log

Every change is recorded as a fact that happened — `observation.corrected`, `food.superseded`,
`phase.targetsChanged` — and the record you see is a projection of those events. The build asserts that
replaying the whole log reproduces the record field for field, which is the only honest proof that the log is
complete: a mutator that forgets to emit shows up immediately as a difference.

Because the unit of exchange is a fact rather than a snapshot, **merging is well defined**. Tabs and devices
converge by union on event id, ordered by (timestamp, device, sequence). Two tabs editing different things
both survive; two devices editing the same record within an hour produce a *reported* conflict with both
edits retained, never a silent overwrite. Between tabs this happens automatically; between devices you export
and import a sync file. There is no server, and none is pretended.

A record can also arrive from outside the log — the demo generator, a restore, a backup from an older build.
In that case the log restarts from a stated snapshot event, so the completeness proof stays universal rather
than exempting the awkward cases.

## Running it

It is a static site. Serve `dist/` over HTTP(S) — there is no runtime and no build step at deploy time.

```
npm run serve      # http://127.0.0.1:8123
```

**It needs an origin.** Opened as a file — from a file manager, or a chat attachment preview — you get the
interface and the demo record, but no food database, no offline mode and no persistent storage, because those
all need somewhere to fetch from. The app says so rather than appearing broken. `localhost` and HTTPS both
count as secure contexts and give you everything; plain HTTP on a LAN address does not (no service worker, no
encryption).

`127.0.0.1:8787` refusing to connect is the **sync server**, which is separate, optional and off by default.
Nothing in the app requires it.

Full matrix, headers and iOS install steps: `docs/deployment.md`.

## What is in each archive

Two artifacts, and the boundary matters:

* **`physique-os-dist.tar.gz` — the client.** `index.html`, the service worker, icons, the food database and
  the reference tables. This is what you host. It does **not** contain `server/`.
* **`physique-os-repo.tar.gz` — the whole project.** Sources, build, tests, scripts, docs, **and
  `server/server.mjs`**. The sync server is distributed here, not relative to the client distribution.

References to `server/server.mjs` elsewhere in this file mean the repository archive.

## Syncing between devices

`server/server.mjs` is a zero-dependency Node service that stores ciphertext it cannot read. Events are
encrypted on the device with a key derived from a recovery phrase the server never receives; authentication
is a signature over a single-use challenge, so there are no passwords and no password database.

```
npm run server      # 127.0.0.1:8787 (from the repository archive)
npm run cloud:e2e   # two real clients + a real server, asserting no plaintext ever lands on disk
```

**The client is built with `connect-src 'self'`, so it can only talk to its own origin.** That is deliberate:
a policy permitting arbitrary destinations is a policy permitting exfiltration. The supported deployment is
therefore a **reverse proxy on the app's own origin** — the client defaults to the same-origin path
`/api/sync`:

```nginx
location /api/sync/ { proxy_pass http://127.0.0.1:8787/; }
```

An HTTPS page also cannot call `http://127.0.0.1:8787` under mixed-content rules, so a localhost endpoint
works for development only. A deployment that genuinely needs a separate origin must say so at build time —
`node build.mjs --sync-origin https://sync.example.com` — which widens the policy for exactly that host and
nothing else. The Sync panel states which arrangement is in force.

A second device joins with the same phrase but must be authorised from a device already signed in, so a
stolen phrase alone cannot silently join. Push is bodiless — the push service learns that something is
waiting and nothing else. What the server *can* still infer (vault existence, event counts, sizes, timing) is
documented in `docs/server-operations.md` rather than glossed over.

Lose the phrase and the data is gone. A server able to recover it would be a server able to read it.

## Capture

* **Voice** — "log 180 grams of chicken breast for lunch" becomes a *proposal* you confirm. Dictation
  mishears, and a misheard number landing unseen is a silent corruption.
* **Nutrition panels** — paste the text (camera live text, a photo app, or by hand) and it parses into a
  food, flagging any panel whose macros cannot produce its stated calories. No OCR engine is bundled.
* **Wearables** — Fitbit, Withings and Oura connection adapters are implemented and tested against simulated providers
  only: no real account has been connected yet, so live connections are not proven. The OAuth credentials identify the
  deployment and are supplied by whoever runs it. Every one of those vendors also exports a file, and file import is
  complete and tested.

## Asking a number where it came from

Tap a figure on Today — the weight average, maintenance, protein — and it opens the chain that produced it:
the readings used, your own scale noise, the line fitted, the interval, the confidence, and what would change
it. Steps carry their own epistemic class, so a chain passing through a population assumption shows it at the
step where it enters rather than only at the end.

A trace reports the same call the view made, never a recomputation, so an explanation cannot disagree with the
thing it explains. Where a number cannot be established, the trace says what is missing rather than producing
one anyway.

## Cooking yields

537 raw-to-cooked yield factors extracted from USDA Agriculture Handbook 102 ship with the app (pages 20–72 of 131). Every one was
confirmed by checking that its yield and loss percentages sum to about 100 — the table's own arithmetic, used
as a semantic check rather than trusting OCR. Rows that could not be confirmed are absent, and an absent item
says so rather than defaulting to a factor of 1.0.

Rebuild or extend the table with `npm run yields:geometry -- --from 20 --to 60`.

## Storage and security

* **Writes are proportional to the change.** Collections are stored separately, and the three that grow
  without bound — observations, food logs, sessions — are sharded by month. A weigh-in writes one month of
  observations and a 1.2 KB metadata blob, not the whole record. A full checkpoint every 25 saves keeps
  recovery independent of the shard layout. At ten years of daily use an incremental save is 38 ms against
  217 ms for a whole-record write.
* **A Content Security Policy pins the script by SHA-256 hash**, with `default-src 'none'`, `connect-src
  'self'`, and object, base, form and framing all denied. The build verifies the hash matches what shipped.
  `style-src` still needs `'unsafe-inline'` because the interface uses `style=""` attributes.
* **Backups can be encrypted** with AES-GCM-256 and a PBKDF2-SHA256 key at 310,000 iterations. There is no
  passphrase recovery, and the app says so before exporting. Plaintext JSON remains the default for
  portability.
* **Errors are classified P0–P3.** A failed write is not filed with a failed chart, and a P0 is escalated
  rather than counted.
* **An integrity check runs on boot.** A P0 suspends saving until you have exported — writing a damaged
  record back over the durable copy would turn a detectable problem into a permanent one.
* **An append-only audit chain** records what happened to the record, hash-linked so tampering is detectable.
  Where SHA-256 is unavailable it degrades to a weaker digest and says so.
* **Storage is inspectable**, including the origin quota and a control to delete the cached food database —
  redownloadable public data, never anything you logged.

## Your training plan is yours

Exercises, sets, reps, and which days you train are all editable, and a plan can be adapted to the equipment
you actually have — home, hotel, barbell only, full gym. Substitutions come from the exercise ontology, and
anything with no available substitute is **named rather than silently dropped**: a plan quietly missing its
only pulling movement is worse than one that admits it could not find a replacement.

Edits create your own copy; the built-in stays underneath, so "reset to the original" always works. Changes
are dated events, so a replay of last month shows the plan as it stood then, and sessions you already logged
are never rewritten.

## What the record has learned

* **Scenarios** compare whole plans, ranked by expected outcome after discounting for how likely you are to
  execute each one.
* **Forecasts** are distributions, not point estimates, sampled from your own rate uncertainty and scale
  noise — and deterministic, so they do not change when you reopen the app.
* **N-of-1 inference** measures a change against the projected pre-change trend, with a washout, and
  discounts for autocorrelation. Daily weight is not independent day to day.
* **Experiment design** derives duration from your own measurement noise and refuses to design one that
  cannot detect its own effect.
* **Episodes** separate what you planned (a cut) from what happened to you (travel, illness, a plateau).
* **Personal knowledge** states what has been established, in which context, whether it transfers, and decays
  with a 270-day half-life — plus the questions the record cannot yet answer.

## Bringing outside data in

File imports for Apple Health exports and generic CSV. No wearable API is called, because that needs platform
credentials. What is implemented is the part that decides whether external data is safe to accept: one
canonical schema, deduplication, trust-weighted reconciliation when sources disagree, and provenance that
survives — an imported value never becomes indistinguishable from one you measured. Every import is previewed
before anything is written.

See `docs/architecture-roadmap.md` for what was deliberately deferred and what cannot be built without a
backend or a device.

## Data discipline

* Observations are append-only. Corrections supersede; deletions retract. Nothing is rewritten.
* Every number shows its class (MEASURED · DERIVED · HEURISTIC · PRIOR · EMPIRICAL · CALIBRATED · PREDICTIVE),
  its source and its age. Lavender means modelled or predicted.
* Predictions are written to the ledger before outcomes exist and scored when due. Forecast accuracy and
  bias are reported, including when intervals turn out too narrow.
* Replay (Archive) reconstructs what the system knew on any past day; nothing after that day leaks in.
* Demo data is generated deterministically and marked `demo` everywhere. It never mixes with your record.
* Effective dates and knowledge dates are separate. Replay shows only what had actually been recorded by that
  day, including phase targets as they stood then — a replay cannot mark its own homework.
* Uncertainty is carried through, not stated once. Intake coverage widens the maintenance interval, which
  widens the energy-balance interval; when that interval exceeds the energy gap itself, the decision says so
  and its confidence is capped.
* Effect sizes come from your own record where they exist. Until an experiment has run, the app says a number
  is a population prior rather than presenting it as your response.
* A record that cannot be migrated is quarantined with its raw copy preserved, never silently reset.
* **The profile is temporal too.** Height, age and sex feed BMR, which feeds maintenance, the calorie target
  and the decision. A height corrected in March would otherwise rewrite what February was computed from, so
  during a replay the profile is projected from the event log rather than read from the current record.
* **Nothing is destroyed and nothing is rewritten.** A correction supersedes; a deletion retracts; an edited
  food entry is superseded by a new one. Every suppression carries the date it became known, so a replay of
  last month sees what the system actually knew then — not what it believes now. Deleting an entry today does
  not change a decision made before the deletion.
* Phase targets and the training program change through one primitive each, so every change records its
  history and generates exactly one intervention, stamped with the value from before the change.

## Known limitations

* NIH DSLD (supplement labels) and USDA FNDDS 2021–2023 (survey foods/portions) adapters are installed but
  their data is not shipped in this distribution; build the shards with `scripts/fndds-build.mjs` and
  `scripts/dsld-build.mjs` (see `docs/data-adapters.md`). Until then, supplement guidance comes from the NIH ODS
  fact sheet and your own entries, and household portions come from Foundation Foods and product labels.
* Branded products labelled by volume (USDA serving unit mL) carry nutrients per 100 mL and are logged in mL, fl oz
  or servings; the app never converts them to grams without a density.
* Body-fat estimates from circumferences are population heuristics (±3–4%). Composition is never a measurement
  here, and fat and lean masses are only split out when a measured body-fat reading from the last 60 days
  anchors them — multiplying an estimated percentage by weight would present two estimates as one measurement.
* Fat-vs-other change is reported qualitatively (fat-loss-compatible, composition unresolved,
  recomposition-compatible). A numeric split requires two body-fat measurements by the same method at least
  21 days apart.
* **AH-102 yields ship, partially.** 537 factors drawn from 33 distinct pages spanning 20–70 of 131, each confirmed by checking that its
  yield and loss percentages sum to about 100 — a check now enforced as a build gate. Five rows passed the
  original cross-check but failed that arithmetic and were dropped rather than repaired, because deciding
  which of the two numbers to believe needs the source images. Pages 73–131 were extracted and excluded: the item-number
  column is misread there, and a yield attributed to the wrong food is worse than a missing one. An item that
  is not in the table reports that it could not be verified — explicitly not the same as a yield of 1.0.
  Descriptions come from OCR and are often partial, so search returns candidates rather than picking one.
* USDA nutrient retention factors are still not shipped. `scripts/reference-build.mjs` takes a transcribed
  CSV; with no table installed the app passes values through unchanged and says so.
* Two evidence entries remain unverified against a primary source and are marked as such in the app: the 2025
  resistance-training-during-deficit meta-analysis and an attributed ACSM 2024 physical-activity consensus
  statement.
* Everything in `docs/ios-device-test.md` needs a physical device. jsdom has no layout engine, no real
  viewport, no service worker and no Safari storage behaviour.
* The outcome adjustment of the energy model (from scored 14-day forecasts) is a heuristic, clamped to ±300 kcal.
* Service worker, install flow and wake lock were validated for logic, not on physical iOS/Android devices.
* Entries in the evidence registry flagged *verify before citing* were summarised from the source framework, not re-checked against the papers.
