# Physique OS — working rules for Claude Code

Read `docs/handoff/TRANSITION.md` before starting work: it holds the current state, the backlog and the order of work.
This file holds the rules that apply to every change.

## What this is

An offline-first personal training and nutrition system: one HTML page built from `src/*.js` (concatenated in file-name
order into one script; every top-level function is a global), an optional sync server (`server/server.mjs`), and a
release discipline of 37 gates (the list is `tests/gates.mjs`). Node 22.23.3 (`.nvmrc`; `package.json` promises only the range every locked dependency
accepts). No framework, no bundler.

## Commands

```
npm ci                                          # dependencies from the lock
npx playwright-core install --with-deps chromium   # the browser build the locked playwright-core drives
node scripts/food-fetch.mjs --if-missing        # food corpus (needs data/food or FOOD_DATA_URL)
node build.mjs                                  # build dist/ (fails without the food corpus)
PHYSIQUE_DEV_BUILD=1 node build.mjs             # development build without the corpus (marked in version.json)
node tests/<gate>.mjs                           # one gate directly
node tests/gate-record.mjs <gate>               # one gate, recorded against the current build
node tests/gate-record.mjs --all                # every release gate in order (needs PHYSIQUE_FOOD_ARCHIVE; commit first)
node tests/release.mjs --from-results           # the release check (refuses a missing, failed or skipped gate)
```

Fast loop after a change: `node build.mjs`, then `node tests/authority.mjs`, `node tests/layers.mjs`,
`node tests/maturity.mjs`, `node tests/dictionary.mjs`, `node tests/engine-check.mjs`, then the gates the change touches.
Before a release: every gate, recorded (the list, order and runtime ceilings are in `tests/gates.mjs`; the procedure is in
`docs/handoff/TRANSITION.md`).

## Rules (each is enforced by a gate; the gate names are in brackets)

1. **No second registry, event system, decision engine, uncertainty system, provenance system or dependency graph.**
   Extend what exists. (§213 of the reconstruction document)
2. **Every persisted store has an entity contract** in `src/23-entity-contracts.js`, and is written only by its declared
   owners. A new store or writer means updating the contract. [authority]
3. **The plan changes only through `changePlan({kind, source, reason, expected, apply})`.** An adaptive change
   (decision, adaptation, optimiser, experiment) must state its expected outcome. [authority]
4. **Engine files never call interface functions** except through a `typeof`-guarded hook. Layers are declared in
   `docs/layers.json` (file numbers record history, not layering). `docs/layer-baseline.json` is empty and stays empty.
   [layers]
5. **Every event has an owning contract; every persisted field is in `docs/data-dictionary.json`.** After adding a field,
   event, store, model or observation type: `node tests/dictionary.mjs --write`. Removing or renaming an id needs an
   entry in `docs/ontology-migrations.json`. [dictionary]
6. **Every model** pushed to `MODELS` declares `cls` from `CLASSES` (40-models.js; use `EMPIRICAL` for fitted personal
   models), inputs that resolve (observation types, other model ids, profile fields), assumptions, failure conditions,
   uncertainty and at least one real consumer. [engine: data and model contracts]
7. **Every observation type** in `OBS_TYPES` (20-schema-storage.js) has unit, group, consumers that resolve (model ids)
   and a semantic type (`TYPE_ALIASES` in 84-presentation.js) unless it is text. [engine, dictionary]
8. **No claim beyond its evidence.** `docs/capabilities.json` rates each capability on eight axes; the README table is
   generated from it (`node tests/maturity.mjs --write`). Prospective validation, real-world evidence, data at scale and
   production operations cannot be claimed yet. [maturity]
9. **The AI layer (`src/97-ai.js`) changes nothing itself**: no owner, plan mutator, dispatch or save; its results are
   proposals the person confirms. [authority]
10. **A personal model starts from a population prior and reports its personal weight**; it says when the person's data
    only hint, and states its limits with every result.
11. **Interface:** every panel needs a detail classification (`PANEL_DETAIL` list in `src/94-navigation.js`); an action
    that takes an argument must be listed in `REQUIRES_SUBJECT` there; new UI goes in an interface-layer file.
12. **Tests compute their expectations independently** (from constants and arithmetic in the test, never by calling the
    function under test). Black-box workflows (`tests/blackbox.mjs`) act only through the screen and wait for conditions,
    never for fixed times. A test that cannot fail proves nothing: when adding a check, make it fail once on purpose.
13. **A skipped gate is a failed gate.** Never record a release with a gate skipped.

## Editing conventions

- Self-tests live in `src/95-selftest.js`; add new blocks immediately before the line containing
  `ok('Response is a first-class entity with its own event',`.
- When editing by script, assert that each anchor exists before replacing it; an edit that silently does not apply has
  happened in this project.
- Write real characters in Markdown, never `\u2014`-style escapes.
- Keep `.gitattributes` (LF line endings): build identities hash source bytes.
- Record each change in `docs/architecture-roadmap.md` (newest at the end) and, while it applies, update the status
  tables in `docs/future-architecture-plan.md`.
