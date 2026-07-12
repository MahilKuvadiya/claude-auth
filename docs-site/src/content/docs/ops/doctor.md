---
title: doctor
description: One-shot health check of your setup.
sidebar:
  order: 1
---

A one-shot health check:

```bash
claudex doctor
```

Checks: macOS; the `claude` CLI presence/version; `claudex` on `PATH`; **Keychain access** (live
credential present); saved-account count; the active account; autoswitch hook state (Stop +
SessionStart); per-account token freshness (offline Keychain read); whether the pool base-URL wiring
is present and yours; and whether a newer `claudex` is available.
