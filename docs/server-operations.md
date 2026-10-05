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

## Production mode, off-host backups and health

Set `PHYSIQUE_PRODUCTION=1` for a production server. It then refuses to start unless:

* the data folder is on a persistent disk, declared with `PHYSIQUE_PERSISTENT_DATA=1`, and not inside the system's temp folder;
* off-host backups are configured (below);
* `ADMIN_TOKEN` and `METRICS_TOKEN`, when set, are at least 32 characters.

Backups go to any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO): `BACKUP_S3_ENDPOINT`,
`BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`. A backup is taken a minute after
start and then every `BACKUP_INTERVAL_HOURS` (default 24); each one is read back and its checksum and contents verified
before it counts, recorded in `last-backup.json`, and `BACKUP_KEEP` (default 14) are kept. Requests are signed with
AWS Signature V4 (no SDK; checked against AWS's published test vector).

Restore into an empty data folder: `node server/server.mjs --restore-from-s3 latest` (or a key; `--force` to overwrite).

`GET /v1/health` reports `status: ok` or `degraded` with reasons (the last backup failed, no verified backup within twice
the interval, storage not persistent, disk low), so an uptime monitor pointed at it alerts on them. Every response
carries an `x-request-id` (a caller's own is kept if it is safe), logged with any error; `/v1/metrics` adds errors by
route, the last 20 failures with their request ids, and the backup state.

Tested against a mock bucket that checks the signature's form and the payload hash (tests/server-ops.mjs), not yet
against a real provider.

## AI assistant (optional)

The app can only talk to its own server (its content-security policy allows nothing else), so model calls go through
`POST /v1/ai/complete`, which requires an unlocked vault and is rate-limited (`AI_RATE_PER_MINUTE`, default 20). The key
never reaches a device. Configure:

* `AI_PROVIDER`: `anthropic`, `openai` or `gemini`
* `AI_MODEL`: for example `claude-sonnet-5-5`; for OpenAI and Gemini, the model name from their documentation
* `AI_API_KEY`: the provider key (not needed for a local server)
* `AI_BASE_URL`: optional; for a local or self-hosted OpenAI-compatible server (Ollama: `http://localhost:11434`,
  LM Studio, a gateway) use `AI_PROVIDER=openai` with this. `AI_TOKEN_FIELD` overrides the token-limit field name.
* `AI_TIMEOUT_MS`: default 60000

Nothing is sent until a person turns the assistant on in Tools and accepts what it sends: what they type, plus what the
model asks to read through read-only tools (parts of their current state, why the plan is what it is, adaptations on
offer, cited evidence, food and exercise search results). Never their full history, photos or notes. The model cannot
change the record; everything it suggests waits for the person to confirm. The server logs each call's size and timing,
never its content. Tested against mock providers that check each protocol (tests/ai-proxy.mjs), not yet a real one.
