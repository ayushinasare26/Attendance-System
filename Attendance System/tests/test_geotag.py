"""
tests/test_geotag.py - Unit Tests for Geocoding & Geotag Watermarking Engine
Tests:
1. Reverse geocoding with geopy Nominatim (mocked for offline deterministic tests).
2. Rate-limited and cached reverse geocode returns same address for nearby coordinates without 2nd network call.
3. Network failures (GeocoderTimedOut, GeocoderUnavailable, empty result) fallback gracefully without blocking.
4. Forward geocoding with mock geopy (success, timeout, failure).
5. Proof-of-attendance photo watermarking with coordinates and accuracy stamp.
"""

import os
import unittest
from unittest.mock import MagicMock, patch
import numpy as np
from PIL import Image

from core.geotag import (
    reverse_geocode,
    forward_geocode,
    stamp_geotag,
    _GEOCODE_CACHE
)
from geopy.exc import GeocoderTimedOut, GeocoderUnavailable, GeocoderServiceError

class MockLocation:
    def __init__(self, address, latitude=19.0760, longitude=72.8777):
        self.address = address
        self.latitude = latitude
        self.longitude = longitude

class TestGeotag(unittest.TestCase):
    def setUp(self):
        # Clear in-memory and persistent DB cache for isolated tests
        _GEOCODE_CACHE.clear()
        try:
            from core.db import get_db_connection
            conn = get_db_connection()
            conn.execute("DELETE FROM geocode_cache")
            conn.commit()
            conn.close()
        except Exception:
            pass

    def test_reverse_geocode_fallback_on_invalid_or_none(self):
        # Missing coordinates
        res_none = reverse_geocode(None, None)
        self.assertIn("Unknown Location", res_none)

        # Malformed strings
        res_inv = reverse_geocode("abc", "def")
        self.assertIn("Invalid coordinates", res_inv)

        # (0, 0) rejection
        res_zero = reverse_geocode(0, 0)
        self.assertIn("Invalid Location (0, 0)", res_zero)

    @patch("core.geotag.get_geocoder")
    def test_reverse_geocode_mock_success(self, mock_get_geocoder):
        mock_geolocator = MagicMock()
        mock_geolocator.reverse.return_value = MockLocation(
            "Bandra Kurla Complex, Bandra East, Mumbai, Maharashtra, 400051, India"
        )
        mock_get_geocoder.return_value = mock_geolocator

        addr = reverse_geocode(19.0657, 72.8687)
        self.assertIn("Bandra Kurla Complex", addr)
        self.assertIn("Mumbai", addr)

    @patch("core.geotag.get_geocoder")
    def test_reverse_geocode_caching_nearby_coordinates(self, mock_get_geocoder):
        """
        Coordinates within ~11 meters round to the same 4-decimal place key.
        The second call must return the cached address without invoking the geocoder again.
        """
        mock_geolocator = MagicMock()
        mock_geolocator.reverse.return_value = MockLocation("Hinjewadi Phase 2, Pune, Maharashtra, India")
        mock_get_geocoder.return_value = mock_geolocator

        # First call with coordinate A
        addr1 = reverse_geocode(18.59131, 73.73891)
        self.assertEqual(addr1, "Hinjewadi Phase 2, Pune, Maharashtra, India")
        self.assertEqual(mock_geolocator.reverse.call_count, 1)

        # Second call with nearby coordinate B (~4 meters away, rounds to same key: 18.5913, 73.7389)
        addr2 = reverse_geocode(18.59134, 73.73893)
        self.assertEqual(addr2, addr1)
        # Verify geolocator was NOT invoked a second time (cache hit!)
        self.assertEqual(mock_geolocator.reverse.call_count, 1)

    @patch("core.geotag.get_geocoder")
    def test_reverse_geocode_timeout_fallback(self, mock_get_geocoder):
        mock_geolocator = MagicMock()
        mock_geolocator.reverse.side_effect = GeocoderTimedOut("Connection timed out")
        mock_get_geocoder.return_value = mock_geolocator

        # Must not raise exception; must return graceful coordinate fallback
        res = reverse_geocode(19.0760, 72.8777)
        self.assertIn("Lat: 19.0760°", res)
        self.assertIn("Lon: 72.8777°", res)
        self.assertIn("Lookup Pending", res)

    @patch("core.geotag.get_geocoder")
    def test_reverse_geocode_service_unavailable_fallback(self, mock_get_geocoder):
        mock_geolocator = MagicMock()
        mock_geolocator.reverse.side_effect = GeocoderUnavailable("Service temporary outage")
        mock_get_geocoder.return_value = mock_geolocator

        res = reverse_geocode(19.0760, 72.8777)
        self.assertIn("Lat: 19.0760°", res)
        self.assertIn("Lookup Pending", res)

    @patch("core.geotag.get_geocoder")
    def test_reverse_geocode_empty_result_fallback(self, mock_get_geocoder):
        mock_geolocator = MagicMock()
        mock_geolocator.reverse.return_value = None
        mock_get_geocoder.return_value = mock_geolocator

        res = reverse_geocode(19.0760, 72.8777)
        self.assertIn("Lat: 19.0760°", res)
        self.assertIn("Lookup Pending", res)

    @patch("core.geotag.get_geocoder")
    def test_forward_geocode_mock_success(self, mock_get_geocoder):
        mock_geolocator = MagicMock()
        mock_geolocator.geocode.return_value = MockLocation(
            address="Tech Park Headquarters, BKC, Mumbai",
            latitude=19.0657,
            longitude=72.8687
        )
        mock_get_geocoder.return_value = mock_geolocator

        res = forward_geocode("Tech Park Headquarters, BKC, Mumbai")
        self.assertIsNotNone(res)
        self.assertEqual(res["latitude"], 19.0657)
        self.assertEqual(res["longitude"], 72.8687)
        self.assertIn("Tech Park", res["address"])

    @patch("core.geotag.get_geocoder")
    def test_forward_geocode_timeout_and_empty(self, mock_get_geocoder):
        # Empty input
        self.assertIsNone(forward_geocode(""))
        self.assertIsNone(forward_geocode(None))

        # Timeout
        mock_geolocator = MagicMock()
        mock_geolocator.geocode.side_effect = GeocoderTimedOut("Timeout")
        mock_get_geocoder.return_value = mock_geolocator
        self.assertIsNone(forward_geocode("Some address"))

    def test_stamp_geotag_creation_with_accuracy(self):
        # Create a test blank image
        test_img = np.zeros((300, 400, 3), dtype=np.uint8)
        test_img[:, :] = [100, 150, 200]
        
        output_rel = stamp_geotag(
            image_input=test_img,
            student_name="Test Student",
            student_id=999,
            timestamp_str="2026-09-27 21:00:00 UTC",
            latitude=19.0760,
            longitude=72.8777,
            address="Mumbai, Maharashtra, India",
            confidence=0.95,
            status="success",
            accuracy_meters=14.0
        )
        self.assertTrue(os.path.exists(output_rel))
        with Image.open(output_rel) as img:
            self.assertEqual(img.size, (400, 300))

    def test_admin_api_forward_geocode_auth_and_lookup(self):
        """Admin forward geocode route requires auth and returns coordinates on success."""
        from app import app
        app.config["TESTING"] = True
        client = app.test_client()

        # 1. Unauthenticated -> 403, 401, or 302
        res_unauth = client.post("/admin/api/geocode/forward", json={"address": "Pune, India"})
        self.assertIn(res_unauth.status_code, (302, 401, 403))

        # 2. Authenticated Admin Session
        with client.session_transaction() as sess:
            sess["role"] = "admin"
            sess["admin_id"] = 1
            sess["admin_username"] = "admin"

        # Empty address -> 400
        res_empty = client.post("/admin/api/geocode/forward", json={"address": ""})
        self.assertEqual(res_empty.status_code, 400)

        # Successful lookup with mock
        with patch("blueprints.admin.routes.forward_geocode") as mock_fg:
            mock_fg.return_value = {
                "latitude": 18.5913,
                "longitude": 73.7389,
                "address": "Hinjewadi Phase 2, Pune, Maharashtra, India"
            }
            res_ok = client.post("/admin/api/geocode/forward", json={"address": "Hinjewadi Phase 2"})
            self.assertEqual(res_ok.status_code, 200)
            data = res_ok.get_json()
            self.assertTrue(data["success"])
            self.assertEqual(data["latitude"], 18.5913)
            self.assertEqual(data["longitude"], 73.7389)

        # Failed lookup -> 404
        with patch("blueprints.admin.routes.forward_geocode", return_value=None):
            res_fail = client.post("/admin/api/geocode/forward", json={"address": "Nonexistent place 12345"})
            self.assertEqual(res_fail.status_code, 404)
            data_fail = res_fail.get_json()
            self.assertFalse(data_fail["success"])

    def test_manual_checkin_accuracy_storage_and_flag(self):
        """
        Submitting manual check-in with accuracy stores accuracy_meters in DB,
        and flags the event when accuracy > 100m.
        """
        from app import app
        from core.db import get_db_connection
        app.config["TESTING"] = True
        client = app.test_client()

        # Clean existing test events for employee 29
        conn = get_db_connection()
        conn.execute("DELETE FROM attendance_events WHERE employee_id = 29")
        conn.execute("DELETE FROM attendance WHERE student_id = 29")
        conn.commit()
        conn.close()

        # Employee 29 session (Aayushi, site_id=1, BKC Mumbai)
        with client.session_transaction() as sess:
            sess["role"] = "employee"
            sess["employee_id"] = 29
            sess["student_id"] = 29
            sess["employee_name"] = "Aayushi"
            sess["student_name"] = "Aayushi"

        # Coordinates 50m from site, but poor accuracy = 150m (> 100m)
        resp = client.post("/employee/manual-check-in", json={
            "latitude": 19.0657 + 0.0004,
            "longitude": 72.8687,
            "accuracy": 150.0,
            "bypass_cooldown": True
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data["success"])
        self.assertTrue(data["flagged"])
        self.assertIn("Low GPS accuracy", data["flag_reason"])
        self.assertEqual(data["accuracy_meters"], 150.0)

        # Verify persisted in database
        event_id = data["event_id"]
        conn = get_db_connection()
        row = conn.execute("SELECT accuracy_meters, flagged, flag_reason FROM attendance_events WHERE id = ?", (event_id,)).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["accuracy_meters"], 150.0)
        self.assertEqual(row["flagged"], 1)

        # Cleanup
        conn.execute("DELETE FROM attendance_events WHERE id = ?", (event_id,))
        conn.execute("DELETE FROM attendance WHERE id = (SELECT MAX(id) FROM attendance WHERE student_id = 29)")
        conn.commit()
        conn.close()

    def tearDown(self):
        if os.path.exists("attendance_photos"):
            for f in os.listdir("attendance_photos"):
                if f.startswith("999_"):
                    try:
                        os.remove(os.path.join("attendance_photos", f))
                    except OSError:
                        pass

if __name__ == "__main__":
    unittest.main()

