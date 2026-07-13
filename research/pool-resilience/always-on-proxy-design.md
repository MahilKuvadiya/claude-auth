# Always-On Proxy — Design & Phased Implementation Plan

> **Status:** design proposal (Phase-1 of the resilience work). No code written yet.
> **Code basis:** `claudex` v2.2.1 (`bin/claudex`). Line refs are `bin/claudex:NNNN`.
> **Related:** [`proxy-lifecycle-scenarios.md`](./proxy-lifecycle-scenarios.md) (the failure catalog this design neutralizes), [`README.md`](./README.md).

---

## 1. Summary

Repurpose the pool proxy from an **on-demand process** (spawned by `pool start`, killed/parked by `pool stop`) into an **always-on local indirection point** that is installed and started at install time, kept alive by launchd across crashes and reboots, and whose behavior is switched **live** by a **persisted mode flag** — `passthrough` (transparent forward, the safe floor) vs `swap` (inject pooled tokens).

**Why:** we proved (experiment, Claim 2) that a running Claude Code session's base URL is fixed at process launch (`process.env.ANTHROPIC_BASE_URL`, confirmed in the binary) and **cannot be changed from outside the process**. The only way to redirect a live session without restarting it is a **stable local proxy** it always points at, whose upstream/behavior we change behind it. Making that proxy always-present converts most Critical/High failures in the catalog from "handle the error" into "the error can't occur."

**Honest scope of the promise.** No userland process can be truly unkillable — `SIGKILL`, OOM, and power loss always win. The achievable, functionally-equivalent goal is **self-healing / always-restarted**: launchd relaunches it within ~1s of any death and starts it at login after a reboot, and `bind-first` + a `SessionStart` pre-flight shrink the restart gap to near-zero. We will describe the promise as "always-available within a sub-second self-heal window," never "unkillable."

**The trade-off we accept deliberately.** An always-in-path proxy is now in front of *every* Claude Code request, pooling or not. Its reliability bar becomes production-critical and its blast radius is all Claude Code usage. This is only acceptable if the daemon is bulletproof (§7). A key safety property makes it tractable: **in `passthrough` mode the daemon holds no tokens and performs no OAuth refresh** — so the "off" state cannot churn or break the user's account (the exact failure mode of the 2026-07-13 incident).

---

## 2. Current behavior (baseline)

- **`pool start`** (`_pool_start`, :2810): `subprocess.Popen(["claudex","pool","serve",…], start_new_session=True)` (:2844) — a **detached, unsupervised** child; then `_wire_base_url` (:2677) writes `env.ANTHROPIC_BASE_URL=http://127.0.0.1:8848` into `~/.claude/settings.json`.
- **`pool serve`** (`_pool_serve`, :2720): binds `127.0.0.1:8848`, then per request either swaps in a pooled token (`_proxy_failover`/`_proxy_selected`) or, once stopped, forwards the client's own token (`_proxy_passthrough`, :2403).
- **`pool stop`** (`_pool_stop`, :2883): `_unwire_base_url()` first (:2885), then **SIGUSR1** → `PASSTHROUGH=True` (:2763). The process stays up as a passthrough shim that **self-exits after 15 min idle** (`PASSTHROUGH_IDLE_SECS=900`, `_idle_watch` :2776). `--now` hard-kills (`_pool_hard_kill`, SIGTERM, :2869).
- **State:** `~/.claude-accounts/pool.{pid,json,log}`; `_pool_read_state`/`_pool_write_state` (:2663, atomic via tmp+`os.replace`).
- **Existing launchd precedent:** `ensure_analytics_agent` (:4876) + `_analytics_plist_xml` (:4854) — a self-healing `gui/$UID` LaunchAgent with `RunAtLoad`, installed idempotently, re-bootstrapped when the plist content changes. **We model the proxy agent on this.**
- **Install hook:** `packaging/install.sh` ends with `"$DEST" --version` → `main()` (:4909) → `ensure_analytics_agent()`. Adding `ensure_proxy_agent()` to `main()` gives us install-time + self-healing registration for free.

Baseline failure classes (from the catalog): Group A (dead-but-wired port), Group C (shim gaps), Group F (wiring drift). This design targets all three.

---

## 3. Target architecture

```
Claude Code session (base URL fixed at launch → 127.0.0.1:8848)
        │  every request, forever
        ▼
┌──────────────────────────────────────────────┐
│  claudex proxy daemon  (launchd: RunAtLoad +   │
│  KeepAlive, always-restarted, bind-first)      │
│                                                │
│  reads persisted mode flag (mtime-cached):     │
│    • passthrough → forward client's OWN token  │  ← safe floor, no token handling
│    • swap        → inject pooled token,         │
│                    failover; degrade to         │
│                    passthrough/fail-loud per §6 │
└──────────────────────────────────────────────┘
        │
        ▼  api.anthropic.com  (errors passed through, retryable-shaped)
```

**Invariants:**
1. **The listener is always present** (self-healed by launchd). A running session's fixed base URL always has something answering → no connection-refused.
2. **`ANTHROPIC_BASE_URL` is wired at install, and changed only by three explicit actions: the `proxy off`/`proxy on` command and uninstall.** `pool start`/`pool stop` **never** touch `settings.json` — they only flip the mode flag. Unwiring (returning to direct-to-Anthropic routing) is a deliberate, reversible operation, decoupled from stopping token-swap.
3. **Mode is a persisted flag** (`swap` | `passthrough`), the source of truth, read at startup *and* live per request. Toggling reaches running sessions on their next request (like `pool use` today).
4. **`passthrough` is the default and the floor.** The daemon degrades to it whenever it cannot pool (see §6), so the session never breaks — except where policy deliberately chooses a loud, actionable error (shared/backend, §6).

**Command model (the precise contract):**

| Action | `ANTHROPIC_BASE_URL` wiring | Daemon | Mode flag |
|---|---|---|---|
| install (`curl \| bash`) | wire → `127.0.0.1:<port>` (capture prior) | register + start (launchd) | `passthrough` |
| `pool start` | untouched | untouched (always on) | → `swap` |
| `pool stop` | untouched | untouched (always on) | → `passthrough` |
| `proxy off` ("back to normal") | unwire → restore prior | bootout / stop | — |
| `proxy on` (re-enable) | re-wire | register + start | `passthrough` |
| uninstall | unwire → restore prior | bootout + disable + remove | remove state |

---

## 4. Component specifications

### 4.1 The launchd agent

Model on `_analytics_plist_xml`/`ensure_analytics_agent`. New label `ai.devxlabs.claudex.proxy`, plist at `~/Library/LaunchAgents/ai.devxlabs.claudex.proxy.plist`.

```
Label                ai.devxlabs.claudex.proxy
ProgramArguments     [<exe>, proxy, serve]          # exe = _self_path()
RunAtLoad            true                            # start at login (post-reboot)
KeepAlive            true                            # restart on ANY exit (crash, kill -9, OOM)
ThrottleInterval     10                              # crash-loop backoff (launchd min)
ProcessType          Interactive                     # latency-sensitive, not nice'd like analytics
EnvironmentVariables PYTHONUTF8=1, LANG=en_US.UTF-8  # launchd has no locale (the analytics UTF-8 fix)
StandardOutPath/Err  ~/.claude-accounts/proxy.log
```

- **`KeepAlive=true` (unconditional)**, not `{SuccessfulExit:false}` — we *always* want it up. The only real teardown is uninstall/panic-off (§4.6), which `bootout`s the job so KeepAlive can't fight it. (Verified: `disable` alone does NOT stop a loaded KeepAlive job — only `bootout` does.)
- **`ensure_proxy_agent()`** (mirror of `ensure_analytics_agent`, :4876): idempotent; writes the plist atomically, re-bootstraps only when content changes (self-heals on version upgrade); no-op if a kill-switch env is set or not `_is_compiled()`. Called from `main()` so every invocation self-heals, and the installer's `--version` call registers it.
- **Reboot cold-start belt-and-suspenders:** a Claude Code `SessionStart` hook running `claudex proxy ensure` (the repo already wires `SessionStart` hooks — `_HOOK_EVENTS`, :1406) guarantees the port is live before a session begins, covering the login-ordering gap.

### 4.2 The daemon (`proxy serve`)

- **Bind-first:** bind `127.0.0.1:8848` *before* any network/keychain/config load, so the port answers in milliseconds after a restart (fixes the remote-pull health race, P-E3). Config loads asynchronously; until loaded, the daemon serves `passthrough`.
- **Mode read live:** effective request path chosen from the persisted flag (§4.3), mtime-cached like `_selected_member_id` (:1987) so a toggle reaches running sessions with no restart and no per-request file read.
- **Two request paths (both already exist):** `swap` → `_proxy_failover`/`_proxy_selected`; `passthrough` → `_proxy_passthrough` (forwards the client's own `Authorization` verbatim, no token handling).
- **Hardening (mandatory — always-in-path):**
  - Wrap `serve_forever` and every handler so one bad request can never kill the loop (P-A7, P-B3).
  - **Bounded** thread/connection pool + backpressure, not unbounded `daemon_threads` (P-I1).
  - Close upstream connections in `finally` on every path (P-I2, P-B3).
  - **Log rotation** on `proxy.log` (size-capped) — an always-on daemon logging every request will otherwise fill the disk (P-M3).
  - **Monotonic clock** (`time.monotonic()`) for cooldowns/idle; wall clock only for server-provided absolute token expiry (P-K1).
  - **Identity** on `/__pool/health`: return a per-daemon token so `status`/`ensure`/health never trust a foreign listener on 8848 (P-E1, P-E5, P-D5).
  - Short **connect** timeout separate from the long read/stream timeout so a black-hole network fails over fast, not after 300s (P-G1/P-B2).

### 4.3 Persisted mode flag / state

- **File:** `~/.claude-accounts/proxy.json` (new; keep `pool.json` for legacy during migration). Atomic writes (tmp+`os.replace`, as `_pool_write_state`), tolerant reads with a *validated* default (never silently collapse a corrupt file into behavior that loses data — the P-D3 lesson).
- **Schema:**
  ```json
  { "mode": "passthrough" | "swap",
    "port": 8848,                       // actual bound port (may differ if 8848 was taken — decision #4)
    "upstream": "https://api.anthropic.com",  // or the user's prior base URL, when chaining (decision #3)
    "poolKind": "local" | "shared" | "backend" | null,
    "autoDegrade": false,               // opt-in silent fallback for shared/backend (decision #1)
    "wiredBaseUrlPrev": "<user's prior ANTHROPIC_BASE_URL or null>",
    "version": "<binary version that wrote it>" }
  ```
- **`mode` is the DESIRED mode.** Effective behavior may degrade `swap`→`passthrough` when pooling isn't possible (§6). Persisted, so after a reboot the daemon resumes the user's chosen mode.
- **Default `mode = passthrough`** at install (safe floor; no pooling until the user opts in with `pool start`).

### 4.4 Install-time configuration

Two touch-points:
1. **`packaging/install.sh`** (the `curl … | bash` installer): after placing the binary, run an explicit `"$DEST" proxy install` (clearer than relying on the `--version` side-effect), which:
   - `ensure_proxy_agent()` → write plist + `enable` + `bootstrap` (daemon comes up via RunAtLoad).
   - `ensure_wired()` → set `env.ANTHROPIC_BASE_URL=http://127.0.0.1:8848` in `settings.json`, **capturing any pre-existing value** into `proxy.json.wiredBaseUrlPrev` (including a non-loopback like a corp gateway — fixes the P-F2/P-F3 clobber bug where prior loopback URLs were lost).
   - default `mode=passthrough`.
   - **Opt-out:** `CLAUDEX_PROXY_OFF=1` skips all of this (mirrors `CLAUDEX_ANALYTICS_OFF`). Some users won't want a permanent in-path proxy; respect that.
2. **`main()`**: `ensure_proxy_agent()` self-heals the agent on every invocation (re-bootstrap on version change), so upgrades and manual runs keep it healthy.

Idempotency/upgrade-safety: re-running the installer or upgrading must not double-register, must not re-clobber `wiredBaseUrlPrev`, and must re-bootstrap the plist when the binary version changes (the analytics agent's content-hash check pattern).

### 4.5 CLI changes

Two clearly-separated concerns: **mode** (token-swap on/off — the `pool` verbs) and **routing** (is the proxy in the path at all — the `proxy` verbs).

- **`pool start`** → set `proxy.json.mode=swap` (+ validate accounts/pool config exist; load tokens). **Only** flips the flag — does not spawn a process, does not edit `settings.json`. Reaches running sessions live.
- **`pool stop`** → set `mode=passthrough`. **Only** flips the flag — does not kill anything, does not edit `settings.json`. The "sessions keep working" promise becomes structural (the daemon is always up in passthrough), and the 15-min idle self-exit (P-C1) is **deleted**.
- **`pool status` / `pool use`** → unchanged verbs; status also reports routing (wired? daemon healthy, identity-checked?) and effective vs desired mode.
- **`claudex proxy on`** → the routing enable: register+start the agent and wire `ANTHROPIC_BASE_URL` (capturing prior). Normally done by install; exposed for re-enabling after `proxy off`.
- **`claudex proxy off`** → **"back to normal"**: unwire `ANTHROPIC_BASE_URL` (restore prior), stop/bootout the daemon. Reversible with `proxy on`. This is the escape hatch for users who don't want interception — **distinct from `pool stop`** (which keeps the proxy in the path, just transparent).
- **`claudex proxy {status|ensure|restart}`** → `status` (routing + daemon health), `ensure` (SessionStart-hook entry: start if unhealthy), `restart`.
- **Back-compat:** keep `pool start/stop/use/status` working with the new semantics; the legacy `claude-auth` alias still resolves (install.sh already symlinks it).

### 4.6 `proxy off` (reversible) and uninstall (full teardown)

Because `pool start`/`pool stop` no longer touch routing, taking the proxy out of the path is explicit. Both paths must **unwire before/as the daemon goes away**, or the wiring would strand every session at a dead port (Group A).

- **`proxy off` (reversible "back to normal"):** restore `settings.json` `ANTHROPIC_BASE_URL` to `wiredBaseUrlPrev` (or remove the key), then `launchctl bootout` the agent. Leaves the plist/state so `proxy on` can re-enable. Ordering: **unwire first, then stop** (new sessions go direct immediately; the daemon lingers only for already-open sessions until it's booted out — or keep it briefly in passthrough during a drain, TBD in Phase 4).
- **uninstall:** `proxy off` semantics **plus** `launchctl disable` (no relaunch at next login), remove the plist and `proxy.json`. `uninstall.sh` must call this — today it only removes the binary, which would leave a wired, dead port.

---

## 5. Real-world scenario matrix

Legend: ✅ handled by design · ⚠️ handled with residual risk · ❗ needs a decision (§11). Catalog IDs in brackets.

### Install / lifecycle
| # | Scenario | Behavior under this design | Catalog |
|---|---|---|---|
| 1 | Fresh `curl\|bash` install | plist registered, daemon up (passthrough), base URL wired, prev captured | — |
| 2 | Re-install / upgrade | idempotent; plist re-bootstrapped on version change; wiring & prev untouched | — |
| 3 | Install with a pre-existing `ANTHROPIC_BASE_URL` (corp gateway) | ✅ **chain**: store it as the daemon's upstream, forward to it (not straight to Anthropic); restore on `proxy off`/uninstall | P-F2/F3 |
| 4 | Install over an already-running old-style pool | detect legacy `pool.pid`/state, migrate (§8), bootout old, adopt agent | P-D5 |
| 5 | Port 8848 already taken at install/boot | ✅ **auto-pick next free port**, wire that, persist in `proxy.json.port`; never crash-loop | P-E2/P-E1 |
| 6 | Headless / SSH install (no GUI `aqua` session) | `launchctl bootstrap gui/$UID` may fail; ⚠️ detect, degrade to "not installed as agent," warn; don't wire a dead port | new |
| 7 | `~/.local/bin` not on PATH | installer already fixes PATH; agent uses absolute `_self_path()` so unaffected | — |
| 8 | Uninstall | bootout+disable, unwire (restore prev), remove plist+state | Group A |

### Runtime resilience
| # | Scenario | Behavior | Catalog |
|---|---|---|---|
| 9 | Reboot / power loss | RunAtLoad restarts at login; bind-first + SessionStart-hook cover the cold-start gap | P-A1/A2 |
| 10 | `kill -9` / crash / OOM | KeepAlive relaunches within ~1s; ⚠️ sub-second gap (bind-first shrinks it) | P-A4/A5/A8 |
| 11 | External `SIGTERM`/`killall` | KeepAlive relaunches; only teardown is bootout (uninstall/off) | P-A6 |
| 12 | Crash-loop (bug/bad input) | ThrottleInterval backs off; serve-loop hardening should make a per-request bug non-fatal | P-A7 |
| 13 | Sleep / wake | daemon frozen/thawed intact; monotonic clock prevents idle/cooldown corruption | P-K1/P-C3 |
| 14 | Port stolen after boot by another app | ⚠️ health identity check detects "not ours"; alternate-port fallback (❗ §11) | P-E1/E5 |
| 15 | Disk full / store unwritable | log rotation caps growth; daemon keeps serving (log writes best-effort) | P-M3/P-D2 |
| 16 | `proxy.json` corrupt/missing | validated read → default `passthrough` (never lose `wiredBaseUrlPrev`); atomic writes | P-D3 |

### Mode toggling & serving
| # | Scenario | Behavior | Catalog |
|---|---|---|---|
| 17 | `pool start` (→swap) mid-session | next request in any open session is pooled; no restart | — |
| 18 | `pool stop` (→passthrough) mid-session | next request forwards own token; session keeps working; no 15-min fuse | P-C1 |
| 19 | Swap on, but no accounts / not loaded yet | degrade to passthrough (session works); status shows "swap requested, not ready" | P-G5 |
| 20 | Swap on, backend/Pantry unreachable | ❗ policy (§6): transient→retry; sustained→ *shared/backend* fail-loud actionable error, *local* degrade to own token | P-G2 |
| 21 | Swap on, all accounts rate-limited | retryable 429 w/ Retry-After + message; local may fall to own token | P-G3 |
| 22 | Upstream (Anthropic) blip | short connect-timeout + retry; pass real retryable error through, no synthetic 502 | P-G1 |
| 23 | In-flight stream when mode toggles | per-request mode snapshot keeps each request consistent; no mid-stream identity flip | P-B5 |
| 24 | Concurrent sessions + subagents | one always-on daemon; bounded pool + fairness so one heavy user can't starve others | P-I1/I3 |
| 25 | Passthrough mode & the account's own token is invalid | upstream 401 passed through transparently (client re-auths); daemon holds no tokens so it can't make it worse | P-C4 |

### Environment / safety
| # | Scenario | Behavior | Catalog |
|---|---|---|---|
| 26 | User already has their own `ANTHROPIC_BASE_URL` and doesn't want interception | `CLAUDEX_PROXY_OFF=1` at install; `proxy off` later; prev restored | P-F1 |
| 27 | Running as a different user / sudo | agent is per-`gui/$UID`; detect cross-user, refuse cleanly (catch `PermissionError`) | P-L2 |
| 28 | `CLAUDE_AUTH_UPSTREAM_*` test vars leak into the always-on daemon | gate behind an explicit test flag; never honored in the installed agent | P-L1 |
| 29 | The daemon itself is the thing that breaks all Claude Code | this is the blast-radius risk — mitigated only by §7 hardening + fast self-heal + passthrough floor | — |

---

## 6. Failure & degradation contract ("never surface a pool error")

Per **effective** request outcome:
- **Passthrough mode:** forward the client's own token; relay upstream status/body **verbatim** (never synthesize). The floor: if Anthropic is reachable, the session works on its own credentials.
- **Swap mode, transient failure** (blip, momentary backend hiccup): retry briefly; if it recovers, the user never sees it.
- **Swap mode, sustained failure:**
  - **Local pool** (user's own accounts): silently degrade to the user's own token (it's all theirs; no consent/attribution issue).
  - **Shared/backend pool:** ❗ **policy decision** (carried from the earlier discussion) — default to a **clear, actionable error** ("pool backend unavailable — run `claudex pool stop` to fall back to your own token, then retry"), because silently spending a pooled/other-member token or the user's own token without asking is wrong. Offer an opt-in `auto-degrade` setting for users who prefer "keep working on my own token, just warn me."
- **Upstream errors** (Anthropic 5xx/overloaded): pass the real, retryable-shaped error through so Claude Code's own retry engages; only synthesize when truly unreachable, and shape it retryable.
- **Never** emit a fatal, pool-branded `502/503` that a session treats as terminal when a working fallback exists.

---

## 7. Security, privacy & good-citizen requirements (non-negotiable, because always-in-path)

- **Passthrough holds no secrets:** no token injection, no OAuth refresh, no persistence — so "off" cannot churn/rotate/break the user's account (the 2026-07-13 root cause). This must be preserved as an invariant and tested.
- **Transparency:** the proxy sees every request. Document it, make it trivially disable-able (`CLAUDEX_PROXY_OFF`, `proxy off`), and never exfiltrate (drop the internal `X-Claude-Auth-Account` header from responses — P-H6; never allow the plaintext-upstream downgrade in the installed agent — P-L1).
- **Bounded footprint:** idle CPU ~0, bounded threads/FDs, rotated logs. An always-on daemon must not degrade the machine over weeks.
- **Clean, complete uninstall** that restores the world (unwire + bootout + disable + remove state).

---

## 8. Migration & backward compatibility

- Existing users have a `pool.pid`/`pool.json` and possibly a running old-style daemon wired to 8848.
- On first run of the new binary: detect the legacy layout, `bootout`/kill the old detached daemon if present, register the launchd agent, migrate `pool.json` → `proxy.json` (carry `prevBaseUrl`→`wiredBaseUrlPrev`, and current running/passthrough → `mode`).
- Keep `pool start/stop/use/status` verbs and the `claude-auth` alias working.

---

## 9. Phased implementation plan

Each phase is independently shippable, isolated-testable, and reversible. **No phase touches the live account, live pool, or real `settings.json` in tests** (§10).

**Phase 0 — Daemon hardening (no behavior change, safe to land first). — ✅ DONE**
Delivered in `bin/claudex` (branch `feat/pool-launchd-supervisor`): serve-loop wrapped to log a crash before exit; `_BoundedThreadingHTTPServer` caps concurrent request threads (`POOL_MAX_WORKERS`, semaphore backpressure); every proxy path closes the upstream conn in `finally` and `_send` closes on error (no FD leak); size-based `pool.log` rotation (`POOL_LOG_MAX` → `pool.log.1`); monotonic clock for cooldowns + passthrough-idle (wall clock kept only for server-provided token expiry); `service`/`instanceId` identity on the `/__pool/health` snapshot; split connect (`_UPSTREAM_CONNECT_TIMEOUT=10s`) vs read (`_UPSTREAM_READ_TIMEOUT=300s`) timeouts via `_upstream_exchange`.
*Tests:* `tests/test_pool_hardening.py` (14 tests) + an isolated end-to-end drive (fake pool, mock upstream) confirming swap/passthrough still behave identically. Full suite: 45/45 green. No contact with the live account/pool/launchd.

**Phase 1 — launchd supervision + bind-first. — ✅ DONE**
Delivered in `bin/claudex`: `PROXY_LABEL`/`PROXY_PLIST`/`PROXY_PID`/`PROXY_LOG` + `_proxy_off()` kill-switch; `_proxy_plist_xml()` (RunAtLoad + KeepAlive + ThrottleInterval=10 + ProcessType Interactive + UTF-8 env); `ensure_proxy_agent(port)` / `remove_proxy_agent()` (idempotent, content-hash fast path, enable→bootout→bootstrap; gated on `_is_compiled()` + kill-switch); `_proxy_serve()` **binds first** then serves transparent passthrough (mode flag + async pool load = Phase 2); `_proxy_pid()`; a hidden `proxy {serve|ensure|off|uninstall|status}` command; `_control` now emits the `service`/`instanceId` identity even before a pool loads.
**Kept fully inert:** NOT wired into `main()` or the installer, so nothing registers an agent or rebinds the live pool yet — activation is Phase 3.
*Tests:* `tests/test_proxy_agent.py` (10 tests: plist content, ensure/remove with mocked `launchctl`, real bind-first daemon on an ephemeral port forwarding the client's own token, health identity). **Real-launchd validation** with a throwaway sandbox label confirmed our exact plist shape: RunAtLoad starts it, `kill -9` → KeepAlive relaunches, bootout+disable stops it with no relaunch. Full suite: 55/55 green. Verified the real `ai.devxlabs.claudex.proxy` agent is NOT registered on the dev machine.

**Phase 2 — persisted mode flag + live toggle. — ✅ DONE**
Delivered in `bin/claudex`: `proxy.json` state (`_proxy_state_read/write`, atomic, tolerant) with a mtime-cached live read `_proxy_mode()` (default = safe floor `passthrough`; corrupt/unknown → passthrough) and `_proxy_set_mode()`. `PROXY_SUPERVISED` makes `_proxy` route by the live flag and **degrade swap→passthrough (never a 503)** when the pool isn't ready/empty; the legacy `pool serve` path is byte-unchanged (still 503). `_proxy_serve` now runs a maintenance thread that **lazily builds the pool when swap is requested and releases it (POOL=None, no refresh) in passthrough** — preserving "passthrough holds no tokens"; plus periodic shared-pool flush/reload and a final flush on shutdown. `pool start`/`pool stop` additionally write the flag (additive; the Phase-3 install completes the cutover). `proxy mode [swap|passthrough]` command + status shows the mode. The always-on daemon has **no idle self-exit** (P-C1/P-C2 gone by construction).
*Tests:* `tests/test_proxy_mode.py` (11 tests: flag read/write/default/corruption/atomic-merge/live-reload; supervised routing for passthrough/swap/degrade; legacy 503 unchanged) + an end-to-end drive proving a live `pool start`→`pool stop` flip switches a running daemon swap↔passthrough with **no restart** and releases the pool in passthrough. Full suite: 66/66 green. No writes to the real store; no agent registered.

**Phase 3 — install-time configuration.**
`claudex proxy install`; wire base URL once with prev-capture; `CLAUDEX_PROXY_OFF` opt-out; hook into `packaging/install.sh` and `main()`; upgrade idempotency.
*Tests:* installer dry-run in a temp `HOME`; wiring capture/restore unit tests; upgrade re-bootstrap test.

**Phase 4 — uninstall / panic-off + identity + port-conflict.**
`proxy off`/`uninstall`, `uninstall.sh` integration; health identity checks; alternate-port fallback (per §11 decision); SessionStart `ensure` hook.
*Tests:* teardown restores wiring; identity check rejects a foreign listener; port-conflict path.

**Phase 5 — degradation contract polish.**
Implement §6 rules; the shared/backend fail-loud vs auto-degrade setting.
*Tests:* each degradation branch with mock backends/upstreams.

---

## 10. Testing strategy (isolation is mandatory)

- **Unit/module tests** (existing `tests/` pattern, `python3 -m unittest`): import `bin/claudex` via `_harness.cx`; **mock** `subprocess`/`launchctl`, `urllib`/`http.client`, the clock, and the filesystem via a temp `STORE_DIR`. No real Anthropic traffic, no token rotation, no launchd writes to the real domain.
- **launchd behavior** is validated only with a **sandbox throwaway label** and cleaned up in a `trap` (as done in the design-verification probe), never the user's real agent.
- **Never** in automated tests: launch `claude` with the real account, run `claudex pool …` against the live 8848 pool, or edit the real `~/.claude/settings.json` / `~/.claude.json`.
- **Manual/integration checklist** (run by a human in a disposable VM/account, for things unit tests can't cover): real reboot, real `kill -9` relaunch timing, real `curl|bash` install, real uninstall restore.

---

## 11. Open decisions (need sign-off before/while building)

1. **[RESOLVED] Shared/backend sustained-failure policy (§6):** **default = clear, actionable error** (never silently spend tokens); **plus an opt-in setting** (`autoDegrade`) for users who prefer "keep working on my own token, just warn me." Transient failures still retry silently; local pools still degrade to the user's own accounts silently.
2. **[RESOLVED] Install-time auto-wire.** Decision: **wire at install**; everything routes through the proxy from install onward. `pool start`/`pool stop` only flip the mode flag; a separate `proxy off` reverts routing to normal (reversible), and uninstall reverts it automatically. `CLAUDEX_PROXY_OFF=1` opt-out at install + a visible notice.
3. **[RESOLVED] Pre-existing user `ANTHROPIC_BASE_URL` (scenario 3):** **chain through it** — claudex's proxy forwards to the user's existing endpoint as its upstream (instead of straight to `api.anthropic.com`), so a corporate gateway keeps seeing all traffic and pooling layers on top. Store the prior value as the upstream target; restore on `proxy off`/uninstall. (Implication: the daemon's upstream host is now configurable, not hard-coded to Anthropic.)
4. **[RESOLVED] Port-conflict fallback (scenario 5/14):** **auto-pick the next free port** — try the default (8848), else scan for a free loopback port, wire Claude Code to whatever was chosen, and persist it in `proxy.json.port`. No user action needed.
5. **[RESOLVED] Default mode at install:** `passthrough` — safe floor, no token-swap until the user runs `pool start`.
6. **[RESOLVED] Headless/no-GUI (scenario 6):** **skip the agent + do NOT wire, just warn.** If there's no `gui/$UID` session to host the launchd agent, we never point Claude Code at a proxy we can't keep alive. claudex commands still work manually.

---

## 12. What this buys us (mapped to the catalog)

- **Group A (dead-but-wired port) — eliminated:** launchd keeps a listener always present; bind-first + SessionStart cover restart/boot gaps.
- **Group C (passthrough shim) — eliminated:** passthrough is a permanent mode of an always-on daemon; the 15-min fuse and the never-exits bug are gone.
- **Group F (wiring drift) — largely eliminated:** wired once at install, prev captured/restored; start/stop never touch settings.
- **Group G (proxy emits hard errors) — contained** by §6 degradation + upstream-transparent retryable errors.
- **Groups D/E/I/K/M — reduced** by the Phase-0 hardening + identity checks the always-in-path bar forces us to do.

Residual, irreducible: the sub-second self-heal window after a `kill -9`, a genuinely-down Anthropic, and a user with no personal token to fall back to (all documented, none fatal).
