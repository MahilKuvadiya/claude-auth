"""Phase-3 (3a-3c) tests: chain-through upstream, port-pick, wire/unwire, enroll gate.

Isolated: temp HOME/STORE/settings, stubbed launchctl. No real launchd/account/network.
"""
import os
import sys
import json
import socket
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _harness import cx


class UpstreamResolution(unittest.TestCase):
    def tearDown(self):
        cx._UPSTREAM_OVERRIDE = None
        for k in ("CLAUDE_AUTH_UPSTREAM_HOST", "CLAUDE_AUTH_UPSTREAM_PORT", "CLAUDE_AUTH_UPSTREAM_PLAIN"):
            os.environ.pop(k, None)

    def test_default_is_anthropic_https(self):
        cx._UPSTREAM_OVERRIDE = None
        self.assertEqual(cx._upstream_target(), ("api.anthropic.com", 443, True))

    def test_parse_upstream_variants(self):
        self.assertEqual(cx._parse_upstream("https://gw.corp.com"), ("gw.corp.com", 443, True))
        self.assertEqual(cx._parse_upstream("http://gw.corp.com:8080"), ("gw.corp.com", 8080, False))
        self.assertIsNone(cx._parse_upstream("not-a-url"))
        self.assertIsNone(cx._parse_upstream("ftp://x"))

    def test_override_used_when_no_env(self):
        cx._UPSTREAM_OVERRIDE = ("gw.corp.com", 443, True)
        self.assertEqual(cx._upstream_target(), ("gw.corp.com", 443, True))
        self.assertEqual(cx._upstream_host(), "gw.corp.com")

    def test_env_seam_wins_over_override(self):
        cx._UPSTREAM_OVERRIDE = ("gw.corp.com", 443, True)
        os.environ["CLAUDE_AUTH_UPSTREAM_HOST"] = "127.0.0.1"
        os.environ["CLAUDE_AUTH_UPSTREAM_PLAIN"] = "1"
        os.environ["CLAUDE_AUTH_UPSTREAM_PORT"] = "9999"
        self.assertEqual(cx._upstream_target(), ("127.0.0.1", 9999, False))


class PickPort(unittest.TestCase):
    def test_prefers_free_port(self):
        # find a definitely-free port to prefer
        s = socket.socket(); s.bind(("127.0.0.1", 0)); free = s.getsockname()[1]; s.close()
        self.assertEqual(cx._pick_proxy_port(free), free)

    def test_falls_forward_when_preferred_busy(self):
        s = socket.socket(); s.bind(("127.0.0.1", 0)); busy = s.getsockname()[1]  # hold it
        try:
            picked = cx._pick_proxy_port(busy)
            self.assertNotEqual(picked, busy)
            # picked must be actually bindable
            t = socket.socket(); t.bind(("127.0.0.1", picked)); t.close()
        finally:
            s.close()


class _SettingsIsolated(unittest.TestCase):
    """Isolate settings.json + proxy.json to a temp dir."""
    def setUp(self):
        self._saved = (cx.SETTINGS, cx.PROXY_STATE, cx.STORE_DIR)
        self._tmp = tempfile.mkdtemp()
        cx.SETTINGS = os.path.join(self._tmp, "settings.json")
        cx.PROXY_STATE = os.path.join(self._tmp, "proxy.json")
        cx.STORE_DIR = self._tmp

    def tearDown(self):
        cx.SETTINGS, cx.PROXY_STATE, cx.STORE_DIR = self._saved

    def _settings(self, obj):
        with open(cx.SETTINGS, "w") as f:
            json.dump(obj, f)

    def _read_settings_env(self):
        with open(cx.SETTINGS) as f:
            return json.load(f).get("env", {})


class WireUnwire(_SettingsIsolated):
    def test_wire_from_empty(self):
        self._settings({})
        cx._proxy_wire(8848)
        self.assertEqual(self._read_settings_env()["ANTHROPIC_BASE_URL"], "http://127.0.0.1:8848")
        st = json.load(open(cx.PROXY_STATE))
        self.assertNotIn("wiredBaseUrlPrev", st)          # nothing to capture
        self.assertEqual(st["port"], 8848)

    def test_wire_chains_through_corp_gateway(self):
        self._settings({"env": {"ANTHROPIC_BASE_URL": "https://gw.corp.com"}})
        cx._proxy_wire(8848)
        self.assertEqual(self._read_settings_env()["ANTHROPIC_BASE_URL"], "http://127.0.0.1:8848")
        st = json.load(open(cx.PROXY_STATE))
        self.assertEqual(st["wiredBaseUrlPrev"], "https://gw.corp.com")
        self.assertEqual(st["upstream"], "https://gw.corp.com")   # chain-through target

    def test_wire_is_idempotent_and_never_self_captures(self):
        self._settings({})
        cx._proxy_wire(8848)
        cx._proxy_wire(8848)                                 # re-wire to our own port
        st = json.load(open(cx.PROXY_STATE))
        self.assertNotIn("wiredBaseUrlPrev", st)             # must NOT capture our own loopback (P-F3)

    def test_capture_is_once_only(self):
        self._settings({"env": {"ANTHROPIC_BASE_URL": "https://gw.corp.com"}})
        cx._proxy_wire(8848)                                 # capture gw
        # simulate a re-wire after a crash left our own URL in settings
        cx._proxy_wire(8848)
        st = json.load(open(cx.PROXY_STATE))
        self.assertEqual(st["wiredBaseUrlPrev"], "https://gw.corp.com")  # still the gateway, not overwritten

    def test_unwire_restores_gateway_and_clears_state(self):
        self._settings({"env": {"ANTHROPIC_BASE_URL": "https://gw.corp.com"}})
        cx._proxy_wire(8848)
        cx._proxy_unwire()
        self.assertEqual(self._read_settings_env()["ANTHROPIC_BASE_URL"], "https://gw.corp.com")
        st = json.load(open(cx.PROXY_STATE))
        self.assertNotIn("wiredBaseUrlPrev", st)
        self.assertNotIn("upstream", st)

    def test_unwire_removes_key_when_no_prior(self):
        self._settings({})
        cx._proxy_wire(8848)
        cx._proxy_unwire()
        self.assertNotIn("ANTHROPIC_BASE_URL", self._read_settings_env())

    def test_unwire_never_touches_a_foreign_value(self):
        self._settings({"env": {"ANTHROPIC_BASE_URL": "https://someone-elses-proxy"}})
        cx._proxy_unwire()                                   # not our loopback → leave it
        self.assertEqual(self._read_settings_env()["ANTHROPIC_BASE_URL"], "https://someone-elses-proxy")


class EnrollGate(_SettingsIsolated):
    def test_off_clears_enrolled_and_leaves_mode(self):
        self._settings({})
        cx._proxy_set_mode("swap")
        cx._proxy_state_write(enrolled=True)
        calls = []
        saved = cx.subprocess.run
        cx.subprocess.run = lambda *a, **k: calls.append(a[0]) or None
        saved_unwire = cx._proxy_unwire
        cx._proxy_unwire = lambda: None                      # settings side already covered above
        try:
            cx._proxy_off_cmd()
        finally:
            cx.subprocess.run = saved
            cx._proxy_unwire = saved_unwire
        st = json.load(open(cx.PROXY_STATE))
        self.assertEqual(st["enrolled"], False)              # opt-out marker cleared
        self.assertEqual(st["mode"], "swap")                 # mode left as-is (D2)


if __name__ == "__main__":
    unittest.main()
