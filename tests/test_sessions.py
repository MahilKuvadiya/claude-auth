import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _harness import cx


def sessions():
    # newest-first, as _list_sessions returns them
    return [
        {"id": "aaaa1111-0000-0000-0000-000000000001", "project": "ai-chatbot"},
        {"id": "aaaa2222-0000-0000-0000-000000000002", "project": "ai-chatbot"},
        {"id": "bbbb3333-0000-0000-0000-000000000003", "project": "claudex"},
    ]


class ResolveSession(unittest.TestCase):
    def test_exact_id_wins(self):
        sid, cand = cx._resolve_session("bbbb3333-0000-0000-0000-000000000003", sessions())
        self.assertEqual(sid, "bbbb3333-0000-0000-0000-000000000003")
        self.assertEqual(cand, [])

    def test_unique_prefix(self):
        sid, cand = cx._resolve_session("bbbb", sessions())
        self.assertEqual(sid, "bbbb3333-0000-0000-0000-000000000003")

    def test_ambiguous_prefix_returns_candidates(self):
        sid, cand = cx._resolve_session("aaaa", sessions())
        self.assertIsNone(sid)
        self.assertEqual(len(cand), 2)

    def test_unique_project(self):
        sid, cand = cx._resolve_session("claudex", sessions())
        self.assertEqual(sid, "bbbb3333-0000-0000-0000-000000000003")

    def test_ambiguous_project_picks_newest_and_surfaces_rest(self):
        sid, cand = cx._resolve_session("ai-chatbot", sessions())
        self.assertEqual(sid, "aaaa1111-0000-0000-0000-000000000001")  # newest-first
        self.assertEqual(len(cand), 2)

    def test_no_match(self):
        sid, cand = cx._resolve_session("nope", sessions())
        self.assertIsNone(sid)
        self.assertEqual(cand, [])


if __name__ == "__main__":
    unittest.main()
