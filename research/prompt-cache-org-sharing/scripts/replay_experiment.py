#!/usr/bin/env python3
"""Definitive cross-account test.
Body   = Mahil's captured cached prefix (captures/mahil.json)  [Mahil WROTE this cache]
A token= Mahil live (mahil.json Authorization)  -> control, expect cache READ
B token= Vishal live (msg_1.json Authorization) -> read>0 SHARED, read=0 ISOLATED
Same body bytes + same headers; only Authorization differs."""
import base64, http.client, json, os, ssl, time

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "captures")
UP_HOST = "api.anthropic.com"
HOP = {"connection","keep-alive","proxy-authenticate","proxy-authorization",
       "te","trailer","trailers","transfer-encoding","upgrade"}
_ctx = ssl.create_default_context()

mahil = json.load(open(os.path.join(D,"mahil.json")))      # body + Mahil token
vishal = json.load(open(os.path.join(D,"msg_1.json")))     # Vishal live token

raw_body = base64.b64decode(mahil["body"]["raw_b64"])
path = mahil["path"]
mahil_headers = mahil["headers"]
mahil_auth = mahil_headers.get("Authorization")
vishal_auth = vishal["headers"].get("Authorization")

def base_headers():
    h = {}
    for k, v in mahil_headers.items():
        lk = k.lower()
        if lk in HOP or lk in ("host","content-length","authorization","accept-encoding"): continue
        h[k] = v
    h["Host"] = UP_HOST; h["Accept-Encoding"] = "identity"
    return h

def parse_usage(sse):
    su, fout = None, None
    for line in sse.splitlines():
        line=line.strip()
        if not line.startswith("data:"): continue
        try: obj=json.loads(line[5:].strip())
        except Exception: continue
        if obj.get("type")=="message_start": su=obj.get("message",{}).get("usage")
        elif obj.get("type")=="message_delta" and obj.get("usage"): fout=obj["usage"].get("output_tokens")
    return su, fout

def fire(label, token):
    h = base_headers(); h["Authorization"] = token
    conn = http.client.HTTPSConnection(UP_HOST,443,timeout=120,context=_ctx)
    t0=time.time(); conn.request("POST",path,body=raw_body,headers=h)
    resp=conn.getresponse(); data=resp.read().decode("utf-8","replace"); dt=(time.time()-t0)*1000
    print(f"\n── {label} ──  HTTP {resp.status}  ({dt:.0f} ms)")
    if resp.status!=200:
        print(f"   body: {data[:300]}"); conn.close(); return None
    su,fout=parse_usage(data)
    if not su: print("   (no usage parsed)"); conn.close(); return None
    inp,cw,cr = su.get("input_tokens",0),su.get("cache_creation_input_tokens",0),su.get("cache_read_input_tokens",0)
    print(f"   input_tokens                : {inp:>8}")
    print(f"   cache_creation_input_tokens : {cw:>8}")
    print(f"   cache_read_input_tokens     : {cr:>8}")
    print(f"   output_tokens               : {(fout or su.get('output_tokens',0)):>8}")
    conn.close(); return {"input":inp,"creation":cw,"read":cr}

print(f"body: Mahil's captured prefix ({len(raw_body)} bytes)  ·  only Authorization differs")
print(f"A token …{mahil_auth[-6:]}   B token …{vishal_auth[-6:]}")
a = fire("A  control  (Mahil live — wrote the cache)", mahil_auth)
time.sleep(1)
b = fire("B  test     (Vishal live — different member, same org)", vishal_auth)

print("\n"+"="*64)
if a and b:
    print(f"A (Mahil)  cache_read = {a['read']:>8}   creation = {a['creation']}")
    print(f"B (Vishal) cache_read = {b['read']:>8}   creation = {b['creation']}")
    print("-"*64)
    if a["read"]==0:
        print("Control A didn't read cache (TTL lapsed) — re-run to re-warm.")
    elif b["read"]>0:
        print(f"VERDICT: SHARED — Vishal read {b['read']} tokens from Mahil's cache.")
        print("         Prompt cache IS shared across members of one Team org.")
    elif b["creation"]>0 and b["read"]==0:
        print("VERDICT: ISOLATED — identical prefix, Vishal read=0 and wrote its own cache.")
        print("         Prompt cache is partitioned per account/seat, not just per org.")
    else:
        print("VERDICT: inconclusive.")
