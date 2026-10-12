# Deployment footprint

Measured by `node scripts/deploy-footprint.mjs` (catalogue doc 1, W-033) on build e82ecf3367, 2026-10-12. Generated: do not edit by hand.

What is measured here is the artifact the host serves and what a browser transfers from a server that applies `vercel.json`. What only the platform knows is not: its stored size for the deployment, the compression level its edge uses, cold starts and region. Those need the owner’s account (`vercel inspect <deployment-url>`).

## What is deployed

The host runs `npm run build` and serves `dist`: 1145 files, 97.8 MB raw, 24.0 MB with brotli, 26.5 MB with gzip.

| Part | Files | Raw | Brotli | Gzip |
|---|---|---|---|---|
| food corpus | 1109 | 93.3 MB | 22.4 MB | 24.8 MB |
| app shell | 17 | 3.83 MB | 1.35 MB | 1.47 MB |
| documents | 16 | 0.52 MB | 0.19 MB | 0.20 MB |
| reference data | 3 | 0.21 MB | 0.03 MB | 0.03 MB |

Largest files: `/index.html` 3.80 MB (1.33 MB brotli), `/data/food/branded/recs-046.json` 0.80 MB (0.18 MB brotli), `/data/food/branded/recs-047.json` 0.74 MB (0.17 MB brotli), `/data/food/branded/recs-058.json` 0.71 MB (0.16 MB brotli), `/data/food/branded/recs-081.json` 0.70 MB (0.16 MB brotli), `/data/food/branded/recs-062.json` 0.70 MB (0.13 MB brotli), `/data/food/branded/recs-056.json` 0.70 MB (0.15 MB brotli), `/data/food/branded/recs-057.json` 0.69 MB (0.15 MB brotli).

## Build

`node build.mjs` took 2.7 s here with the food corpus already present. On the host, `prebuild` first fetches the corpus (`scripts/food-fetch.mjs --if-missing`), whose time depends on the host’s network.

## Caching

| Path | Cache-Control |
|---|---|
| `/index.html` | no-cache |
| `/sw.js` | no-cache |
| `/version.json` | no-cache |
| `/data/food/manifest.json` | no-cache |
| `/data/food/foundation.json` | public, max-age=86400, must-revalidate |
| `/icons/icon.svg` | (platform default) |

No path is given two different Cache-Control values by `vercel.json`.

## What a browser transfers

| Visit | Requests | Bytes | Food shards | Time to ready |
|---|---|---|---|---|
| First visit (app ready, service worker installed) | 15 | 1.42 MB | 0 | 1.4 s |
| First food search ("chicken breast") | 3 | 0.28 MB | 3 | |
| Return visit (same browser) | 2 | 0.0 KB | | 1.2 s |

Compression assumed: brotli quality 5 (gzip level 6 for clients without brotli). Times are on a local connection and show the app’s own work, not a network’s.

The food corpus is 93.3 MB of the deployment and none of it is sent on a first visit: a search fetches only the shards it needs, and the service worker keeps them.

## Budgets the deploy gate holds

First visit at most 1.53 MB, a first food search at most 0.95 MB, a return visit at most 58.6 KB; no food shard on a first visit; no path with two Cache-Control values.
