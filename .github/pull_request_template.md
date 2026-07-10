<!--
PR title MUST be a Conventional Commit — it becomes the squash-merge commit and drives
the release version. e.g.  feat: add spend command   |   fix: handle missing settings.json
-->

## What & why


## How I verified
- [ ] `make check` (py_compile) passes
- [ ] `make test` passes (added/updated tests for changed logic)
- [ ] Exercised the affected command(s) by hand on macOS

## Notes
- [ ] Kept `bin/claudex` a single, stdlib-only file (no new deps, no module split)
