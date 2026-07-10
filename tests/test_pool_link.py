import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _harness import cx


class PoolCrypto(unittest.TestCase):
    def test_encrypt_decrypt_roundtrip(self):
        secret = os.urandom(32)
        plaintext = b'{"accessToken":"sk-ant-oauth-abc123"}'
        blob = cx._pool_encrypt(secret, plaintext)
        self.assertIsInstance(blob, str)
        self.assertEqual(cx._pool_decrypt(secret, blob), plaintext)

    def test_wrong_key_raises(self):
        blob = cx._pool_encrypt(os.urandom(32), b"secret token")
        with self.assertRaises(ValueError):
            cx._pool_decrypt(os.urandom(32), blob)

    def test_tamper_detected(self):
        secret = os.urandom(32)
        import base64
        raw = bytearray(base64.b64decode(cx._pool_encrypt(secret, b"hello")))
        raw[-1] ^= 0x01  # flip a ciphertext bit
        with self.assertRaises(ValueError):
            cx._pool_decrypt(secret, base64.b64encode(bytes(raw)).decode())


class PoolLink(unittest.TestCase):
    def test_link_roundtrip(self):
        key = os.urandom(32)
        link = cx._pool_link_encode("pantry-abc-123", key)
        self.assertTrue(link.startswith(cx.POOL_LINK_PREFIX))
        pid, kb = cx._pool_link_decode(link)
        self.assertEqual(pid, "pantry-abc-123")
        self.assertEqual(kb, key)

    def test_tolerates_hash_before_key(self):
        key = os.urandom(32)
        link = cx._pool_link_encode("pid", key).replace(":" + cx._b64u(key), "#" + cx._b64u(key))
        pid, kb = cx._pool_link_decode(link)
        self.assertEqual(kb, key)

    def test_malformed_link_exits(self):
        with self.assertRaises(SystemExit):
            cx._pool_link_decode("not-a-pool-link")


if __name__ == "__main__":
    unittest.main()
