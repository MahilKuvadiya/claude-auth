---
title: sessions
description: List your Claude Code sessions.
sidebar:
  order: 1
---

Lists recent Claude Code sessions straight from disk (`~/.claude/projects/*/*.jsonl`) — id, project
(cwd), git branch, auto-title, context size, idle time; `●` marks sessions the keep-warm proxy has
captured. This is how you find an id/project to hand to **[keep-warm](/sessions/keep-warm/)**.

```bash
claudex sessions            # 25 most recent
claudex sessions --limit 50
```

No network, no Keychain — local disk only.
