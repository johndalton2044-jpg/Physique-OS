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

Connected services (optional; each needs a developer account with the provider):

    CONNECT_TOKEN_KEY=<64 hex characters>   # encrypts stored sign-ins; without it connections are off
    PHYSIQUE_PUBLIC_URL=https://YOUR-APP    # the provider sends people back to /api/sync/v1/ext/connect/callback
    FITBIT_CLIENT_ID=... FITBIT_CLIENT_SECRET=...
    WITHINGS_CLIENT_ID=... WITHINGS_CLIENT_SECRET=...
    OURA_CLIENT_ID=... OURA_CLIENT_SECRET=...
    STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=...   # strava.com/settings/api; set the Authorization Callback Domain to YOUR-APP's host
    STRAVA_VERIFY_TOKEN=<any random string>        # for Strava's webhook handshake
    STRAVA_SUBSCRIPTION_ID=<id returned when you subscribe, below>

Strava webhooks (optional, for new workouts without pressing Sync) — subscribe once:

    curl -X POST https://www.strava.com/api/v3/push_subscriptions \
      -F client_id=$STRAVA_CLIENT_ID -F client_secret=$STRAVA_CLIENT_SECRET \
      -F callback_url=https://YOUR-APP/api/sync/v1/ext/webhook?provider=strava -F verify_token=$STRAVA_VERIFY_TOKEN

and set STRAVA_SUBSCRIPTION_ID to the id it returns. Events for any other subscription are refused.
    FITBIT_SUBSCRIBER_VERIFY=...            # optional: Fitbit webhook verification code

Register `https://YOUR-APP/api/sync/v1/ext/connect/callback` as the redirect URI with each provider.

Check it: `https://YOUR-SERVER/v1/health` should answer `{"ok":true,"service":"physique-os-sync",...}`.

## 2. Forward /api/sync to it
Deploying the repository (recommended): run `node scripts/configure-deploy.mjs --sync-origin https://YOUR-SERVER`,
commit `vercel.json`, and set `SYNC_DEPLOYMENT_MODE=reverse-proxy` in Vercel so a missing rewrite fails the build.

Deploying this folder on its own: copy `vercel.json.template` to `vercel.json` and replace the placeholder with your
server's https origin. Never use localhost or 127.0.0.1 — on Vercel those mean Vercel itself.

## 3. Check it
`https://YOUR-APP/api/sync/v1/health` must return the same JSON as above (a web page means the rewrite is missing).
In the app: Tools → External server → Test external server names the layer that fails.
