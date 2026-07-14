"""Phase-3 (3d-3e) tests: headless guard, migration, install/uninstall wiring,
and the enrolled `pool start`/`pool stop` flag-flip cutover.

Fully isolated: temp HOME/STORE/settings; launchctl, health, agent install, and
process kills are all stubbed. Never touches the real launchd/account/pool/settings.
"""
import os
import sys
import json
import types
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _harness import cx


class _Iso(unittest.TestCase):
    def setUp(self):
        self._saved = {k: getattr(cx, k) for k in (
            "SETTINGS", "PROXY_STATE", "STORE_DIR", "_is_compiled", "_has_gui_session",
            "_proxy_health_is_ours", "ensure_proxy_agent", "remove_proxy_agent",
            "_pool_pid", "_pool_hard_kill", "load_index", "_remote_config")}
        self._mc = dict(cx._MODE_CACHE)
        self._tmp = tempfile.mkdtemp()
        cx.SETTINGS = os.path.join(self._tmp, "settings.json")
        cx.PROXY_STATE = os.path.join(self._tmp, "proxy.json")
        cx.STORE_DIR = self._tmp
        cx._MODE_CACHE.update({"mtime": -1.0, "mode": "passthrough"})
        # safe stubs (no real system contact)
        cx._is_compiled = lambda: True
        cx._has_gui_session = lambda: True
        cx._proxy_health_is_ours = lambda port, timeout=6.0: True
        cx.ensure_proxy_agent = lambda port=None: None
        cx.remove_proxy_agent = lambda: None
        cx._pool_pid = lambda: None
        cx._pool_hard_kill = lambda pid: None
        cx.load_index = lambda: {"accounts": {"acct": {}}, "active": "acct"}
        cx._remote_config = lambda: None
        with open(cx.SETTINGS, "w") as f:
            json.dump({}, f)

    def tearDown(self):
        for k, v in self._saved.items():
            setattr(cx, k, v)
        cx._MODE_CACHE.clear(); cx._MODE_CACHE.update(self._mc)

    def _settings_env(self):
        return json.load(open(cx.SETTINGS)).get("env", {})

    def _state(self):
        return json.load(open(cx.PROXY_STATE)) if os.path.exists(cx.PROXY_STATE) else {}


class HeadlessGuard(_Iso):
    def test_headless_skips_wiring_and_enroll(self):
        cx._has_gui_session = lambda: False
        cx._proxy_on()
        self.assertNotIn("ANTHROPIC_BASE_URL", self._settings_env())  # nothing wired
        self.assertIsNot(self._state().get("enrolled"), True)         # not enrolled

    def test_gui_present_wires_and_enrolls(self):
        cx._proxy_on()
        self.assertTrue(self._settings_env()["ANTHROPIC_BASE_URL"].startswith("http://127.0.0.1:"))
        self.assertTrue(self._state()["enrolled"])


class Migration(_Iso):
    def test_legacy_daemon_retired_on_enable(self):
        killed = []
        cx._pool_pid = lambda: 4242
        cx._pool_hard_kill = lambda pid: killed.append(pid)
        cx._proxy_on()
        self.assertEqual(killed, [4242])          # legacy pool daemon retired during migration


class HealthGate(_Iso):
    def test_unhealthy_daemon_not_wired(self):
        cx._proxy_health_is_ours = lambda port, timeout=6.0: False
        cx._proxy_on()
        self.assertNotIn("ANTHROPIC_BASE_URL", self._settings_env())  # never wire a dead port
        self.assertIsNot(self._state().get("enrolled"), True)


class PoolStartStopCutover(_Iso):
    def _mk_args(self, **kw):
        a = types.SimpleNamespace(local=False, no_wire=False, mode=None, now=False, port=None)
        for k, v in kw.items():
            setattr(a, k, v)
        return a

    def test_enrolled_pool_start_is_flag_only(self):
        cx._proxy_on()                            # enroll (wires in passthrough)
        base_before = self._settings_env()["ANTHROPIC_BASE_URL"]
        spawned = []
        saved = cx.subprocess.Popen
        cx.subprocess.Popen = lambda *a, **k: spawned.append(a) or (_ for _ in ()).throw(AssertionError("must not spawn"))
        try:
            cx._pool_start(self._mk_args())
        finally:
            cx.subprocess.Popen = saved
        self.assertEqual(cx._proxy_mode(), "swap")                       # flag flipped
        self.assertEqual(self._settings_env()["ANTHROPIC_BASE_URL"], base_before)  # settings untouched
        self.assertEqual(spawned, [])                                    # no daemon spawned

    def test_enrolled_pool_stop_is_flag_only(self):
        cx._proxy_on()
        cx._pool_start(self._mk_args())           # → swap
        cx._pool_stop(self._mk_args())
        self.assertEqual(cx._proxy_mode(), "passthrough")                # flipped back
        self.assertTrue(self._settings_env()["ANTHROPIC_BASE_URL"].startswith("http://127.0.0.1:"))  # STILL wired (proxy stays in path)

    def test_not_enrolled_uses_legacy_path(self):
        # not enrolled → _pool_start must fall through to the legacy body, which
        # would try to spawn. We assert it does NOT take the supervised early-return
        # by checking it reaches the legacy spawn (stubbed to a sentinel).
        reached_legacy = []
        saved = cx.subprocess.Popen
        cx.subprocess.Popen = lambda *a, **k: reached_legacy.append(True) or (_ for _ in ()).throw(RuntimeError("stop-here"))
        try:
            try:
                cx._pool_start(self._mk_args())
            except RuntimeError:
                pass
        finally:
            cx.subprocess.Popen = saved
        self.assertTrue(reached_legacy, "not-enrolled must use the legacy spawn path")


if __name__ == "__main__":
    unittest.main()
