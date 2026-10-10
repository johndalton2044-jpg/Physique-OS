# Release environment

The one environment a release is made and checked in. CI (`.github/workflows/ci.yml`) is this environment, and the deploy
gate checks the parts of it that can be checked from the repository (see "What is enforced").

## Two builds

| Build | Needs | What it is for |
|---|---|---|
| Development | the repository alone: `PHYSIQUE_DEV_BUILD=1 node build.mjs` | working on the code; `version.json` marks it as a development build and it has no branded food search |
| Production | the repository and the pinned food corpus: `node build.mjs` | every release; the build refuses to run without the corpus rather than shipping a distribution without it |

## The environment

| Part | Value | Where it is pinned |
|---|---|---|
| Runtime | Node 22.23.3 (the promise is `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`, the range every locked dependency accepts) | `.nvmrc`, `package.json` engines |
| Package manager | npm 10, installing with `npm ci` (never `npm install`) | `package-lock.json` |
| Browser | Chromium build 1243, the one playwright-core 1.63.0 drives (`npx playwright-core install --with-deps chromium`; the latest `playwright` CLI installs a different build). The gates use it first, after an explicit `CHROME_PATH`; where it is not installed they fall back to a system Chrome, Chromium or Edge, then Playwright's cache, and print which they used; jsdom 30.1.0 for the DOM gates | `package-lock.json` |
| Operating system | Linux x64 (CI: `ubuntu-latest`). The gates also find Chrome, Chromium or Edge on macOS and Windows, but releases are made on Linux | `.github/workflows/ci.yml` |
| Food corpus | USDA FoodData Central `fdc-2026-04-30`: 1,107 files, 97.8 MB unpacked; archive `physique-os-food-data.tar.gz`, 26.1 MB | `data/food.lock.json` |
| Reproducible time | `SOURCE_DATE_EPOCH` (CI: the commit's time; the clean room: 1790000000) | `.github/workflows/ci.yml`, `scripts/clean-room.mjs` |
| Gates | 36, in the order and under the runtime ceilings in `tests/gates.mjs` | `tests/gates.mjs` |

## The food corpus

- **Identity.** Content is the authority. `sumsSha256` (`8ab856bd…cb2c`) pins the per-file checksum list, and the build
  checks every file against it. The archive checksum (`32dfd0bc…c566`) pins the reproducible archive made by
  `scripts/package.mjs`; earlier archives of identical content stay accepted (`acceptedArchives`).
- **Acquisition.** `node scripts/food-fetch.mjs --url <archive path or URL>`, or set `FOOD_DATA_URL` (CI reads it from the
  repository secret of that name). With `--if-missing` it does nothing when the corpus is already present.
- **Failure behaviour.** A download that fails, an archive whose checksum the lock does not accept, a path outside the
  folder, or a checksum list that does not match the lock each stop the fetch with an error, and the production build
  then refuses to run. Nothing falls back to an unverified corpus.

## Environment variables

| Variable | Used by | Effect |
|---|---|---|
| `FOOD_DATA_URL` | `scripts/food-fetch.mjs`, CI | where the food archive comes from |
| `PHYSIQUE_FOOD_ARCHIVE` | the `reproducible` gate | the archive the clean room fetches (falls back to `FOOD_DATA_URL`, then to the corpus the commit carries in `data/food`) |
| `SOURCE_DATE_EPOCH` | `build.mjs` | fixes the time written into the build, so two builds of one commit are byte-identical |
| `PHYSIQUE_DEV_BUILD` | `build.mjs` | `1` builds without the food corpus, marked as a development build |
| `PHYSIQUE_SKIP_BROWSER` | the browser gates | `1` skips them, and the gate recorder then records each as failed: a skipped gate is a failed gate |
| `CHROME_PATH`, `PLAYWRIGHT_BROWSERS_PATH` | `tests/_browser-path.mjs` | where the browser gates look for a browser |

The sync server's variables (`ADMIN_TOKEN`, `METRICS_TOKEN`, provider credentials and the rest) are in
`docs/server-operations.md`; no gate needs a real value for them.

## External-test mode

Every gate that touches an outside service (AI providers, wearable connections, weather, S3 backups) runs against a
protocol-checking local mock, or replays a recorded provider response. A recording carries the time it was recorded
(`__retrievedAt`), the server reports that time, and the gate runs the browser at it: a recording replayed as if
retrieved today ages, and the weather checks failed on 2026-10-10, the day after the recording's last forecast day. No release gate reaches a real provider, so a release says nothing about real accounts:
that is TRANSITION item 11, and it waits for credentials.

## The clean-room release

`scripts/clean-room.mjs` (the `reproducible` gate) exports the exact commit with `git archive HEAD` into an empty folder,
installs from the lock, fetches the corpus from its archive (or, given none, uses the corpus the commit itself carries in
`data/food`; the build checks every file against the lock either way), builds it and this tree with the same `SOURCE_DATE_EPOCH`,
and compares every distributed file byte for byte. It records the commit and the runtime it ran on. A difference caused
by uncommitted changes is named as such, because a release is of a commit. `--worktree` checks uncommitted work instead,
and is not release evidence.

## What is enforced

The deploy gate fails when:
- `package.json` promises a Node that any locked dependency rejects;
- `.nvmrc` is missing, not one exact version, or outside the promise;
- the gate itself runs on a Node outside the promise;
- the CI workflow is missing from the repository root, or a misplaced copy is left in `data/.github`;
- CI does not install the `.nvmrc` Node and the locked dependencies, run every gate and the release check, and keep the
  release evidence;
- the release check does not read the gate list in `tests/gates.mjs`, or a gate in it is not a script.

The gate recorder fails a gate that runs past its ceiling, and records how long each gate took.
