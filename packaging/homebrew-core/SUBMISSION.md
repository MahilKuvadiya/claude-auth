# Submitting `claudex` to homebrew-core

Goal: get `brew install claudex` (no tap, for everyone) by adding the formula to
[Homebrew/homebrew-core](https://github.com/Homebrew/homebrew-core).

**The formula (`claudex.rb`) in this folder is submission-ready.** What's missing is
**notability** — do not open the PR until claudex clears Homebrew's popularity bar,
or it will be closed on sight.

## 0. Prerequisite: notability (the gate)

`brew audit --new` runs a GitHub popularity check. Rule of thumb (discretionary):

- **75+ stars**, or **30+ forks**, or **30+ watchers**.

Grow this first (share it, get real users). Everything else below is mechanical.

> ⚠️ macOS-only headwind: because claudex is `depends_on :macos`, a maintainer may
> question a single-platform tool. It's allowed in core, but be ready to make the case
> (it manipulates the macOS login Keychain — inherently platform-specific).

## 1. Refresh the formula to the latest release

Core installs a specific tagged tarball. Update `url` + `sha256` in `claudex.rb` to the
newest `vX.Y.Z`:

```bash
TAG=v1.12.0   # <- set to the latest release
curl -fsSL "https://github.com/vishalmakwana111/claudex/archive/refs/tags/$TAG.tar.gz" \
  | shasum -a 256
# put the printed sha256 + the $TAG url into claudex.rb
```

## 2. Get a local homebrew-core checkout & drop the formula in

```bash
brew tap --force homebrew/core          # local clone of homebrew-core
CORE="$(brew --repo homebrew/core)"
cp packaging/homebrew-core/claudex.rb "$CORE/Formula/c/claudex.rb"
```

## 3. Validate locally (must all pass)

```bash
brew audit --strict --online --new claudex     # style + popularity + license + url
brew style claudex
brew install --build-from-source claudex
brew test claudex
```

If audit complains that the script relies on the system `python3`, the fallback is to
add `depends_on "python@3.13"` and rewrite the shebang in `install`:

```ruby
depends_on "python@3.13"
def install
  bin.install "bin/claudex"
  # point the shebang at the brewed interpreter
  inreplace bin/"claudex", %r{\A#!/usr/bin/env python3}, "#!#{Formula["python@3.13"].opt_bin}/python3.13"
end
```

## 4. Open the PR

Fork `Homebrew/homebrew-core`, commit on a branch, and open a PR.

- **Commit message & PR title (exact format core requires):**
  ```
  claudex 1.12.0 (new formula)
  ```
- **PR body:**
  ```
  `claudex` is a single-file, zero-dependency macOS CLI for switching between multiple
  Claude Code accounts, tracking per-account rate-limit usage, pooling accounts behind a
  local failover proxy, and keeping idle sessions' prompt cache warm.

  - Homepage / source: https://github.com/vishalmakwana111/claudex
  - License: MIT
  - macOS-only (uses the login Keychain via `security`), declared with `depends_on :macos`.
  - stdlib-only Python 3; no third-party runtime dependencies.

  Popularity: <fill in current stars / forks / watchers>.
  ```
- Homebrew's CI will build/test on their runners (macOS; Linux is skipped via
  `depends_on :macos`). Respond to maintainer review comments; merges are at their
  discretion.

## After it merges

`brew install claudex` works for everyone with zero setup. At that point, retire the
personal tap from the README's headline (keep it as a fallback), and future releases
update core via Homebrew's own `brew bump-formula-pr` automation (or a maintainer bot).
