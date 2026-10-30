"""
tests/test_geofence.py - Unit Tests for Geofencing Engine & Edge Cases
Covers:
1. Geodesic distance calculation against known city-pair distances.
2. Coordinates well inside the geofence radius.
3. Coordinates well outside the geofence radius.
4. Coordinates exactly on the boundary radius.
5. Sites with geofencing disabled (remote/field workers).
6. Missing GPS coordinates and distinct error handling (permission denied, timeout, unavailable).
7. Invalid coordinate formatting, NaN, Inf, out-of-range, and (0,0) rejection.
8. Accuracy-aware geofencing: low accuracy, uncertain overlap, and confident outside classification.
"""

import math
import unittest
from core.geofence import (
    geodesic_distance,
    haversine_distance,
    validate_geofence,
    is_valid_coordinate
)

class TestGeofenceEngine(unittest.TestCase):
    def setUp(self):
        # Mumbai Office reference coordinates
        self.site_lat = 19.0657
        self.site_lon = 72.8687
        self.radius = 200.0

    def test_geodesic_identical_point(self):
        """Distance between identical coordinates must be 0 meters."""
        dist = geodesic_distance(self.site_lat, self.site_lon, self.site_lat, self.site_lon)
        self.assertEqual(dist, 0.0)
        # haversine_distance alias also returns 0.0
        self.assertEqual(haversine_distance(self.site_lat, self.site_lon, self.site_lat, self.site_lon), 0.0)

    def test_known_city_pair_geodesic_distance(self):
        """
        Geodesic distance calculation against known international & domestic city pairs:
        - London (51.5074, -0.1278) to Paris (48.8566, 2.3522): ~343.9 km
        - Mumbai (19.0760, 72.8777) to Delhi (28.6139, 77.2090): ~1,144.5 km
        """
        london = (51.5074, -0.1278)
        paris = (48.8566, 2.3522)
        dist_lp = geodesic_distance(london[0], london[1], paris[0], paris[1])
        self.assertIsNotNone(dist_lp)
        # Expected ~343,923 meters ± 500m
        self.assertAlmostEqual(dist_lp, 343923.12, delta=1000.0)

        mumbai = (19.0760, 72.8777)
        delhi = (28.6139, 77.2090)
        dist_md = geodesic_distance(mumbai[0], mumbai[1], delhi[0], delhi[1])
        self.assertIsNotNone(dist_md)
        # Expected ~1,144,526 meters ± 1000m
        self.assertAlmostEqual(dist_md, 1144526.44, delta=2000.0)

    def test_inside_geofence(self):
        """Employee 50m away should be accepted within 200m radius."""
        emp_lat = self.site_lat + 0.0004
        emp_lon = self.site_lon
        result = validate_geofence(emp_lat, emp_lon, self.site_lat, self.site_lon, radius_meters=self.radius, accuracy_meters=15.0)
        self.assertTrue(result["within_geofence"])
        self.assertFalse(result["flagged"])
        self.assertLess(result["distance_meters"], self.radius)
        self.assertEqual(result["classification"], "verified")

    def test_outside_geofence(self):
        """Employee 800m away should be flagged as outside geofence."""
        emp_lat = self.site_lat + 0.008
        emp_lon = self.site_lon
        result = validate_geofence(emp_lat, emp_lon, self.site_lat, self.site_lon, radius_meters=self.radius, accuracy_meters=20.0)
        self.assertFalse(result["within_geofence"])
        self.assertTrue(result["flagged"])
        self.assertGreater(result["distance_meters"], self.radius)
        self.assertEqual(result["classification"], "violation")
        self.assertIn("Geofence violation", result["flag_reason"])

    def test_exactly_on_boundary(self):
        """Coordinates exactly at the boundary radius must be accepted (<= radius)."""
        dist = geodesic_distance(self.site_lat, self.site_lon, self.site_lat + 0.001, self.site_lon)
        result = validate_geofence(
            self.site_lat + 0.001,
            self.site_lon,
            self.site_lat,
            self.site_lon,
            radius_meters=dist
        )
        self.assertTrue(result["within_geofence"], "Points on the boundary radius must be marked within_geofence")
        self.assertFalse(result["flagged"])
        self.assertEqual(result["classification"], "verified")

    def test_geofencing_disabled_for_field_staff(self):
        """Sites with geofencing disabled must never flag distance regardless of location."""
        delhi_lat = 28.6139
        delhi_lon = 77.2090
        result = validate_geofence(
            delhi_lat,
            delhi_lon,
            self.site_lat,
            self.site_lon,
            radius_meters=self.radius,
            geofencing_enabled=False,
            site_name="Field Sales"
        )
        self.assertTrue(result["within_geofence"])
        self.assertFalse(result["flagged"])
        self.assertFalse(result["geofencing_enabled"])
        self.assertEqual(result["classification"], "remote")

    def test_null_island_rejection(self):
        """(0, 0) coordinates must be treated as invalid uninitialized GPS and rejected."""
        self.assertFalse(is_valid_coordinate(0, 0))
        self.assertFalse(is_valid_coordinate(0.0, 0.0))
        dist = geodesic_distance(0.0, 0.0, self.site_lat, self.site_lon)
        self.assertIsNone(dist)

        result = validate_geofence(0.0, 0.0, self.site_lat, self.site_lon, radius_meters=self.radius)
        self.assertFalse(result["within_geofence"])
        self.assertTrue(result["flagged"])
        self.assertIn("Invalid (0, 0)", result["flag_reason"])

    def test_invalid_coordinates(self):
        """Malformed, NaN, infinite, or out-of-range coordinate values must be caught safely."""
        self.assertFalse(is_valid_coordinate("invalid", "coordinates"))
        self.assertFalse(is_valid_coordinate(float("nan"), 72.0))
        self.assertFalse(is_valid_coordinate(float("inf"), 72.0))
        self.assertFalse(is_valid_coordinate(95.0, 72.0)) # Lat > 90
        self.assertFalse(is_valid_coordinate(19.0, 195.0)) # Lon > 180
        self.assertFalse(is_valid_coordinate(None, self.site_lon))

        self.assertIsNone(geodesic_distance("invalid", "coordinates", self.site_lat, self.site_lon))
        self.assertIsNone(geodesic_distance(float("nan"), 72.0, self.site_lat, self.site_lon))

    def test_accuracy_low_inside_radius_flags_event(self):
        """
        When employee coordinates are inside the geofence radius but reported accuracy
        is worse than the threshold (>100m), do not silently accept:
        Flag the event for review with a clear reason and suggestion.
        """
        emp_lat = self.site_lat + 0.0004
        emp_lon = self.site_lon
        result = validate_geofence(
            emp_lat, emp_lon, self.site_lat, self.site_lon,
            radius_meters=self.radius, accuracy_meters=140.0
        )
        self.assertTrue(result["within_geofence"])
        self.assertTrue(result["flagged"])
        self.assertEqual(result["classification"], "low_accuracy")
        self.assertIn("Low GPS accuracy", result["flag_reason"])
        self.assertIn("move near a window", result["message"])

    def test_accuracy_circle_overlaps_geofence_classified_uncertain(self):
        """
        When employee distance from site is outside the geofence radius (e.g. 230m > 200m),
        but the accuracy circle overlaps the geofence boundary (230m - 50m = 180m <= 200m),
        mark it as 'uncertain' rather than a hard violation.
        """
        # Lat offset ~0.0021 deg is approx 233 meters
        emp_lat = self.site_lat + 0.0021
        emp_lon = self.site_lon
        dist = geodesic_distance(emp_lat, emp_lon, self.site_lat, self.site_lon)
        self.assertGreater(dist, self.radius)

        result = validate_geofence(
            emp_lat, emp_lon, self.site_lat, self.site_lon,
            radius_meters=self.radius, accuracy_meters=50.0
        )
        self.assertFalse(result["within_geofence"])
        self.assertTrue(result["flagged"])
        self.assertEqual(result["classification"], "uncertain")
        self.assertIn("Uncertain", result["flag_reason"])
        self.assertIn("overlaps", result["flag_reason"])

    def test_accuracy_circle_confidently_outside_classified_violation(self):
        """
        When distance minus accuracy is still greater than the geofence radius,
        the person is confidently outside -> hard violation.
        """
        emp_lat = self.site_lat + 0.005 # approx 555 meters away
        emp_lon = self.site_lon
        dist = geodesic_distance(emp_lat, emp_lon, self.site_lat, self.site_lon)
        self.assertGreater(dist, 500)

        # Accuracy is 30m; 555 - 30 = 525m > 200m radius
        result = validate_geofence(
            emp_lat, emp_lon, self.site_lat, self.site_lon,
            radius_meters=self.radius, accuracy_meters=30.0
        )
        self.assertFalse(result["within_geofence"])
        self.assertTrue(result["flagged"])
        self.assertEqual(result["classification"], "violation")
        self.assertIn("Geofence violation", result["flag_reason"])

    def test_explicit_gps_errors(self):
        """
        Handle distinct GPS errors (permission denied, timeout, position unavailable)
        producing specific user-friendly messages and flag reasons.
        """
        # 1. Permission Denied
        r1 = validate_geofence(None, None, self.site_lat, self.site_lon, radius_meters=self.radius, gps_error="permission_denied")
        self.assertFalse(r1["within_geofence"])
        self.assertTrue(r1["flagged"])
        self.assertIn("permission denied", r1["flag_reason"].lower())
        self.assertIn("allow location access", r1["message"].lower())

        # 2. Timeout
        r2 = validate_geofence(None, None, self.site_lat, self.site_lon, radius_meters=self.radius, gps_error="timeout")
        self.assertFalse(r2["within_geofence"])
        self.assertTrue(r2["flagged"])
        self.assertIn("timed out", r2["flag_reason"].lower())
        self.assertIn("timed out", r2["message"].lower())

        # 3. Position Unavailable
        r3 = validate_geofence(None, None, self.site_lat, self.site_lon, radius_meters=self.radius, gps_error="position_unavailable")
        self.assertFalse(r3["within_geofence"])
        self.assertTrue(r3["flagged"])
        self.assertIn("position unavailable", r3["flag_reason"].lower())
        self.assertIn("ensure location services are enabled", r3["message"].lower())

if __name__ == "__main__":
    unittest.main()
