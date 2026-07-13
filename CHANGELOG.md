# Changelog

All notable changes are documented here. This file is maintained automatically by
[release-please](https://github.com/googleapis/release-please) from Conventional Commit
messages; the entry below the header is the pre-automation baseline.

## [2.2.0](https://github.com/vishalmakwana111/claudex/compare/v2.1.1...v2.2.0) (2026-07-13)


### Features

* **api:** Phase 3 — port pool/admin backend Firestore → Prisma/Postgres ([300c9d9](https://github.com/vishalmakwana111/claudex/commit/300c9d902ec5450dd254377490aa1a245ffe4c92))
* **api:** Phase 4 — RBAC (admin/pod_lead/member + pods) ([e13fd86](https://github.com/vishalmakwana111/claudex/commit/e13fd864223336e57411e40b1ba4f04e3da0cb3e))
* **api:** Phase 5 — analytics ingest + role-scoped query API ([1e4d20b](https://github.com/vishalmakwana111/claudex/commit/1e4d20b9556059ea8ce532c31ea49486681deec2))
* claudex platform — Postgres/Prisma, RBAC, analytics, 2-env IaC ([f6aee93](https://github.com/vishalmakwana111/claudex/commit/f6aee93568dae33f2d495a0a31d364e6f6e9cf5b))
* claudex platform — Postgres/Prisma, RBAC, analytics, 2-env IaC ([1e98a87](https://github.com/vishalmakwana111/claudex/commit/1e98a8715dbc616732ca6c7a4fc944ebc1e102da))
* **cli,dashboard:** Phase 9 — point clients at the unified Cloud Run API ([83670a5](https://github.com/vishalmakwana111/claudex/commit/83670a581c6fc245fbf2234af68ac82d3b47f076))
* **cli:** Phase 6 — automatic, zero-management analytics collector ([4647bd2](https://github.com/vishalmakwana111/claudex/commit/4647bd287818cf9d128bc8dcf79394002ddd5f87))
* **dashboard,api:** Phase 7 — role-aware analytics console ([f66a530](https://github.com/vishalmakwana111/claudex/commit/f66a53027780be16bc35c0f2bde419aa548c1e4c))
* **infra,db:** Phase 1-2 — Cloud SQL + per-env creds + Prisma schema ([e13a043](https://github.com/vishalmakwana111/claudex/commit/e13a0437b789481a2161e586fbdbd1ee8acba8d5))
* **infra:** Phase 0 — Terraform foundation (shared globals adopted, env state) ([1374cc0](https://github.com/vishalmakwana111/claudex/commit/1374cc09d7adbb5b0d777eae5b5074cd4022c820))


### Bug Fixes

* **api:** pin Prisma binaryTargets for distroless runtime ([6280e8d](https://github.com/vishalmakwana111/claudex/commit/6280e8dd1191f5bd942aa25f1b8ace0863209af5))
* **ci:** deploy job needs npm ci + robust DATABASE_URL resolution ([b50f35a](https://github.com/vishalmakwana111/claudex/commit/b50f35a367ecd458e8fd553a474366e2bb8ea8ed))
* **migrate:** upsert Org before Pool to satisfy orgId FK ([ea17906](https://github.com/vishalmakwana111/claudex/commit/ea17906094452221b181104ca0c151a44ac1862f))

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
