"""Phase-2 tests: persisted mode flag + live per-request routing.

Isolated: temp PROXY_STATE, mock upstream, no launchd/account/network-to-Anthropic.
"""
import os
import sys
import json
import time
import http.client
import threading
import tempfile
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _harness import cx


class _TmpState(unittest.TestCase):
    """Base: isolate PROXY_STATE + STORE_DIR to a temp dir and reset the mode cache."""
    def setUp(self):
        self._saved = (cx.PROXY_STATE, cx.STORE_DIR, dict(cx._MODE_CACHE))
        self._tmp = tempfile.mkdtemp()
        cx.PROXY_STATE = os.path.join(self._tmp, "proxy.json")
        cx.STORE_DIR = self._tmp
        cx._MODE_CACHE.update({"mtime": -1.0, "mode": "passthrough"})

    def tearDown(self):
        cx.PROXY_STATE, cx.STORE_DIR, mc = self._saved
        cx._MODE_CACHE.clear(); cx._MODE_CACHE.update(mc)


class StateFlag(_TmpState):
    def test_default_is_passthrough_when_absent(self):
        self.assertEqual(cx._proxy_mode(), "passthrough")

    def test_set_and_read_swap(self):
        cx._proxy_set_mode("swap")
        self.assertEqual(cx._proxy_mode(), "swap")
        # persisted on disk
        self.assertEqual(json.load(open(cx.PROXY_STATE))["mode"], "swap")

    def test_invalid_mode_rejected(self):
        with self.assertRaises(ValueError):
            cx._proxy_set_mode("bogus")

    def test_corrupt_file_defaults_to_passthrough(self):
        with open(cx.PROXY_STATE, "w") as f:
            f.write("{ this is not json")
        self.assertEqual(cx._proxy_mode(), "passthrough")   # never a token-holding mode

    def test_unknown_mode_value_defaults_to_passthrough(self):
        with open(cx.PROXY_STATE, "w") as f:
            json.dump({"mode": "weird"}, f)
        self.assertEqual(cx._proxy_mode(), "passthrough")

    def test_write_is_atomic_and_merges(self):
        cx._proxy_set_mode("swap")
        cx._proxy_state_write(port=18848)
        st = json.load(open(cx.PROXY_STATE))
        self.assertEqual(st["mode"], "swap")     # preserved
        self.assertEqual(st["port"], 18848)      # merged
        self.assertIn("version", st)

    def test_live_reload_picks_up_external_change(self):
        cx._proxy_set_mode("passthrough")
        self.assertEqual(cx._proxy_mode(), "passthrough")
        time.sleep(0.01)
        cx._proxy_set_mode("swap")               # external writer flips it
        self.assertEqual(cx._proxy_mode(), "swap")   # mtime changed → cache refreshed

    def test_rapid_writes_same_mtime_still_consistent(self):
        # Regression (found in Docker on a coarse-mtime fs): two sets within one mtime
        # tick must both be reflected by this process. Simulate a warm cache whose
        # mtime already equals the file's, so ONLY the writer's direct cache update
        # can keep _proxy_mode correct.
        cx._proxy_set_mode("passthrough")
        cx._MODE_CACHE["mtime"] = os.stat(cx.PROXY_STATE).st_mtime   # warm, matching mtime
        cx._MODE_CACHE["mode"] = "passthrough"
        cx._proxy_set_mode("swap")               # must refresh the cache itself, not via mtime
        self.assertEqual(cx._MODE_CACHE["mode"], "swap")
        self.assertEqual(cx._proxy_mode(), "swap")


class SupervisedRouting(_TmpState):
    """Drive the real handler with PROXY_SUPERVISED, proving routing follows the
    live flag and degrades to passthrough (never 503) when swap has no pool."""
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
        threading.Thread(target=cls.up.serve_forever, daemon=True).start()
        os.environ.update(CLAUDE_AUTH_UPSTREAM_HOST="127.0.0.1",
                          CLAUDE_AUTH_UPSTREAM_PORT=str(cls.up.server_address[1]),
                          CLAUDE_AUTH_UPSTREAM_PLAIN="1")

    @classmethod
    def tearDownClass(cls):
        cls.up.shutdown()
        for k in ("CLAUDE_AUTH_UPSTREAM_HOST", "CLAUDE_AUTH_UPSTREAM_PORT", "CLAUDE_AUTH_UPSTREAM_PLAIN"):
            os.environ.pop(k, None)

    def _serve(self):
        srv = cx._BoundedThreadingHTTPServer(("127.0.0.1", 0), cx.PoolHandler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        return srv, srv.server_address[1]

    def _post(self, port, auth="Bearer OWNTOKEN"):
        c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        c.request("POST", "/v1/messages", body=b'{"m":1}',
                  headers={"Authorization": auth, "Content-Length": "7"})
        r = c.getresponse(); r.read(); c.close()
        return r.status

    def _fake_pool(self):
        o = (cx.load_index, cx.active_name, cx.kc_read)
        cx.load_index = lambda: {"accounts": {}, "active": None}
        cx.active_name = lambda i: None; cx.kc_read = lambda *a, **k: None
        try:
            p = cx._Pool("failover")
        finally:
            cx.load_index, cx.active_name, cx.kc_read = o
        p.accounts = [{"name": "acct", "member_id": None, "token": "POOLTOKEN",
                       "refresh": None, "expiresAt": int((time.time() + 3600) * 1000)}]
        return p

    def test_passthrough_mode_forwards_own_token(self):
        cx._proxy_set_mode("passthrough")
        saved = (cx.PROXY_SUPERVISED, cx.PASSTHROUGH, cx.POOL)
        cx.PROXY_SUPERVISED, cx.PASSTHROUGH, cx.POOL = True, False, self._fake_pool()
        srv, port = self._serve()
        try:
            self.assertEqual(self._post(port, "Bearer OWNTOKEN"), 200)
            self.assertEqual(self.seen[-1], "Bearer OWNTOKEN")   # flag=passthrough → own token, pool ignored
        finally:
            srv.shutdown(); srv.server_close()
            cx.PROXY_SUPERVISED, cx.PASSTHROUGH, cx.POOL = saved

    def test_swap_mode_injects_pool_token(self):
        cx._proxy_set_mode("swap")
        saved = (cx.PROXY_SUPERVISED, cx.PASSTHROUGH, cx.POOL)
        cx.PROXY_SUPERVISED, cx.PASSTHROUGH, cx.POOL = True, False, self._fake_pool()
        srv, port = self._serve()
        try:
            self.assertEqual(self._post(port, "Bearer OWNTOKEN"), 200)
            self.assertEqual(self.seen[-1], "Bearer POOLTOKEN")  # flag=swap → pooled token
        finally:
            srv.shutdown(); srv.server_close()
            cx.PROXY_SUPERVISED, cx.PASSTHROUGH, cx.POOL = saved

    def test_swap_with_no_pool_degrades_not_503(self):
        cx._proxy_set_mode("swap")
        saved = (cx.PROXY_SUPERVISED, cx.PASSTHROUGH, cx.POOL)
        cx.PROXY_SUPERVISED, cx.PASSTHROUGH, cx.POOL = True, False, None  # pool not loaded yet
        srv, port = self._serve()
        try:
            status = self._post(port, "Bearer OWNTOKEN")
            self.assertEqual(status, 200)                        # degraded to passthrough, NOT a 503
            self.assertEqual(self.seen[-1], "Bearer OWNTOKEN")   # served on the client's own token
        finally:
            srv.shutdown(); srv.server_close()
            cx.PROXY_SUPERVISED, cx.PASSTHROUGH, cx.POOL = saved

    def test_legacy_daemon_still_503_when_no_pool(self):
        # PROXY_SUPERVISED False = legacy `pool serve`: behavior unchanged (503, not degrade)
        saved = (cx.PROXY_SUPERVISED, cx.PASSTHROUGH, cx.POOL)
        cx.PROXY_SUPERVISED, cx.PASSTHROUGH, cx.POOL = False, False, None
        srv, port = self._serve()
        try:
            self.assertEqual(self._post(port), 503)
        finally:
            srv.shutdown(); srv.server_close()
            cx.PROXY_SUPERVISED, cx.PASSTHROUGH, cx.POOL = saved


if __name__ == "__main__":
    unittest.main()
