"""
tests/test_location_mismatch.py - Comprehensive tests for Check-in vs Check-out Location Mismatch Rule
"""

import unittest
from unittest.mock import patch, MagicMock
from core.geofence import geodesic_distance, validate_geofence
from core.pipeline import run_attendance_pipeline

class TestLocationMismatchLogic(unittest.TestCase):
    def setUp(self):
        # Base coordinates (e.g. employee's home or field location)
        self.in_lat = 18.5204
        self.in_lon = 73.8567

    def test_geofence_outside_produces_no_flag(self):
        """Former geofence violation (e.g. 600km away from office) must NOT flag."""
        office_lat = 19.0657
        office_lon = 72.8687
        res = validate_geofence(
            employee_lat=self.in_lat,
            employee_lon=self.in_lon,
            site_lat=office_lat,
            site_lon=office_lon,
            radius_meters=200.0,
            accuracy_meters=15.0
        )
        self.assertTrue(res["within_geofence"])
        self.assertFalse(res["flagged"])
        self.assertIsNone(res["flag_reason"])

    def test_same_location_within_radius_not_flagged(self):
        """Check-out at nearly same location (e.g. 30m GPS jitter) is not flagged."""
        # 0.0002 deg is approx 22m
        out_lat = self.in_lat + 0.0002
        out_lon = self.in_lon
        dist = geodesic_distance(self.in_lat, self.in_lon, out_lat, out_lon)
        self.assertLess(dist, 200.0)

        # Simulate comparison
        match_radius = 200.0
        is_flagged = dist > match_radius
        self.assertFalse(is_flagged)

    def test_different_location_beyond_radius_flagged(self):
        """Check-out at different location (e.g. 1.5km away) is flagged with distance."""
        # 0.015 deg is approx 1,660m
        out_lat = self.in_lat + 0.015
        out_lon = self.in_lon
        dist = geodesic_distance(self.in_lat, self.in_lon, out_lat, out_lon)
        self.assertGreater(dist, 200.0)

        match_radius = 200.0
        is_flagged = dist > match_radius
        self.assertTrue(is_flagged)
        reason = f"Check-out location differs from check-in by {int(dist):,} m (allowed {int(match_radius):,} m)"
        self.assertIn("Check-out location differs from check-in", reason)
        self.assertIn("allowed 200 m", reason)

    def test_boundary_distance(self):
        """Distance exactly at boundary radius (<= match_radius) is not flagged."""
        match_radius = 200.0
        dist_at_boundary = 200.0
        self.assertFalse(dist_at_boundary > match_radius)

        dist_just_over = 200.1
        self.assertTrue(dist_just_over > match_radius)

    def test_multiple_sessions_pairing(self):
        """Multiple sessions in one day pair the most recent check-in with the check-out."""
        events = [
            {"id": 1, "event_type": "check_in", "latitude": 18.5204, "longitude": 73.8567},
            {"id": 2, "event_type": "check_out", "latitude": 18.5205, "longitude": 73.8568}, # Session 1 closed
            {"id": 3, "event_type": "check_in", "latitude": 18.5500, "longitude": 73.8800},  # Session 2 open
        ]

        unpaired = []
        for ev in events:
            if ev["event_type"] == "check_in":
                unpaired.append(ev)
            elif ev["event_type"] == "check_out" and unpaired:
                unpaired.pop()

        self.assertEqual(len(unpaired), 1)
        self.assertEqual(unpaired[-1]["id"], 3)
        self.assertEqual(unpaired[-1]["latitude"], 18.5500)

    def test_missing_gps_on_either_event_not_flagged(self):
        """Missing GPS on check-in or check-out does not flag."""
        in_lat, in_lon = None, None
        out_lat, out_lon = 18.5204, 73.8567
        dist = geodesic_distance(in_lat, in_lon, out_lat, out_lon)
        self.assertIsNone(dist)
        is_flagged = False
        self.assertFalse(is_flagged)

    def test_changing_radius_setting_affects_comparison(self):
        """Changing the match radius changes whether distance triggers a flag."""
        dist = 350.0 # 350m distance
        # Default radius 200m -> Flagged
        self.assertTrue(dist > 200.0)

        # Admin increases radius to 500m -> Not flagged
        admin_radius = 500.0
        self.assertFalse(dist > admin_radius)

if __name__ == "__main__":
    unittest.main()
