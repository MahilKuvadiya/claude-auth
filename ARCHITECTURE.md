# Architecture

This document explains how `claudex` works under the hood — the storage model it builds on, the design decisions that make it safe, and the data flow of each command.

## 1. The problem: a login is two things, not one

Claude Code persists a single login across **two** separate locations on macOS:

```
┌─────────────────────────────────────────────────────────────────┐
│  macOS login Keychain                                             │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ service: "Claude Code-credentials"   account: <macOS user>   │ │
│  │ password (a JSON blob):                                       │ │
│  │   {                                                           │ │
│  │     "claudeAiOauth": {                                        │ │
│  │       "accessToken":  "sk-ant-...",   ← short-lived, rotates  │ │
│  │       "refreshToken": "sk-ant-...",   ← mints new access toks │ │
│  │       "expiresAt": 1782325736544,                             │ │
│  │       "subscriptionType": "team", ...                         │ │
│  │     },                                                        │ │
│  │     "mcpOAuth": { ... }               ← MCP server tokens     │ │
│  │   }                                                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  ~/.claude.json   (plaintext config, ~75 keys)                   │
│    "oauthAccount": {                                              │
│       "emailAddress":     "you@company.com",                     │
│       "organizationName": "Acme",                                │
│       "accountUuid":      "….",      ← stable identity key       │
│       ...                                                         │
│    },                                                             │
│    "userID": "eacb38…"                                            │
└─────────────────────────────────────────────────────────────────┘
```

**Key consequence:** swapping only the Keychain token leaves `~/.claude.json` pointing at the previous account. The app then shows the wrong email/org and may behave inconsistently. A correct switch must replace **both** pieces together.

## 2. Storage model

`claudex` keeps secrets where Claude Code already keeps them — the Keychain — and keeps only non-secret metadata on disk.

```
                         claudex's storage
┌───────────────────────────────────────────────────────────────────┐
│ macOS Keychain                                                      │
│                                                                     │
│   service "Claude Code-credentials"   ← the LIVE slot (Claude reads)│
│       └── <one blob — whichever account is active>                  │
│                                                                     │
│   service "claude-auth-store"         ← our per-account BACKUPS     │
│       ├── account "personal"  → full credential blob               │
│       ├── account "work"      → full credential blob               │
│       └── account "client"    → full credential blob               │
└───────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│ ~/.claude-accounts/accounts.json   (chmod 600 — NON-SECRET only)    │
│   {                                                                 │
│     "accounts": {                                                   │
│       "personal": {                                                 │
│         "email": "...", "organizationName": "...",                  │
│         "accountUuid": "...", "userID": "...",                      │
│         "subscriptionType": "...", "expiresAt": ...,                │
│         "oauthAccount": { ...full identity, restored on switch... },│
│         "addedAt": ..., "updatedAt": ...                            │
│       }, ...                                                        │
│     }                                                               │
│   }                                                                 │
└───────────────────────────────────────────────────────────────────┘
```

Why split it this way:

- **Secrets → Keychain.** Storing tokens in a plaintext file would be strictly *less* secure than where Claude Code already puts them. Backups live in the Keychain too, just under a different `service` name so they never collide with the live slot.
- **Metadata → JSON index.** Email, org, expiry, and the identity object are not secret. They drive the `list` output and let `switch` restore `~/.claude.json` without touching the Keychain blob for display purposes.

## 3. Three design decisions that matter

### 3.1 Never delete the live item — update it in place

```python
security add-generic-password -U  -s "Claude Code-credentials" -a <user> -w <blob>
```

The `-U` flag updates an existing Keychain item's data while keeping the item itself — crucially, its **ACL** (access-control list). The ACL records which apps may read the item without a user prompt; the `claude` binary is already trusted on the live item.

If we deleted and recreated the item instead, that trust would be lost and macOS would pop *"claude wants to use your confidential information…"* on every launch. Updating in place avoids this entirely. **The live item is therefore never deleted by `claudex`** — only ever updated.

### 3.2 Auto-sync the outgoing account before switching away

Access tokens rotate, and MCP servers accumulate their own tokens over time. If `switch` blindly overwrote the live slot, the backup of the account you're *leaving* would slowly drift out of date.

So `switch` (and `login`) first re-snapshot the current account into its backup — *if* it matches a known profile — before writing the new one. Pass `--no-save` to skip. The result: your backups stay current automatically, with no manual `add` re-runs.

### 3.3 Atomic write of `~/.claude.json`

`~/.claude.json` is large (~228 KB, ~75 keys) and owned by Claude Code. We only mutate `oauthAccount` and `userID`, then write via a temp file + `os.replace()`, which is atomic on the same filesystem. An interrupted switch can never leave a half-written, corrupt config.

## 4. Active-account detection

"Which profile is active?" is answered by matching the **stable** `accountUuid` — not the access token, which rotates:

```python
live_uuid = json.load(open("~/.claude.json"))["oauthAccount"]["accountUuid"]
active    = next(name for name, p in index if p["accountUuid"] == live_uuid)
```

This is why `list` can reliably show the `*` marker and why `switch` knows which outgoing account to refresh.

## 5. Command data flow

### `add [name]`
```
read live Keychain blob ─┐
read ~/.claude.json id  ─┴─► write blob → claude-auth-store/<name>
                              write metadata → accounts.json
```

### `switch <name>`
```
(if current matches a profile) snapshot current → its backup     [3.2]
read claude-auth-store/<name> ──► write into LIVE slot (-U)       [3.1]
read profile.oauthAccount     ──► overwrite ~/.claude.json (atomic) [3.3]
```

### `login [name]`
```
snapshot current account (preserve it)                           [3.2]
exec `claude auth login [--email/--console/--sso]`  (browser OAuth)
   └─► Claude Code writes the new account into the LIVE slot
read new identity from ~/.claude.json
run `add` logic → save under <name> (default: email prefix)
```

### `current` / `list`
```
read live accountUuid ──► match against accounts.json ──► render
```

### `rename` / `remove`
```
rename: copy Keychain backup old→new, delete old, move index entry
remove: delete Keychain backup, drop index entry
```

## 6. Usage tracking

`claudex usage` reports each account's rate-limit consumption. The data comes
from Anthropic's OAuth usage endpoint — the same source Claude Code's
`/status → Usage` tab uses:

```
GET https://api.anthropic.com/api/oauth/usage
    Authorization: Bearer <accessToken>
    anthropic-beta: oauth-2025-04-20
    anthropic-version: 2023-06-01
```

Response (relevant fields):

```jsonc
{
  "five_hour":        { "utilization": 12.0, "resets_at": "2026-…T15:09:59Z" },  // session
  "seven_day":        { "utilization": 57.0, "resets_at": "2026-…T21:59:59Z" },  // weekly, all models
  "seven_day_sonnet": { "utilization": 13.0, "resets_at": "…" },
  "seven_day_opus":   null
}
```

Two design points make this work cleanly:

- **No switching required.** Each saved account's access token lives in its
  Keychain backup, so usage for *every* account is fetched in parallel (a thread
  pool) using its own token — the active account uses the live token, the rest
  use their backups. You see all accounts at once.
- **Read-only, no token rotation.** The endpoint is a `GET`; it mutates nothing.
  This version deliberately does **not** refresh tokens — refreshing rotates the
  refresh token and could disrupt the active Claude Code session. Inactive
  accounts whose short-lived (~hours) token has expired fall back to the last
  cached snapshot (stored in the index under `usage.fetchedAt`), labeled with its
  age; switching to such an account refreshes its token via the normal flow.

Bars are colored by severity (`< 50%` green, `< 80%` amber, `≥ 80%` red). The
weekly window is highlighted because it's the limit that usually binds.

## 7. Auto-switch

`claudex autoswitch` moves you to a fresher account when the active one's
usage crosses a threshold. The whole design hinges on **when** the check runs.

**The "no active prompt" guarantee.** Switching is driven by a Claude Code
**`Stop` hook**, registered in `~/.claude/settings.json`:

```jsonc
"hooks": {
  "Stop": [
    { "hooks": [
        { "type": "command",
          "command": "nohup /…/claudex autoswitch run --quiet >/dev/null 2>&1 &" }
    ] }
  ]
}
```

The `Stop` hook fires precisely when Claude finishes a response and the session
goes idle — so by construction there is no active prompt at switch time. The
command is detached (`nohup … &`) so it adds zero latency to the turn.

**The check (`autoswitch run`):**

1. If disabled, or if the last check was under `intervalSec` ago (default 120s),
   exit immediately — this throttles the API so frequent `Stop`s are cheap.
2. Read the active account's usage on the configured `window` (`session` default).
3. If under `threshold` (default 90%), do nothing.
4. Otherwise fetch the other accounts' usage (each via its own stored token),
   keep those under threshold, and pick a target:
   - `next` — round-robin to the next account in order with headroom;
   - `lowest` — the account with the most headroom.
5. Snapshot the outgoing account, restore the target (§5), log to
   `~/.claude-accounts/autoswitch.log`, and post a macOS notification.

**The fundamental limitation.** A switch swaps the *on-disk* credential. A
Claude Code process already running holds its token in memory and will not adopt
a different account mid-session (§ "New-session scope"). So an auto-switch takes
effect on the **next** session/restart — the notification says as much. What it
buys you: when you do hit the wall and restart, you're already on a fresh
account instead of having to manually find one and switch.

Config lives in the index under `config.autoswitch`; the `Stop` hook is added and
removed surgically (matched by the `claudex … autoswitch` substring) so the
rest of `settings.json` is never touched.

## 8. Token refresh, status line & pre-flight

Three features build on the usage pipeline and hook mechanism.

**Token refresh.** A saved account's access token is short-lived. `refresh_stored()`
exchanges the stored refresh token for a fresh credential:

```
POST https://platform.claude.com/v1/oauth/token
Content-Type: application/json
{"grant_type":"refresh_token","refresh_token":"…","client_id":"9d1c250a-…"}
```

The response's `access_token` / `refresh_token` / `expires_in` are written back to the
account's Keychain backup. Two guard rails:

- **Inactive accounts only.** The active account's credential is owned by Claude
  Code (it refreshes on its own schedule). Rotating it underneath a running
  session would break that session's next refresh — so `claudex` never
  refreshes the active account; it uses the live token as-is.
- **Lazy + on-demand.** `usage` refreshes an account only when its token actually
  returns `expired` (401), then retries once. `claudex refresh` lets you
  proactively refresh all inactive backups.

**Status line.** `claudex statusline` is network-free: it renders the active
account plus its **cached** weekly % straight from the index, so it's instant on
every render. When the cache is older than 5 minutes it spawns a *detached*
`usage --quiet` to refresh in the background — the render never blocks. Output is
ANSI-colored even though the stream is captured, because Claude Code renders ANSI
from status-line output.

**Pre-flight switch.** Auto-switch installs two hook points (§7 covers the idle
`Stop` hook). The `SessionStart` hook runs the same check **synchronously** as a
session begins — if the credential swap completes before Claude reads it, the new
session lands directly on a fresh account, narrowing the "applies next restart"
gap. It's throttled like the Stop check, so it usually costs one quick usage call.

## 9. The pool proxy

`switch` and `autoswitch` change the credential *on disk*, which a running session never re-reads. `pool` sidesteps that entirely by moving the decision from disk to the network: it runs a local HTTP proxy and points Claude Code at it with `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>` (written into the `env` block of `~/.claude/settings.json`).

```
  Claude Code ──HTTP──▶ 127.0.0.1:8848 (claudex pool serve)
                              │
                              │  pick an account  (failover: active first; balance: round-robin)
                              │  token_for(acct)  → refresh if expiring  (POST /v1/oauth/token)
                              │  forward with  Authorization: Bearer <token>,  Host: api.anthropic.com
                              ▼
                        api.anthropic.com
                              │
                       429 ? ─┴─▶ mark account "resting" (Retry-After), pick next, retry SAME request
                       2xx ? ───▶ stream response straight back (SSE-safe), tag X-Claude-Auth-Account
```

**The key correctness property:** the Messages API is *stateless* — the client resends the entire conversation each turn — so no server-side session exists to migrate. Routing turn *N* to account A and turn *N+1* to account B is transparent; each request just draws down its own account's rate-limit bucket. This is why pooling works where an on-disk swap can't: it's load-balancing over independent requests, not "moving" a session.

Design notes:

- **Process model.** `pool start` spawns a detached `pool serve` daemon (`ThreadingHTTPServer`, `daemon_threads=True`), records its pid in `~/.claude-accounts/pool.pid` and state in `pool.json`, then waits on a local `/__pool/health` probe before reporting success. `pool stop` SIGTERMs it and restores `settings.json`.
- **Account selection** lives in the in-memory `_Pool` object: an ordered account list (active first), a per-account cooldown map (set from a 429's `Retry-After` / `anthropic-ratelimit-*-reset`), and round-robin state for `balance` mode. All mutated under a lock since each request runs in its own thread.
- **Token freshness** reuses the existing `refresh_access_token` flow: before forwarding, an expiring token is refreshed and persisted back to the Keychain backup; a `401/403` triggers one forced refresh-and-retry on the same account before failing over.
- **Streaming** is relayed chunk-by-chunk with `flush()` and `Connection: close`, so Server-Sent Events reach the client as they arrive. Hop-by-hop headers are stripped both directions (RFC 7230 §6.1).
- **Blast radius is zero by design.** Everything binds `127.0.0.1` only, no secret is ever written outside the Keychain, and because `pool stop` restores the prior `ANTHROPIC_BASE_URL`, a failure to route just means Claude Code talks to the API directly as before.

## 9.5 `session` — the forwarder, pinned to one process

`session <account>` and `pool` are two account-selection *policies* over the same primitive: the local, OAuth-preserving, token-refreshing forwarder (`PoolHandler` + `_Pool.token_for`). `pool` fans across all accounts as a global, `settings.json`-wired, singleton daemon. `session` pins to **one** account for the lifetime of **one** `claude` process — expressed by a single `only=<name>` argument to `_Pool.reload()`, which filters the account list to that name so `pick()` only ever returns it.

Why the mechanism is *forced*, not chosen: on macOS the credential store is a single process-global Keychain item, so there is no per-process credential to swap (`CLAUDE_CONFIG_DIR` relocates credentials only on Linux/Windows). The only isolation boundary available to one process is its network egress — so `session` redirects that one process via its own `ANTHROPIC_BASE_URL`.

- **Process model.** No daemon, no pid/state/log files, no `settings.json` edit. `session` runs `ThreadingHTTPServer(("127.0.0.1", 0), …)` — an **ephemeral** OS-assigned port — on a background thread *inside the command itself*, launches `claude` as a foreground child with `env` extended by `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>`, and tears the server down when the child exits. Because the wiring is a process env var, unlimited pinned sessions can run concurrently (each its own process/port/forwarder), and none of them collide with the `pool` daemon.
- **Precedence (verified).** A *process* `ANTHROPIC_BASE_URL` overrides the `env` block of `settings.json`, so a pinned session wins even while `pool` is wired — no conflict, no settings mutation. Confirmed empirically against `claude` v2.1.198: a real session launched this way routed `POST /v1/messages?beta=true` through the forwarder, kept subscription-OAuth mode (`anthropic-beta: …oauth-2025-04-20…`, `Authorization: Bearer sk-ant-oat01-…`, no `x-api-key`), and the forwarder's bearer swap changed the serving account while the live Keychain item and `~/.claude.json` were byte-for-byte unchanged.
- **Signal handling.** The parent never installs `SIG_IGN` for `SIGINT` (that would leak to the child, since Python's `restore_signals` doesn't cover it). Instead it `Popen`s `claude` and loops on `wait()`, swallowing `KeyboardInterrupt`: Ctrl-C reaches `claude` directly via the shared tty and the parent just keeps waiting rather than killing it.

## 9.6 `keep-warm` — refreshing an idle session's prompt cache

Claude Code's prompt cache has a **1-hour sliding TTL**; a read refreshes it (verified: a control prefix left untouched expired at ~60 min, while one that got read-only pings at 20/40/50 min was still alive at 76 min). So while a session is idle, replaying its last request as a **cache read** every <60 min keeps it warm for ~0.1× the context — cheaper than a 1× cold re-pay for idle gaps up to ~9h.

Why it *must* be a proxy: the exact cacheable prefix (system prompt + `tools` + `cache_control`) is **not** stored on disk — the transcript is a conversation log, not a request log (grep of a 44 MB transcript: 0 hits for `tools`/`cache_control`/`input_schema`). The prompt cache is an exact-byte prefix match, so a session can only be warmed from bytes captured **live in the request path**.

- **Transparent capture daemon.** `keep-warm serve` runs a `ThreadingHTTPServer` with `KeepWarmHandler` — like the pool proxy but it **passes Claude Code's own `Authorization` through unchanged** (no account swap; `_forward_headers(src, token=None)`) and, on each 2xx, stores that request's exact bytes keyed by the **`X-Claude-Code-Session-Id`** header (`_SessionStore`). Sessions are per-request identifiable: every request carries that header *and* `metadata.user_id → {session_id, account_uuid}` (verified: two runs → two session ids, same account_uuid).
- **The warm ping.** `_warm_ping` replays the captured request with `max_tokens` surgically rewritten to `1` in the **raw bytes** (`_set_max_tokens_1` — never re-serialized, so the cached prefix stays byte-identical) → the replay reads the cache instead of writing. Token priority is the **bearer captured from Claude Code** (fresh, valid for that exact account, re-captured every real turn), falling back to a refreshed saved-account token — deliberately *not* the saved backup for the active account, whose single-use refresh token Claude Code rotates. Verified live: a ping returned `cache_read=41150, cache_create=0` at status 200.
- **Idle-only, capped.** A daemon thread (`_keep_warm_loop`) pings a marked session only when `sinceTouch ≥ interval` (default 50 min, clamped ≤55) and `idle ≤ max` (default 8h) — real turns reset both, so active sessions cost zero extra pings. Marked sessions live in `keepwarm.json` (re-read each tick, so `add`/`rm` from a separate process take effect). Separate pid/state/log from the pool; `start` refuses if a pool is already wired (both own `ANTHROPIC_BASE_URL`).
- **Discovery.** `sessions` reads `~/.claude/projects/*/*.jsonl` directly (no proxy) — tail-scanning each transcript for the freshest cwd/gitBranch/`ai-title`/usage — so you can find a session id (or select by id-prefix / project / `--last`) to hand to `keep-warm add`.

## 10. The `security` CLI surface used

| Operation | Command |
|-----------|---------|
| Read a credential | `security find-generic-password -s <svc> -a <acct> -w` |
| Write / update (in place) | `security add-generic-password -U -s <svc> -a <acct> -w <secret>` |
| Delete a backup | `security delete-generic-password -s <svc> -a <acct>` |
| Discover the live item's account name | parse `security find-generic-password -s "Claude Code-credentials"` |

The macOS account name on the live item is detected dynamically (falling back to `getpass.getuser()`), so nothing about the local user is hardcoded.

## 11. Known trade-offs

- **macOS only.** Linux Claude Code stores credentials in `~/.claude/.credentials.json` (plaintext). A Linux backend would swap the `kc_*` functions for file operations; the rest of the architecture (index, identity swap, auto-sync) carries over unchanged.
- **`-w "<secret>"` exposure.** The secret is passed as a process argument, so it's briefly visible to `ps` for the same user during a write. Local-only and transient; eliminating it would require a Keychain API binding rather than the `security` CLI.
- **New-session scope (for `switch`/`autoswitch`).** Changing the on-disk credential doesn't reach a process that's already running. `pool` (route per request across accounts) or `session` (pin one process to one account) is the answer when the on-disk swap won't do.
- **`pool`/`session` depend on `ANTHROPIC_BASE_URL` routing.** They only work if Claude Code honors the base-URL override for the active auth mode. Verified against v2.1.198 (a real subscription session routes through the loopback forwarder in OAuth mode); if a future version stopped honoring it the proxy would simply receive no traffic — detectable (`pool status`, `doctor`) and non-destructive.
- **`pool --mode balance` and subscription terms.** Serving one workflow from several subscription accounts may conflict with Anthropic's terms around rate limits; `failover` mode (one account at a time) mirrors manual switching and is the conservative default.
