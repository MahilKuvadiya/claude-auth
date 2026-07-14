import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _harness import cx


class ProfileTierFields(unittest.TestCase):
    """`profile_tier_fields` maps a live /oauth/profile response onto the
    oauthAccount tier keys that plan_label() reads (the fix for a stale TIER
    after a seat upgrade)."""

    def test_team_org_maps_snake_case_to_camel_case(self):
        # A real /oauth/profile payload for an upgraded team seat.
        prof = {
            "account": {"has_claude_max": False, "has_claude_pro": False},
            "organization": {
                "rate_limit_tier": "default_claude_max_5x",
                "seat_tier": "team_tier_1",
            },
        }
        fields = cx.profile_tier_fields(prof)
        self.assertEqual(fields["userRateLimitTier"], "default_claude_max_5x")
        self.assertEqual(fields["seatTier"], "team_tier_1")
        # end-to-end: the mapped fields render as the upgraded label.
        self.assertEqual(cx.plan_label(fields), "Max 5x")

    def test_standard_team_seat(self):
        prof = {"organization": {"rate_limit_tier": "default_raven",
                                 "seat_tier": "team_standard"}}
        self.assertEqual(cx.plan_label(cx.profile_tier_fields(prof)), "Team")

    def test_personal_max_falls_back_to_account_boolean(self):
        # No org tier — personal plans surface only as booleans on the account.
        prof = {"account": {"has_claude_max": True}, "organization": {}}
        self.assertEqual(cx.plan_label(cx.profile_tier_fields(prof)), "Max")

    def test_personal_pro_falls_back_to_account_boolean(self):
        prof = {"account": {"has_claude_pro": True}}
        self.assertEqual(cx.plan_label(cx.profile_tier_fields(prof)), "Pro")

    def test_empty_and_malformed_return_empty(self):
        self.assertEqual(cx.profile_tier_fields({}), {})
        self.assertEqual(cx.profile_tier_fields(None), {})
        self.assertEqual(cx.profile_tier_fields({"organization": {}, "account": {}}), {})


if __name__ == "__main__":
    unittest.main()
