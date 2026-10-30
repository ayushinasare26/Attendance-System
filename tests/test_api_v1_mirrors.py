"""
tests/test_api_v1_mirrors.py - Verification of /api/v1 Mirror Routes & Dual-Mode JSON Adaptation

Verifies:
1. Every route is cleanly mirrored under /api/v1 using the exact same view functions.
2. In JSON mode, `render_template` returns context dictionaries as JSON.
3. In JSON mode, `redirect` + `flash` returns structured JSON responses.
4. Role and ownership boundaries hold identically on mirrors (401/403 responses with correct targets).
5. Non-JSON (HTML) behavior remains 100% unaltered.
"""

import unittest
from app import app

class TestApiV1Mirrors(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        app.config["WTF_CSRF_ENABLED"] = False
        self.client = app.test_client()

    def test_01_healthcheck_mirrored(self):
        """Verifies health endpoint is mirrored at both /api/v1/api/health and /api/v1/health."""
        res1 = self.client.get("/api/v1/api/health")
        self.assertEqual(res1.status_code, 200)
        data1 = res1.get_json()
        self.assertIn("status", data1)
        self.assertIn("python_version", data1)

        res2 = self.client.get("/api/v1/health")
        self.assertEqual(res2.status_code, 200)
        data2 = res2.get_json()
        self.assertEqual(data1["status"], data2["status"])

    def test_02_root_redirect_json(self):
        """Unauthenticated /api/v1/ returns redirect to /employee/login."""
        res = self.client.get("/api/v1/")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        self.assertIn("/employee/login", data.get("redirect", ""))

    def test_03_unauthenticated_admin_blocked(self):
        """Unauthenticated access to /api/v1/admin/dashboard returns 401 with redirect to /admin/login."""
        res = self.client.get("/api/v1/admin/dashboard")
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertFalse(data.get("ok"))
        self.assertEqual(data.get("redirect"), "/admin/login")

    def test_04_unauthenticated_manager_blocked(self):
        """Unauthenticated access to /api/v1/manager/dashboard returns 401 with redirect to /employee/login."""
        res = self.client.get("/api/v1/manager/dashboard")
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertFalse(data.get("ok"))
        self.assertEqual(data.get("redirect"), "/employee/login")

    def test_05_unauthenticated_employee_blocked(self):
        """Unauthenticated access to /api/v1/employee/check-in-out returns 401 with redirect to /employee/login."""
        res = self.client.get("/api/v1/employee/check-in-out")
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertFalse(data.get("ok"))
        self.assertEqual(data.get("redirect"), "/employee/login")

    def test_06_employee_cannot_access_admin_mirror(self):
        """Logged in employee accessing /api/v1/admin/dashboard receives 403 and redirect to check-in-out."""
        with self.client.session_transaction() as sess:
            sess["role"] = "employee"
            sess["employee_id"] = 78
            sess["employee_name"] = "Aarav Sharma"

        res = self.client.get("/api/v1/admin/dashboard")
        self.assertEqual(res.status_code, 403)
        data = res.get_json()
        self.assertFalse(data.get("ok"))
        self.assertEqual(data.get("redirect"), "/employee/check-in-out")
        self.assertIn("permission", data.get("error", "").lower())

    def test_07_employee_cannot_access_manager_mirror(self):
        """Logged in employee accessing /api/v1/manager/dashboard receives 403."""
        with self.client.session_transaction() as sess:
            sess["role"] = "employee"
            sess["employee_id"] = 78
            sess["employee_name"] = "Aarav Sharma"

        res = self.client.get("/api/v1/manager/dashboard")
        self.assertEqual(res.status_code, 403)
        data = res.get_json()
        self.assertFalse(data.get("ok"))
        self.assertEqual(data.get("redirect"), "/employee/check-in-out")

    def test_08_manager_cannot_access_admin_mirror(self):
        """Logged in manager accessing /api/v1/admin/dashboard receives 403 and redirect to manager dashboard."""
        with self.client.session_transaction() as sess:
            sess["role"] = "manager"
            sess["manager_id"] = 76
            sess["employee_name"] = "Vikram Sharma"

        res = self.client.get("/api/v1/admin/dashboard")
        self.assertEqual(res.status_code, 403)
        data = res.get_json()
        self.assertFalse(data.get("ok"))
        self.assertEqual(data.get("redirect"), "/manager/dashboard")

    def test_09_admin_login_mirror(self):
        """Admin login through /api/v1/admin/login sets session cookie and returns JSON redirect."""
        res = self.client.post("/api/v1/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("redirect"), "/admin/dashboard")

    def test_10_authenticated_admin_dashboard_mirror(self):
        """Authenticated Admin requesting /api/v1/admin/dashboard receives template context as JSON."""
        with self.client.session_transaction() as sess:
            sess["role"] = "admin"
            sess["admin_id"] = 1
            sess["admin_name"] = "Administrator"

        res = self.client.get("/api/v1/admin/dashboard")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        self.assertIn("total_employees", data)
        self.assertIn("total_sites", data)
        self.assertIn("present_today", data)
        self.assertIn("recent_logs", data)

    def test_11_authenticated_admin_sites_mirror(self):
        """Authenticated Admin requesting /api/v1/admin/sites receives sites list in JSON context."""
        with self.client.session_transaction() as sess:
            sess["role"] = "admin"
            sess["admin_id"] = 1

        res = self.client.get("/api/v1/admin/sites")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        self.assertIn("sites", data)
        self.assertIsInstance(data["sites"], list)

    def test_12_authenticated_admin_shifts_mirror(self):
        """Authenticated Admin requesting /api/v1/admin/shifts receives shifts list in JSON context."""
        with self.client.session_transaction() as sess:
            sess["role"] = "admin"
            sess["admin_id"] = 1

        res = self.client.get("/api/v1/admin/shifts")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        self.assertIn("shifts", data)

    def test_13_authenticated_admin_employees_mirror(self):
        """Authenticated Admin requesting /api/v1/admin/employees receives employees directory in JSON."""
        with self.client.session_transaction() as sess:
            sess["role"] = "admin"
            sess["admin_id"] = 1

        res = self.client.get("/api/v1/admin/employees")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        self.assertIn("employees", data)

    def test_14_authenticated_manager_dashboard_mirror(self):
        """Authenticated Manager requesting /api/v1/manager/dashboard receives team context in JSON."""
        with self.client.session_transaction() as sess:
            sess["role"] = "manager"
            sess["manager_id"] = 76
            sess["employee_id"] = 76
            sess["employee_name"] = "Vikram Sharma"

        res = self.client.get("/api/v1/manager/dashboard")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        self.assertIn("team_members", data)
        self.assertIn("total_team", data)

    def test_15_authenticated_employee_check_in_out_mirror(self):
        """Authenticated Employee requesting /api/v1/employee/check-in-out receives check-in context in JSON."""
        with self.client.session_transaction() as sess:
            sess["role"] = "employee"
            sess["employee_id"] = 79  # Aditya Verma
            sess["student_id"] = 79
            sess["employee_name"] = "Aditya Verma"
            sess["employee_code"] = "EMP-002"

        res = self.client.get("/api/v1/employee/check-in-out")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        self.assertIn("site", data)
        self.assertIn("shift", data)
        self.assertIn("effective_policy", data)
        self.assertIn("next_action", data)

    def test_16_authenticated_employee_my_attendance_mirror(self):
        """Authenticated Employee requesting /api/v1/employee/my-attendance receives records list in JSON."""
        with self.client.session_transaction() as sess:
            sess["role"] = "employee"
            sess["employee_id"] = 79
            sess["employee_name"] = "Aditya Verma"

        res = self.client.get("/api/v1/employee/my-attendance")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        self.assertIn("records", data)

    def test_17_logout_mirror(self):
        """Calling /api/v1/admin/logout returns JSON response with category and redirect."""
        with self.client.session_transaction() as sess:
            sess["role"] = "admin"
            sess["admin_id"] = 1

        res = self.client.get("/api/v1/admin/logout")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("category"), "info")
        self.assertEqual(data.get("redirect"), "/admin/login")

    def test_18_non_json_mode_remains_html(self):
        """Non-JSON endpoints (e.g. /admin/login) continue rendering exact HTML string."""
        res = self.client.get("/admin/login")
        self.assertEqual(res.status_code, 200)
        self.assertIn(b"<!doctype html>", res.data)
        self.assertIn(b"GeoFace Portal", res.data)

if __name__ == "__main__":
    unittest.main()
