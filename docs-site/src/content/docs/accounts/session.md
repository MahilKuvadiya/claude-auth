---
title: session
description: Run one Claude Code process pinned to an account.
sidebar:
  order: 4
---

Runs **one** Claude Code process pinned to a chosen account — without touching the global login or
any other running session.

```bash
claudex session work                 # launch claude pinned to "work"
claudex session work --no-launch     # print ANTHROPIC_BASE_URL instead of launching
claudex session work -- --model opus # pass args through to claude
```

How it works: because macOS has one process-global Keychain item, isolation is done at the
**network layer** — claudex spins up a loopback proxy pinned to that one account and hands only the
child `claude` its own `ANTHROPIC_BASE_URL` (an env var wins even over a running pool). No daemon,
no files; the proxy dies with the session.
