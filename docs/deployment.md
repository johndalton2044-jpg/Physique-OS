# Deploying Physique OS

## The short answer

It is a **static site**. Serve the contents of `dist/` over HTTP(S) from any web server. There is no build
step at deploy time, no runtime, no database.

```bash
npm run serve          # http://127.0.0.1:8123 — verified working
```

`127.0.0.1:8787` refusing to connect is the **sync server**, which is separate, optional, and off by default.
Nothing in the app needs it.

---

## What it must be served over

| Method | Works? | Notes |
|---|---|---|
| **HTTPS on a domain** | ✅ full | the intended deployment: service worker, offline, install to home screen |
| **`http://localhost` / `127.0.0.1`** | ✅ full | browsers treat localhost as a secure context, so everything works |
| **`http://` on a LAN IP** (e.g. `192.168.1.5`) | ⚠️ partial | not a secure context: **no service worker, no offline, no encryption, no push** |
| **`file://`** (opening index.html directly) | ❌ degraded | no origin, so **no food database, no offline, no persistent storage** |
| **A file preview / in-app viewer** | ❌ degraded | same as `file://` — this is what the screenshots were showing |

That last row matters. Opening `physique-os-index.html` from a file manager or a chat attachment gives you the
interface and the demo record, but the 455,381-product food database, the yield table and the service worker
all need an origin to fetch from. The app reports this honestly rather than appearing broken: *"unavailable:
food database not reachable in this environment"*.

## Verified working

Serving `dist/` over HTTP and booting against it:

```
200  /                         200  /data/food/manifest.json
200  /index.html               200  /data/food/foundation.json
200  /sw.js                    200  /data/reference/yields.json
200  /manifest.webmanifest
200  /version.json
```

…and from the running app: branded food search returns results, and the 537-factor yield table loads.

## Hosted builds (Vercel, Netlify, Cloudflare Pages)

```
build command:      npm run build
output directory:   dist
install command:    npm install        (jsdom is a devDependency, used only by the tests)
```

`vercel.json` ships with the repository and sets exactly this, plus the cache headers below.

**The build needs nothing but Node.** It has no child processes, no packages imported by `build.mjs`, and no
runtime dependencies — the audit enforces all three. It previously shelled out to `python3` with Pillow to
draw the icons, which works on a developer machine and fails on an image that ships Node and nothing else;
that is now a dependency-free PNG encoder in `scripts/icons.mjs`.

If a hosted build fails, check first that the **output directory is `dist`** and that no SPA rewrite is
sending `/data/*` to `index.html`.

## Host it anywhere static

Any of these work with no configuration beyond serving the directory:

* nginx, Apache, Caddy
* GitHub Pages, Netlify, Vercel, Cloudflare Pages
* S3 + CloudFront, Azure Static Web Apps
* `npx serve dist`, `python3 -m http.server`

Two things to get right:

1. **Serve `dist/` as the web root**, or the whole directory at a sub-path. Paths inside are relative, so a
   sub-path works — but keep `index.html`, `sw.js`, `manifest.webmanifest` and `data/` together.
2. **Do not rewrite everything to `index.html`.** It is not a single-page app router; `/data/...` must return
   the real files. If your host has an SPA fallback, exclude `/data/`.

Recommended headers (none are required):

```nginx
location /data/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
location = /sw.js { add_header Cache-Control "no-cache"; }
location = /index.html { add_header Cache-Control "no-cache"; }
```

The data shards are content-addressed by the release, so caching them hard is safe; `index.html` and `sw.js`
should not be cached hard or an update will not be picked up.

## Size

`dist/` is about 98 MB, almost all of it the food database under `data/food/`. If that is too much for your
host, deleting `data/food/` leaves a working app — food search then reports itself unavailable rather than
failing, and everything else is unaffected.

## iOS

Open the HTTPS URL in Safari → Share → **Add to Home Screen**. That gives standalone mode, offline via the
service worker, and the safe-area handling. Adding from a `file://` preview does not work.

The twelve device checks that cannot be verified without hardware are in `docs/ios-device-test.md` and in the
app under Tools.

## The sync server, if you want it

Entirely optional. Without it the app is fully functional and entirely local.

```bash
node server/server.mjs --port 8787 --data ./server-data
```

Then reverse-proxy it onto the **same origin** as the app, because the client ships with
`connect-src 'self'` — it is not permitted to talk to any other host, which is what stops it posting your
record anywhere:

```nginx
location /api/sync/ { proxy_pass http://127.0.0.1:8787/; }
```

The client's default endpoint is already `/api/sync`. A separate origin requires building with
`node build.mjs --sync-origin https://sync.example.com`, which widens the policy for that host and nothing
else. See `docs/server-operations.md` for the threat model and what public deployment requires.

`server/server.mjs` ships in `physique-os-repo.tar.gz`, **not** in the client distribution.
