"""Phase-0 daemon-hardening tests.

All isolated: no real Anthropic traffic, no Keychain, no launchd, no touching
~/.claude. We import the CLI as a module and exercise the hardened helpers with
stubs and temp files.
"""
import os
import sys
import time
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _harness import cx


def _make_pool():
    """Construct a _Pool without touching the Keychain or the real account index."""
    orig = (cx.load_index, cx.active_name, cx.kc_read)
    cx.load_index = lambda: {"accounts": {}, "active": None}
    cx.active_name = lambda idx: None
    cx.kc_read = lambda *a, **k: None
    try:
        return cx._Pool("failover")
    finally:
        cx.load_index, cx.active_name, cx.kc_read = orig


class UpstreamTimeoutSplit(unittest.TestCase):
    def test_default_read_timeout_unchanged(self):
        # existing callers (keep-warm/session) get the long timeout as before
        self.assertEqual(cx._upstream_conn().timeout, 300)

    def test_short_connect_timeout_available(self):
        c = cx._upstream_conn(timeout=cx._UPSTREAM_CONNECT_TIMEOUT)
        self.assertEqual(c.timeout, cx._UPSTREAM_CONNECT_TIMEOUT)
        self.assertLess(cx._UPSTREAM_CONNECT_TIMEOUT, cx._UPSTREAM_READ_TIMEOUT)

    def test_exchange_raises_read_timeout_after_connect(self):
        recorded = {}

        class FakeSock:
            def settimeout(self, t): recorded["t"] = t

        class FakeResp:  # marker
            pass

        class FakeConn:
            sock = FakeSock()
            def request(self, *a, **k): recorded["requested"] = True
            def getresponse(self): return FakeResp()

        resp = cx._upstream_exchange(FakeConn(), "POST", "/v1/messages", b"{}", {})
        self.assertIsInstance(resp, FakeResp)
        self.assertTrue(recorded.get("requested"))
        self.assertEqual(recorded.get("t"), cx._UPSTREAM_READ_TIMEOUT)  # bumped to long read timeout


class RetryAfter(unittest.TestCase):
    def test_explicit_seconds(self):
        self.assertEqual(cx._retry_after_secs({"Retry-After": "30"}), 30)

    def test_floor_of_5(self):
        self.assertEqual(cx._retry_after_secs({"Retry-After": "1"}), 5)

    def test_default_when_absent(self):
        self.assertEqual(cx._retry_after_secs({}), 60)


class LogRotation(unittest.TestCase):
    def test_rotates_past_cap(self):
        d = tempfile.mkdtemp()
        saved = (cx.STORE_DIR, cx.POOL_LOG, cx.POOL_LOG_MAX)
        cx.STORE_DIR = d
        cx.POOL_LOG = os.path.join(d, "pool.log")
        cx.POOL_LOG_MAX = 500
        try:
            for _ in range(200):
                cx._pool_log("x" * 40)
            self.assertTrue(os.path.exists(cx.POOL_LOG + ".1"), "expected a rotated pool.log.1")
            # live log stays bounded (last write can overshoot the cap by one line)
            self.assertLessEqual(os.path.getsize(cx.POOL_LOG), cx.POOL_LOG_MAX + 200)
        finally:
            cx.STORE_DIR, cx.POOL_LOG, cx.POOL_LOG_MAX = saved


class MonotonicCooldown(unittest.TestCase):
    def _pool_with_two(self):
        p = _make_pool()
        p.accounts = [
            {"name": "a", "member_id": None, "token": "t", "refresh": None, "expiresAt": None},
            {"name": "b", "member_id": None, "token": "t", "refresh": None, "expiresAt": None},
        ]
        return p

    def test_cooldown_is_monotonic_not_wallclock(self):
        p = self._pool_with_two()
        p.mark_exhausted("a", 60)
        # value must be ~ monotonic()+60, NOT time.time()+60 (which is ~1.7e9 larger)
        self.assertAlmostEqual(p.cooldown["a"], time.monotonic() + 60, delta=5)
        self.assertNotAlmostEqual(p.cooldown["a"], time.time() + 60, delta=1e6)

    def test_pick_skips_resting_then_recovers(self):
        p = self._pool_with_two()
        p.mark_exhausted("a", 60)
        self.assertEqual(p.pick(), "b")          # a is resting → the other one serves
        p.cooldown["a"] = time.monotonic() - 1   # expire a's cooldown (in the monotonic past)
        self.assertEqual(p.pick(), "a")          # highest-priority healthy one again

    def test_snapshot_cooldown_remaining_uses_monotonic(self):
        p = self._pool_with_two()
        p.mark_exhausted("a", 60)
        snap = p.snapshot()
        a = next(x for x in snap["accounts"] if x["name"] == "a")
        # if snapshot mixed wall-clock now with a monotonic cooldown this would clamp to 0
        self.assertGreater(a["cooldown"], 50)


class HealthIdentity(unittest.TestCase):
    def test_instance_id_and_service_marker(self):
        p = _make_pool()
        self.assertTrue(p.instance_id)
        snap = p.snapshot()
        self.assertEqual(snap.get("service"), "claudex-pool")
        self.assertEqual(snap.get("instanceId"), p.instance_id)

    def test_distinct_daemons_get_distinct_ids(self):
        self.assertNotEqual(_make_pool().instance_id, _make_pool().instance_id)


class BoundedServer(unittest.TestCase):
    def test_subclass_and_worker_cap(self):
        self.assertTrue(issubclass(cx._BoundedThreadingHTTPServer, cx.ThreadingHTTPServer))
        self.assertGreaterEqual(cx.POOL_MAX_WORKERS, 1)

    def test_instance_has_bounded_semaphore(self):
        srv = cx._BoundedThreadingHTTPServer(("127.0.0.1", 0), cx.PoolHandler)
        try:
            self.assertTrue(hasattr(srv, "_worker_sem"))
            self.assertTrue(srv.daemon_threads)
        finally:
            srv.server_close()


class SendClosesConnOnError(unittest.TestCase):
    def test_failed_send_closes_upstream_conn(self):
        closed = []

        class FakeConn:
            sock = None
            def request(self, *a, **k): raise OSError("boom")
            def close(self): closed.append(True)

        h = cx.PoolHandler.__new__(cx.PoolHandler)   # bypass BaseHTTPRequestHandler.__init__
        h.command, h.path, h.headers = "POST", "/v1/messages", {}
        orig = cx._upstream_conn
        cx._upstream_conn = lambda *a, **k: FakeConn()
        try:
            resp, conn, err = h._send("tok", b"{}")
        finally:
            cx._upstream_conn = orig
        self.assertIsNone(resp)
        self.assertTrue(err)
        self.assertEqual(closed, [True])   # the failed attempt released its socket (no FD leak)


if __name__ == "__main__":
    unittest.main()
