# claude-auth

> Switch between multiple Claude Code accounts on one Mac — like `gh auth switch`, but for Claude Code.

If you juggle more than one Claude Code login (personal, work, a client's org…), you know the pain: there's no built-in account switcher, so you end up logging out and back in every time. `claude-auth` fixes that. Save each account once, then flip between them instantly.

```console
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
auth  ·  multi-account switcher for Claude Code
```

```console
$ claude-auth list

  Accounts   ·   2 saved

  ┌───┬──────────┬───────────────────┬───────────┬──────┬─────────┐
  │   │ ACCOUNT  │ EMAIL             │ ORG       │ PLAN │ SAVED   │
  ├───┼──────────┼───────────────────┼───────────┼──────┼─────────┤
  │ ● │ personal │ you@gmail.com     │ —         │ max  │ 2m ago  │
  │ ○ │ work     │ you@company.com   │ Acme      │ team │ 3d ago  │
  └───┴──────────┴───────────────────┴───────────┴──────┴─────────┘

  ● active    ○ saved

$ claude-auth switch work

  ✓ Switched to work  · you@company.com
  ↻ restart Claude Code (and running sessions) to use this account
```

> The real output is rendered in Claude's warm "clay" palette with a gradient wordmark. Colors auto-disable when piped or when `NO_COLOR` is set.

### Usage tracking

`claude-auth usage` shows how much of each account's rate limit you've burned — the fastest way to decide *which account to switch to*:

```console
$ claude-auth usage

  Usage   ·   weekly limit is the one that bites

  ┌───┬──────────┬────────┬──────────────────────────┬─────────────────────────────────┬─────────┐
  │   │ ACCOUNT  │ TIER   │ SESSION                  │ WEEK                            │ UPDATED │
  ├───┼──────────┼────────┼──────────────────────────┼─────────────────────────────────┼─────────┤
  │ ○ │ personal │ Max 5x │ ██░░░░░░░░  23%  10:19pm │ ██░░░░░░░░  24%  Jun 26 12:29am │ live    │
  │ ● │ work     │ Team   │ █░░░░░░░░░  12%  8:39pm  │ ██████░░░░  57%  Jun 25 3:29am  │ live    │
  └───┴──────────┴────────┴──────────────────────────┴─────────────────────────────────┴─────────┘

  █ <50%   █ <80%   █ ≥80%
```

The **`TIER`** column tells you each account's plan at a glance — `Pro`, `Max 5x`, `Max 20x`, `Team`, `Enterprise`, or `Free` — so you can see *which* account carries the bigger rate limit, not just how much of it is left. The single-account detail view (`claude-auth usage <name>`) shows the same tier next to the email in its header.

`claude-auth usage <name>` gives a detailed breakdown (5-hour session, weekly all-models, weekly Sonnet/Opus) with reset countdowns.

It works across **all** accounts at once — without switching — because each account's token is already saved, and usage is fetched from Anthropic's `/api/oauth/usage` endpoint (the same data Claude Code's `/status` → Usage tab shows). Bars are colored by severity (green < 50%, amber < 80%, red ≥ 80%). The tier comes straight from the saved account metadata (no extra request). If an inactive account's short-lived token has expired, the last fetched snapshot is shown with its age; switching to that account refreshes it.

---

## Why this is needed

A Claude Code login isn't a single token in a single place. It's split across **two** locations on your machine:

| What | Where | Contains |
|------|-------|----------|
| **Secrets** | macOS Keychain, service `Claude Code-credentials` | OAuth `accessToken`, `refreshToken`, `expiresAt`, plus MCP server tokens |
| **Identity** | `~/.claude.json` → `oauthAccount` + `userID` | email, organization, account UUID |

Swapping just the token leaves the app convinced it's still the old account (wrong email/org, possible mismatches). A *correct* switch has to swap **both, atomically**. That's exactly what `claude-auth` does — and why hand-pasting tokens is fragile.

## Features

- 🔑 **Tokens never leave the Keychain.** Per-account backups are stored as namespaced Keychain items, not plaintext files. Only non-secret metadata (email/org) is written to disk.
- 🔄 **Atomic two-part swap** of Keychain credential + `~/.claude.json` identity.
- ♻️ **Auto-sync on switch.** The outgoing account's stored copy is refreshed before you leave it, so rotated tokens never go stale.
- 🚪 **`login` wrapper.** Drives the real `claude auth login` browser flow, then auto-saves the result under a name.
- 🛡️ **No re-prompt nags.** Updates the live Keychain item *in place* so macOS keeps trusting the `claude` binary.
- 📦 **Zero dependencies.** One self-contained Python 3 file (stdlib only). Nothing to `pip install`.

## Requirements

- **macOS** (uses the login Keychain via the `security` CLI)
- **Python 3** (ships with macOS / Xcode Command Line Tools)
- **Claude Code** installed and on your `PATH` (only needed for the `login` command)

## Install

### One-liner

```bash
git clone https://github.com/vishalmakwana111/claude-auth.git
cd claude-auth
./install.sh
```

The installer copies the script to `~/.local/bin/claude-auth` and checks that directory is on your `PATH`.

### Manual

```bash
cp bin/claude-auth ~/.local/bin/claude-auth
chmod +x ~/.local/bin/claude-auth
# ensure ~/.local/bin is on PATH:
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

### Updating

Once installed, update in place — no need to re-clone:

```bash
claude-auth update          # downloads the latest version and replaces itself
claude-auth update --check  # just tell me if a newer version exists
```

`update` fetches the latest `bin/claude-auth` from GitHub, verifies it parses as valid Python, then atomically swaps it over the running file. Your saved accounts are untouched — they live in the Keychain and `~/.claude-accounts/`, separate from the binary. `claude-auth doctor` also reports when a newer version is available.

> If the binary lives somewhere you can't write to, `update` tells you — just re-run `./install.sh` (or use `sudo`).

## Quick start

```bash
# 1. Save the account you're currently logged into
claude-auth add personal

# 2. Sign into another account and save it in one step
claude-auth login work        # opens the browser; saved as "work" when done

# 3. See what you've got
claude-auth list

# 4. Switch any time (no browser needed)
claude-auth switch personal
```

> **Restart Claude Code after switching.** A running session holds the old token in memory; the swap only affects new sessions.

## Commands

| Command | Description |
|---------|-------------|
| `claude-auth login [name]` | Sign in fresh (real OAuth flow), then save the result as a profile. Supports `--email`, `--console`, `--sso`. |
| `claude-auth add [name]` | Save the **currently** logged-in account. Name defaults to the email prefix. `--force` to overwrite. |
| `claude-auth list` / `ls` | List saved accounts. `*` marks the active one. |
| `claude-auth switch [name]` | Switch to a saved account. Interactive picker if no name. `--force`, `--no-save`. |
| `claude-auth usage [name]` | Show plan tier + rate-limit usage (session + weekly) across accounts. Detail view for one account. |
| `claude-auth autoswitch on/off/status` | Auto-switch to another account when usage gets high. `--threshold`, `--window`, `--strategy`. |
| `claude-auth pool start/stop/status` | Run a local proxy that pools all accounts and auto-fails-over on rate limits — **no restart needed**. `--port`, `--mode`, `--no-wire`. |
| `claude-auth pool create/join/use/usage/members/remove/leave/clear` | **Shared pool** — pool accounts with friends via a free, encrypted online store (no server). Pick who serves you live with `use`; `usage` shows each member's live headroom. |
| `claude-auth refresh [name]` | Refresh stored tokens of inactive accounts (keeps usage live & backups fresh). |
| `claude-auth statusline` | Compact one-line status (active account + weekly %) for Claude Code's status line. |
| `claude-auth current` / `whoami` | Show the active account. |
| `claude-auth rename <old> <new>` | Rename a saved profile (moves its Keychain backup too). |
| `claude-auth remove <name>` / `rm` | Delete a saved profile. `--force` to remove the active one. |
| `claude-auth doctor` | Health-check the setup: `claude`/PATH/Keychain/hooks/token validity/latest version. |
| `claude-auth update` | Update claude-auth to the latest version from GitHub. `--check` to only check, `--force` to reinstall. |
| `claude-auth completion bash\|zsh` | Output a shell-completion script (tab-complete commands & account names). |
| `claude-auth commands` | Show a grouped cheat sheet of every command, with flags and aliases. |

### Flag reference

- `login --email <addr>` — pre-populate the email on the login page
- `login --console` — use Anthropic Console (API billing) instead of the Claude subscription
- `login --sso` — force the SSO login flow
- `switch --no-save` — don't refresh the outgoing account's stored copy before switching
- `switch --force` — switch even if the target is already active

### Auto-switch when you're running low

Turn on auto-switch and `claude-auth` will move you to a fresher account before you hit a wall:

```console
$ claude-auth autoswitch on --threshold 90 --window session

  ✓ Auto-switch enabled — switch above 90% session usage
  strategy next · checks at most every 120s when Claude is idle
  Stop hook installed in ~/.claude/settings.json
```

How it works:

- It installs a **`Stop` hook** — Claude Code runs it the moment a response finishes and the session goes idle. That's the guarantee that **it never switches while a prompt is running**.
- On each idle check (throttled, default every 120s) it reads the active account's usage. If it's over the threshold, it picks another account with headroom and swaps the credential.
- `--strategy next` rotates round-robin; `--strategy lowest` jumps to the account with the most headroom. `--window` chooses `session` (5-hour) or `week`.
- You get a macOS notification and a log line in `~/.claude-accounts/autoswitch.log`.

> **Important:** switching swaps the on-disk credential — it can't move an *already-running* session to the new account (the token is held in memory). So an auto-switch takes effect on your **next** Claude Code session/restart. The notification reminds you to restart.

Auto-switch installs **two** hooks: a `Stop` hook (idle checkpoint, detached/zero-latency) and a `SessionStart` hook (synchronous **pre-flight** — it tries to switch *before* a new session loads its credentials, so the next session can land on a fresh account automatically).

Check status any time with `claude-auth autoswitch status`, preview a decision with `claude-auth autoswitch run --force --dry-run`, and turn it off with `claude-auth autoswitch off` (which removes both hooks).

### Run one session as a specific account: `session`

`switch` changes the account for **everything** — it swaps the shared credential on disk, so every Claude Code session on the machine follows. Sometimes you want the opposite: run **one** session as a specific account while your global login and every other session stay exactly as they are.

`claude-auth session <account>` does that. It launches Claude Code for you, pinned to the account you named, and leaves the Keychain and `~/.claude.json` untouched:

```console
$ claude-auth session work

  › Claude Code pinned to work · global login unchanged
  <interactive Claude Code session, authenticated as work>
```

Pass arguments straight through to `claude` after a `--`:

```console
$ claude-auth session work -- --resume
$ claude-auth session work -- -p "summarize this repo"
```

**How it stays scoped to just that session:** on macOS the credential lives in a single, machine-wide Keychain item, so there's no per-process credential to swap. Instead, `session` runs a tiny loopback proxy pinned to the one account (on an ephemeral port, in-process — no daemon, no files) and hands *only that `claude` child* its own `ANTHROPIC_BASE_URL`. A process environment variable overrides `settings.json`, so this cleanly wins even if `pool` is running. When the session ends, the proxy ends with it. Nothing global is ever written.

Want to point your own tool at it instead of launching Claude Code? `claude-auth session <account> --no-launch` keeps the pinned proxy up and prints the `ANTHROPIC_BASE_URL` to export (Ctrl-C to stop). You can run as many pinned sessions at once as you like — each is its own process on its own port.

### Pool all accounts into one — no restarts: `pool`

`autoswitch` is great, but it has one rough edge: a switch only takes effect on your **next** Claude Code session. `pool` removes that edge entirely.

`claude-auth pool start` launches a tiny **local proxy** (on `127.0.0.1`, your machine only) and points Claude Code at it. From then on, every request Claude Code makes flows through the proxy, which forwards it to the real API using one of your accounts. The moment an account hits its rate limit, the proxy quietly **switches to another account and retries the same request** — mid-conversation, with no switch command and no restart.

```console
$ claude-auth pool start

  › Starting pool on 127.0.0.1:8848 · mode failover
  ✓ Pool is live · Claude Code will use it on next start
  wired ANTHROPIC_BASE_URL into ~/.claude/settings.json
  stop anytime with claude-auth pool stop

$ claude-auth pool status

  Pool   ·   shared multi-account proxy

  ● running   pid 40127 · 127.0.0.1:8848 · mode failover

  personal   ready       served 142 · failovers 0
  work       resting 24s served 38 · failovers 1

  ✓ wired into settings.json
```

**Why it can switch without a restart** (and why it's not a hack): the Messages API is *stateless* — Claude Code resends the whole conversation on every turn, so there is no server-side session to "move." The proxy is just a load-balancer over independent requests, so any account can serve any turn. That's the one thing a credential-on-disk swap can't do.

Two modes:

- `--mode failover` (default) — keep using your current account until it's actually rate-limited, then fail over. This is the safe, conservative choice: it behaves exactly like `autoswitch`, just instantly and without a restart.
- `--mode balance` — spread requests across all accounts every turn, keeping them all warm.

Turn it off with `claude-auth pool stop` — it shuts the proxy down and restores your `settings.json` (then restart Claude Code).

> **⚠️ Heads-up on Anthropic's terms.** `failover` mode uses one account at a time — the same as switching manually, just automated. `balance` mode draws on several subscription accounts to serve one workflow, which may run against Anthropic's subscription terms (around getting around rate limits). Use your own accounts, and use `balance` knowing that. When in doubt, stick with `failover`.

> **Note:** `pool` works by setting `ANTHROPIC_BASE_URL` so Claude Code routes through the local proxy. If a future Claude Code version stops honoring that for subscription logins, the pool simply won't receive traffic (and `pool status` / `doctor` will tell you) — it can't break your normal setup, because `pool stop` always restores `settings.json`.

### Share a pool of accounts with friends: `pool create` / `join`

The local `pool` above only spans accounts saved on *your* Mac. A **shared pool** lets a group of friends pool their accounts together — with **no server to host**. Members' tokens live (encrypted) in a free [Pantry](https://getpantry.cloud) JSON store, and everyone runs the same local proxy fed from that one shared blob.

```console
# one person creates the pool (needs a free pantry id from getpantry.cloud)
$ claude-auth pool create <pantry-id>
  ✓ Pool created and encrypted.
    Share this link with people you trust:
    clpool:v1:pantry:<id>:<key>

# friends join with that link — contributing their current account in one step
$ claude-auth pool join "clpool:v1:pantry:<id>:<key>"

# start it, then pick whose token serves you — switches live, no restart
$ claude-auth pool start
$ claude-auth pool use alice
$ claude-auth pool usage      # live rate-limit headroom per member (who to switch to)
$ claude-auth pool members    # who's in + per-type token tallies (add --live for current counts)
```

`pool members` breaks each member's **contributed** (tokens their account served) and **consumed** (tokens they ran) down by type — input, output, cache-read, cache-write — since prompt caching makes those costs very different. Tallies are pool accounting flushed every ~5 min; pass `--live` to merge the running proxy's un-flushed counts for up-to-the-second totals.

Unlike the local `pool`, the shared pool **does not auto-failover**: it serves the **one** account you selected — so prompt caching stays intact — and `pool use <name>` changes which token serves you, taking effect on **running** sessions instantly (the proxy re-reads your choice from a local file, so there's nothing to restart). If your selected account gets rate-limited, you switch manually.

Admin: `pool remove <name>` drops any member, `pool leave` removes yourself, `pool clear` wipes the pool.

**Security & trust model:**
- Tokens are **encrypted client-side** — the key lives in the link and is never sent to Pantry, which only ever stores ciphertext (encrypt-then-MAC, stdlib only).
- **Anyone with the link can decrypt every token in the pool** and overwrite the blob. Share it only with people you trust, and over a private channel (it's a secret, like an SSH key).
- `pool remove` / `leave` / `clear` **un-share** a token but do **not revoke** it; to truly invalidate a token, its owner must log out / re-login.

**Known limits** (inherent to a serverless, shared-blob design):
- The store has no compare-and-swap, so two members writing at the same instant can lose the loser's change (usage counters are approximate).
- Claude's refresh tokens are single-use, so a contributor who *also* uses Claude Code normally may have their token rotated out from under the pool — dedicate an account to the pool, or re-`join` occasionally.

> **⚠️ Anthropic's terms:** pooling several people's subscriptions to serve one workflow may run against Anthropic's subscription terms (around circumventing rate limits). Use it with people you trust and at your own discretion.

### Keep every account's usage live: `refresh`

A saved account's access token is short-lived (~hours), so an account you haven't touched in a while can show a stale snapshot. `claude-auth refresh` exchanges each inactive account's refresh token for a fresh one (Anthropic's `POST /v1/oauth/token`), so `usage` stays live and switching never lands on a dead token. It only touches **inactive** accounts — the active one is owned by Claude Code and left alone. `usage` also auto-refreshes an account's token on demand if it returns expired.

### Status line

`claude-auth statusline` prints a compact, network-free segment from cached usage — ideal for Claude Code's status line:

```
● work · wk 57% · ↺ Jun 25 3:29am
```

Wire it into `~/.claude/settings.json`:

```jsonc
"statusLine": { "type": "command", "command": "claude-auth statusline" }
```

…or append it to your existing status-line script. It reads the cached snapshot (instant), and opportunistically kicks off a background usage refresh when the cache is older than 5 minutes, so it stays current without ever blocking a render.

### Shell completion

Tab-complete commands *and* account names:

```bash
# zsh — add to ~/.zshrc:
eval "$(claude-auth completion zsh)"
# bash — add to ~/.bashrc:
eval "$(claude-auth completion bash)"
```

```console
$ claude-auth switch <TAB>
personal   work
$ claude-auth usage wo<TAB>      # → work
```

### Health check

`claude-auth doctor` verifies the whole setup in one shot:

```console
$ claude-auth doctor

  Doctor   ·   checking your setup

  ✓ macOS
  ✓ claude CLI   2.1.187 (Claude Code)
  ✓ claude-auth on PATH   /Users/you/.local/bin/claude-auth
  ✓ Keychain access   live credential present
  ✓ 2 account(s) saved
  ✓ active account   personal
  ✓ autoswitch   Stop + SessionStart hooks present

  accounts:
  ✓ personal   active (managed live by Claude Code)
  ✓ work       token valid

  ● 9 ok
```

It catches the common gotchas — `claude` not on PATH, missing/partial auto-switch hooks, stale tokens, an active login that isn't saved.

## How it works

```
                         claude-auth switch work
                                   │
            ┌──────────────────────┼──────────────────────┐
            ▼                      ▼                       ▼
   1. refresh outgoing     2. write secrets         3. write identity
      account's backup        into the LIVE slot       into ~/.claude.json
            │                      │                       │
            ▼                      ▼                       ▼
   Keychain:               Keychain:                 ~/.claude.json
   claude-auth-store        "Claude Code-credentials"   oauthAccount + userID
     ├─ personal  ◄─┐         (-U, updated in place        ↑ replaced with
     └─ work        │          so the ACL survives)          work's identity
                    └─ (snapshot of current live)
```

A full deep-dive — storage layout, the in-place-update trick, atomic writes, and the active-account detection — lives in **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## Where things are stored

| Path / item | Purpose | Secret? |
|-------------|---------|---------|
| Keychain `Claude Code-credentials` | The live credential Claude Code reads | yes |
| Keychain `claude-auth-store` (one item per profile) | Per-account credential backups | yes |
| `~/.claude-accounts/accounts.json` (chmod 600) | Non-secret index: names, emails, orgs, expiry | no |
| `~/.claude.json` → `oauthAccount`, `userID` | Live account identity (managed by Claude Code; swapped on switch) | no |

**The `claude-auth` script itself contains zero secrets** — safe to commit, share, and publish. All tokens stay in *your* Keychain on *your* machine.

## Security notes

- Secrets remain in the macOS Keychain, encrypted at rest — never in plaintext config.
- The live Keychain item is **updated in place** (`security add-generic-password -U`), preserving its access-control list so Claude Code isn't re-prompted for Keychain access on every launch.
- `~/.claude.json` is rewritten atomically (temp file + `os.replace`) so an interrupted switch can't corrupt your config.
- Brief caveat: `security ... -w "<secret>"` passes the secret as a CLI argument, so it's momentarily visible to `ps` for *your own user* during the write. Local-only and transient.

## Troubleshooting

**`claude-auth: command not found`** — `~/.local/bin` isn't on your `PATH`. See [Install → Manual](#manual).

**Switch had no effect** — restart Claude Code; running sessions cache the token in memory.

**`stored credential for X is missing from Keychain`** — the backup Keychain item was deleted (e.g. via Keychain Access). Re-create it: switch to that account through `claude auth login`, then `claude-auth add X`.

**macOS prompts for Keychain access** — click *Always Allow*. This should be rare since the tool updates items in place rather than recreating them.

## Limitations

- **macOS only** for now. Linux stores credentials in `~/.claude/.credentials.json` (plaintext) instead of the Keychain; a Linux backend is a natural future addition.
- `switch` / `autoswitch` affect **new** sessions only (a running session caches its token in memory). If you want switching to take effect *inside* a running session, use `claude-auth pool` instead — it routes per-request, so there's nothing to restart.

## 🐈 One more thing

Run `claude-auth` (or `claude-auth --help`) in a real terminal and a little cat walks the full width of your CLI — in the clay gradient — and stops at the right edge with a trailing `meow~ ♪`, just above the wordmark. It's purely cosmetic: it's skipped when output is piped, and you can turn it off with `CLAUDE_AUTH_NO_ANIM=1`.

```
                                              meow~ ♪ /\_/\
                                                      ( ^.^ )
                                                       > ^ <
```

## License

[MIT](LICENSE)

---

<sub>Not affiliated with Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic.</sub>
