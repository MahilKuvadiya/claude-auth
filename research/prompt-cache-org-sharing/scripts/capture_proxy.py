#!/usr/bin/env python3
"""Same primitive as `claude-auth session`: an ephemeral loopback forwarder.
Claude Code is launched pointed at it (ANTHROPIC_BASE_URL), builds its own real
request, and we (a) capture that exact request and (b) transparently forward it
to api.anthropic.com — Authorization is passed through untouched (no keychain
read). Confirms the Claude-Code-shaped request returns 200 and gives us the
genuine shape to replay for the cache experiment."""
import http.client, json, os, shutil, ssl, subprocess, threading, base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CAP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "captures")
os.makedirs(CAP_DIR, exist_ok=True)
UP_HOST = "api.anthropic.com"
HOP = {"connection","keep-alive","proxy-authenticate","proxy-authorization",
       "te","trailer","trailers","transfer-encoding","upgrade"}
_ctx = ssl.create_default_context()
_n = [0]
_lock = threading.Lock()

class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass
    def do_GET(self):    self._relay()
    def do_POST(self):   self._relay()
    def do_PUT(self):    self._relay()
    def do_PATCH(self):  self._relay()
    def do_DELETE(self): self._relay()

    def _relay(self):
        ln = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(ln) if ln else b""
        # capture only the messages endpoint
        if "/v1/messages" in self.path:
            with _lock:
                _n[0] += 1; idx = _n[0]
            hdrs = {k: self.headers[k] for k in self.headers.keys()}
            bstore = {"raw_b64": base64.b64encode(body).decode()}  # exact bytes for replay
            try:
                bstore["json"] = json.loads(body.decode())          # parsed, for summary only
            except Exception:
                pass
            with open(os.path.join(CAP_DIR, f"msg_{idx}.json"), "w") as f:
                json.dump({"method": self.command, "path": self.path,
                           "headers": hdrs, "body": bstore}, f)
        # transparent forward (Authorization passed through unchanged)
        up = {}
        for k in self.headers.keys():
            lk = k.lower()
            if lk in HOP or lk in ("host","content-length"): continue
            up[k] = self.headers[k]
        up["Host"] = UP_HOST
        try:
            conn = http.client.HTTPSConnection(UP_HOST, 443, timeout=60, context=_ctx)
            conn.request(self.command, self.path, body=body, headers=up)
            resp = conn.getresponse()
        except Exception as e:
            self.send_response(502); self.end_headers()
            self.wfile.write(str(e).encode()); return
        self.send_response(resp.status)
        for k, v in resp.getheaders():
            if k.lower() in HOP or k.lower() in ("content-length","connection"): continue
            self.send_header(k, v)
        self.send_header("Connection","close"); self.end_headers()
        self.close_connection = True
        while True:
            chunk = resp.read(65536)
            if not chunk: break
            try:
                self.wfile.write(chunk); self.wfile.flush()
            except Exception:
                break
        conn.close()

claude = shutil.which("claude")
if not claude:
    print("claude binary not found on PATH"); raise SystemExit(1)

srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
srv.daemon_threads = True
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
print(f"forwarder on 127.0.0.1:{port}  ·  launching `claude -p` through it …")

env = {**os.environ, "ANTHROPIC_BASE_URL": f"http://127.0.0.1:{port}"}
try:
    r = subprocess.run([claude, "-p", "Reply with exactly: OK"],
                       env=env, capture_output=True, text=True, timeout=180)
    print(f"\nclaude exit={r.returncode}")
    print(f"claude stdout: {r.stdout.strip()[:200]!r}")
    if r.stderr.strip():
        print(f"claude stderr: {r.stderr.strip()[:200]!r}")
finally:
    srv.shutdown()

# summarize captures (mask Authorization; nothing secret printed)
caps = sorted(os.path.join(CAP_DIR, f) for f in os.listdir(CAP_DIR) if f.startswith("msg_"))
print(f"\ncaptured {len(caps)} /v1/messages request(s):")
for c in caps:
    d = json.load(open(c))
    h = d["headers"]; b = d["body"].get("json", {})
    auth = h.get("Authorization","")
    sysblocks = b.get("system")
    sys0 = ""
    if isinstance(sysblocks, list) and sysblocks:
        sys0 = (sysblocks[0].get("text","") if isinstance(sysblocks[0], dict) else str(sysblocks[0]))[:60]
    elif isinstance(sysblocks, str):
        sys0 = sysblocks[:60]
    ccount = json.dumps(b).count('"cache_control"')
    print(f"  {os.path.basename(c)}: {d['method']} {d['path']}")
    print(f"    auth       : {auth[:16]}…{auth[-4:] if len(auth)>20 else ''}  (masked)")
    print(f"    model      : {b.get('model')}   stream={b.get('stream')}   max_tokens={b.get('max_tokens')}")
    print(f"    system[0]  : {sys0!r}")
    print(f"    cache_control breakpoints in body: {ccount}")
    print(f"    beta hdr   : {h.get('anthropic-beta','—')[:80]}")
    print(f"    user-agent : {h.get('User-Agent','—')[:60]}")
    print(f"    body bytes : {len(json.dumps(b))}")
