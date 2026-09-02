PHYSIQUE OS 1.0.0

An offline-first, single-file adaptive body-composition operating system. It separates what was measured from what was derived, assumed, estimated or predicted; it changes one variable at a time with a prediction stamped before the outcome; and it keeps what did not work.

Not medical advice. It interprets a training and nutrition record; it does not diagnose disease.

Run it
Simplest: open index.html. Everything works: logging, models, decisions, experiments, replay, exports, the inline Foundation food database. Branded-product search and the service worker need a server (browsers block fetch of local files and service workers under file://).
Full: serve this folder over http(s) — python3 -m http.server 8080 — open http://localhost:8080/, then Add to Home Screen / Install. The service worker caches the shell; branded food shards are cached as they are used, or all at once from Tools → Food database → Download all shards.
iOS: Safari → Share → Add to Home Screen. Storage is IndexedDB (authoritative) mirrored to localStorage; export a JSON backup regularly (Tools → Data). Safari can evict unused site data after seven days of non-use — a backup is the only durable copy you control.
What is in the folder
path	purpose
index.html	the whole application (540 KB, no external dependencies, no eval)
sw.js	service worker: versioned cache, precached shell, cache-first data shards, network-first HTML
manifest.webmanifest, icons/	PWA metadata and generated icons
data/food/	USDA FoodData Central Branded Foods (release 2026-04-30, CC0): 455,381 products in 114 record shards, 892 search-index shards, 100 barcode shards, manifest.json, SHA256SUMS (93 MB, lazy-loaded)
data/reference/compendium-2024.json	2024 Adult Compendium of Physical Activities, all 1,111 activities
version.json, BUILD-MANIFEST.json, SHA256SUMS	build identity and checksums

Foundation Foods (354 foods with analytical nutrients and portions) are embedded in index.html.

Keyboard

⌘/Ctrl K command palette and global search · ⌘/Ctrl Z undo · / search · L quick log · Esc close · 1–9 views.

Data discipline
Observations are append-only. Corrections supersede; deletions retract. Nothing is rewritten.
Every number shows its class (MEASURED · DERIVED · HEURISTIC · PRIOR · EMPIRICAL · CALIBRATED · PREDICTIVE), its source and its age. Lavender means modelled or predicted.
Predictions are written to the ledger before outcomes exist and scored when due. Forecast accuracy and bias are reported, including when intervals turn out too narrow.
Replay (Archive) reconstructs what the system knew on any past day; nothing after that day leaks in.
Demo data is generated deterministically and marked demo everywhere. It never mixes with your record.
Known limitations
NIH DSLD (supplement labels) and USDA FNDDS (survey foods/portions) adapters are declared but not installed; supplement guidance comes from the NIH ODS fact sheet and your own entries.
Body-fat estimates from circumferences are population heuristics (±3–4%). Composition is never a measurement here.
The outcome adjustment of the energy model (from scored 14-day forecasts) is a heuristic, clamped to ±300 kcal.
Service worker, install flow and wake lock were validated for logic, not on physical iOS/Android devices.
Entries in the evidence registry flagged verify before citing were summarised from the source framework, not re-checked against the papers.
