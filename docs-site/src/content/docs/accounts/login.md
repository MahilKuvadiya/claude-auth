---
title: login
description: Sign in fresh and save the account as a profile.
sidebar:
  order: 1
---

Drives the real `claude auth login` browser flow, then auto-saves the result as a named profile.

```bash
claudex login work                 # sign in, save as "work"
claudex login --email you@co.com   # prefill the login email
claudex login --console            # Anthropic Console / API billing (not subscription)
claudex login --sso                # force the SSO flow
```

- `name` defaults to the email prefix.
- Requires the `claude` CLI on your `PATH`.
- Writes a Keychain backup + index entry after login. Touches the network via the login flow.

See also **[add](/accounts/add/)** (save the *current* login without a browser flow).
