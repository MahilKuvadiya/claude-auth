---
title: autoswitch
description: Hop to a fresher account when usage crosses a threshold.
---

Auto-switches to a fresher account when the active one's usage crosses a threshold — and installs
Claude Code hooks so it only fires while a session is **idle**, never mid-prompt.

```bash
claudex autoswitch on                       # enable + install hooks
claudex autoswitch off                      # disable + remove hooks
claudex autoswitch status                   # (default) show state
claudex autoswitch run                      # run one check now
claudex autoswitch on --threshold 85 --window session --strategy lowest
```

**Flags:** `--threshold <pct>` (default 90), `--window session|week` (default session/5-hour),
`--strategy next|lowest` (`next` = round-robin, `lowest` = most headroom; default `next`),
`--interval <secs>` (min between checks, default 120), `--force`, `--dry-run`, `--quiet`.

**How the hooks guarantee no mid-prompt switch:**
- A **`Stop`** hook fires the instant a response finishes.
- A **`SessionStart`** hook does a synchronous pre-flight switch before a new session loads
  credentials.

It reads active usage (network), picks another account with headroom, swaps the credential, posts a
macOS notification, and logs to `~/.claude-accounts/autoswitch.log`. Edits `settings.json` hooks +
the Keychain.
