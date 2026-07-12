---
title: Backend pool (GCP)
description: Server-custodied tokens + per-member usage.
sidebar:
  order: 4
---

The production pool mode: refresh tokens are custodied **server-side** in Secret Manager, and a
unified REST API mints short-lived access tokens and ingests per-member usage. An org admin invites
teammates with a targeted, single-use join link generated from the dashboard.

```bash
claudex pool join <join-token>     # dashboard-issued token → server stores your refresh token
claudex pool members               # roster + per-member consumed/contributed token tallies
claudex pool members --live        # merge the running proxy's un-flushed counts
claudex pool usage                 # live rate-limit headroom per member
claudex pool use <name>            # choose which member's token serves you
```

Why it's safer than the Pantry pool: your refresh token never reaches other members — the backend
is the **sole refresher** (serialized per member) and hands out only short-lived access tokens.
Usage is attributed **per person** (consumed vs contributed).

See the **[API](/api/overview/)** for the endpoints, and the dashboard for pool/member/usage views.
