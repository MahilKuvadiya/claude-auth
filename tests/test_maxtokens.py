import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _harness import cx


class MaxTokensRewrite(unittest.TestCase):
    """The warm-ping rewrites max_tokens -> 1 by editing raw bytes (never
    re-serializing), so the cached prefix stays byte-identical. A wrong rewrite
    silently corrupts the cache prefix — hence these guards."""

    def test_rewrites_first_value(self):
        body = b'{"model":"x","max_tokens": 4096,"stream":true}'
        out = cx._set_max_tokens_1(body)
        self.assertEqual(out, b'{"model":"x","max_tokens": 1,"stream":true}')

    def test_only_first_occurrence(self):
        body = b'{"max_tokens":50,"tools":[{"max_tokens":9}]}'
        out = cx._set_max_tokens_1(body)
        self.assertEqual(out, b'{"max_tokens":1,"tools":[{"max_tokens":9}]}')

    def test_no_maxtokens_is_noop(self):
        body = b'{"model":"x","stream":true}'
        self.assertEqual(cx._set_max_tokens_1(body), body)

    def test_tolerates_spacing(self):
        self.assertEqual(cx._set_max_tokens_1(b'{"max_tokens"  :  32000}'),
                         b'{"max_tokens"  :  1}')

    def test_surrounding_bytes_untouched(self):
        body = b'PREFIX{"max_tokens":8}SUFFIX'
        out = cx._set_max_tokens_1(body)
        self.assertTrue(out.startswith(b'PREFIX'))
        self.assertTrue(out.endswith(b'SUFFIX'))


if __name__ == "__main__":
    unittest.main()
