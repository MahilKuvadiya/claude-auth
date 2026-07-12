# Changelog

All notable changes are documented here. This file is maintained automatically by
[release-please](https://github.com/googleapis/release-please) from Conventional Commit
messages; the entry below the header is the pre-automation baseline.

## [2.1.1](https://github.com/vishalmakwana111/claudex/compare/v2.1.0...v2.1.1) (2026-07-12)


### Bug Fixes

* **docs:** perfect the animations + slim the README ([#28](https://github.com/vishalmakwana111/claudex/issues/28)) ([18abeb2](https://github.com/vishalmakwana111/claudex/commit/18abeb261998ec67f90f20dabea30c4098311e17))

## [2.1.0](https://github.com/vishalmakwana111/claudex/compare/v2.0.2...v2.1.0) (2026-07-12)


### Features

* unified REST API, REST-based dashboard, docs site, faster CLI startup ([#26](https://github.com/vishalmakwana111/claudex/issues/26)) ([7815321](https://github.com/vishalmakwana111/claudex/commit/7815321b9011fbfd1b002a82cc3446a382206b49))

## [2.0.2](https://github.com/vishalmakwana111/claudex/compare/v2.0.1...v2.0.2) (2026-07-12)


### Bug Fixes

* installer adds ~/.local/bin to PATH automatically ([#24](https://github.com/vishalmakwana111/claudex/issues/24)) ([5931723](https://github.com/vishalmakwana111/claudex/commit/593172324ab72c0fac9393573198046c27ecb366))

## [2.0.1](https://github.com/vishalmakwana111/claudex/compare/v2.0.0...v2.0.1) (2026-07-12)


### Bug Fixes

* verify TLS via the macOS system CA bundle in the compiled binary ([#22](https://github.com/vishalmakwana111/claudex/issues/22)) ([abc7f53](https://github.com/vishalmakwana111/claudex/commit/abc7f5360eb068bb4983d6909cf0067d0337b86a))

## [2.0.0](https://github.com/vishalmakwana111/claudex/compare/v1.16.0...v2.0.0) (2026-07-12)


### ⚠ BREAKING CHANGES

* Homebrew and raw-GitHub-source installs no longer work. Install via `curl -fsSL https://storage.googleapis.com/claudex-dist/install.sh | bash`. Apple Silicon (arm64) only.

### Features

* distribute as a compiled binary from a public GCS bucket ([#20](https://github.com/vishalmakwana111/claudex/issues/20)) ([c2e6f52](https://github.com/vishalmakwana111/claudex/commit/c2e6f528fa2c7e81d18d243b91e7dd08f3f5238b))

## [1.16.0](https://github.com/vishalmakwana111/claudex/compare/v1.15.0...v1.16.0) (2026-07-11)


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


### Bug Fixes

* **pool:** member listing, per-member counts, usage headroom (release 1.15.0) ([#18](https://github.com/vishalmakwana111/claudex/issues/18)) ([97599bf](https://github.com/vishalmakwana111/claudex/commit/97599bff6ed31a22625172bbe6284b2820330133))

## [1.14.0](https://github.com/vishalmakwana111/claudex/compare/v1.13.0...v1.14.0) (2026-07-11)


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
