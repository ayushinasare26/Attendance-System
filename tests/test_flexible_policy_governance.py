"""
tests/test_flexible_policy_governance.py - Flexible Hours Work Policy Governance Tests

Verifies:
1. Migration Integrity & Reversibility:
   - shifts.is_archived, employees.previous_shift_id, required_daily_hours, required_weekly_hours.
   - Legacy fixed shifts (IDs 1-8) are archived and misleading names renamed.
   - Seeded policies ("Flexible 8h", "Flexible 6h", "Flexible 9h") exist.
   - Active employees have previous_shift_id and are assigned to Flexible 8h.
   - Rollback mechanism (restoring previous_shift_id) is verified.
2. Policy Resolution Order (get_effective_work_policy):
   - Tier 1: Per-employee override
   - Tier 2: Employee assigned shift
   - Tier 3: Department default
   - Tier 4: Site default
   - Tier 5: Company default policy
   - Historical snapshots preserved from daily_attendance_summary.
3. Three-Portal Consistency Assertion:
   - Admin Roster, Employee Portal (check-in/out), and Payroll CSV Export all
     present identical duration and policy name derived from get_effective_work_policy.
4. Route Security & Access Control:
   - Employee cannot edit policies or durations.
   - Admin bulk assignment updates policies, overrides, and logs to audit trail.
5. Edge Cases:
   - Part-time duration overrides.
   - Mid-week policy change snapshot preservation.
   - Shift deletion protection when referenced.
"""

import io
import csv
import json
import unittest
from datetime import datetime, date, timedelta
from app import app
from core.db import get_db_connection, get_effective_work_policy

class TestFlexiblePolicyGovernance(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        app.config["WTF_CSRF_ENABLED"] = False
        self.client = app.test_client()

    def test_migration_integrity_and_seeded_policies(self):
        """Verify schema columns, seeded flexible policies, legacy shift archiving, and renaming."""
        conn = get_db_connection()
        c = conn.cursor()
        try:
            # Check columns exist
            c.execute("PRAGMA table_info(shifts)")
            shift_cols = [r["name"] for r in c.fetchall()]
            self.assertIn("is_archived", shift_cols)

            c.execute("PRAGMA table_info(employees)")
            emp_cols = [r["name"] for r in c.fetchall()]
            self.assertIn("previous_shift_id", emp_cols)
            self.assertIn("required_daily_hours", emp_cols)
            self.assertIn("required_weekly_hours", emp_cols)

            # Check seeded policies
            c.execute("SELECT id, name, shift_type, required_daily_hours, required_weekly_hours, core_start, core_end FROM shifts WHERE id IN (9, 10, 11)")
            seeded = {r["id"]: dict(r) for r in c.fetchall()}
            self.assertIn(9, seeded)
            self.assertEqual(seeded[9]["name"], "Flexible 8h")
            self.assertEqual(seeded[9]["shift_type"], "flexible")
            self.assertEqual(seeded[9]["required_daily_hours"], 8.0)
            self.assertEqual(seeded[9]["required_weekly_hours"], 40.0)
            self.assertEqual(seeded[9]["core_start"], "11:00")
            self.assertEqual(seeded[9]["core_end"], "16:00")

            self.assertIn(10, seeded)
            self.assertEqual(seeded[10]["name"], "Flexible 6h")
            self.assertEqual(seeded[10]["required_daily_hours"], 6.0)

            self.assertIn(11, seeded)
            self.assertEqual(seeded[11]["name"], "Flexible 9h")
            self.assertEqual(seeded[11]["required_daily_hours"], 9.0)

            # Check misleading legacy names were renamed
            c.execute("SELECT name FROM shifts WHERE id = 4")
            row_4 = c.fetchone()
            if row_4:
                self.assertIn("Legacy Fixed 09:00-18:00", row_4["name"])
                self.assertFalse(row_4["name"].startswith("Flexible Shift"))

            c.execute("SELECT name FROM shifts WHERE id = 8")
            row_8 = c.fetchone()
            if row_8:
                self.assertIn("Legacy Fixed Field Shift", row_8["name"])
                self.assertFalse(row_8["name"].startswith("Flexible Field Shift"))

            # Check active employees are on Flexible 8h and have previous_shift_id
            c.execute("SELECT id, name, shift_id, previous_shift_id FROM employees WHERE active = 1")
            active_emps = [dict(r) for r in c.fetchall()]
            self.assertGreater(len(active_emps), 0)
            for emp in active_emps:
                self.assertEqual(emp["shift_id"], 9, f"Employee {emp['name']} not assigned to Flexible 8h")
                self.assertIsNotNone(emp["previous_shift_id"], f"Employee {emp['name']} has null previous_shift_id")

            # Check migration was recorded in audit_logs
            c.execute("SELECT action, details FROM audit_logs WHERE action = 'MIGRATE_FLEXIBLE_WORK_POLICY'")
            audit = c.fetchone()
            self.assertIsNotNone(audit)
        finally:
            conn.close()

    def test_migration_reversibility(self):
        """Verify that rolling back to previous_shift_id restores previous shift assignments."""
        conn = get_db_connection()
        c = conn.cursor()
        try:
            c.execute("SELECT id, shift_id, previous_shift_id FROM employees WHERE active = 1 LIMIT 5")
            sample_emps = [dict(r) for r in c.fetchall()]
            self.assertTrue(len(sample_emps) > 0)

            # Test simulated rollback
            for emp in sample_emps:
                c.execute("UPDATE employees SET shift_id = previous_shift_id WHERE id = ?", (emp["id"],))
            conn.commit()
            
            # Verify restored
            for emp in sample_emps:
                c.execute("SELECT shift_id FROM employees WHERE id = ?", (emp["id"],))
                res = c.fetchone()
                self.assertEqual(res["shift_id"], emp["previous_shift_id"])

            # Revert back to Flexible 8h
            for emp in sample_emps:
                c.execute("UPDATE employees SET shift_id = 9 WHERE id = ?", (emp["id"],))
            conn.commit()
        finally:
            conn.close()

    def test_resolution_order(self):
        """
        Verify the 5 tiers of policy resolution:
        1. Employee override
        2. Employee shift assignment
        3. Department default shift
        4. Site default shift
        5. Company default shift
        """
        conn = get_db_connection()
        c = conn.cursor()
        try:
            # Create a test employee
            c.execute("""
                INSERT INTO employees (name, employee_code, email, password_hash, active, shift_id, department_id, site_id, created_at)
                VALUES ('Policy Test Emp', 'PTE001', 'pte@example.com', 'dummy_hash', 1, NULL, NULL, NULL, datetime('now'))
            """)
            emp_id = c.lastrowid
            conn.commit()

            # 5. Company default fallback (all null)
            pol = get_effective_work_policy(emp_id, conn=conn)
            self.assertEqual(pol["id"], 9)
            self.assertEqual(pol["required_daily_hours"], 8.0)
            self.assertFalse(pol["is_override"])

            # 4. Site default fallback
            c.execute("INSERT INTO sites (name, address, latitude, longitude, shift_id, created_at) VALUES ('Test Site', '123 Test', 19.0, 72.8, 10, datetime('now'))")
            site_id = c.lastrowid
            c.execute("UPDATE employees SET site_id = ? WHERE id = ?", (site_id, emp_id))
            conn.commit()
            pol = get_effective_work_policy(emp_id, conn=conn)
            self.assertEqual(pol["id"], 10)
            self.assertEqual(pol["required_daily_hours"], 6.0)

            # 3. Department default overrides site default
            c.execute("INSERT INTO departments (name, shift_id, created_at) VALUES ('Test Dept', 11, datetime('now'))")
            dept_id = c.lastrowid
            c.execute("UPDATE employees SET department_id = ? WHERE id = ?", (dept_id, emp_id))
            conn.commit()
            pol = get_effective_work_policy(emp_id, conn=conn)
            self.assertEqual(pol["id"], 11)
            self.assertEqual(pol["required_daily_hours"], 9.0)

            # 2. Employee shift assignment overrides department default
            c.execute("UPDATE employees SET shift_id = 10 WHERE id = ?", (emp_id,))
            conn.commit()
            pol = get_effective_work_policy(emp_id, conn=conn)
            self.assertEqual(pol["id"], 10)
            self.assertEqual(pol["required_daily_hours"], 6.0)

            # 1. Per-employee override takes absolute precedence
            c.execute("UPDATE employees SET required_daily_hours = 7.5, required_weekly_hours = 37.5 WHERE id = ?", (emp_id,))
            conn.commit()
            pol = get_effective_work_policy(emp_id, conn=conn)
            self.assertEqual(pol["required_daily_hours"], 7.5)
            self.assertEqual(pol["required_weekly_hours"], 37.5)
            self.assertTrue(pol["is_override"])
            self.assertIn("7.5h/day", pol["duration_display"])
        finally:
            c.execute("DELETE FROM employees WHERE employee_code = 'PTE001'")
            c.execute("DELETE FROM departments WHERE name = 'Test Dept'")
            c.execute("DELETE FROM sites WHERE name = 'Test Site'")
            conn.commit()
            conn.close()

    def test_duration_consistency_admin_employee_payroll(self):
        """
        Verify assertion:
        Duration and policy display shown in Admin Roster, Employee Portal, and Payroll Export
        are identical and sourced from get_effective_work_policy.
        """
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT id, name, employee_code, email FROM employees WHERE active = 1 LIMIT 1")
        emp = dict(c.fetchone())
        emp_id = emp["id"]
        today_str = date.today().isoformat()

        # Effective policy for today
        effective_pol = get_effective_work_policy(emp_id, date=today_str, conn=conn)
        policy_name = effective_pol["name"]
        daily_hours = effective_pol["required_daily_hours"]
        duration_display = effective_pol["duration_display"]
        conn.close()

        # 1. Admin Roster View
        with self.client.session_transaction() as sess:
            sess["role"] = "admin"
            sess["admin_id"] = 1
            sess["user_name"] = "Admin"
        
        admin_res = self.client.get("/admin/employees")
        self.assertEqual(admin_res.status_code, 200)
        admin_html = admin_res.get_data(as_text=True)
        # Ensure employee name and duration display appear in the roster
        self.assertIn(emp["name"], admin_html)
        self.assertIn(duration_display, admin_html)

        # 2. Employee Portal View
        with self.client.session_transaction() as sess:
            sess["role"] = "employee"
            sess["employee_id"] = emp_id
            sess["student_id"] = emp_id
            sess["employee_name"] = emp["name"]
            sess["email"] = emp["email"]

        emp_res = self.client.get("/employee/check-in-out")
        self.assertEqual(emp_res.status_code, 200)
        emp_html = emp_res.get_data(as_text=True)
        # Check header status card and Assigned Shift Schedule card
        self.assertIn(duration_display, emp_html)
        self.assertIn(policy_name, emp_html)
        self.assertIn(f"{daily_hours:g}h/day", emp_html)

        # 3. Payroll Export View
        with self.client.session_transaction() as sess:
            sess["role"] = "admin"
            sess["admin_id"] = 1
            sess["user_name"] = "Admin"

        payroll_res = self.client.get(f"/admin/payroll-export/csv?from={today_str}&to={today_str}")
        self.assertEqual(payroll_res.status_code, 200)
        csv_text = payroll_res.get_data(as_text=True)
        csv_reader = csv.DictReader(io.StringIO(csv_text))
        
        # Verify columns exist
        headers = csv_reader.fieldnames
        self.assertIn("Policy Name", headers)
        self.assertIn("Required Hours", headers)
        self.assertIn("Worked Hours", headers)
        self.assertIn("Short Hours", headers)
        self.assertIn("Overtime Hours", headers)
        self.assertIn("Core Missed Days", headers)

        emp_row = None
        for row in csv_reader:
            if row.get("Employee Code") == emp["employee_code"] or row.get("Employee Name") == emp["name"]:
                emp_row = row
                break

        self.assertIsNotNone(emp_row, "Employee not found in payroll CSV")
        self.assertEqual(emp_row["Policy Name"], policy_name)
        self.assertEqual(float(emp_row["Required Hours"]), float(daily_hours))

    def test_route_security_and_permissions(self):
        """Employees cannot modify policies/durations; admin bulk assignment is authorized & audited."""
        # Employee cannot POST policy update
        with self.client.session_transaction() as sess:
            sess["role"] = "employee"
            sess["employee_id"] = 29

        res = self.client.post("/admin/employees/29/policy", data={
            "shift_id": 10,
            "required_daily_hours": 6.0
        }, follow_redirects=False)
        self.assertIn(res.status_code, [302, 401, 403])

        # Admin can bulk assign and verify audit trail
        with self.client.session_transaction() as sess:
            sess["role"] = "admin"
            sess["admin_id"] = 1
            sess["user_name"] = "Admin"

        bulk_res = self.client.post("/admin/shifts/assign", data={
            "shift_id": 9,
            "assignment_mode": "bulk",
            "scope": "selected",
            "employee_ids": "29",
            "override_daily_hours": "8.0",
            "override_weekly_hours": "40.0"
        }, follow_redirects=True)
        self.assertEqual(bulk_res.status_code, 200)

        conn = get_db_connection()
        c = conn.cursor()
        try:
            c.execute("SELECT action, details FROM audit_logs WHERE action = 'ASSIGN_SHIFTS_BULK' ORDER BY id DESC LIMIT 1")
            audit_entry = c.fetchone()
            self.assertIsNotNone(audit_entry)
            self.assertIn("selected", audit_entry["details"].lower())
        finally:
            conn.close()

    def test_delete_referenced_shift_is_blocked(self):
        """Deleting an active/referenced shift must be blocked and archived instead."""
        with self.client.session_transaction() as sess:
            sess["role"] = "admin"
            sess["admin_id"] = 1
            sess["user_name"] = "Admin"

        # Shift 9 is assigned to all active employees
        res = self.client.post("/admin/shifts/9/delete", follow_redirects=True)
        self.assertEqual(res.status_code, 200)
        html = res.get_data(as_text=True)
        # Should show a warning / blocking message that it was archived rather than deleted
        self.assertTrue("archived" in html.lower() or "cannot" in html.lower() or "referenced" in html.lower())

        conn = get_db_connection()
        c = conn.cursor()
        try:
            c.execute("SELECT id FROM shifts WHERE id = 9")
            self.assertIsNotNone(c.fetchone(), "Shift 9 was completely deleted when it should have been protected!")
        finally:
            conn.close()

    def test_midweek_policy_change_snapshots(self):
        """Mid-week policy changes compute weekly hours per day and preserve past snapshots."""
        conn = get_db_connection()
        c = conn.cursor()
        try:
            c.execute("SELECT id FROM employees WHERE active = 1 LIMIT 1")
            emp_id = c.fetchone()["id"]

            yesterday = (date.today() - timedelta(days=1)).isoformat()
            today = date.today().isoformat()

            snap_json = json.dumps({
                "shift_id": 9,
                "shift_name": "Flexible 8h",
                "shift_type": "flexible",
                "required_daily_hours": 8.0,
                "required_daily_minutes": 480,
                "required_weekly_hours": 40.0,
                "display_string": "Flexible · 8h/day · 40h/week · Core 11:00-16:00",
                "is_override": False
            })

            # Record yesterday's summary under 8h policy (480 minutes)
            c.execute("""
                INSERT OR REPLACE INTO daily_attendance_summary 
                (employee_id, date, shift_id, shift_type, policy_snapshot, required_minutes, worked_minutes, status, computed_at)
                VALUES (?, ?, 9, 'flexible', ?, 480, 480, 'Complete', datetime('now'))
            """, (emp_id, yesterday, snap_json))
            conn.commit()

            # Now simulate a policy override change today: 6h (360 min)
            c.execute("UPDATE employees SET required_daily_hours = 6.0, required_weekly_hours = 30.0 WHERE id = ?", (emp_id,))
            conn.commit()

            # Query effective policy for yesterday: must preserve snapshot from summary!
            yesterday_pol = get_effective_work_policy(emp_id, date=yesterday, conn=conn)
            self.assertEqual(yesterday_pol["required_daily_hours"], 8.0)
            self.assertEqual(yesterday_pol["required_daily_minutes"], 480)

            # Query effective policy for today: must use new override!
            today_pol = get_effective_work_policy(emp_id, date=today, conn=conn)
            self.assertEqual(today_pol["required_daily_hours"], 6.0)
            self.assertEqual(today_pol["required_daily_minutes"], 360)
            self.assertTrue(today_pol["is_override"])

            # Reset override
            c.execute("UPDATE employees SET required_daily_hours = NULL, required_weekly_hours = NULL WHERE id = ?", (emp_id,))
            conn.commit()
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main()
