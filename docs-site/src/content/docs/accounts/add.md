---
title: add
description: Save the currently logged-in account as a profile.
sidebar:
  order: 2
---

Saves whatever account you're currently logged into as a named profile — no browser flow.

```bash
claudex add personal        # save the current login as "personal"
claudex add personal -f     # overwrite an existing profile
```

- `name` defaults to the email prefix.
- Reads the live Keychain credential + `~/.claude.json`, writes a namespaced Keychain backup and an
  index entry. No network.
