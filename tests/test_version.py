import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _harness import cx


class VersionParse(unittest.TestCase):
    def test_parses_plain(self):
        self.assertEqual(cx.parse_script_version('__version__ = "1.2.3"'), "1.2.3")

    def test_parses_single_quotes(self):
        self.assertEqual(cx.parse_script_version("__version__ = '2.0.0'"), "2.0.0")

    def test_ignores_trailing_annotation(self):
        # release-please appends `# x-release-please-version`; must not break parsing.
        line = '__version__ = "1.11.0"  # x-release-please-version'
        self.assertEqual(cx.parse_script_version(line), "1.11.0")

    def test_reads_own_source(self):
        with open(cx.__file__) as fh:
            self.assertEqual(cx.parse_script_version(fh.read()), cx.__version__)

    def test_none_on_missing(self):
        self.assertIsNone(cx.parse_script_version("no version here"))


class VersionCompare(unittest.TestCase):
    def test_numeric_not_lexicographic(self):
        # The classic trap: "1.11" < "1.9" as strings, but 11 > 9 numerically.
        self.assertGreater(cx._version_tuple("1.11.0"), cx._version_tuple("1.9.0"))

    def test_equal(self):
        self.assertEqual(cx._version_tuple("1.11.0"), cx._version_tuple("1.11.0"))

    def test_major_beats_minor(self):
        self.assertGreater(cx._version_tuple("2.0.0"), cx._version_tuple("1.99.99"))


if __name__ == "__main__":
    unittest.main()
