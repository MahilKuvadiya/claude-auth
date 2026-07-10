# Contributing to claudex

Thanks for helping out! A few things make this project unusual — please read the first
section before you touch the code.

## ⚠️ It's one file, on purpose

The entire tool is a single, zero-dependency Python 3 script: **`bin/claudex`**. This is a
hard design constraint, not an accident:

- `install.sh` copies that one file to `~/.local/bin/claudex`.
- `claudex update` downloads that one raw file from `main` and atomically replaces itself.
- The Homebrew formula installs that one file.

**Do not split it into modules, add a package layout, or introduce a build/bundling step.**
Doing so breaks the self-updater and the Homebrew formula. Keep it stdlib-only — no
third-party runtime dependencies (`pip install` must never be required to run it).

Internal organization within the file is welcome (clear sections, helpers); a second
importable module is not.

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
make check   # python3 -m py_compile bin/claudex  (the same gate `update` uses)
make test    # python3 -m unittest discover -s tests
make lint    # shellcheck install.sh uninstall.sh
make install # ./install.sh  (into ~/.local/bin)
```

Tests live in `tests/` and use only the stdlib `unittest`. They load `bin/claudex` as a
module through `tests/_harness.py` (it has no `.py` extension) and cover the pure,
high-risk logic — version parsing/compare, the byte-preserving `max_tokens` rewrite, header
forwarding, session resolution, and the pool-link crypto. Please add a test when you touch
that logic. Keychain- and network-touching code is verified by hand (documented in the PR).

## Releasing (maintainers)

1. Merge feature PRs to `main` (Conventional-Commit titles). release-please keeps a rolling
   **"Release vX.Y.Z"** PR up to date.
2. Merge that Release PR. That tags `vX.Y.Z`, publishes a GitHub Release (with `bin/claudex`
   attached), bumps the `homebrew-claudex` formula, and redeploys the showcase.
