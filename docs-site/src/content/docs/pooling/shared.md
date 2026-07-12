---
title: Shared pool (Pantry)
description: Pool with friends via a link — no server.
sidebar:
  order: 3
---

Pool with teammates with no backend: members' tokens live client-side-encrypted in a free Pantry
JSON store; everyone runs the same local proxy fed from one shared blob.

```bash
claudex pool create <pantry-id>    # create the pool, print the clpool: share link
claudex pool join <clpool-link>    # join via link
claudex pool use <name>            # pick which member's token serves you
claudex pool leave                 # remove yourself
```

**Security model (important):** the `clpool:v1:pantry:<id>:<key>` link **is** the credential — anyone
with it can decrypt and read every token in the pool. Encryption is stdlib-only encrypt-then-MAC
(PBKDF2 → HMAC-SHA256 stream); the key lives only in the link, never sent to Pantry (only ciphertext
is stored). There's no compare-and-swap, so last write wins. Share links only with people you trust.

By default `join` mints a **dedicated sign-in session** (its own single-use refresh chain) and
donates that — not your primary login. `--use-current` donates your current token instead.
