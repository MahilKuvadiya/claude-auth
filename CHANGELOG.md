# Changelog

All notable changes are documented here. This file is maintained automatically by
[release-please](https://github.com/googleapis/release-please) from Conventional Commit
messages; the entry below the header is the pre-automation baseline.

## 1.11.0

- **Rebranded `claude-auth` → `claudex`.** The command, the GitHub repo, and the
  Homebrew formula are now `claudex`. Your saved accounts are preserved — the internal
  Keychain service (`claude-auth-store`) and `~/.claude-accounts/` storage are unchanged.
  If you previously installed `claude-auth`, reinstall once as `claudex`
  (`brew install vishalmakwana111/claudex/claudex`, or `./install.sh` from source) and
  remove the old `~/.local/bin/claude-auth`.
- Added a Homebrew tap, continuous integration (py_compile gate + unit tests + shellcheck),
  and automated releases (release-please → tag, GitHub Release, Homebrew bump).
- `claudex update` now defers to `brew upgrade claudex` when installed via Homebrew,
  instead of overwriting the read-only Cellar copy.
