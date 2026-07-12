---
title: refresh
description: Keep inactive accounts' tokens live.
sidebar:
  order: 2
---

Exchanges each **inactive** account's refresh token for a fresh one, so usage stays live and a
future switch never lands on a dead token.

```bash
claudex refresh          # all inactive accounts
claudex refresh work     # just one
```

- Only touches inactive accounts — the active one is owned by Claude Code.
- Calls Anthropic's OAuth token endpoint and writes the rotated token back to that account's
  Keychain backup.
