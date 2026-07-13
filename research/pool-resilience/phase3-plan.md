# Phase 3 — Install-time wiring & routing cutover (EXECUTION PLAN, needs sign-off)

> **This is the first phase that changes behavior for installed users and touches
> the live machine.** Nothing here is implemented yet. Reviewing this before any code.
> **Branch:** `feat/pool-launchd-supervisor` (Phases 0–2 committed at `34aec26`).
> **Prereqs:** Phase 0 (hardening) ✅, Phase 1 (launchd agent, inert) ✅, Phase 2 (mode flag) ✅.

---

## 0. What changes, in one paragraph

Today the proxy only exists while you're pooling: `pool start` spawns it + wires
`ANTHROPIC_BASE_URL`; `pool stop` parks/kills it + unwires. After Phase 3, the proxy
is **installed and wired once at install time** and kept alive by launchd forever;
`pool start`/`pool stop` stop spawning/killing anything and become **pure mode-flag
toggles** (swap ↔ passthrough) — which Phase 2 already built and proved. Taking the
proxy out of the path (back to talking to Anthropic directly) becomes an explicit,
reversible `proxy off`, and uninstall does it automatically.

**Blast-radius reality:** from install onward the proxy is in front of *every* Claude
Code request. Phase 0 hardening + the passthrough floor make that safe, but this is
the phase where a bug reaches all users — so it ships behind a fast opt-out and a
thorough manual test in a throwaway account/VM before release.

---

## 1. Scope (what Phase 3 delivers)

1. **`proxy on` / `proxy install`** — register the launchd agent (Phase 1 `ensure_proxy_agent`) **and** wire `ANTHROPIC_BASE_URL`, capturing any prior value. Idempotent.
2. **`proxy off`** — unwire (restore prior) + bootout/disable the agent. Reversible via `proxy on`.
3. **Install hook** — `packaging/install.sh` (the `curl|bash` path) and `install.sh` (local) call `claudex proxy install` after placing the binary; `CLAUDEX_PROXY_OFF=1` skips it.
4. **`main()` self-heal** — `ensure_proxy_agent()` runs on every invocation *only if already opted in* (a marker exists), mirroring `ensure_analytics_agent`, so upgrades re-bootstrap the agent but a user who ran `proxy off` is never re-enrolled.
5. **Port auto-pick** — bind 8848 else next free loopback port; persist in `proxy.json.port`; wire that port.
6. **Chain-through** — if the user already had `ANTHROPIC_BASE_URL`, store it as the daemon's **upstream** (not just a restore value) so their gateway keeps receiving traffic; `_upstream_host`/`_upstream_conn` read the configured upstream.
7. **Headless/no-GUI guard** — if `launchctl bootstrap gui/$UID` can't work (no Aqua session), skip the agent **and** skip wiring; warn; exit success.
8. **`pool start`/`pool stop` cutover** — stop spawning/parking a daemon; they only flip the flag (Phase 2 logic) and no longer touch `settings.json`.
9. **`pool status` / `doctor`** — report the new world (agent state, wired port, effective+desired mode, upstream).
10. **Migration** — detect a legacy running `pool serve` + `pool.pid` and transition without stranding a session.
11. **`uninstall.sh`** — call `proxy off` semantics (unwire + bootout + disable + remove state) before removing the binary.

Out of scope (later): the §6 degradation polish (Phase 5), SessionStart `ensure` hook hardening (can land here or Phase 4), identity-checked health enforcement in `_pool_wait_health` (Phase 4).

---

## 2. State & wiring model

`proxy.json` (extends Phase 2):
```json
{ "mode": "passthrough",              // Phase 2
  "port": 8848,                       // actual bound port (auto-picked)
  "upstream": "https://api.anthropic.com",  // or the user's prior base URL (chain-through)
  "wiredBaseUrlPrev": "<prior ANTHROPIC_BASE_URL or null>",  // for exact restore on off/uninstall
  "enrolled": true,                   // opt-in marker: main() only self-heals the agent if true
  "autoDegrade": false,               // Phase 5
  "version": "<binary version>" }
```

- **`enrolled`** is the critical opt-out anchor: `proxy off` clears it, so `main()`'s self-heal never re-adds the agent behind the user's back. `proxy on`/install sets it.
- **`wiredBaseUrlPrev`** is captured **once** at first wire and never overwritten while enrolled (fixes P-F3, where a re-start wiped the saved gateway).

Wiring rules (`_wire_base_url`/`_unwire_base_url`, extended):
- On wire: read current `settings.json` `env.ANTHROPIC_BASE_URL`.
  - none → just set ours; `wiredBaseUrlPrev=null`.
  - a non-loopback (corp gateway) → **chain**: set `upstream=that`, `wiredBaseUrlPrev=that`, set ours.
  - already our own loopback → no-op (idempotent; don't self-capture, the P-F3 bug).
  - some other loopback (another tool) → capture as `wiredBaseUrlPrev`, warn.
- On unwire: restore `wiredBaseUrlPrev` (or delete the key). Never delete a value we didn't set.

---

## 3. Exact touch-points in code

| Area | Function(s) | Change |
|---|---|---|
| upstream target | `_upstream_host`, `_upstream_conn` | read `proxy.json.upstream` (fallback to env test-var, then `api.anthropic.com`) so chain-through works |
| wiring | `_wire_base_url`, `_unwire_base_url` | capture-once `wiredBaseUrlPrev`; chain-through; idempotent for our own port |
| port pick | new `_pick_proxy_port()` | try DEFAULT_POOL_PORT, else scan for a free 127.0.0.1 port |
| agent self-heal | `main()` | call `ensure_proxy_agent(port)` **only if `proxy.json.enrolled`** and `_is_compiled()` |
| commands | `cmd_proxy` | add `on`/`install` (ensure agent + wire + enroll), make `off` clear enroll + unwire |
| pool cutover | `_pool_start`, `_pool_stop` | drop the Popen/SIGUSR1/`_wire`/`_unwire`; keep only the flag write (Phase 2) + user messaging |
| status | `_pool_status`, `doctor` | reflect agent + wired port + mode + upstream |
| installer | `packaging/install.sh`, `install.sh` | `"$DEST" proxy install` (unless `CLAUDEX_PROXY_OFF`) |
| uninstall | `uninstall.sh` | `"$DEST" proxy off` before `rm` |
| migration | `_pool_start` / a one-shot in `main()` | detect legacy daemon, bootout, adopt agent |

**Legacy `_pool_serve` stays** for now (the agent uses `_proxy_serve`); we remove it in a later cleanup once the cutover is proven.

---

## 4. Scenario walk-through (what a user experiences)

| # | Situation | Phase-3 behavior |
|---|---|---|
| 1 | Fresh `curl\|bash` install | agent registered, daemon up (passthrough), `ANTHROPIC_BASE_URL` wired to the picked port, `enrolled=true`. `claude` works immediately (own token). |
| 2 | User runs `pool start` | flag→swap; running + new sessions pool on next request. No process spawn, no settings edit. |
| 3 | User runs `pool stop` | flag→passthrough; sessions keep working on own token. Proxy stays in path. |
| 4 | User wants OUT | `claudex proxy off` → unwire (restore prior/none) + agent removed + `enrolled=false`. `claude` talks to Anthropic directly again. Reversible with `proxy on`. |
| 5 | Reboot | agent RunAtLoad brings the daemon back at login; bind-first answers instantly. |
| 6 | `kill -9` the daemon | KeepAlive relaunches within the throttle window. |
| 7 | Upgrade (`claudex update` / re-install) | `main()` sees `enrolled=true` → re-bootstraps the agent with the new binary/port. Wiring + prev untouched. |
| 8 | Had a corp gateway in `ANTHROPIC_BASE_URL` | chained: proxy forwards to the gateway; `proxy off`/uninstall restores it exactly. |
| 9 | Port 8848 busy | next free port picked + wired + persisted; user never notices. |
| 10 | Headless SSH box | agent + wiring skipped with a clear warning; `claude` unaffected (direct); manual claudex commands still work. |
| 11 | Existing user upgrading from the old pool model | migration: if a legacy `pool serve` is running + wired, bootout it, register the agent, carry `pool.json`→`proxy.json`, keep the port wired the whole time (no dead-port window). |
| 12 | Uninstall | `uninstall.sh` unwires + boots out + disables + removes state, then removes the binary. No stranded wiring. |

---

## 5. Risks & mitigations (this is the dangerous phase)

- **R1 — a proxy bug breaks all Claude Code.** *Mitigations:* Phase 0 hardening; passthrough floor (holds no tokens); `CLAUDEX_PROXY_OFF=1` env opt-out honored at install and in `main()`; a dead-simple recovery documented (`claudex proxy off`, or manually delete the `env` block). Ship to a canary/self first.
- **R2 — wiring a dead port (agent failed to start) → connection-refused for everyone.** *Mitigation:* **wire only after** `_pool_wait_health` confirms our own daemon (identity-checked) is answering the picked port. If health fails, do NOT wire; warn. (Order: ensure agent → wait health → wire.)
- **R3 — losing the user's prior `ANTHROPIC_BASE_URL`.** *Mitigation:* capture-once + never-overwrite `wiredBaseUrlPrev`; unit tests for every wire/unwire branch (P-F2/F3 regression tests).
- **R4 — self-heal re-enrolling a user who opted out.** *Mitigation:* `main()` self-heal is strictly gated on `proxy.json.enrolled`; `proxy off` clears it.
- **R5 — migration strands a live session** (bootout the old daemon while a session streams). *Mitigation:* register the new agent and confirm it's healthy on the SAME port *before* booting the old one, so the port is continuously served; accept a brief single-request blip only if unavoidable and document it.
- **R6 — corrupt `proxy.json` → wrong port/upstream.** *Mitigation:* validated reads (Phase 2), safe defaults, `doctor` surfaces mismatch.
- **R7 — the compiled binary can't `bootstrap` in some environments** (MDM, restricted launchd). *Mitigation:* all `launchctl` calls already best-effort + timeout; if bootstrap fails, don't wire; report via `proxy status`/`doctor`.

---

## 6. Testing strategy (unchanged discipline: nothing touches the live setup)

- **Unit (module import + temp HOME/STORE):** wire/unwire branch matrix (none / corp-gateway chain / our-own-port idempotent / other-loopback); `_pick_proxy_port` with a pre-bound socket; `enrolled` gating of `main()` self-heal (mock `ensure_proxy_agent`); migration detection with a fake legacy `pool.pid`/state.
- **Installer:** run `install.sh`/`packaging/install.sh` against a **temp `HOME`** with `launchctl`/network stubbed; assert plist written, `settings.json` wired to the picked port, `enrolled=true`, and `CLAUDEX_PROXY_OFF=1` fully skips.
- **launchd real behavior:** throwaway sandbox label only (as in Phases 1–2), never the real agent.
- **Manual integration checklist** (human, disposable account + VM/second user, pre-release): real `curl|bash` install → reboot → `kill -9` relaunch → `pool start`/`stop` live flip → corp-gateway chain → `proxy off` restore → uninstall restore. This is the gate before the always-on default reaches real users.

---

## 7. Suggested sub-phase landing order (each independently testable)

- **3a — ✅ DONE** — `_upstream_target`/`_parse_upstream` + `_UPSTREAM_OVERRIDE` (chain-through plumbing); `_proxy_serve` sets it from `proxy.json.upstream`. Upstream still defaults to Anthropic; env test-seam unchanged.
- **3b — ✅ DONE** — `_pick_proxy_port` (auto-avoids a busy port); `_proxy_wire`/`_proxy_unwire` (capture-once `wiredBaseUrlPrev`, chain-through a gateway, idempotent for our own port, never touch a foreign value) + `_proxy_state_delete`.
- **3c — ✅ DONE** — `proxy on`/`off`/`install`/`uninstall` commands; `enrolled` marker; `_proxy_health_is_ours` (identity-checked, wire only after our daemon is healthy — no dead/foreign port); `main()` self-heal gated strictly on `enrolled`.
- **3d — NEXT (needs go-ahead)** — installer + uninstaller hooks + `CLAUDEX_PROXY_OFF` + headless guard. *(first step that auto-enrolls on install.)*
- **3e** — `pool start`/`stop` cutover to flag-only + `pool status`/`doctor` messaging + migration.
- **3f** — manual integration pass in a throwaway account/VM; then flip the installer default on.

3a–3c landed safe and inert (like Phases 0–2): the agent + wiring activate only via the explicit `proxy on` command; `main()` never enrolls anyone. Tests: `tests/test_proxy_wiring.py` (14) + an end-to-end `proxy on`→`pool start`→`proxy off` cycle (stubbed launchd/health) proving health-gated wiring, gateway chain+restore, enroll toggle, and no dead-port wiring. Full suite 80/80. Verified on the dev machine: no real `proxy.json`, no agent, `settings.json` untouched; port-pick correctly chose 8849 while the live pool held 8848. **3d is the first step that makes install auto-enroll — checkpoint with the user before landing.**

---

## 8. Decisions (RESOLVED)

- **D1 — install default: [RESOLVED] wire at install, in passthrough.** Install starts the always-on daemon **and** wires `ANTHROPIC_BASE_URL` → proxy immediately, with `mode=passthrough` (forwards the client's own token; holds no tokens). Crash/reboot protection is active from install. **Swap turns on when the user joins or starts a pool** (`pool join` / `pool start` → `mode=swap`); `pool stop` → back to `passthrough`. `CLAUDEX_PROXY_OFF=1` skips the whole thing; `proxy off` reverts anytime. `enrolled` marker still gates `main()` self-heal so an opted-out user is never re-enrolled.
- **D2 — [RESOLVED] `proxy off` leaves the mode flag as-is** (routing is moot while unwired; the next `proxy on` resumes the prior mode).
- **D3 — [RESOLVED] automatic migration:** on first new-binary run, detect a running old-style pool, transition it to the always-on agent (keeping the port served throughout so no session breaks), and carry `pool.json`→`proxy.json`.
- **D4 — [verify during 3b]** the always-on proxy's port-pick must not collide with the `session`/keep-warm loopback servers (they bind ephemeral/other ports — confirm in code).

**Cutover consequence of D1:** since we wire at install in passthrough, `pool start`/`pool stop` become **pure mode-flag flips** and must NEVER touch `settings.json` (wiring is owned by install / `proxy on` / `proxy off`). `pool join` also sets `mode=swap` (joining a pool = intent to use it).
