---
title: list · current · rename · remove
description: Everyday account management.
sidebar:
  order: 5
---

## `list` (alias `ls`)
Lists saved accounts in a table — account, email, org, plan tier, saved-age; `●` marks the active
one. Local only.

```bash
claudex list
```

## `current` (alias `whoami`)
Shows the active account (from the live Keychain credential + identity). Local only.

```bash
claudex current
```

## `rename`
Renames a saved profile, moving its Keychain backup too.

```bash
claudex rename old new
```

## `remove` (alias `rm`)
Deletes a saved profile (index entry + Keychain backup).

```bash
claudex remove work        # remove a saved profile
claudex remove work -f     # required to remove the ACTIVE account
```
