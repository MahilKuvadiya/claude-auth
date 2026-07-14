#!/usr/bin/env python3
"""Transparent logging proxy for Claude Code.

Listens on 127.0.0.1:<port>, logs every request it receives, then forwards it
verbatim to the real api.anthropic.com (keeping your own Authorization header) and
streams the response back — so your `claude` session works normally while you watch
exactly which requests hit this server.

Usage:
    python3 logserver.py <PORT> [LABEL]

Example (two servers, to see the "pinned base URL" behaviour):
    python3 logserver.py 9101 A
    python3 logserver.py 9102 B

Point Claude Code at it with  ANTHROPIC_BASE_URL=http://127.0.0.1:<PORT>
Stop with Ctrl-C.
"""
import sys, time, http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT  = int(sys.argv[1]) if len(sys.argv) > 1 else 9101
LABEL = sys.argv[2] if len(sys.argv) > 2 else str(PORT)
UPSTREAM = "api.anthropic.com"
HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
       "te", "trailers", "transfer-encoding", "upgrade"}

class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass          # silence default noisy logging

    def _log(self):
        ts = time.strftime("%H:%M:%S")
        print(f"{ts}  [{LABEL}:{PORT}]  {self.command} {self.path}", flush=True)

    def _proxy(self):
        self._log()
        body = b""
        n = int(self.headers.get("Content-Length") or 0)
        if n:
            body = self.rfile.read(n)
        # rebuild headers for upstream: keep everything (incl. your Authorization),
        # drop hop-by-hop + host + content-length (http.client recomputes it).
        headers = {}
        for k in self.headers.keys():
            if k.lower() in HOP or k.lower() in ("host", "content-length"):
                continue
            headers[k] = self.headers[k]
        headers["Host"] = UPSTREAM
        try:
            conn = http.client.HTTPSConnection(UPSTREAM, 443, timeout=300)
            conn.request(self.command, self.path, body=body, headers=headers)
            resp = conn.getresponse()
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(f'{{"error":"logserver could not reach {UPSTREAM}: {e}"}}'.encode())
            return
        # relay status + headers (framing via close so streaming/SSE works)
        self.send_response(resp.status)
        for k, v in resp.getheaders():
            if k.lower() in HOP or k.lower() in ("content-length", "connection"):
                continue
            self.send_header(k, v)
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        try:
            while True:
                chunk = resp.read(8192)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except Exception:
            pass
        finally:
            conn.close()

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = _proxy

if __name__ == "__main__":
    print(f"logserver [{LABEL}] listening on http://127.0.0.1:{PORT}  →  https://{UPSTREAM}",
          flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
