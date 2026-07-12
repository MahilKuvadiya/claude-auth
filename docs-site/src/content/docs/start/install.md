---
title: Install
description: One command. Apple Silicon macOS.
---

claudex ships as a compiled binary from a public bucket — no account, login, or token needed:

```bash
curl -fsSL https://storage.googleapis.com/claudex-dist/install.sh | bash
```

This downloads the binary, **verifies its SHA256**, installs to `~/.local/bin/claudex`, adds that
directory to your `PATH`, and clears the download quarantine so macOS runs it without a Gatekeeper
prompt. Open a new terminal afterward.

- **Apple Silicon (arm64) macOS only.** On Intel the installer prints a clear message and stops.
- **Claude Code** must be installed and on your `PATH` (only needed for `claudex login`).

Update in place any time:

```bash
claudex update          # download + checksum-verify the latest, then replace itself
claudex update --check  # is a newer version available?
```

Pin a version with `CLAUDEX_VERSION=vX.Y.Z` before the install command.
