# Running the sync server

`server/server.mjs` is a zero-dependency Node service. It exists so that "sync between my devices" does not
require trusting an operator — including you, if you run it for someone else.

```
npm run server                 # 127.0.0.1:8787, data in ./server-data
node server/server.mjs --port 8787 --data /var/lib/physique --host 0.0.0.0
```

Verify it end to end, with two real clients and real encryption:

```
npm run cloud:e2e
```

That test starts a server on a scratch directory, has client A create a vault and upload, asserts the
ciphertext on disk contains no plaintext, has client B join and decrypt, drives concurrent edits from both,
and deletes the vault. It is part of `npm run check`.

---

## What this server can and cannot see

**It cannot read your data.** Events are encrypted client-side with AES-GCM under a key derived from your
recovery phrase, which never leaves your device. The server receives base64.

**It does see metadata**, and pretending otherwise would be dishonest:

| Visible | Not visible |
|---|---|
| that a vault exists, and its id | anything in it |
| how many events it holds | what any event is |
| the size of each event | any weight, meal, session or note |
| when events arrive, and from which device id | who you are |

Event sizes and arrival times leak *something* — a burst of events at 7am most days is a pattern. That is
inherent to any sync service that is not also a mix network, and it is stated here rather than glossed over.

## The threat model, plainly

* **Stolen server / hostile operator.** Gets ciphertext and the metadata above. Cannot decrypt. This is the
  case the design is built for.
* **Stolen recovery phrase.** Gets everything, *if* they can also add a device — and adding one requires
  authorisation from a device already signed in. A phrase alone does not silently join a vault.
* **Stolen unlocked device.** Gets everything. No server-side design helps here; use device-level encryption
  and a screen lock.
* **Lost recovery phrase.** You lose the data. By construction. A server able to recover it would be a server
  able to read it, and the whole point is that it cannot.

There are no passwords, no email addresses, and no password database to leak. Authentication is an ECDSA
signature over a single-use server challenge, so nothing replayable crosses the wire.

## Before it leaves localhost

The server is written carefully — request rate limits, body size caps, single-use challenges, atomic writes,
no dynamic evaluation, and logging structurally incapable of carrying payloads. It is **not** a hardened
public service as written. Running it on the open internet responsibly needs:

1. **TLS**, terminated by a reverse proxy (nginx, Caddy). The server speaks plain HTTP by design; putting
   certificate handling in the same file would make the trust surface harder to audit, which defeats the
   purpose of it being readable in one sitting.
2. **A process supervisor** — systemd, or a container with a restart policy.
3. **Backups of the data directory.** The server holds the only copy of events uploaded from a device that
   has since been lost. It is ciphertext, so backups need no special handling beyond ordinary care.
4. **Disk monitoring.** `MAX_EVENTS_PER_VAULT` caps a single vault; nothing caps the number of vaults.
5. **Real rate limiting at the proxy.** The in-process limiter is per-IP and in-memory: it survives a burst,
   not a distributed flood.
6. **A CORS origin.** Pass `--cors https://your.app.origin` rather than leaving the default `*` if the
   server is public.

```
# nginx
location / {
  proxy_pass http://127.0.0.1:8787;
  proxy_set_header X-Forwarded-For $remote_addr;
  client_max_body_size 4m;
}
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/health` | liveness, vault count, VAPID public key |
| POST | `/v1/vault` | create a vault from a client-derived id |
| POST | `/v1/vault/device` | authorise another device (requires an authenticated device) |
| POST | `/v1/auth/challenge` | request a single-use nonce |
| POST | `/v1/auth/verify` | exchange a signature for a short-lived token |
| POST | `/v1/events` | append encrypted events |
| GET | `/v1/events?since=` | pull events after a sequence number |
| POST | `/v1/push/subscribe` | register a Web Push endpoint |
| POST | `/v1/push/notify` | nudge a vault's other devices |
| POST | `/v1/vault/delete` | erase the vault and everything in it |

## Push

Push is the honest answer to "a browser will not run a closed app's code". It will not — but a push service
will wake it. Pushes from this server are **bodiless**: the push service learns that something is waiting and
nothing else. The service worker shows a fixed notification and the app syncs when opened.

VAPID keys are generated on first start into `<data>/vapid.json`. Keep them: replacing them invalidates every
existing subscription.

## Deleting everything

`POST /v1/vault/delete` with the vault id removes the vault directory immediately and completely. A service
holding health data that cannot be left is not a service, it is a trap.
