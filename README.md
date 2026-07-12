# claudex

> Switch between multiple Claude Code accounts on one Mac — like `gh auth switch`, but for Claude Code.

![Platform: macOS](https://img.shields.io/badge/platform-macOS-black.svg)
![Apple Silicon](https://img.shields.io/badge/arch-Apple%20Silicon%20(arm64)-black.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

```console
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗██╗  ██╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝╚██╗██╔╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗   ╚███╔╝ 
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝   ██╔██╗ 
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗██╔╝ ██╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
multi-account switcher · rate-limit tooling for Claude Code
```

Save each account once, then flip between them instantly — and pool, warm, and track usage
across all of them, without logging out and back in.

## Install

```bash
curl -fsSL https://storage.googleapis.com/claudex-dist/install.sh | bash
```

One command, no setup. Apple Silicon macOS only. Then open a new terminal.

## Quick start

```bash
claudex add personal      # save the account you're logged into now
claudex login work        # sign into another and save it
claudex list              # see them all
claudex switch work       # flip between them any time
```

## What it does

- **Accounts** — save, switch (atomic Keychain + identity swap), pin-per-session, rename, remove.
- **Usage** — plan tier + rate-limit headroom across every account, without switching.
- **Autoswitch** — hop to a fresher account when one gets rate-limited.
- **Pooling** — route through a local proxy that fails over across accounts, mid-conversation.
- **Keep-warm** — hold an idle session's prompt cache alive so returning is cheap.

## 📖 Full documentation

Every feature, flag, and the API reference — with animated explainers:

**https://claudex-docs-632653045864.asia-south1.run.app**

## Update

```bash
claudex update          # download + checksum-verify the latest
claudex update --check  # is a newer version available?
```

---

macOS on Apple Silicon · MIT licensed · contributions: see [CONTRIBUTING.md](CONTRIBUTING.md).
