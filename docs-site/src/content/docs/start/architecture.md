---
title: Architecture
description: How claudex stores accounts and routes traffic.
---

## Accounts live in two places
- **Secrets** — the macOS login Keychain. claudex keeps per-account backups in a namespaced
  Keychain service (`claude-auth-store`); tokens never touch disk in plaintext.
- **Identity** — `~/.claude.json` (`oauthAccount` + `userID`). A switch swaps **both** atomically.

## Local proxies (network-layer isolation)
macOS has a single process-global Keychain credential, so per-session isolation is done at the
network layer. claudex runs small `127.0.0.1` proxies and points Claude Code at them via
`ANTHROPIC_BASE_URL`:
- **`session`** — one Claude Code process pinned to a chosen account.
- **`pool`** — all accounts behind one endpoint with auto-failover.
- **`keep-warm`** — replays a session's last request to keep its cache warm.

These are mutually exclusive where they'd both own `ANTHROPIC_BASE_URL`.

## Shared pools (with teammates)
- **Serverless (Pantry)** — tokens client-side-encrypted (encrypt-then-MAC) in a shared blob; the
  `clpool:` link is the credential.
- **Backend (GCP)** — refresh tokens custodied server-side in Secret Manager; a unified REST API
  mints short-lived access tokens and ingests usage. See **[API](/api/overview/)**.

## Distribution
Source is private; releases compile to a native binary (Nuitka) published to a public GCS bucket.
`claudex update` pulls + checksum-verifies new binaries.
