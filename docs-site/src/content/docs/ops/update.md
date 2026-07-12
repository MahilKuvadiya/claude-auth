---
title: update
description: Update claudex in place.
sidebar:
  order: 2
---

Updates claudex in place from the distribution bucket — fetches the latest binary + checksum,
verifies it, then atomically swaps the running file. Saved accounts are untouched.

```bash
claudex update           # download + verify + install the latest
claudex update --check   # report only — is a newer version available?
claudex update --force   # reinstall even if up to date
```

Apple Silicon only. Aborts on a checksum mismatch — it never installs an unverified binary. When run
from source (development) it no-ops and tells you to `git pull`.
