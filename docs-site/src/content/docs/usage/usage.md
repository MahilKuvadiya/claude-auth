---
title: usage
description: Plan tier + rate-limit headroom across all accounts, without switching.
sidebar:
  order: 1
---

Shows plan tier and rate-limit usage across every saved account — no switching required.

```bash
claudex usage           # all accounts
claudex usage work      # detailed view for one account
claudex usage --quiet   # fetch + cache silently (used by background refreshers)
```

- **Windows:** 5-hour "session" window and weekly; the single-account view breaks out session /
  weekly all-models / weekly Sonnet / weekly Opus with reset countdowns.
- **Plan-tier detection:** maps OAuth metadata to `Pro` / `Max 5x` / `Max 20x` / `Team` /
  `Enterprise` / `Free` (a Max seat is recognized even inside a Team org). No extra request — tier
  comes from saved metadata.
- Hits Anthropic's `/api/oauth/usage` per account and caches snapshots; expired inactive tokens show
  the last snapshot with its age.

Headroom here also feeds **[autoswitch --strategy lowest](/autoswitch/autoswitch/)** and
**[pool usage](/pooling/commands/)**.
