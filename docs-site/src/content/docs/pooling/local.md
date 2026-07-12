---
title: Local pool
description: Pool your own accounts behind one endpoint.
sidebar:
  order: 2
---

Runs a proxy pooling all *your* accounts behind one endpoint, with auto-failover on rate limits.

```bash
claudex pool start                 # spawn the daemon + wire ANTHROPIC_BASE_URL into settings.json
claudex pool status                # pid/port/mode, per-account served/failover counts, health
claudex pool stop                  # graceful: flip to a passthrough shim so live sessions keep working
claudex pool stop --now            # hard kill immediately
```

**Flags:** `--port` (default 8848), `--mode failover|balance`, `--no-wire` (print the URL instead of
editing `settings.json`), `--local` (force a local pool even if a shared pool is joined).

- **Graceful stop:** by default `pool stop` flips the proxy to a passthrough shim (each request
  forwarded with its own token) so running sessions don't break; the shim self-exits after 15 min
  idle.
- Reads all accounts from the Keychain, proxies to the real API, writes `pool.pid`/`pool.json`/`pool.log`.
