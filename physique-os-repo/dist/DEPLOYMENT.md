# Deploying Physique OS

This folder is a **static site**. Weather, online food lookups (Open Food Facts) and cloud sync need a separate
**Physique OS server** (`server/server.mjs` in the repository), reached from the app at **`/api/sync`**.

Copying `server.mjs` into this folder does **not** run it: a static host serves it as a file.

## 1. Run the server on a Node host
It needs a long-running Node process, persistent storage and HTTPS (for example Render, Fly.io, Railway, or your own VM).

    HOST=0.0.0.0
    PORT=<the port your host gives you>
    DATA_DIR=<a persistent volume>
    TRUST_PROXY=1                          # behind Vercel: rate limits apply per person, not to Vercel as a whole
    PHYSIQUE_CONTACT=you@example.org       # identifies the app to Open Food Facts
    METEOSOURCE_API_KEY=<optional secret>  # only for the Meteosource provider; never put it in the app

    node server/server.mjs

Check it: `https://YOUR-SERVER/v1/health` should answer `{"ok":true,"service":"physique-os-sync",...}`.

## 2. Forward /api/sync to it
Deploying the repository (recommended): run `node scripts/configure-deploy.mjs --sync-origin https://YOUR-SERVER`,
commit `vercel.json`, and set `SYNC_DEPLOYMENT_MODE=reverse-proxy` in Vercel so a missing rewrite fails the build.

Deploying this folder on its own: copy `vercel.json.template` to `vercel.json` and replace the placeholder with your
server's https origin. Never use localhost or 127.0.0.1 — on Vercel those mean Vercel itself.

## 3. Check it
`https://YOUR-APP/api/sync/v1/health` must return the same JSON as above (a web page means the rewrite is missing).
In the app: Tools → External server → Test external server names the layer that fails.
