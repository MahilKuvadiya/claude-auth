# Contributing to claudex

Thanks for helping out! A few things make this project unusual — please read the first
section before you touch the code.

## ⚠️ One-file *source*, compiled binary *release*

The entire tool is a single, stdlib-only Python 3 script: **`bin/claudex`**. You develop in
that one file — no package layout, no second importable module, no third-party runtime deps.

> **This reverses the old rule.** Earlier, `bin/claudex` was *also* the shipped artifact:
> `install.sh` copied the raw `.py`, `claudex update` fetched it from GitHub, and Homebrew
> installed it. That is no longer true. The source repository is **private**, and releases now
> ship a **compiled native binary** (via Nuitka) so the source is never distributed.

What this means in practice:

- Keep `bin/claudex` a **single stdlib-only file** — Nuitka compiles it as one entry point, and
  `pip install` must never be required to *run* the release. (Nuitka itself is a build-time-only
  tool; it does not become a runtime dependency.)
- The build is `make dist` → `dist/claudex` (arm64, ad-hoc signed) + `dist/SHA256SUMS`. CI runs
  this on a macOS runner at release time and uploads to the public GCS bucket.
- Distribution is the public **GCS bucket** (`gs://claudex-dist`), not Homebrew or a raw GitHub
  file. The bootstrap installer is `packaging/install.sh` (served as the bucket's `install.sh`).
- `claudex update` downloads the latest **binary** + `SHA256SUMS`, verifies the checksum, and
  replaces the running binary. When run from source it no-ops and tells you to `git pull`.

## Commit messages & PRs (this drives releases)

Releases are automated with [release-please](https://github.com/googleapis/release-please),
which reads **Conventional Commits** to decide the next version. We squash-merge, so the
**PR title** becomes the commit — and CI lints it.

| Prefix | Example | Version bump |
|--------|---------|--------------|
| `fix:` | `fix: don't crash when settings.json is missing` | patch (1.11.0 → 1.11.1) |
| `feat:` | `feat: add spend command` | minor (1.11.0 → 1.12.0) |
| `feat!:` / `BREAKING CHANGE:` | `feat!: drop Linux path fallback` | major (1.11.0 → 2.0.0) |
| `docs:` `chore:` `ci:` `refactor:` `test:` | | no release |

You never edit `__version__` by hand — release-please bumps `bin/claudex` (the line is
annotated `# x-release-please-version`) and updates `CHANGELOG.md` in its Release PR.

## Development

```bash
make check   # python3 -m py_compile bin/claudex  (syntax gate the build runs first)
make test    # python3 -m unittest discover -s tests
make lint    # shellcheck install.sh uninstall.sh packaging/install.sh
make build   # compile the native binary with Nuitka → dist/claudex (arm64, needs Nuitka)
make dist    # build + emit dist/SHA256SUMS (what CI uploads)
make install # ./install.sh  (installs the .py source into ~/.local/bin for dev)
```

Tests live in `tests/` and use only the stdlib `unittest`. They load `bin/claudex` as a
module through `tests/_harness.py` (it has no `.py` extension) and cover the pure,
high-risk logic — version parsing/compare, the byte-preserving `max_tokens` rewrite, header
forwarding, session resolution, and the pool-link crypto. Please add a test when you touch
that logic. Keychain- and network-touching code is verified by hand (documented in the PR).

## Releasing (maintainers)

1. Merge feature PRs to `main` (Conventional-Commit titles). release-please keeps a rolling
   **"Release vX.Y.Z"** PR up to date.
2. Merge that Release PR. That tags `vX.Y.Z` and triggers the `publish` job on a macOS/arm64
   runner: it compiles + ad-hoc-signs the binary, generates `SHA256SUMS`, authenticates to GCP
   via keyless Workload Identity Federation, and uploads the binary + checksum + `VERSION` +
   `install.sh` to `gs://claudex-dist` (both `v<tag>/` and rolling `latest/`). The
   `curl … | bash` installer serves the new version immediately.
