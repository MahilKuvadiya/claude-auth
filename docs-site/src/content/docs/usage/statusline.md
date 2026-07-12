---
title: statusline
description: A compact status segment for Claude Code's status line.
sidebar:
  order: 3
---

Prints a compact, network-free status segment for Claude Code's status line — e.g.
`● work · wk 57% · ↺ …`.

```bash
claudex statusline              # for Claude Code's statusLine config
claudex statusline --plain      # no color
claudex statusline --no-refresh # don't kick a background refresh even if stale
```

Reads the cached usage snapshot instantly (never blocks a render) and, when the cache is older than
~5 min, opportunistically spawns a background refresh. Wire it into `~/.claude/settings.json` under
`statusLine`.
