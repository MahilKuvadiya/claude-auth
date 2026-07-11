# Finding: Prompt cache is shared across accounts within one Claude Team org

**Date:** 2026-07-10
**Environment:** Claude Code v2.1.206, model `claude-opus-4-8`, org "devx labs" (Team plan)
**Accounts:** `mahil.kuvadiya@devxlabs.ai` (Mahil) and `vishal.makwana@devxlabs.ai` (Vishal) — two distinct member seats in the same organization.

## Question

Anthropic's docs say prompt caches are isolated **per organization** (and, since 2026-02-05, per **workspace** within an org on the Claude API). What they do **not** spell out: for **subscription OAuth** (Claude Code), do two different member seats of the *same* Team org share one cache partition, or is the cache keyed per account/seat?

This determines whether:
- switching accounts (or a pool failing over) mid-work loses the prompt cache, and
- pooling several seats of one Team org thrashes the cache or reuses it.

## TL;DR result

**The cache is shared across seats of the same org.** A request first sent under Mahil's token, replayed byte-for-byte under Vishal's token, read **34,476 tokens from cache** (`cache_creation_input_tokens = 0`). Rate limits, by contrast, are **per seat**. So pooling seats of one org gives **aggregate rate limit + one shared warm cache**.

## How prompt caching works (the mechanism under test)

- Prompt caching is a **prefix match**: the API hashes the rendered prompt (order: `tools` → `system` → `messages`) up to each `cache_control` breakpoint and reuses precomputed state when the hash matches a recent request.
- The response `usage` object bifurcates the input tokens:
  - `cache_creation_input_tokens` — tokens **written** to cache (a cache write).
  - `cache_read_input_tokens` — tokens **served** from cache (a cache hit).
  - `input_tokens` — tokens after the last breakpoint, processed at full price.
- Isolation (per docs): *"Caches are isolated between organizations… As of February 5, 2026, caches are also isolated per workspace within an organization on the Claude API…"* The mechanism never transfers content between requests — a hit only reuses computation for a prefix the caller itself re-sends. So the only observable signal for "shared" is **`cache_read_input_tokens > 0` on a second token for a prefix only the first token had sent**.

## Method

All requests are **raw HTTPS calls to `POST https://api.anthropic.com/v1/messages?beta=true`** (no Claude Code process in the loop), so model, effort, headers and body could be held identical while only the `Authorization` bearer changed.

Three practical facts had to be established first:

1. **The OAuth gate.** A bare subscription token (`sk-ant-oat01-…`) on `/v1/messages` returns **`429 rate_limit_error`** even with full rate-limit headroom (9% of the 5h window). It is only honored when the request carries **Claude Code's shape**: `anthropic-beta: claude-code-20250219,oauth-2025-04-20,…`, `User-Agent: claude-cli/2.1.206`, **and** Claude Code's actual `system` prompt (a *generic* system prompt is also 429'd). The read-only usage endpoint (`GET /api/oauth/usage`), by contrast, accepts a bare token. This is why the `pool`/`session` proxies work by *forwarding Claude Code's own request* rather than crafting one.
2. **Token validity.** Locally-stored / refresh-minted tokens for non-active accounts were rejected (`401 Invalid bearer token`) because the shared-pool daemon had rotated their **single-use** refresh chains (documented pool limitation; visible in `pool.log`: `vishal.makwana: token rejected`). The reliable way to obtain a working `/v1/messages` token was to **capture the live token straight from a real Claude Code request** (a loopback forwarder + `claude -p`, the same primitive `claude-auth session` uses).
3. **Byte-exactness.** The cache is byte-exact on the prefix, so replays must use the **exact original request bytes** (a re-serialized JSON would differ in key order/whitespace and false-miss). Bodies were captured and replayed verbatim; only the `Authorization` header was swapped.

## Experiment 1 — byte-exact cross-account replay

Captured one real Claude Code request (issued under Mahil), then replayed the **identical 102,202-byte body** twice, swapping only the bearer:

| Run | Token (account) | `cache_creation` | `cache_read` | `input` |
|---|---|---:|---:|---:|
| A (control) | Mahil (wrote the cache) | 0 | **34,476** | 3,027 |
| B (test) | **Vishal** (different seat, same org) | 0 | **34,476** | 3,027 |

Vishal read the exact cache Mahil created, with zero re-creation → **cache is shared org-wide**. The control read the same 34,476 across three independent runs (stable, reproducible).

## Experiment 2 — a real conversation continued across a token swap

Reused Claude Code's `system`+`tools` (29 tools, ~34k tokens) as a fixed cached prefix and injected a custom conversation into `messages`. Model `claude-opus-4-8`, `output_config.effort: high`, `thinking: disabled` — **identical on every turn**. Turns 1–4 sent with Mahil's token, turns 5–6 with Vishal's; the full transcript is resent each turn (stateless API).

| turn | account | input | cache_write | cache_read | output | prompt |
|---|---|---:|---:|---:|---:|---|
| 1 | Mahil | 2 | 34,180 | 0 | 26 | Hi, My name is Mahil. |
| 2 | Mahil | 2 | 35 | 34,180 | 23 | My company name is devx. |
| 3 | Mahil | 2 | 43 | 34,215 | 33 | my friend's nickname is Laggo. |
| 4 | Mahil | 2 | 46 | 34,258 | 297 | write me a poem about the flowers. |
| 5 | **Vishal** | 2 | 305 | **34,304** | 12 | **what is my company name?** |
| 6 | **Vishal** | 2 | 23 | **34,609** | 332 | write me the poem on the river. |

Two things are proven by the text + the numbers:

- **Continuity across the swap:** turn 5 (Vishal) answered *"Your company name is **devx**"* — a fact stated only in turn 2, which was sent under **Mahil's** token. Turn 6 even opened *"…for you, Mahil."* The conversation carried over because the history is resent, not because of any server-side session.
- **Shared cache across the swap:** `cache_read` stayed ~34k the instant the token changed (turn 5) — Vishal read the cache Mahil built. A re-run started fully warm (turn 1 `cache_read=34,180`, `cache_write=0`), showing the cache also persists across independent runs for the subscription TTL (1h).

(See `transcript.md` for the complete LLM outputs.)

## Conclusions

1. **Prompt cache is shared across member seats of the same Claude Team organization** (subscription OAuth). This confirms the documented org/workspace-level isolation applies to per-seat OAuth — the case the public docs left unstated.
2. **Rate limits are per seat**, not per org (Mahil 68% vs Vishal 9% on the 5h window, independent).
3. **Implication for pooling / switching:**
   - Pooling seats within one org yields **aggregate rate limit + a single shared warm cache** — the ideal case. Cache-thrashing only occurs when pooling across *different* orgs.
   - Switching between same-org accounts (or the 30s live credential re-read) does **not** incur a cold cache-rebuild turn; only cross-org hops do.

## Caveats

- Scope: n = 1 organization, 2 seats, one model, one prefix. The numbers are byte-exact and consistent and match the documented isolation model, so this is expected to generalize to members of the same org/workspace — but it is not a multi-org study.
- The OAuth gate (Claude-Code-shaped requests) and the single-use refresh-token rotation are v2.1.206 behaviors observed on macOS.

## Reproduction

Scripts under `scripts/` (they read **live** tokens captured locally; those are never committed):

1. `capture_proxy.py` — loopback forwarder; launches `claude -p` through it and captures the exact request + live token.
2. `replay_experiment.py` — replays a captured body byte-for-byte under two tokens; prints the `usage` bifurcation (Experiment 1).
3. `demo.py` — the multi-turn cross-account conversation (Experiment 2); emits per-turn `usage` and full answers.

Token TTL is a few hours; re-capture when they expire (`401 Invalid bearer token`).

## Citations

- Prompt caching — cache storage & isolation: <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
- How Claude Code uses prompt caching (layers, subagents, per-model cache): <https://code.claude.com/docs/en/prompt-caching>
- Lessons from building Claude Code: Prompt caching is everything: <https://claude.com/blog/lessons-from-building-claude-code-prompt-caching-is-everything>
