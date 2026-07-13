# Pool Resilience — Production Readiness Analysis

> **Status:** Phase 1 — scenario discovery (problem statements only, no solutions yet).
> **Code basis:** `claudex` v2.1.1 (`bin/claudex`), the current public source of truth.
> **Scope of this phase:** the **local proxy server (`pool serve` daemon) process lifecycle**
> ONLY. Token semantics (refresh rotation, minting, expiry) are a **separate later phase**.

## Why this exists

We are moving `claudex pool` from a power-user tool to production. In production we cannot
control the user's machine: it will be rebooted, put to sleep, force-killed (`kill -9`), run out
of disk, lose network, have Claude Code updated underneath us, etc.

**The North Star:** a user's Claude Code sessions must **never** surface a pool-related error, in
any lifecycle scenario. If the pool cannot serve, the failure must be invisible to the running
`claude` session (degrade to the user's own token, or fail transparently), never a broken session.

## Method

Three independent agents brainstormed failure scenarios from different lenses so nothing is
missed, then the results were de-duplicated and compiled:

- **Lens A — OS & process lifecycle:** reboot, shutdown, logout, sleep/wake, signals, OOM, crashes, orphaning, PID reuse.
- **Lens B — Claude Code client experience & wiring:** what CC actually sees (connection-refused, mid-stream aborts), `settings.json` / `ANTHROPIC_BASE_URL` drift, concurrent sessions.
- **Lens C — Daemon internal state, concurrency & environment:** state/PID file integrity, port binding, disk/permissions, threading, network-to-backend during serve, clock, resource leaks.

## Documents

- [`proxy-lifecycle-scenarios.md`](./proxy-lifecycle-scenarios.md) — the compiled scenario catalog (this phase).
- [`always-on-proxy-design.md`](./always-on-proxy-design.md) — design + phased plan to repurpose the proxy as an always-on, launchd-supervised indirection point with a live persisted mode flag (swap vs passthrough). Phases 0–2 implemented (commit `34aec26`).
- [`phase3-plan.md`](./phase3-plan.md) — detailed execution plan for Phase 3 (install-time wiring + routing cutover — the first phase that changes behavior for installed users). Needs sign-off before landing sub-phase 3d.
- [`tools/logserver.py`](./tools/logserver.py) — transparent logging proxy used to empirically verify base-URL behavior.

## Out of scope (tracked for later phases)

- Token lifecycle: refresh-token rotation/reuse, access-token expiry, minting races, Keychain/Secret Manager failures.
- Backend/API availability, dashboard, join-link flows.
- Shared (Pantry) pool crypto/consistency.

These will get their own analysis once the proxy-lifecycle catalog is agreed and solutions are designed.
