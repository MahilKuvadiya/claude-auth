#!/usr/bin/env python3
"""
DEMO: continue one conversation across two accounts' tokens, and watch the
per-turn token bifurcation (input / cache_write / cache_read / output).

- Phase A: build context on account A's token (Mahil).
- Phase B: swap to account B's token (Vishal), keep the SAME conversation.
- Each turn is a real `curl` to https://api.anthropic.com/v1/messages?beta=true.
- The big Claude-Code system+tools prefix (identical every turn) is the cached
  block; your chat rides on top. Model + effort are identical on every call.

The Messages API is stateless, so we resend the whole conversation each turn;
that is why B can answer "what is my company name?" — the history is resent —
and B's cache_read>0 proves it is reading the cache A created (same org).
"""
import base64, json, os, subprocess, sys

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "captures")
URL = "https://api.anthropic.com/v1/messages?beta=true"
HOP = {"connection","keep-alive","proxy-authenticate","proxy-authorization",
       "te","trailer","trailers","transfer-encoding","upgrade"}

cap   = json.load(open(os.path.join(D, "mahil.json")))
body0 = cap["body"]["json"]
TOK_A = cap["headers"]["Authorization"]                                   # Mahil live
TOK_B = json.load(open(os.path.join(D, "msg_1.json")))["headers"]["Authorization"]  # Vishal live

# fixed gate-passing prefix, reused byte-for-byte every turn
SYSTEM = body0["system"]     # 3 blocks; blocks 1 & 2 carry cache_control
TOOLS  = body0["tools"]      # 29 Claude Code tools
META   = body0.get("metadata")
MODEL  = "claude-opus-4-8"
EFFORT = {"effort": "high"}  # identical every turn

# headers: reuse Claude Code's shape (satisfies the OAuth gate), swap only auth
HDRS = {}
for k, v in cap["headers"].items():
    lk = k.lower()
    if lk in HOP or lk in ("host","content-length","authorization","accept-encoding"):
        continue
    HDRS[k] = v
HDRS["content-type"] = "application/json"
HDRS["accept-encoding"] = "identity"

def build_body(messages):
    # cache_control on the last message block too, so the growing conversation
    # caches across turns (in addition to the system/tools breakpoints).
    msgs = []
    for i, m in enumerate(messages):
        if i == len(messages) - 1:
            msgs.append({"role": m["role"],
                         "content": [{"type": "text", "text": m["content"],
                                      "cache_control": {"type": "ephemeral"}}]})
        else:
            msgs.append({"role": m["role"], "content": m["content"]})
    b = {"model": MODEL, "max_tokens": 1024, "stream": False,
         "thinking": {"type": "disabled"},
         "output_config": EFFORT,
         "system": SYSTEM, "tools": TOOLS, "messages": msgs}
    if META: b["metadata"] = META
    return b

CURLS = os.path.join(os.path.dirname(D), "curls")
os.makedirs(CURLS, exist_ok=True)

def curl(token, body, show=False, turn=None):
    bf = os.path.join(D, "_body.json")
    with open(bf, "w") as f:
        json.dump(body, f)
    cmd = ["curl","-sS","-X","POST",URL]
    for k, v in HDRS.items():
        cmd += ["-H", f"{k}: {v}"]
    cmd += ["-H", f"Authorization: {token}", "--data", f"@{bf}"]
    # emit a standalone, runnable curl + body for Postman
    if turn is not None:
        bodyfile = os.path.join(CURLS, f"body{turn}.json")
        with open(bodyfile, "w") as f:
            json.dump(body, f)
        lines = [f"curl -sS -X POST '{URL}' \\"]
        for k, v in HDRS.items():
            lines.append(f"  -H '{k}: {v}' \\")
        lines.append(f"  -H 'Authorization: {token}' \\")
        lines.append(f"  --data @body{turn}.json")
        with open(os.path.join(CURLS, f"curl_{turn}.sh"), "w") as f:
            f.write("#!/bin/sh\n# run from the curls/ directory\n" + "\n".join(lines) + "\n")
    if show:
        shown = [c if not c.startswith("Authorization:") else "Authorization: Bearer sk-ant-oat01-…" for c in cmd]
        # collapse the giant --data for readability
        print("  raw call (headers trimmed):")
        print(f"    curl -X POST '{URL}' \\")
        print(f"      -H 'anthropic-beta: {HDRS.get('anthropic-beta','')[:48]}…' \\")
        print(f"      -H 'user-agent: {HDRS.get('user-agent','')}' \\")
        print(f"      -H 'Authorization: Bearer sk-ant-oat01-…' \\")
        print(f"      --data @body.json   # body = fixed system+tools prefix + conversation")
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout
    return json.loads(out)

def answer_text(resp):
    return "".join(b.get("text","") for b in resp.get("content",[]) if b.get("type")=="text").strip()

def usage_row(u):
    return (u.get("input_tokens",0), u.get("cache_creation_input_tokens",0),
            u.get("cache_read_input_tokens",0), u.get("output_tokens",0))

# ── the conversation ─────────────────────────────────────────────────────────
PHASE_A = [
    "Hi, My name is Mahil.",
    "My company name is devx.",
    "my friends name is meet, his nickname is Laggo.",
    "write me a poem about the flowers.",
]
PHASE_B = [
    "what is my company name?",
    "write me the poem on the river.",
]

messages = []          # full transcript, resent every turn
rows = []              # (turn, account, prompt, usage tuple, answer)

def run(prompt, token, acct, turn, show=False):
    messages.append({"role": "user", "content": prompt})
    resp = curl(token, build_body(messages), show=show, turn=turn)
    if "usage" not in resp:
        print(f"\n[turn {turn}] ERROR: {json.dumps(resp)[:300]}")
        sys.exit(1)
    ans = answer_text(resp)
    messages.append({"role": "assistant", "content": ans})
    u = usage_row(resp["usage"])
    rows.append((turn, acct, prompt, u, ans))
    print(f"\n┌─ turn {turn} · {acct} (token …{token[-6:]})")
    print(f"│  prompt : {prompt}")
    print(f"│  tokens : input={u[0]:<6} cache_write={u[1]:<6} cache_read={u[2]:<6} output={u[3]:<6}")
    print(f"└─ answer :\n{ans}\n")

print("="*78)
print("PHASE A — build context on account A (Mahil)")
print("="*78)
for i, p in enumerate(PHASE_A, 1):
    run(p, TOK_A, "A/Mahil ", i, show=(i==1))

print("\n" + "="*78)
print("PHASE B — SAME conversation, now on account B (Vishal) — token swapped")
print("="*78)
for j, p in enumerate(PHASE_B, len(PHASE_A)+1):
    run(p, TOK_B, "B/Vishal", j)

print("\n" + "="*78)
print("SUMMARY  (input / cache_write / cache_read / output)")
print("="*78)
print(f"{'turn':<5}{'account':<10}{'input':>7}{'cache_wr':>10}{'cache_rd':>10}{'output':>8}   prompt")
for turn, acct, prompt, u, _ in rows:
    print(f"{turn:<5}{acct:<10}{u[0]:>7}{u[1]:>10}{u[2]:>10}{u[3]:>8}   {prompt[:34]}")
print("\nNote: cache_read stays high after the swap → account B reads the cache")
print("account A created (same Team org). B answering the company-name question")
print("proves the conversation itself carried over (stateless API resends history).")
# save a full transcript (prompts + complete answers + usage)
tpath = os.path.join(os.path.dirname(D), "transcript.md")
with open(tpath, "w") as f:
    f.write("# Cross-account conversation demo — full transcript\n")
    for turn, acct, prompt, u, ans in rows:
        f.write(f"\n## Turn {turn} · {acct.strip()}\n")
        f.write(f"- tokens: input={u[0]}  cache_write={u[1]}  cache_read={u[2]}  output={u[3]}\n\n")
        f.write(f"**User:** {prompt}\n\n")
        f.write(f"**Assistant:**\n\n{ans}\n")
print(f"\nfull transcript written to: {tpath}")
try: os.remove(os.path.join(D, "_body.json"))
except OSError: pass
