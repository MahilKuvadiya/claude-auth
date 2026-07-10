import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _harness import cx


class ForwardHeaders(unittest.TestCase):
    def base(self):
        return {
            "Authorization": "Bearer CLIENT_TOKEN",
            "Content-Type": "application/json",
            "Content-Length": "123",
            "Host": "localhost:8848",
            "Connection": "keep-alive",
            "Accept-Encoding": "gzip",
        }

    def test_transparent_keeps_client_authorization(self):
        h = cx._forward_headers(self.base(), token=None)
        self.assertEqual(h["Authorization"], "Bearer CLIENT_TOKEN")

    def test_swap_replaces_authorization(self):
        h = cx._forward_headers(self.base(), token="POOL_TOKEN")
        self.assertEqual(h["Authorization"], "Bearer POOL_TOKEN")

    def test_drops_hop_by_hop_and_length_and_host(self):
        h = cx._forward_headers(self.base(), token=None)
        lower = {k.lower() for k in h}
        self.assertNotIn("content-length", lower)   # http.client recomputes it
        self.assertNotIn("connection", lower)        # hop-by-hop
        # Host is replaced with the upstream host, never the client's
        self.assertNotEqual(h.get("Host"), "localhost:8848")

    def test_meter_forces_identity_encoding(self):
        h = cx._forward_headers(self.base(), token=None, meter=True)
        self.assertEqual(h.get("Accept-Encoding"), "identity")

    def test_content_type_preserved(self):
        h = cx._forward_headers(self.base(), token=None)
        self.assertEqual(h["Content-Type"], "application/json")


if __name__ == "__main__":
    unittest.main()
