# claudex — Command Reference

Every command, every flag, with examples. For the pitch, install, and quick start, see the **[README](README.md)**. For internals (storage layout, the in-place-update trick, the proxy design), see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

`claudex commands` prints a condensed version of this table in your terminal.

---

## Conventions

- Invocation is always `claudex <command> [args] [flags]`.
- `<required>` · `[optional]` · `a|b` = choose one.
- **Aliases** are noted per command (`list`/`ls`, `current`/`whoami`, `remove`/`rm`).
- Output is rendered in Claude's warm "clay" palette. Color auto-disables when piped or when **`NO_COLOR`** is set.
- macOS only (credentials live in the login Keychain). Python 3, stdlib only, zero dependencies.

## Contents

- [Accounts](#accounts) — `login` · `add` · `switch` · `session` · `list` · `current` · `rename` · `remove`
- [Usage & limits](#usage--limits) — `usage` · `refresh` · `autoswitch` · `pool` · `pool` (shared) · `sessions` · `keep-warm`
- [Setup & integration](#setup--integration) — `statusline` · `completion` · `doctor` · `update`
- [Misc](#misc) — `commands` · `--help` · `--version`
- [Environment variables](#environment-variables)

---

## Accounts

### `login`

Drive the real `claude auth login` browser flow, then auto-save the result as a named profile.

```
claudex login [name] [--email <addr>] [--console] [--sso]
```

| Arg / flag | Meaning |
|------------|---------|
| `name` | Profile name to save under. Defaults to the email prefix. |
| `--email <addr>` | Pre-populate the email on the login page. |
| `--console` | Use Anthropic Console (API billing) instead of the Claude subscription. |
| `--sso` | Force the SSO login flow. |

```bash
claudex login work                 # opens the browser; saved as "work"
claudex login client --email me@client.com
```

> Requires the `claude` CLI on your `PATH`.

### `add`

Save the account you're **currently** logged into as a named profile — no browser flow.

```
claudex add [name] [-f|--force]
```

| Arg / flag | Meaning |
|------------|---------|
| `name` | Profile name. Defaults to the email prefix. |
| `-f`, `--force` | Overwrite an existing profile of the same name. |

```bash
claudex add personal
```

### `switch`

Switch the machine-wide login to a saved account. Swaps **both** the Keychain credential and the `~/.claude.json` identity, atomically.

```
claudex switch [name] [-f|--force] [--no-save]
```

| Arg / flag | Meaning |
|------------|---------|
| `name` | Account to switch to. Interactive picker if omitted. |
| `-f`, `--force` | Switch even if the target is already active. |
| `--no-save` | Don't refresh the outgoing account's stored copy before leaving it. |

```bash
claudex switch work
claudex switch              # interactive picker
```

> **Restart Claude Code after switching.** A running session holds the old token in memory; the swap only affects new sessions. To move a *running* session, use [`pool`](#pool-local) instead.

### `session`

Run **one** Claude Code session pinned to a specific account, leaving your global login and every other session untouched.

```
claudex session <account> [--no-launch] [-- <claude args>...]
```

| Arg / flag | Meaning |
|------------|---------|
| `account` | Saved account to pin this session to. |
| `--no-launch` | Don't launch `claude`; keep the pinned proxy up and print the `ANTHROPIC_BASE_URL` to export yourself (Ctrl-C to stop). |
| `-- <claude args>` | Everything after `--` is passed straight through to `claude`. |

```bash
claudex session work
claudex session work -- --resume
claudex session work -- -p "summarize this repo"
claudex session work --no-launch      # point your own tool at the printed URL
```

**How it stays scoped:** on macOS the credential is a single machine-wide Keychain item, so there's no per-process credential to swap. `session` runs a tiny in-process loopback proxy pinned to the one account (ephemeral port, no daemon, no files) and hands *only that `claude` child* its own `ANTHROPIC_BASE_URL`. A process env var overrides `settings.json`, so it wins even if `pool` is running. When the session ends, the proxy ends with it. Run as many pinned sessions at once as you like — each is its own process on its own port.

### `list` (alias `ls`)

List saved accounts. `●` marks the active one.

```
claudex list
claudex ls
```

```console
$ claudex list

  Accounts   ·   2 saved

  ┌───┬──────────┬───────────────────┬───────────┬──────┬─────────┐
  │   │ ACCOUNT  │ EMAIL             │ ORG       │ PLAN │ SAVED   │
  ├───┼──────────┼───────────────────┼───────────┼──────┼─────────┤
  │ ● │ personal │ you@gmail.com     │ —         │ max  │ 2m ago  │
  │ ○ │ work     │ you@company.com   │ Acme      │ team │ 3d ago  │
  └───┴──────────┴───────────────────┴───────────┴──────┴─────────┘
```

### `current` (alias `whoami`)

Show the active account.

```
claudex current
claudex whoami
```

### `rename`

Rename a saved profile (moves its Keychain backup too).

```
claudex rename <old> <new>
```

```bash
claudex rename work acme
```

### `remove` (alias `rm`)

Delete a saved profile.

```
claudex remove <name> [-f|--force]
claudex rm <name>
```

| Arg / flag | Meaning |
|------------|---------|
| `name` | Profile to delete. |
| `-f`, `--force` | Required to remove the **active** account. |

---

## Usage & limits

### `usage`

Show plan tier + rate-limit usage (5-hour session and weekly) across **all** accounts — without switching. The fastest way to decide which account to switch to.

```
claudex usage [name] [--quiet]
```

| Arg / flag | Meaning |
|------------|---------|
| `name` | Detail view for one account (session + weekly all-models + weekly Sonnet/Opus, with reset countdowns). Omit for all accounts. |
| `--quiet` | Fetch & cache silently (no output). Used by background refreshers. |

```console
$ claudex usage

  Usage   ·   weekly limit is the one that bites

  ┌───┬──────────┬────────┬──────────────────────────┬─────────────────────────────────┬─────────┐
  │   │ ACCOUNT  │ TIER   │ SESSION                  │ WEEK                            │ UPDATED │
  ├───┼──────────┼────────┼──────────────────────────┼─────────────────────────────────┼─────────┤
  │ ○ │ personal │ Max 5x │ ██░░░░░░░░  23%  10:19pm │ ██░░░░░░░░  24%  Jun 26 12:29am │ live    │
  │ ● │ work     │ Team   │ █░░░░░░░░░  12%  8:39pm  │ ██████░░░░  57%  Jun 25 3:29am  │ live    │
  └───┴──────────┴────────┴──────────────────────────┴─────────────────────────────────┴─────────┘

  █ <50%   █ <80%   █ ≥80%
```

Usage comes from Anthropic's `/api/oauth/usage` endpoint (the same data Claude Code's `/status` → Usage tab shows). The **`TIER`** column (`Pro`, `Max 5x`, `Max 20x`, `Team`, `Enterprise`, `Free`) comes from saved metadata — no extra request. If an inactive account's token has expired, the last snapshot is shown with its age; switching to it (or [`refresh`](#refresh)) revives it.

### `refresh`

Exchange each **inactive** account's refresh token for a fresh one (Anthropic's `POST /v1/oauth/token`), so `usage` stays live and switching never lands on a dead token.

```
claudex refresh [name]
```

| Arg | Meaning |
|-----|---------|
| `name` | Refresh one account. Omit to refresh all inactive accounts. |

Only touches **inactive** accounts — the active one is owned by Claude Code and left alone.

### `autoswitch`

Auto-switch to a fresher account when the active one's usage gets high. Installs Claude Code hooks so it only ever fires while a session is **idle**, never mid-prompt.

```
claudex autoswitch [on|off|status|run]
                       [--threshold <pct>] [--window session|week]
                       [--strategy next|lowest] [--interval <secs>]
                       [--force] [--dry-run] [--quiet]
```

| Action | Meaning |
|--------|---------|
| `on` | Enable auto-switch and install the hooks. |
| `off` | Disable and remove both hooks. |
| `status` | Show current config and hook state (default). |
| `run` | Run one check now (pair with `--force`/`--dry-run` to preview). |

| Flag | Meaning |
|------|---------|
| `--threshold <pct>` | Switch above this usage % (default 90). |
| `--window session\|week` | Which limit to watch (default `session`, the 5-hour window). |
| `--strategy next\|lowest` | `next` = round-robin; `lowest` = jump to most headroom (default `next`). |
| `--interval <secs>` | Minimum seconds between checks (default 120). |
| `--force` | Ignore the enabled flag and throttle; run now. |
| `--dry-run` | Decide and report, but don't switch. |
| `--quiet` | Suppress output (used by the hook). |

```bash
claudex autoswitch on --threshold 90 --window session
claudex autoswitch status
claudex autoswitch run --force --dry-run    # preview the next decision
claudex autoswitch off
```

**How it works:** it installs a **`Stop` hook** (Claude runs it the instant a response finishes and the session goes idle — the guarantee it never switches mid-prompt) and a **`SessionStart` hook** (a synchronous pre-flight that tries to switch *before* a new session loads its credentials). On each throttled idle check it reads the active account's usage; over threshold, it picks another account with headroom and swaps the credential. You get a macOS notification and a line in `~/.claude-accounts/autoswitch.log`.

> Like `switch`, an auto-switch takes effect on your **next** session/restart — it can't move an already-running session. For no-restart switching, use [`pool`](#pool-local).

### `pool` (local)

Run a local proxy (on `127.0.0.1`, your machine only) that pools **all** your accounts behind one endpoint and auto-fails-over on rate limits — **mid-conversation, no restart.**

```
claudex pool [start|stop|status|serve]
                 [--port <n>] [--mode failover|balance] [--no-wire] [--local]
```

| Action | Meaning |
|--------|---------|
| `start` | Launch the proxy and wire `ANTHROPIC_BASE_URL` into `settings.json`. |
| `stop` | Shut the proxy down and restore `settings.json`. |
| `status` | Show the running proxy, per-account served/failover counts, and wiring state (default). |
| `serve` | *(internal)* the daemon entry point `start` spawns — you won't call it directly. |

| Flag | Meaning |
|------|---------|
| `--port <n>` | Port to listen on (default 8848). |
| `--mode failover\|balance` | `failover` (default) = use one account until it's rate-limited, then move; `balance` = spread requests across all accounts every turn. |
| `--no-wire` | Don't edit `settings.json`; just print the URL to set yourself. |
| `--local` | Serve the **local-Keychain** pool even if a shared pool is joined. |

```console
$ claudex pool start

  › Starting pool on 127.0.0.1:8848 · mode failover
  ✓ Pool is live · Claude Code will use it on next start
  wired ANTHROPIC_BASE_URL into ~/.claude/settings.json

$ claudex pool status

  ● running   pid 40127 · 127.0.0.1:8848 · mode failover
  personal   ready       served 142 · failovers 0
  work       resting 24s served 38 · failovers 1
```

**Why it can switch without a restart:** the Messages API is *stateless* — Claude Code resends the whole conversation on every turn, so there's no server-side session to "move." The proxy is a load-balancer over independent requests; any account can serve any turn.

> **⚠️ Anthropic's terms.** `failover` uses one account at a time (same as manual switching, automated). `balance` draws on several subscription accounts for one workflow, which may run against Anthropic's subscription terms (around circumventing rate limits). Prefer `failover` when in doubt.
>
> **Note:** `pool` works by setting `ANTHROPIC_BASE_URL`. If a future Claude Code stops honoring that for subscription logins, the pool simply won't receive traffic (`pool status` / `doctor` will say so) — it can't break your normal setup, because `pool stop` always restores `settings.json`. Mutually exclusive with [`keep-warm`](#keep-warm) (both own the base URL).

### `pool` (shared)

Pool accounts with **friends** — no server to host. Members' tokens live encrypted in a free [Pantry](https://getpantry.cloud) JSON store; everyone runs the same local proxy fed from that one shared blob.

```
claudex pool create <pantry-id>
claudex pool join   <link>
claudex pool use    <name>
claudex pool usage
claudex pool members [--live]
claudex pool remove <name>
claudex pool leave
claudex pool clear  [--yes]
```

| Action | Meaning |
|--------|---------|
| `create <pantry-id>` | Create the pool (needs a free pantry id from getpantry.cloud). Prints the share link. |
| `join <link>` | Join with a `clpool:v1:…` link. Signs in a **dedicated session** (its own refresh chain) and donates that — your own Claude Code login is captured, then restored, untouched. |
| `use <name>` | Pick which member's token serves you — takes effect on **running** sessions instantly (no restart). |
| `usage` | Live rate-limit headroom for each member (who to switch to). |
| `members` | Members + per-type token tallies (input / output / cache-read / cache-write) contributed & consumed. |
| `remove <name>` | Drop any member's token from the pool. |
| `leave` | Remove yourself from the pool. |
| `clear` | Wipe the entire pool. |

| Flag | Meaning |
|------|---------|
| `--live` | `pool members`: merge the running proxy's un-flushed counts for up-to-the-second totals. |
| `--use-current` | `pool join`/`create`: donate the **current** live token instead of a dedicated sign-in. Only safe for an account not used by Claude Code elsewhere. |
| `--email <addr>` | `pool join`/`create`: pre-fill the email on the dedicated sign-in. |
| `--now` | `pool stop`: kill the proxy immediately (running sessions error) instead of leaving a passthrough shim. |
| `--yes` | `pool clear`: skip the confirmation prompt. |

```bash
# one person creates the pool
claudex pool create <pantry-id>
#   → clpool:v1:pantry:<id>:<key>   (share with people you trust)

# friends join, then run it and pick whose token serves them
claudex pool join "clpool:v1:pantry:<id>:<key>"
claudex pool start
claudex pool use alice
claudex pool usage       # live headroom per member
claudex pool members     # who's in + token tallies (add --live)
```

Unlike the local pool, the shared pool **does not auto-failover**: it serves the **one** account you selected (so prompt caching stays intact). If it gets rate-limited, `pool use <name>` to another member — live.

**Dedicated session (why `join` signs in again).** Claude's refresh tokens are *single-use* (each refresh rotates it), so the pool must not share the same session as your own Claude Code — otherwise whoever refreshes second gets locked out. `join` therefore mints a **separate** session for the pool and restores your own login afterward, giving the pool an independent refresh chain. Pass `--use-current` to skip this and donate the live token as-is — only do that for an account you don't use in Claude Code elsewhere.

**Stopping without breaking running sessions.** `pool stop` doesn't kill the proxy outright — it flips it to a **passthrough shim** that forwards each request with the session's *own* token, so any Claude Code session still pointed at the port keeps working with **no restart** (new sessions go direct because `settings.json` is unwired). The shim self-exits once idle; `pool stop --now` kills it immediately.

> **Security & trust model:**
> - Tokens are **encrypted client-side** — the key lives in the link and is never sent to Pantry, which only stores ciphertext (encrypt-then-MAC, stdlib only).
> - **Anyone with the link can decrypt every token and overwrite the blob.** Share it only with people you trust, over a private channel — treat it like an SSH key.
> - `remove` / `leave` / `clear` **un-share** a token but do **not revoke** it; to truly invalidate, the owner must log out / re-login.
>
> **Known limits:** the store has no compare-and-swap, so simultaneous writes can lose one change (counters are approximate). A pooled member's machine being offline means its token can't be refreshed — the pool surfaces that so you can `pool use` a live member.
>
> **⚠️ Anthropic's terms:** pooling several people's subscriptions for one workflow may run against Anthropic's subscription terms. Use with people you trust, at your own discretion.

### `sessions`

List your recent Claude Code sessions straight from disk (`~/.claude/projects/*/*.jsonl`) — no proxy, no setup. This is how you find the id (or project name) to hand to [`keep-warm`](#keep-warm).

```
claudex sessions [--limit <n>]
```

| Flag | Meaning |
|------|---------|
| `--limit <n>` | Max sessions to show (default 25). |

```console
$ claudex sessions

  Sessions   ·   3 recent

  ┌───┬──────────┬─────────────┬─────────┬──────────────────────────┬──────┬─────────┐
  │   │ ID       │ PROJECT     │ BRANCH  │ TITLE                    │ CTX  │ IDLE    │
  ├───┼──────────┼─────────────┼─────────┼──────────────────────────┼──────┼─────────┤
  │ ● │ 76ba159f │ ai-chatbot  │ develop │ fix-discovery-failures   │ 375k │ 2m ago  │
  │ ○ │ 262eb4da │ shru        │ main    │ case-study-detail-pages  │ 705k │ 17m ago │
  └───┴──────────┴─────────────┴─────────┴──────────────────────────┴──────┴─────────┘

  ● kept warm    ○ not warmed
```

Each row shows the project (cwd), git branch, auto-title, context size, and idle time. `●` marks sessions the keep-warm proxy has captured (warmable now).

### `keep-warm`

Keep a specific idle session's prompt cache alive. Claude Code caches your conversation with a **1-hour** TTL (its requests carry `cache_control: {ttl: "1h"}`); step away longer and the next turn re-processes the whole conversation as fresh input. While a warmed session sits idle, a local proxy replays its last request as a cheap **cache read** every ~50 minutes, refreshing the 1-hour timer. A cache read is far cheaper than fresh input — ~0.1× the token price on the pay-per-token API, and on a Claude Code subscription it barely touches your rate limit (measured: millions of cache-read tokens moved the 5-hour window ~0%, vs ~1% per a few-hundred-thousand fresh tokens).

```
claudex keep-warm [start|stop|status|add|rm|list]
                      [<target>] [--last]
                      [--interval <min>] [--max <hrs>] [--no-wire]
```

| Action | Meaning |
|--------|---------|
| `start` | Start the warming proxy and wire `ANTHROPIC_BASE_URL`. Sessions must route through it to be warmable. |
| `add <target>` | Warm a session — by id, unique id-prefix, project name, or `--last`. |
| `rm <target>` | Stop warming a session. |
| `status` (alias `list`) | Show warmed sessions + pings sent and cache-read tokens spent (default). |
| `stop` | Stop the proxy and restore `settings.json`. |
| `serve` | *(internal)* daemon entry point spawned by `start`. |

| Flag | Meaning |
|------|---------|
| `--last` | `add`/`rm`: target the most-recently-active session (skip typing an id). |
| `--interval <min>` | Minutes between warm pings when idle (default 50, max 55 — under the 60-min TTL). |
| `--max <hrs>` | Stop warming a session after this many idle hours (default 8). |
| `--no-wire` | Don't edit `settings.json`; just print the URL to set yourself. |

```console
$ claudex keep-warm start          # starts the proxy, wires ANTHROPIC_BASE_URL
$ claudex sessions                 # find the session id
$ claudex keep-warm add ai-chatbot # warm it (by project, id, or --last)
$ claudex keep-warm status
  ● running   pid 40127 · 127.0.0.1:8849 · interval 50m · cap 8h
  ▶ 76ba159f  ai-chatbot  captured  · 3 pings · 123,450 read tok
```

**Idle-only:** while you're actively working, your real turns keep the cache warm for free — pings only fire after ~50 min of no activity, and stop after 8h idle. It's transparent: each session stays on its own account; nothing is swapped.

> **Two things to know.** (1) A session must **route through the proxy** to be warmable — after `keep-warm start`, only sessions started *from then on* are captured (nothing is grabbed retroactively). (2) Mutually exclusive with [`pool`](#pool-local) (both own `ANTHROPIC_BASE_URL`).
>
> **Why it must be a proxy:** the exact cacheable prefix (system prompt + tools) isn't stored on disk — only the live request has it — so a session can only be warmed from bytes seen in the request path.

---

## Setup & integration

### `statusline`

Print a compact, network-free status segment from cached usage — ideal for Claude Code's status line.

```
claudex statusline [--plain] [--no-refresh]
```

| Flag | Meaning |
|------|---------|
| `--plain` | No color. |
| `--no-refresh` | Don't kick off a background usage refresh, even if the cache is stale. |

```
● work · wk 57% · ↺ Jun 25 3:29am
```

Wire it into `~/.claude/settings.json`:

```jsonc
"statusLine": { "type": "command", "command": "claudex statusline" }
```

It reads the cached snapshot (instant) and opportunistically kicks off a background refresh when the cache is older than 5 minutes, so it stays current without ever blocking a render.

### `completion`

Output a shell-completion script that tab-completes commands **and** account names.

```
claudex completion [bash|zsh]
```

```bash
# zsh — add to ~/.zshrc:
eval "$(claudex completion zsh)"
# bash — add to ~/.bashrc:
eval "$(claudex completion bash)"
```

```console
$ claudex switch <TAB>
personal   work
```

### `doctor`

Health-check the whole setup in one shot.

```
claudex doctor
```

```console
$ claudex doctor

  Doctor   ·   checking your setup

  ✓ macOS
  ✓ claude CLI   2.1.187 (Claude Code)
  ✓ claudex on PATH   /Users/you/.local/bin/claudex
  ✓ Keychain access   live credential present
  ✓ 2 account(s) saved
  ✓ active account   personal
  ✓ autoswitch   Stop + SessionStart hooks present
```

Catches the common gotchas: `claude` not on PATH, missing/partial auto-switch hooks, stale tokens, an active login that isn't saved, and whether a newer `claudex` is available.

### `update`

Update `claudex` in place from GitHub — no re-clone.

```
claudex update [--check] [--force]
```

| Flag | Meaning |
|------|---------|
| `--check` | Only report whether a newer version exists; don't install. |
| `--force` | Reinstall even if already up to date. |

```bash
claudex update
claudex update --check
```

It fetches the latest `bin/claudex`, verifies it parses as valid Python, then atomically swaps it over the running file. Your saved accounts (Keychain + `~/.claude-accounts/`) are untouched. If the binary lives somewhere you can't write to, it tells you — re-run `./install.sh` or use `sudo`.

---

## Misc

### `commands`

Print the grouped cheat sheet of every command in your terminal (a condensed form of this file).

```
claudex commands
```

### `--help`, `-h`

Full help screen — and a little cat walks the width of your terminal in the clay gradient. Purely cosmetic; skipped when piped, disable with `CLAUDE_AUTH_NO_ANIM=1`.

```
claudex --help
claudex            # no args → help
```

### `--version`, `-V`

Print the version.

```
claudex --version
```

---

## Environment variables

| Variable | Effect |
|----------|--------|
| `NO_COLOR` | Disable all color output (also auto-disabled when piped). |
| `CLAUDE_AUTH_NO_ANIM` | `=1` disables the walking-cat animation on the help screen. |
| `ANTHROPIC_BASE_URL` | Set **by** `pool` / `keep-warm` / `session` (via `settings.json` or the child's env) to route Claude Code through the local proxy. You don't normally set this yourself. |
| `CLAUDE_AUTH_UPSTREAM_HOST` / `CLAUDE_AUTH_UPSTREAM_PORT` / `CLAUDE_AUTH_UPSTREAM_PLAIN` | *(testing)* point the proxy at a fake upstream instead of the real API. For development only. |

---

<sub>Not affiliated with Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic.</sub>
