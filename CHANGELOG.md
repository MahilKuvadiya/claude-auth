# Changelog

All notable changes are documented here. This file is maintained automatically by
[release-please](https://github.com/googleapis/release-please) from Conventional Commit
messages; the entry below the header is the pre-automation baseline.

## [1.12.0](https://github.com/vishalmakwana111/claudex/compare/v1.11.0...v1.12.0) (2026-07-10)


### Features

* add `claude-auth update` self-updater ([41641ae](https://github.com/vishalmakwana111/claudex/commit/41641ae62010548deac5425002d6d2aee6bff8ed))
* add `claude-auth update` self-updater ([88fa42d](https://github.com/vishalmakwana111/claudex/commit/88fa42d73011c70e487132a8f54f43d85f22c8c6))
* **keep-warm:** keep a specific idle session's prompt cache warm + `sessions` discovery ([#7](https://github.com/vishalmakwana111/claudex/issues/7)) ([c078405](https://github.com/vishalmakwana111/claudex/commit/c078405e4ea2837ac82338fc5f349171a6239417))
* pin one Claude Code session to a specific account (`session`) ([#4](https://github.com/vishalmakwana111/claudex/issues/4)) ([2c2ada3](https://github.com/vishalmakwana111/claudex/commit/2c2ada3076d7c7c0ce6965edc6be8ec744247b3d))
* pool all accounts behind one auto-failover proxy (no restart needed) ([6db20c3](https://github.com/vishalmakwana111/claudex/commit/6db20c3a2a8711624dea5841bddbee1562fc3ecf))
* **pool:** add multi-account pooling proxy with auto-failover ([049d2d2](https://github.com/vishalmakwana111/claudex/commit/049d2d2eb8c018ad9f97622606f1d2c34822cf80))
* **pool:** per-type token tallies in `pool members` + `--live` (+ gzip metering fix) ([#6](https://github.com/vishalmakwana111/claudex/issues/6)) ([9931a88](https://github.com/vishalmakwana111/claudex/commit/9931a88cb7994b6e30d2508cafd03a12d8f384e4))
* **pool:** shared "global pool" — pool accounts with friends, no server ([#5](https://github.com/vishalmakwana111/claudex/issues/5)) ([90d2ab0](https://github.com/vishalmakwana111/claudex/commit/90d2ab0895b6943684cbde821e360a0e434a6f5f))
* rebrand to claudex; add CI/CD, tests, Homebrew tap, release automation ([#9](https://github.com/vishalmakwana111/claudex/issues/9)) ([21115d6](https://github.com/vishalmakwana111/claudex/commit/21115d64aba64b8a0349c08e9db2d961e511db64))
* **usage:** show plan tier (Pro / Max 5x / Team …) in usage views ([e6c3032](https://github.com/vishalmakwana111/claudex/commit/e6c30327be340a1ecc1e1e6cb21342a605a45d5f))
* **usage:** show plan tier (Pro / Max 5x / Team …) in usage views ([ecd685b](https://github.com/vishalmakwana111/claudex/commit/ecd685b3f97d4d03b0ffc4805ae8590867ecf860))

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
