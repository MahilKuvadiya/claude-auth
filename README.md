# claudex

> Switch between multiple Claude Code accounts on one Mac — like `gh auth switch`, but for Claude Code.

[![CI](https://github.com/vishalmakwana111/claudex/actions/workflows/ci.yml/badge.svg)](https://github.com/vishalmakwana111/claudex/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/vishalmakwana111/claudex?sort=semver)](https://github.com/vishalmakwana111/claudex/releases)
[![Homebrew](https://img.shields.io/badge/homebrew-claudex-blue)](https://github.com/vishalmakwana111/homebrew-claudex)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

If you juggle more than one Claude Code login (personal, work, a client's org…), you know the pain: there's no built-in account switcher, so you end up logging out and back in every time. `claudex` fixes that. Save each account once, then flip between them instantly — and pool, warm, and track usage across all of them.

```console
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗██╗  ██╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝╚██╗██╔╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗   ╚███╔╝ 
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝   ██╔██╗ 
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗██╔╝ ██╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
multi-account switcher · rate-limit tooling for Claude Code
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

$ claudex switch work

  ✓ Switched to work  · you@company.com
  ↻ restart Claude Code (and running sessions) to use this account
```

> The real output is rendered in Claude's warm "clay" palette with a gradient wordmark. Colors auto-disable when piped or when `NO_COLOR` is set.

**📖 Every command and flag lives in [COMMANDS.md](COMMANDS.md). Internals in [ARCHITECTURE.md](ARCHITECTURE.md).**

## Why it's needed

A Claude Code login isn't a single token in a single place. It's split across **two** locations on your machine:

| What | Where | Contains |
|------|-------|----------|
| **Secrets** | macOS Keychain, service `Claude Code-credentials` | OAuth `accessToken`, `refreshToken`, `expiresAt`, plus MCP server tokens |
| **Identity** | `~/.claude.json` → `oauthAccount` + `userID` | email, organization, account UUID |

Swapping just the token leaves the app convinced it's still the old account (wrong email/org, possible mismatches). A *correct* switch has to swap **both, atomically** — exactly what `claudex` does, and why hand-pasting tokens is fragile.

## Features

- 🔑 **Tokens never leave the Keychain.** Per-account backups are namespaced Keychain items, not plaintext files. Only non-secret metadata (email/org) touches disk.
- 🔄 **Atomic two-part swap** of the Keychain credential + `~/.claude.json` identity.
- ♻️ **Auto-sync on switch.** The outgoing account's stored copy is refreshed before you leave it, so rotated tokens never go stale.
- 📊 **Cross-account usage** — see every account's plan tier and rate-limit headroom without switching.
- ⚖️ **Pool & failover** — route through a local proxy that switches accounts mid-conversation, no restart.
- 🔥 **Keep-warm** — hold a specific idle session's prompt cache alive so returning is cheap.
- 📦 **Zero dependencies.** One self-contained Python 3 file (stdlib only). Nothing to `pip install`.

## Requirements

- **macOS** (uses the login Keychain via the `security` CLI)
- **Python 3** (ships with macOS / Xcode Command Line Tools)
- **Claude Code** installed and on your `PATH` (only needed for the `login` command)

## Install

**Homebrew** (recommended):

```bash
brew tap vishalmakwana111/claudex   # one time
brew install claudex
```

**From source:**

```bash
git clone https://github.com/vishalmakwana111/claudex.git
cd claudex
./install.sh
```

The installer copies the script to `~/.local/bin/claudex` and checks that directory is on your `PATH`.

<details>
<summary>Manual install</summary>

```bash
cp bin/claudex ~/.local/bin/claudex
chmod +x ~/.local/bin/claudex
# ensure ~/.local/bin is on PATH:
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```
</details>

Once installed, update in place — no re-clone:

```bash
claudex update          # download the latest and replace itself
claudex update --check  # just tell me if a newer version exists
```

`update` fetches the latest `bin/claudex` from GitHub, verifies it parses as valid Python, then atomically swaps it over the running file. Your saved accounts are untouched. See [COMMANDS.md → update](COMMANDS.md#update).

## Quick start

```bash
# 1. Save the account you're currently logged into
claudex add personal

# 2. Sign into another account and save it in one step
claudex login work        # opens the browser; saved as "work" when done

# 3. See what you've got
claudex list

# 4. Switch any time (no browser needed)
claudex switch personal
```

> **Restart Claude Code after switching.** A running session holds the old token in memory; the swap only affects new sessions. (Want no-restart switching? See [`pool`](COMMANDS.md#pool-local).)

## Commands at a glance

Full reference — every flag, example, and gotcha — in **[COMMANDS.md](COMMANDS.md)**.

| | Command | What it does |
|--|---------|--------------|
| **Accounts** | [`login`](COMMANDS.md#login) `[name]` | Sign in fresh (real OAuth) and save as a profile |
| | [`add`](COMMANDS.md#add) `[name]` | Save the currently logged-in account |
| | [`switch`](COMMANDS.md#switch) `[name]` | Switch the machine-wide login to a saved account |
| | [`session`](COMMANDS.md#session) `<name>` | Run **one** session pinned to an account |
| | [`list`](COMMANDS.md#list-alias-ls) / `ls` | List saved accounts |
| | [`current`](COMMANDS.md#current-alias-whoami) / `whoami` | Show the active account |
| | [`rename`](COMMANDS.md#rename) `<old> <new>` | Rename a profile |
| | [`remove`](COMMANDS.md#remove-alias-rm) `<name>` / `rm` | Delete a profile |
| **Usage & limits** | [`usage`](COMMANDS.md#usage) `[name]` | Plan tier + rate-limit usage across accounts |
| | [`refresh`](COMMANDS.md#refresh) `[name]` | Refresh stored tokens of inactive accounts |
| | [`autoswitch`](COMMANDS.md#autoswitch) `[on\|off]` | Auto-switch when usage gets high |
| | [`pool`](COMMANDS.md#pool-local) `[start\|stop]` | Pool local accounts behind one auto-failover proxy |
| | [`pool create`](COMMANDS.md#pool-shared)`/join/use/…` | Shared pool with friends (no server) |
| | [`sessions`](COMMANDS.md#sessions) | List your Claude Code sessions (find a session id) |
| | [`keep-warm`](COMMANDS.md#keep-warm) `[add\|status]` | Keep an idle session's prompt cache alive |
| **Setup** | [`statusline`](COMMANDS.md#statusline) | Compact status line for Claude Code |
| | [`completion`](COMMANDS.md#completion) `[bash\|zsh]` | Shell-completion script |
| | [`doctor`](COMMANDS.md#doctor) | Health-check your setup |
| | [`update`](COMMANDS.md#update) | Update claudex to the latest version |
| | [`commands`](COMMANDS.md#commands) | Show the cheat sheet in your terminal |

## Highlights

**See where every account stands — [`usage`](COMMANDS.md#usage).** One table, all accounts, no switching: plan tier (`Pro` / `Max 5x` / `Team` / …) next to session and weekly rate-limit bars, colored by severity. The fastest way to decide which account to switch to. Data comes from the same `/api/oauth/usage` endpoint Claude Code's `/status` tab reads.

**Pool everything, switch mid-conversation — [`pool`](COMMANDS.md#pool-local).** `pool start` runs a tiny local proxy and points Claude Code at it. The moment an account hits its rate limit, the proxy switches to another and retries the same request — no switch command, no restart. Works because the Messages API is stateless: every turn resends the whole conversation, so any account can serve any turn. A [**shared pool**](COMMANDS.md#pool-shared) extends this to friends via a free encrypted store — no server to host.

**Keep an idle session cheap to return to — [`keep-warm`](COMMANDS.md#keep-warm).** Claude Code's prompt cache has a 1-hour TTL; step away longer and the next turn re-pays the whole conversation. `keep-warm add <session>` replays that session's last request as a cheap cache read every ~50 min while idle, refreshing the timer — so coming back an hour later costs ~0.1× instead of a full re-pay. Find the session with [`sessions`](COMMANDS.md#sessions).

**Run one session as another account — [`session`](COMMANDS.md#session).** Unlike `switch` (which moves the whole machine), `session <account>` pins a single Claude Code session to an account via an in-process proxy, leaving your global login and every other session untouched.

**Switch before you hit the wall — [`autoswitch`](COMMANDS.md#autoswitch).** Installs idle-only Claude Code hooks that move you to a fresher account when usage crosses a threshold — never mid-prompt.

## How it works

```
                         claudex switch work
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

A full deep-dive — storage layout, the in-place-update trick, atomic writes, active-account detection, and the proxy designs behind `pool` / `keep-warm` — lives in **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## Where things are stored

| Path / item | Purpose | Secret? |
|-------------|---------|---------|
| Keychain `Claude Code-credentials` | The live credential Claude Code reads | yes |
| Keychain `claude-auth-store` (one item per profile) | Per-account credential backups | yes |
| `~/.claude-accounts/accounts.json` (chmod 600) | Non-secret index: names, emails, orgs, expiry | no |
| `~/.claude.json` → `oauthAccount`, `userID` | Live account identity (managed by Claude Code; swapped on switch) | no |

**The `claudex` script itself contains zero secrets** — safe to commit, share, and publish. All tokens stay in *your* Keychain on *your* machine.

## Security notes

- Secrets remain in the macOS Keychain, encrypted at rest — never in plaintext config.
- The live Keychain item is **updated in place** (`security add-generic-password -U`), preserving its access-control list so Claude Code isn't re-prompted for Keychain access on every launch.
- `~/.claude.json` is rewritten atomically (temp file + `os.replace`) so an interrupted switch can't corrupt your config.
- Caveat: `security ... -w "<secret>"` passes the secret as a CLI argument, so it's momentarily visible to `ps` for *your own user* during the write. Local-only and transient.
- Shared pools encrypt tokens client-side, but **anyone with the pool link can decrypt them** — share links only with people you trust. See [COMMANDS.md → pool (shared)](COMMANDS.md#pool-shared).

## Troubleshooting

**`claudex: command not found`** — `~/.local/bin` isn't on your `PATH`. See the manual-install steps above.

**Switch had no effect** — restart Claude Code; running sessions cache the token in memory.

**`stored credential for X is missing from Keychain`** — the backup Keychain item was deleted. Re-create it: switch to that account via `claude auth login`, then `claudex add X`.

**macOS prompts for Keychain access** — click *Always Allow*. Should be rare, since the tool updates items in place rather than recreating them.

Run [`claudex doctor`](COMMANDS.md#doctor) to check the whole setup at once.

## Limitations

- **macOS only** for now. Linux stores credentials in `~/.claude/.credentials.json` (plaintext); a Linux backend is a natural future addition.
- `switch` / `autoswitch` affect **new** sessions only (a running session caches its token in memory). For switching *inside* a running session, use [`pool`](COMMANDS.md#pool-local) — it routes per-request, so there's nothing to restart.

## 🐈 One more thing

Run `claudex` (or `claudex --help`) in a real terminal and a little cat walks the full width of your CLI — in the clay gradient — and stops at the right edge with a trailing `meow~ ♪`, just above the wordmark. Purely cosmetic: skipped when output is piped, and disabled with `CLAUDE_AUTH_NO_ANIM=1`.

```
                                              meow~ ♪ /\_/\
                                                      ( ^.^ )
                                                       > ^ <
```

## License

[MIT](LICENSE)

---

<sub>Not affiliated with Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic.</sub>
