---
title: pool — all commands
description: Every pool subcommand and flag.
sidebar:
  order: 5
---

| Command | What it does |
|---|---|
| `pool start` | Spawn the local proxy, wire `ANTHROPIC_BASE_URL` |
| `pool stop [--now]` | Graceful passthrough stop (or hard kill) |
| `pool status` | Running pid/port/mode, per-account counts, health |
| `pool create <pantry-id>` | Create a shared (Pantry) pool → `clpool:` link |
| `pool join <link\|token>` | Join a shared (`clpool:`) or backend (dashboard token) pool |
| `pool use <name>` | Pick which member's token serves you (instant) |
| `pool members [--live]` | Members + per-type token tallies (consumed & contributed) |
| `pool usage` | Live rate-limit headroom per member |
| `pool remove <name>` | Drop a member's token from the pool |
| `pool leave` | Remove yourself |
| `pool clear [--yes]` | Wipe the entire pool |

**Shared flags:** `--yes`, `--live`, `--now`, `--use-current`, `--email`, `--port`,
`--mode failover|balance`, `--no-wire`, `--local`.

Pool and **[keep-warm](/sessions/keep-warm/)** are mutually exclusive (both own `ANTHROPIC_BASE_URL`).
