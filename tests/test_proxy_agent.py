"""Phase-1 tests: launchd agent machinery + bind-first always-on proxy daemon.

Isolated: launchctl/subprocess are stubbed; the real daemon is driven on an
ephemeral port against a mock upstream. Nothing touches the user's real launchd
domain, account, pool, or ~/.claude.
"""
import os
import sys
import time
import http.client
import threading
import tempfile
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _harness import cx


class PlistXml(unittest.TestCase):
    def test_contains_keepalive_runatload_and_serve_args(self):
        xml = cx._proxy_plist_xml("/usr/local/bin/claudex", 8848)
        self.assertIn("<key>Label</key><string>ai.devxlabs.claudex.proxy</string>", xml)
        self.assertIn("<key>RunAtLoad</key><true/>", xml)          # start at login
        self.assertIn("<key>KeepAlive</key><true/>", xml)          # restart on any exit
        self.assertIn("<key>ThrottleInterval</key><integer>10</integer>", xml)  # crash-loop backoff
        self.assertIn("<string>proxy</string><string>serve</string>", xml)
        self.assertIn("<string>--port</string><string>8848</string>", xml)
        self.assertIn("PYTHONUTF8", xml)                           # launchd has no locale
        self.assertTrue(xml.strip().endswith("</plist>"))

    def test_port_is_reflected(self):
        self.assertIn("<string>19999</string>", cx._proxy_plist_xml("/x/claudex", 19999))


class EnsureAndRemoveAgent(unittest.TestCase):
    def setUp(self):
        self._saved = (cx.PROXY_PLIST, cx._is_compiled, cx.subprocess.run, cx._self_path)
        self._tmp = tempfile.mkdtemp()
        cx.PROXY_PLIST = os.path.join(self._tmp, "proxy.plist")
        self.calls = []
        cx.subprocess.run = lambda *a, **k: self.calls.append(a[0]) or None

    def tearDown(self):
        cx.PROXY_PLIST, cx._is_compiled, cx.subprocess.run, cx._self_path = self._saved

    def test_ensure_is_noop_when_not_compiled(self):
        cx._is_compiled = lambda: False
        cx.ensure_proxy_agent(8848)
        self.assertFalse(os.path.exists(cx.PROXY_PLIST))
        self.assertEqual(self.calls, [])

    def test_ensure_is_noop_when_killswitch_set(self):
        cx._is_compiled = lambda: True
        os.environ["CLAUDEX_PROXY_OFF"] = "1"
        try:
            cx.ensure_proxy_agent(8848)
            self.assertFalse(os.path.exists(cx.PROXY_PLIST))
        finally:
            del os.environ["CLAUDEX_PROXY_OFF"]

    def test_ensure_writes_plist_and_bootstraps_when_compiled(self):
        cx._is_compiled = lambda: True
        cx._self_path = lambda: sys.executable          # a path that exists
        cx.ensure_proxy_agent(8848)
        self.assertTrue(os.path.exists(cx.PROXY_PLIST))
        verbs = [c[1] for c in self.calls if c[0] == "launchctl"]
        self.assertIn("enable", verbs)
        self.assertIn("bootout", verbs)                 # old def cleared first
        self.assertIn("bootstrap", verbs)               # then (re)loaded

    def test_ensure_fast_path_skips_when_plist_current(self):
        cx._is_compiled = lambda: True
        cx._self_path = lambda: sys.executable
        cx.ensure_proxy_agent(8848)
        n_after_first = len(self.calls)
        cx.ensure_proxy_agent(8848)                     # identical content → no re-bootstrap
        self.assertEqual(len(self.calls), n_after_first)

    def test_ensure_rebootstraps_when_port_changes(self):
        cx._is_compiled = lambda: True
        cx._self_path = lambda: sys.executable
        cx.ensure_proxy_agent(8848)
        n = len(self.calls)
        cx.ensure_proxy_agent(9999)                     # content changed → re-bootstrap
        self.assertGreater(len(self.calls), n)

    def test_remove_bootout_and_disable(self):
        open(cx.PROXY_PLIST, "w").close()
        cx.remove_proxy_agent()
        verbs = [c[1] for c in self.calls if c[0] == "launchctl"]
        self.assertIn("bootout", verbs)
        self.assertIn("disable", verbs)                 # so it can't relaunch at next login
        self.assertFalseIfExists = self.assertFalse(os.path.exists(cx.PROXY_PLIST))


class BindFirstDaemon(unittest.TestCase):
    """Drive the real _proxy_serve daemon on an ephemeral port against a mock
    upstream, proving it binds and forwards the client's OWN token (passthrough)."""

    @classmethod
    def setUpClass(cls):
        cls.seen = []

        class Up(BaseHTTPRequestHandler):
            def log_message(self, *a): pass
            def do_POST(self):
                n = int(self.headers.get("Content-Length") or 0); self.rfile.read(n)
                cls.seen.append(self.headers.get("Authorization"))
                b = b'{"ok":true}'
                self.send_response(200); self.send_header("Content-Length", str(len(b)))
                self.end_headers(); self.wfile.write(b)

        cls.up = ThreadingHTTPServer(("127.0.0.1", 0), Up)
        cls.upport = cls.up.server_address[1]
        threading.Thread(target=cls.up.serve_forever, daemon=True).start()
        os.environ.update(CLAUDE_AUTH_UPSTREAM_HOST="127.0.0.1",
                          CLAUDE_AUTH_UPSTREAM_PORT=str(cls.upport),
                          CLAUDE_AUTH_UPSTREAM_PLAIN="1")

    @classmethod
    def tearDownClass(cls):
        cls.up.shutdown()
        for k in ("CLAUDE_AUTH_UPSTREAM_HOST", "CLAUDE_AUTH_UPSTREAM_PORT", "CLAUDE_AUTH_UPSTREAM_PLAIN"):
            os.environ.pop(k, None)

    def test_serves_passthrough_forwarding_own_token(self):
        # bind on an ephemeral port using the real bounded server + PoolHandler,
        # with PASSTHROUGH set exactly as _proxy_serve does.
        saved_pt, saved_pool = cx.PASSTHROUGH, cx.POOL
        cx.PASSTHROUGH, cx.POOL = True, None
        srv = cx._BoundedThreadingHTTPServer(("127.0.0.1", 0), cx.PoolHandler)
        port = srv.server_address[1]
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            c.request("POST", "/v1/messages", body=b'{"m":"x"}',
                      headers={"Authorization": "Bearer MYOWN", "Content-Length": "9"})
            r = c.getresponse(); r.read(); c.close()
            self.assertEqual(r.status, 200)
            self.assertEqual(self.seen[-1], "Bearer MYOWN")   # own token forwarded untouched
        finally:
            srv.shutdown(); srv.server_close()
            cx.PASSTHROUGH, cx.POOL = saved_pt, saved_pool

    def test_health_reports_identity_even_without_pool(self):
        saved_pool = cx.POOL
        cx.POOL = None
        srv = cx._BoundedThreadingHTTPServer(("127.0.0.1", 0), cx.PoolHandler)
        port = srv.server_address[1]
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            c.request("GET", "/__pool/health")
            r = c.getresponse(); import json; body = json.loads(r.read()); c.close()
            self.assertEqual(r.status, 200)
            self.assertEqual(body.get("service"), "claudex-pool")   # identity marker present
        finally:
            srv.shutdown(); srv.server_close()
            cx.POOL = saved_pool


if __name__ == "__main__":
    unittest.main()
