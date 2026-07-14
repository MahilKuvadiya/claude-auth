# Pool Proxy — Lifecycle Failure Scenario Catalog

> **Phase 1 deliverable — problem statements only, no solutions.**
> **Code basis:** `claudex` v2.1.1, `bin/claudex`. All `:NNNN` refs are line numbers in that file.
> **North Star:** a running/new `claude` session must **never** see a pool-related error.
> A scenario is a **North-Star violation (NSV)** if the user's `claude` session experiences an
> error, hang, truncation, or wrong-route as a result.

Compiled from three independent scenario sweeps (OS/process lens, client/wiring lens,
daemon-state lens). 89 raw scenarios de-duplicated to 48 unique problems, grouped by theme.

---

## How to read this

Each scenario has: **Trigger**, **Current behavior** (what the code does today, cited),
**Session symptom** (what `claude` sees — the NSV, if any), **Residual state**,
**Severity** (Critical/High/Medium/Low, judged by session impact), **Likelihood**.
`UNHANDLED` marks genuinely undefined behavior with no code path.

---

## Root-cause themes

Most scenarios trace back to a small set of underlying design gaps. These are the real targets
for the solutions phase; the catalog below is the evidence.

- **RC1 — No supervisor / no auto-restart.** The daemon is a detached `Popen(start_new_session=True)` child (`:2822`); nothing restarts it after any death. (drives Group A)
- **RC2 — Wiring outlives the process.** `ANTHROPIC_BASE_URL` is removed only by an explicit `pool stop` (`_unwire_base_url`, `:2863`). Any non-graceful death leaves `settings.json` pointing at a dead port. (drives Group A, F)
- **RC3 — No listener identity/authentication.** `_pool_pid` trusts `os.kill(pid,0)` (`:2632`) and `_pool_wait_health` trusts any HTTP 200 on `/__pool/health` (`:2692`) — neither proves the process/port is *our* daemon. (drives Group D, E)
- **RC4 — The proxy converts backend/upstream failures into hard error responses to the client** (502/503/429/401) instead of degrading. (drives Group G)
- **RC5 — Blocking work on the request thread** (synchronous Keychain persist `:2330`, inline `reload()` `:2445`) and **no concurrency limits / connection-close-on-leak** (`:2715`, `:2510`). (drives Group I, J)
- **RC6 — Wall-clock (`time.time()`) everywhere** for cooldowns and expiry; no monotonic clock. (drives Group K)
- **RC7 — Non-atomic / trust-the-file state** (`pool.pid` plain write `:2720`; `pool.json` read defaults to `{}` on corruption `:2645`) and **wiring/`prevBaseUrl` bookkeeping gaps**. (drives Group D, F)
- **RC8 — Passthrough shim lifecycle is fragile** (idle self-exit assumptions; never trusts its own token). (drives Group C)

---

## Group A — Daemon dies, port stays wired → connection-refused  ⚠️ NSV

The single biggest failure class. After the daemon stops for *any* non-graceful reason,
`settings.json` still points `claude` at `127.0.0.1:8848`, where nothing listens.
(Root causes: RC1 + RC2.)

### P-A1 — Hard reboot / power loss  · **Critical · High**
- **Trigger:** Machine loses power / force-restart while pool running and wired.
- **Current behavior:** Process ceases; nothing on disk changes; no launchd/systemd unit, no restart (`:2822`).
- **Session symptom:** First `claude` after boot → `ECONNREFUSED`; every session broken until manual `pool start`/`stop`.
- **Residual:** Stale `pool.pid`, `pool.json` says "running", `settings.json` wired to dead port, lost usage deltas.

### P-A2 — Clean OS shutdown / restart  · **Critical · High**
- **Trigger:** User picks Restart/Shut Down.
- **Current behavior:** macOS sends SIGTERM then SIGKILL with little grace; `_bye`'s flush is on a daemon thread killed with the process (`:2725-2735`); `settings.json` is never unwired on this path.
- **Session symptom:** Same as P-A1 on next boot.

### P-A3 — User logout / session end  · **High · Med**
- **Trigger:** Logout without shutdown while daemon runs.
- **Current behavior:** OS reaps user processes; no cleanup handler unwires settings.
- **Session symptom:** After re-login, wired port dead → `ECONNREFUSED`.

### P-A4 — SIGKILL (`kill -9`) / uncatchable crash  · **Critical · Med**
- **Trigger:** `kill -9`, native interpreter crash.
- **Current behavior:** No handler can run; process vanishes; pid + wiring remain.
- **Session symptom:** `ECONNREFUSED` on every wired session until manual recovery.

### P-A5 — OOM killer / macOS jetsam  · **High · Low**
- **Trigger:** Memory pressure (e.g. large `_read_body` buffered fully `:2574`, or many threads) → SIGKILL.
- **Current behavior:** Uncatchable, no cleanup (= P-A4).
- **Session symptom:** Dead wired port → `ECONNREFUSED`.

### P-A6 — External SIGTERM from another tool  · **High · Med**
- **Trigger:** `killall`, a process manager, or `kill <pid>` (not via `pool stop`).
- **Current behavior:** `_bye` runs (`:2725`), threads flush + `httpd.shutdown()`; in-flight requests dropped (`daemon_threads=True`); **settings never unwired**, pid not removed.
- **Session symptom:** In-flight requests reset; all future sessions → `ECONNREFUSED`.

### P-A7 — Unhandled exception escapes `serve_forever` (main thread)  · **High · Low**
- **Trigger:** Exception reaches the main serving loop (`serve_forever()` not wrapped, `:2785`).
- **Current behavior:** Main thread exits; process dies; workers die with it; no cleanup.
- **Session symptom:** Immediate dead wired port → `ECONNREFUSED`.

### P-A8 — No supervisor (amplifier)  · **Critical · High**
- **Trigger:** Structural — every death mode above.
- **Current behavior:** Deliberate detachment (`:2822`), **no watchdog / restart-on-exit anywhere**.
- **Session symptom:** Every death degrades to "wired port, nothing behind it."
- *This is RC1 itself; it multiplies the severity of P-A1–A7.*

---

## Group B — In-flight request disruption  ⚠️ NSV

The daemon survives (or is stopping), but a request already in flight is cut or truncated.

### P-B1 — Long SSE stream truncated on hard-kill mid-stream  · **Critical · Med**
- **Trigger:** `pool stop --now` (SIGTERM→`_bye`, `:2849`) or any kill during a long streaming/agentic turn.
- **Current behavior:** `httpd.shutdown()` on a side thread; `daemon_threads=True` tears down in-flight threads (`:2718`); client socket closed mid-body.
- **Session symptom:** SSE ends with no terminal `message_stop` → truncated answer or network error. `pool stop --now` even warns sessions "will error" (`:2872`).

### P-B2 — Upstream slowness > 300s mid-stream → silent truncation  · **High · Low**
- **Trigger:** Anthropic stalls > 300s while streaming.
- **Current behavior:** 300s upstream timeout (`:1624`); the `resp.read()` exception is swallowed by `except Exception: pass` in `_stream` (`:2569-2570`); stream just ends. Status/headers already sent (`:2535`).
- **Session symptom:** Response ends with no `message_stop`, no error status → silently truncated answer.

### P-B3 — Worker raises in `_stream` *before* the byte-loop try  · **Medium · Med**
- **Trigger:** Client disconnects or `wfile` write fails during `send_response`/`send_header`/`end_headers` (`:2535-2542`, before the `try` at `:2553`).
- **Current behavior:** `BrokenPipeError` propagates out of `_stream`, past `note_served`/`note_usage`, aborting the handler with partial headers; also **skips `_close(conn)`** (`:2510`) → upstream connection leak.
- **Session symptom:** Truncated/malformed HTTP response on that turn; other sessions fine.

### P-B4 — Sleep/suspend mid-request  · **Medium · Med**
- **Trigger:** Machine sleeps while a request is in flight.
- **Current behavior:** Both sockets freeze; on wake upstream TCP is likely reset; if headers already sent, `_stream` silently stops → truncated SSE.
- **Session symptom:** Resumed turn drops into a partial/hung response.

### P-B5 — SIGUSR1 passthrough flip races concurrent requests  · **Medium · Med**
- **Trigger:** `pool stop` (SIGUSR1, `:2879`) fires while requests are in flight.
- **Current behavior:** `_proxy` reads `PASSTHROUGH` once (`:2394`); each request is internally consistent, but concurrent requests split across modes (pooled vs client's own token).
- **Session symptom:** Two near-simultaneous turns served by different identities; the passthrough one loses prompt-cache locality and can 401 (→ P-C4) while its sibling succeeds.

### P-B6 — SIGPIPE / client disconnects mid-stream  · **Low · High** *(handled — documented for completeness)*
- **Current behavior:** Python sets SIGPIPE→SIG_IGN; write loop `try/except: pass` (`:2553-2570`); daemon survives; the abandoned turn's usage may be partially counted.

---

## Group C — Passthrough shim lifecycle gaps  ⚠️ NSV

Graceful stop keeps the port alive as a passthrough shim so live sessions survive — but the
shim's guarantees are narrower than they look. (Root cause: RC8.)

### P-C1 — Shim self-exits under a long-idle session → refused on resume  · **Critical · Med**
- **Trigger:** Graceful stop → passthrough; a `claude` session sits idle > 900s (`PASSTHROUGH_IDLE_SECS`), then resumes.
- **Current behavior:** `_idle_watch` shuts the shim after 900s idle (`:2753-2761`); the running session's base URL is fixed at spawn and still points at 8848.
- **Session symptom:** Resumed turn → `ECONNREFUSED`. The "keeps working, no restart" promise silently expires after 15 min of inactivity.

### P-C2 — Shim never self-exits when it never served a request  · **Low · Med**
- **Trigger:** Graceful stop flips to passthrough but no request is ever proxied afterward.
- **Current behavior:** `_idle_watch` guard is `PASSTHROUGH and LAST_REQ_TS and …`; `LAST_REQ_TS` starts at `0.0` (`:100`) and is set only in `_proxy` (`:2393`). With no request, the guard stays falsy **forever** → immortal shim holding the port.
- **Session symptom:** None directly, but the next `pool start` takes the hard-kill path; operationally surprising.

### P-C3 — Sleep inflates idle measurement → premature shim exit  · **Medium · Med**
- **Trigger:** Machine sleeps in passthrough; wake makes `time.time()-LAST_REQ_TS` exceed 900s on the first tick (RC6).
- **Current behavior:** `_idle_watch` exits the shim immediately on wake even if a session is still open.
- **Session symptom:** Open session's next request → `ECONNREFUSED`.

### P-C4 — Passthrough forwards the client's own (possibly invalid) token → 401  · **High · Med**
- **Trigger:** After graceful stop, a session that relied on the pool for auth keeps sending requests.
- **Current behavior:** `_proxy_passthrough` forwards the client's **own** `Authorization` verbatim (`:2419-2427`); injects nothing. Whatever token `claude` sends reaches Anthropic.
- **Session symptom:** If the client's own credential isn't currently valid at the API (the pool token had been masking it), Anthropic 401/403s and it's relayed verbatim (`:2416`) — an auth error the session never saw while pooled. *(Token validity mechanics deferred to the token phase; the structural gap is passthrough blindly trusting the client header.)*

### P-C5 — `pool stop` on an already-dead daemon strands running sessions  · **Medium · Med**
- **Trigger:** `pool stop` when the daemon PID is already gone (crashed).
- **Current behavior:** `_pool_stop` unwires **before** checking the PID (`:2863`); `os.kill(pid,SIGUSR1)` raises `ProcessLookupError` → cleans pid file, reports "not running" (`:2880-2885`).
- **Session symptom:** New sessions correctly go direct, but any still-running session pointed at the dead port gets `ECONNREFUSED` — it can't be flipped to passthrough (no process to flip).

---

## Group D — PID / state-file integrity & identity  ⚠️ NSV (indirect)

The tooling's belief about "is the pool running?" can diverge from reality. (Root causes: RC3 + RC7.)

### P-D1 — PID reuse: a dead daemon looks alive / a bystander gets signalled  · **High · Low**
- **Trigger:** Daemon dies ungracefully; the OS reassigns its PID to an unrelated process; `pool.pid` still holds that number.
- **Current behavior:** `_pool_pid`'s only liveness test is `os.kill(pid,0)` (`:2632`) — succeeds for ANY process with that PID. `pool start` then `die`s "already running (pid N)" (`:2809`); `pool stop` sends **SIGUSR1** (default: terminate) and `--now` sends **SIGTERM** (`:2849`) to the innocent process. **UNHANDLED** (no check the PID is a `claudex pool serve`).
- **Session symptom:** `pool start` wrongly refused while nothing serves the wired port → `ECONNREFUSED`; and a bystander process may be killed.

### P-D2 — Disk full / `STORE_DIR` unwritable → no pid file → unmanageable daemon  · **High · Low**
- **Trigger:** `~/.claude-accounts` unwritable when the daemon starts.
- **Current behavior:** pid write is `except OSError: pass` (`:2720-2723`) → daemon **runs with no pid file**; `_pool_pid` always returns None. `pool stop` believes nothing runs (just unwires, `:2865`) while the daemon keeps injecting tokens; `pool start` later fails to bind.
- **Session symptom:** Daemon can't be cleanly stopped/restarted; eventually dies by other means → dead wired port with no tooling cleanup.

### P-D3 — `pool.json` corruption defaults to `{}` → loses `prevBaseUrl` & port/passthrough truth  · **Medium · Low**
- **Trigger:** State file truncated (crash mid-write elsewhere) or hand-edited to invalid JSON.
- **Current behavior:** Writes are atomic (`:2650-2653`), but `_pool_read_state` returns `{}` on any error (`:2645`). Empty `{}` ⇒ port defaults 8848, `remote`/`passthrough`/`prevBaseUrl` all absent → `_unwire_base_url` **deletes** `ANTHROPIC_BASE_URL` instead of restoring the user's original (`:2677-2681`).
- **Session symptom:** New sessions lose the user's intended custom base URL (deleted, unrecoverable).

### P-D4 — `pool.pid` non-atomic write → torn/garbage read  · **Low · Low**
- **Trigger:** pid file read while being written (plain `open("w")`, no tmp+replace, `:2720`), or non-numeric content.
- **Current behavior:** Torn read → `ValueError` → None (`:2629`); "not running" misreport.
- **Session symptom:** Possible duplicate daemon (→ P-E4) or transient misreport; no direct session error.

### P-D5 — State says `passthrough` but the live daemon isn't  · **Medium · Low**
- **Trigger:** `pool.json.passthrough=true` but the serving daemon's in-memory `PASSTHROUGH` is False (fresh daemon rebound the port; SIGUSR1 lost; second daemon never got it).
- **Current behavior:** `PASSTHROUGH` is an in-process global (`:99`) never reconciled with the on-disk flag. `_pool_start` trusts the file and **hard-kills** a daemon it thinks is a spent shim (`:2805-2807`) — even a healthy token-injecting one.
- **Session symptom:** A subsequent `pool start` SIGTERMs a fully-active daemon; sessions mid-request get reset.

### P-D6 — Stale pid file after ungraceful death  · **Medium · High** *(self-healing, but window exists)*
- **Current behavior:** `_pool_pid` self-cleans a dead-pid file (`:2624-2639`); start/stop logic recovers. **But** the window before the user runs any pool command leaves `settings.json` wired to a dead port (= Group A).

### P-D7 — CLI killed mid-`pool stop`  · **Medium · Low**
- **Trigger:** `pool stop` CLI killed between its steps: unwire (`:2863`) → SIGUSR1 (`:2879`) → write `passthrough` (`:2887`).
- **Current behavior:** Partial completion leaves `pool.json` inconsistent with the daemon's real mode (ties to P-D5/P-C2).
- **Session symptom:** Usually invisible; leaves state divergence.

### P-D8 — CLI killed mid-`pool start`  · **Low · Low**
- **Trigger:** `pool start` killed after `Popen` (`:2822`) but before `_pool_write_state`/`_wire_base_url`.
- **Current behavior:** Detached daemon runs and wrote its pid, but `pool.json` unwritten and settings unwired.
- **Session symptom:** `pool status` shows "running but not wired"; `claude` silently goes direct; orphan daemon holds the port.

---

## Group E — Startup, binding & health-check identity  ⚠️ NSV (some)

### P-E1 — Health check accepts a *foreign* server on 8848  · **High · Low**
- **Trigger:** Port 8848 already held by an unrelated process that answers HTTP 200 on `GET /__pool/health`.
- **Current behavior:** `_pool_wait_health` accepts any `status==200` (`:2692`) with no identity/signature check; the real daemon child fails to bind (`OSError`→`die`, `:2716`) but the parent already saw 200 → proceeds to `_wire_base_url` (`:2828`). **Partially UNHANDLED** (RC3).
- **Session symptom:** `claude` is wired to a foreign server; requests (carrying the swapped `Authorization`) go to a third party → arbitrary errors/hangs **and a token/header leak**.

### P-E2 — Port 8848 occupied by an unrelated process (clean-fail case)  · **Medium · Med**
- **Trigger:** Something else listening on 8848 that does *not* answer 200 on the health path.
- **Current behavior:** Child `die`s on bind (`:2716`); parent's health times out (6s) → `die("pool did not come up")` (`:2823`); no wiring done.
- **Session symptom:** `pool start` fails cleanly; no session breakage (unless P-E1).

### P-E3 — Remote-pool health race → orphan daemon  · **High · Med**
- **Trigger:** `pool start` for a shared/remote pool; `_Pool` construction pulls the Pantry blob (network, up to 10s×3, `:1811-1828`) **before** binding the socket.
- **Current behavior:** `_pool_wait_health` waits only 6s (`:2686`); if the remote pull exceeds it, health fails → `die` — but the detached daemon keeps initializing, eventually binds and writes its pid; wiring never happened.
- **Session symptom:** User sees "did not come up" (settings unwired, so `claude` goes direct — no error there), but an **orphan daemon** now holds the port; a retry `pool start` dies "already running."

### P-E4 — Double `pool start` / two daemons  · **Low–Medium · Low**
- **Trigger:** Two `pool start` near-simultaneously (scripts, two terminals); or a second start after a lost pid file (P-D2), possibly with a different `--port`.
- **Current behavior:** Both see `_pool_pid`→None (`:2803`) and spawn; same port → loser dies on bind but the winner answers health, so the loser's parent still rewrites state/wiring; **different port → two live daemons**, each with its own `POOL`, cooldowns, `_sync_loop` flush.
- **Session symptom:** Usually converges; with two daemons, double telemetry flush + non-CAS Pantry clobber (`:1717`), drifting usage; sessions on the port that later loses its daemon break.

### P-E5 — Fast user switching / multi-user host  · **High · Low**
- **Trigger:** User A starts the pool; user B (concurrent login) also runs `pool start`.
- **Current behavior:** pid/state/settings are per-user, but 127.0.0.1:8848 is **host-wide**. B's bind fails, but B's health check sees A's daemon (200) → B wires B's settings to **A's** daemon.
- **Session symptom:** B's `claude` is silently served by A's accounts/tokens (wrong identity + usage attribution); if A logs out, B's wiring dies; B's `pool stop` can signal/kill A's daemon.

---

## Group F — Wiring / `settings.json` drift  ⚠️ NSV (some)

Everything about how `ANTHROPIC_BASE_URL` is set, shadowed, or lost. (Root causes: RC2 + RC7.)

### P-F1 — Shell-exported `ANTHROPIC_BASE_URL` shadows the wiring  · **High · Med**
- **Trigger:** User's shell already `export`ed `ANTHROPIC_BASE_URL` before launching `claude`.
- **Current behavior:** Process env overrides `settings.json` (`:3525` note); claudex only writes settings, can't see/change the export.
- **Session symptom:** That session bypasses the pool entirely (or breaks if the export points somewhere dead), while `pool status` reports "running · wired."

### P-F2 — Pre-existing loopback base URL clobbered, never restored  · **Medium · Med**
- **Trigger:** `settings.json` already had `ANTHROPIC_BASE_URL` pointing at *another loopback* proxy (keep-warm, old port), then `pool start`.
- **Current behavior:** `_wire_base_url` only saves `prevBaseUrl` when the prior value does **not** start with `http://127.0.0.1:` (`:2661`); any prior loopback is overwritten with no memory; `pool stop` then deletes the key (`:2680`).
- **Session symptom:** The user's earlier loopback tool is silently unrouted; after stop nothing points at it.

### P-F3 — `prevBaseUrl` wiped by re-`start` after a crash  · **High · Med**
- **Trigger:** `ANTHROPIC_BASE_URL=https://corp-gateway` saved as `prevBaseUrl`; daemon crashes (still wired to 8848); user runs `pool start` again.
- **Current behavior:** `_pool_start` writes a fresh state dict with **no** `prevBaseUrl` (`:2825`), wiping it; `_wire_base_url` reads the current value (now `127.0.0.1:8848`), which starts with `127.0.0.1:` so `prevBaseUrl` isn't re-saved (`:2661`).
- **Session symptom:** The corp-gateway URL is gone forever; on the eventual `pool stop` the key is deleted → the user's original endpoint is never restored.

### P-F4 — Malformed `settings.json` makes every claudex command `die()`  · **High · Med**
- **Trigger:** User/another tool leaves invalid JSON, or a partial write.
- **Current behavior:** `_read_settings` → `die()` on `JSONDecodeError` (`:1392-1393`). Every command that reads settings (`pool stop/status/start`) aborts.
- **Session symptom:** `pool stop` can't unwire (dies first) → wiring stuck; Claude Code also can't parse its own settings → client broken independently. No recovery through claudex.

### P-F5 — Project-level / `.local` settings override user-level wiring  · **Medium · Med**
- **Trigger:** A repo has `.claude/settings.json` / `settings.local.json` setting or omitting `ANTHROPIC_BASE_URL`.
- **Current behavior:** claudex writes only user-level `~/.claude/settings.json` (`:64`); Claude Code ranks project/local above user.
- **Session symptom:** Sessions in that project ignore the pool (or break if the project pins a stale loopback); invisible to claudex.

### P-F6 — `--no-wire` leaves shell exports stranded past `pool stop`  · **Medium · Med**
- **Trigger:** `pool start --no-wire` tells the user to `export …`; later `pool stop`.
- **Current behavior:** `pool stop` unwires only `settings.json` (`:2863`); can't touch a shell export.
- **Session symptom:** Every exported shell keeps routing at the port; after the shim exits (P-C1) or `--now`, those sessions → `ECONNREFUSED`.

### P-F7 — Wiring is spawn-time only  · **Low · High** *(structural, benign but load-bearing)*
- **Current behavior:** `settings.json` env is injected at `claude` spawn; a running process's `ANTHROPIC_BASE_URL` is fixed for its lifetime (`pool start` even hints "on next start", `:2829`).
- **Session symptom:** Wiring/unwiring mid-session has no effect on running processes — this is *why* passthrough exists, and why a running session's fate is tied to the shim (P-C1).

---

## Group G — Proxy surfaces a pool-branded error to the session  ⚠️ NSV

By construction the proxy returns 502/503/429/401 bodies (`_err_body`, type `claude_auth_pool_error`, `:2617`) directly to `claude`. Every one of these is a North-Star violation. (Root cause: RC4.)

### P-G1 — Upstream unreachable (DNS/TLS/partition/edge-down) → 502  · **Critical · Med**
- **Trigger:** Network blip to `api.anthropic.com` while serving.
- **Current behavior:** `_send` catches and returns `err` (`:2520`); callers emit `502 "pool could not reach the API"` (`:2454`, `:2461`, `:2614`); passthrough emits 502 (`:2414`). With the 300s upstream timeout, a black-hole network can hang **300s per account** before the 502 (`:1624`).
- **Session symptom:** 502 pool-branded error (or a multi-minute hang first). A transient upstream blip becomes a hard pool error.

### P-G2 — Backend/Pantry token fetch fails → 502  · **Critical · Med**
- **Trigger:** Shared/backend mode; cached token expiring/None and the backend/Pantry is unreachable.
- **Current behavior:** `_backend_token` returns stale `tok` which may be `None` (`:2268-2272`); shared `token_for` returns old token on refresh failure (`:2311). A `None` token → account skipped in failover (`:2482`); all-none → `_all_busy(None)` → `502 "unknown error"` (`:2612`). Selected mode → `POOL.reload()` then 502 (`:2449`).
- **Session symptom:** 502 pool-branded error.

### P-G3 — All accounts rate-limited → 429  · **High · Med**
- **Trigger:** Heavy concurrency / small or exhausted pool.
- **Current behavior:** `_proxy_failover` cools each 429'd account and moves on (`:2502`); when all tried, `_all_busy` → `429 "all pooled accounts are at their rate limit"` (`:2604`). **Selected mode has no failover** — a single 429 is streamed straight back (`:2464`).
- **Session symptom:** 429 (pool-branded, or raw upstream in selected mode) — a rate-limit error that's a property of the *shared pool*, not the user's own account.

### P-G4 — Selected-mode 401/403 surfaced (no auto-switch)  · **High · Med**
- **Trigger:** Shared pool, selected member's token dead/rotated even after one in-place refresh.
- **Current behavior:** `_proxy_selected` refreshes once, retries; if still 401/403 it **streams it back** and only logs "user must `pool use <other>`" (`:2462-2469`).
- **Session symptom:** Hard 401/403 mid-work, no automatic recovery; user must manually `pool use`.

### P-G5 — No account selected / no accounts → 503  · **Medium · Low**
- **Trigger:** Shared pool with `selectedMemberId` unset; or local index emptied after start.
- **Current behavior:** `503 "no pool account selected"` (`:2440`) / `503 "no accounts available to pool"` (`:2396`).
- **Session symptom:** 503 on every request until a selection/account exists.

### P-G6 — Inline `reload()` on the request path stalls, then 502  · **High · Med**
- **Trigger:** Selected mode; `token_for` returns falsy once → inline `POOL.reload()` recovery (`:2445`).
- **Current behavior:** `reload → _reload_remote → store.load` does a network round-trip on the **request thread** (Pantry retries with `time.sleep(Retry-After)` `:1815`; backend 15s `:1925`), possibly tens of seconds, before the eventual 502.
- **Session symptom:** Long unexplained mid-turn stall, then a 502.

---

## Group H — HTTP request/response fidelity

Correctness of the proxy as an HTTP intermediary.

### P-H1 — Chunked / no-Content-Length request body dropped  · **High · Low** · UNHANDLED
- **Trigger:** Client sends `Transfer-Encoding: chunked` with no `Content-Length`.
- **Current behavior:** `_read_body` reads exactly `Content-Length` bytes, returns `b""` when absent (`:2574`); `Transfer-Encoding` is hop-by-hop and stripped. Forwarded request has an **empty body**.
- **Session symptom:** Upstream 400 on a valid client request. Low with real Claude Code (sends Content-Length), higher with unusual clients.

### P-H2 — Auth header-shape change on a Claude Code update  · **Medium · Low** · UNHANDLED
- **Trigger:** A future `claude` release authenticates differently (e.g. `x-api-key`) or changes request shape.
- **Current behavior:** Pool mode drops `authorization` and injects `Authorization: Bearer` (`:1656-1668`); touches no other auth header.
- **Session symptom:** Conflicting/ambiguous credentials upstream → 401 surfaced to the client.

### P-H3 — Forced `Connection: close` defeats client keep-alive  · **Medium · Med**
- **Trigger:** Claude Code reuses keep-alive sockets; every proxy response closes the connection.
- **Current behavior:** Every response sets `Connection: close` + `close_connection=True` (`:2541`, `:2596`) despite advertised HTTP/1.1; a fresh upstream HTTPS connection per request (no pooling).
- **Session symptom:** TCP+TLS reconnect per request (latency, FD/ephemeral-port pressure under many subagents); a socket-reuse race on a non-idempotent POST can `ECONNRESET` and surface as a spurious network error.

### P-H4 — Response loses upstream `Content-Length`; framing relies on close  · **Low · Low**
- **Current behavior:** `_stream` strips `Content-Length`/`Connection` and re-adds only `Connection: close` (`:2537`); body framed by socket close only.
- **Session symptom:** A strict client expecting `Content-Length` on a non-chunked response may treat close-framing as a short read → spurious error.

### P-H5 — `/__pool/` namespace collision  · **Low · Low**
- **Current behavior:** `do_GET` intercepts any path starting `/__pool/` and returns the local snapshot (`:2376`); only GET is intercepted.
- **Session symptom:** If Anthropic ever exposes a `GET /__pool/...` route, the client would get local JSON instead of the real response.

### P-H6 — `X-Claude-Auth-Account` leaked on every response  · **Low · Low**
- **Current behavior:** `_stream` always adds `X-Claude-Auth-Account: <name>` (`:2540`), exposing the internal account name.
- **Session symptom:** Harmless to `claude` today; leaks a member/account identifier into every response header.

---

## Group I — Concurrency, resource leaks & scaling

### P-I1 — No thread/connection cap → thread & FD explosion  · **High · Med** · UNHANDLED
- **Trigger:** Many concurrent requests (multiple sessions / parallel tool calls).
- **Current behavior:** `ThreadingHTTPServer` + `daemon_threads=True` spawns **one unbounded thread per connection** (`:2715`), each holding an upstream HTTPS connection up to 300s. No pool, cap, queue, or backpressure.
- **Session symptom:** Approaching FD/thread limits → socket-creation failures → 502s (P-G1); possible machine-wide `EMFILE`; climbing latency.

### P-I2 — Upstream connection leaks on error paths  · **Medium · Med**
- **Trigger:** `getresponse()` throws in `_send` (`:2516`); or `_stream` raises before/around the byte loop (P-B3).
- **Current behavior:** In those paths `conn` is opened but never `.close()`d (`_close` only on success, `:2510`).
- **Session symptom:** Slow FD accumulation over a long-lived daemon → eventually P-I1.

### P-I3 — Concurrent sessions/subagents amplify pool-wide failure  · **High · Med**
- **Trigger:** Many `claude` sessions + background agents on one proxy.
- **Current behavior:** Pool state (exhausted accounts, selection) is **global**; one heavy consumer rate-limits shared accounts for everyone (→ P-G3); one daemon crash takes down all sessions (→ Group A). No per-client fairness/isolation.
- **Session symptom:** A single busy session degrades all others into 429s.

### P-I4 — `reload()` swaps the account list mid-request  · **Medium · Low**
- **Trigger:** `_sync_loop` (or inline P-G6) `reload()` replaces `self.accounts` while `_proxy_failover` iterates.
- **Current behavior:** Failover snapshots `len(accounts)` once for its bound (`:2476`) then re-reads under lock; `reload` rebuilds `accounts`/`stats` but does **not** reset `cooldown`/`refresh_locks` or drop departed-member keys.
- **Session symptom:** Usually invisible; if reload shrinks the pool below `tried`, the loop can exit early → an avoidable 429/502. Also a slow memory leak of stale `cooldown`/`refresh_locks`/`stats` keys over churn.

### P-I5 — Coarse global lock: health/status contends with serving  · **Low · Low**
- **Current behavior:** `_control`→`snapshot()` and all hot-path methods contend on a single `self.lock` (`:2009`); snapshot deep-copies deltas under it (`:2347`).
- **Session symptom:** Added routing latency under concurrent health/status polling; a scaling ceiling compounding P-I1.

---

## Group J — Blocking the request thread  ⚠️ NSV

### P-J1 — Local-mode Keychain persist blocks the request thread  · **High · Med**
- **Trigger:** Local pool; a pooled token expires within 60s (`:2297`), `token_for` refreshes and persists to Keychain while the login keychain is locked / ACL prompts for `security`.
- **Current behavior:** Local mode calls `_pool_persist_token` **synchronously on the request thread** (`:2330-2331`) → `subprocess.run(["security", …])` (`:1697`) with **no timeout**; blocks until the user reacts (or forever if headless). (Shared/backend mode persists on a daemon thread `:2326`.)
- **Session symptom:** The in-flight `claude` request hangs for the whole keychain prompt/lock; the model "stops responding" → client timeout.

*(P-G6 inline `reload()` is the other request-thread blocker; filed under Group G.)*

---

## Group K — Time / clock correctness  ⚠️ NSV

### P-K1 — Wall-clock jumps corrupt cooldown & token-expiry math  · **Medium · Med** · UNHANDLED (no monotonic clock)
- **Trigger:** NTP step, VM suspend/resume, laptop sleep/wake, manual clock change (RC6).
- **Current behavior:** Everything time-based uses `time.time()`: cooldown set/expiry (`:2227`, `:2217`), token freshness (`:2258`, `:2297`), `_retry_after_secs` (`:1641`), idle-exit (`:2757`). A **backward** jump makes cooldowns look far-future (accounts appear rate-limited → premature P-G3/P-G1) and tokens look valid too long (serve expired → 401 churn). A **forward** jump expires cooldowns/tokens early (extra refreshes; premature shim exit P-C3).
- **Session symptom:** After sleep/wake or a clock correction, a burst where all accounts wrongly appear on cooldown → 429/502, or stale-token 401 churn.

---

## Group L — Environment & deployment hazards

### P-L1 — `CLAUDE_AUTH_UPSTREAM_*` test env vars leak into production  · **High · Low**
- **Trigger:** `CLAUDE_AUTH_UPSTREAM_HOST`/`_PORT`/`_PLAIN` set in the daemon's env (stray export, inherited shell, CI leftover).
- **Current behavior:** `_upstream_host`/`_upstream_conn` read them unconditionally (`:1617-1626`); `HOST` re-points **all** upstream traffic; `_PLAIN` downgrades to cleartext HTTP sending the bearer token in the clear. No test-mode guard. Read at spawn, sticks for the daemon's life.
- **Session symptom:** Every request forwarded to the wrong host (→ P-G1) or, with `_PLAIN`, tokens exfiltrated over plaintext — total availability break.

### P-L2 — Running as a different user / under sudo  · **Medium · Low**
- **Trigger:** Daemon started via `sudo` (root `$HOME`), managed by a normal-user `claudex`.
- **Current behavior:** pid lives under a different `STORE_DIR` (invisible to the normal user); cross-user `os.kill` raises `PermissionError`, which `_pool_hard_kill` does **not** catch (only `ProcessLookupError`, `:2848`).
- **Session symptom:** Daemon can't be stopped/restarted; `pool stop --now` can raise an uncaught `PermissionError` traceback; wiring and daemon owned by different users.

### P-L3 — In-place binary / OS upgrade  · **Medium · Med**
- **Trigger:** `claudex` upgraded (brew/self-update) or OS updates while the daemon runs.
- **Current behavior:** Running daemon keeps its in-memory old code (fine); management commands use the new binary and signal by pid (works). If the update reboots → collapses into P-A1/P-A2.
- **Session symptom:** None while the old daemon lives; `ECONNREFUSED` if the update reboots.

### P-L4 — SIGHUP on foreground `pool serve`  · **Medium · Low**
- **Trigger:** User runs `claudex pool serve …` directly in a foreground shell (supported, `:2698`) and closes the terminal.
- **Current behavior:** No SIGHUP handler; default action terminates it with no cleanup. (The `pool start` daemon is detached via `start_new_session`, so it's immune — this is only the foreground path.)
- **Session symptom:** Port dies on terminal close; if wired, sessions break.

### P-L5 — SIGSTOP/SIGCONT freeze  · **Medium · Low**
- **Trigger:** Daemon gets SIGSTOP (debugger, `kill -STOP`, throttling tool).
- **Current behavior:** Uncatchable freeze; process still "exists" so `_pool_pid` reports it alive and the port stays bound but unresponsive.
- **Session symptom:** Client connections hang until Claude Code's timeout, then error; `pool status`/`start` believe it's healthy and won't restart. SIGCONT resumes.

---

## Group M — Usage-accounting loss (non-session-facing)

Not North-Star violations (no `claude` error), but production-relevant for metered/billed pools.

### P-M1 — Final flush thread races process exit → lost usage  · **Low · Med**
- **Current behavior:** `_bye` runs `flush_usage()` on a daemon thread then `httpd.shutdown()` (`:2728`); if the network flush hasn't completed at interpreter teardown, it's killed; requeued deltas are in-memory (`:2159`) and also lost.
- **Impact:** Shared-pool usage under-counts the final window on every SIGTERM stop.

### P-M2 — Shutdown flush vs `_sync_loop` flush race / non-CAS Pantry clobber  · **Medium · Med**
- **Current behavior:** `flush_usage` swaps deltas under lock (`:2140`) so the same delta isn't double-sent, but shared-mode does read-modify-write on Pantry with **no CAS** (`:2154`); an overlapping `_sync_loop` save and shutdown save clobber each other (documented, `:1717`).
- **Impact:** Misattributed spend in a metered shared pool.

### P-M3 — `pool.log` grows unbounded (no rotation)  · **Medium · High**
- **Current behavior:** `_pool_log` appends on **every** request (`log_message`, `:2373`) with no size cap/rotation anywhere (`:1677`).
- **Impact:** Over weeks, a multi-GB log; once the volume fills, system-wide writes fail (keychain persist, Pantry saves) — an indirect path to several Group G/J failures.

### P-M4 — Log handle vs rotation/deletion  · **Low · Med**
- **Current behavior:** Fresh handle per call (no inode pinning) but no SIGHUP reopen; concurrent threads may race `makedirs`/recreate after an external `rm`/logrotate.
- **Impact:** Split/unreliable logs for diagnosing the above; no session impact.

### P-M5 — `_sync_loop` hang on slow network  · **Low · Med**
- **Current behavior:** Single-threaded loop; a slow Pantry/backend cycle (retries + `time.sleep`) just delays the next; deltas accumulate; roster staleness delays picking up rotated tokens (can cascade to P-G2/P-G4).
- **Impact:** Off the request path (no direct session error); stale roster risk.

---

## Explicitly benign / already-handled (recorded so they aren't re-investigated)

- **Sleep/wake while idle** (OS): timers suspend/resume; port intact on wake. (edge: P-C3)
- **TIME_WAIT reuse after death:** `SO_REUSEADDR` lets the new daemon rebind; generally fine.
- **Claude Code client crash/restart:** daemon decoupled; client re-reads settings and reconnects — the correct direction.
- **SIGPIPE / client mid-stream disconnect:** swallowed; daemon survives (P-B6).
- **Stale pid file:** self-cleaned by `_pool_pid` (but leaves the Group A wiring window, P-D6).
- **Foreground-daemon SIGHUP immunity:** `pool start` uses `start_new_session` (only the manual `pool serve` path is exposed, P-L4).

---

## Severity snapshot (session-facing NSV first)

| Severity | Scenarios |
|---|---|
| **Critical** | P-A1, P-A2, P-A4, P-A8, P-B1, P-C1, P-G1, P-G2 |
| **High** | P-A3, P-A5, P-A6, P-A7, P-C4, P-D1, P-D2, P-E1, P-E3, P-E5, P-F1, P-F3, P-F4, P-G3, P-G4, P-G6, P-H1, P-I1, P-I3, P-J1, P-L1 |
| **Medium** | P-B2, P-B3, P-B4, P-B5, P-C3, P-C5, P-D3, P-D5, P-D7, P-E2, P-E4, P-F2, P-F5, P-F6, P-G5, P-H2, P-H3, P-I2, P-I4, P-K1, P-L2, P-L3, P-L4, P-L5, P-M2, P-M3 |
| **Low** | P-B6, P-C2, P-D4, P-D6, P-D8, P-F7, P-H4, P-H5, P-H6, P-I5, P-M1, P-M4, P-M5 |

**The dominant NSV clusters** (where `claude` actually errors): Group A (dead-but-wired port),
Group G (proxy emits 502/503/429/401), Group C (shim gaps), Group B (in-flight truncation),
plus P-J1 (request-thread hang). These are the priorities for the solutions phase.
