"""
tests/test_shift_engine.py - Unit Tests for Industrial Shift Engine
Covers:
1. On-time check-in (within grace period).
2. Late check-in (exceeds grace period).
3. Early check-out (leaves before scheduled end).
4. Normal on-time check-out.
5. Overtime calculation for extended hours.
6. Edge case: Check-out before check-in (invalid sequence).
7. Edge case: Missing check-out (incomplete event).
8. Break deduction for shifts >= 4 hours.
"""

import unittest
import datetime
from core.shift_engine import (
    evaluate_check_in,
    evaluate_check_out,
    calculate_shift_hours,
    compute_flexible_day,
    compute_flexible_week,
    validate_flexible_shift_policy
)

class TestShiftEngine(unittest.TestCase):
    def setUp(self):
        # Standard Shift: 09:00 to 18:00 (9 hours gross, 60m break -> 8h regular scheduled)
        self.shift = {
            "name": "General Shift",
            "start_time": "09:00",
            "end_time": "18:00",
            "grace_period_minutes": 15,
            "break_duration_minutes": 60
        }

    def test_on_time_check_in_exact(self):
        """Checking in at 09:00 exact should be on_time."""
        check_in = "2026-09-29T09:00:00"
        res = evaluate_check_in(check_in, self.shift)
        self.assertEqual(res["status"], "on_time")
        self.assertEqual(res["minutes_late"], 0.0)

    def test_on_time_check_in_within_grace(self):
        """Checking in at 09:12 (within 15m grace) should still be on_time."""
        check_in = "2026-09-29T09:12:00"
        res = evaluate_check_in(check_in, self.shift)
        self.assertEqual(res["status"], "on_time")
        self.assertEqual(res["minutes_late"], 0.0)

    def test_late_check_in(self):
        """Checking in at 09:35 (20 mins past grace limit) must be marked late."""
        check_in = "2026-09-29T09:35:00"
        res = evaluate_check_in(check_in, self.shift)
        self.assertEqual(res["status"], "late")
        self.assertEqual(res["minutes_late"], 35.0)

    def test_early_leave(self):
        """Checking out at 16:30 (1.5 hours before 18:00) must be early_leave."""
        check_out = "2026-09-29T16:30:00"
        res = evaluate_check_out(check_out, self.shift)
        self.assertEqual(res["status"], "early_leave")
        self.assertEqual(res["minutes_early"], 90.0)

    def test_overtime_calculation(self):
        """Working from 09:00 to 20:00 (11 hours gross - 1h break = 10h net -> 2h overtime)."""
        check_in = "2026-09-29T09:00:00"
        check_out = "2026-09-29T20:00:00"
        res = calculate_shift_hours(check_in, check_out, self.shift)
        self.assertEqual(res["gross_hours"], 11.0)
        self.assertEqual(res["net_hours"], 10.0)
        self.assertEqual(res["regular_hours"], 8.0)
        self.assertEqual(res["overtime_hours"], 2.0)
        self.assertEqual(res["status"], "overtime")

    def test_checkout_before_checkin_edge_case(self):
        """Check-out timestamp earlier than check-in must be flagged as invalid sequence."""
        check_in = "2026-09-29T14:00:00"
        check_out = "2026-09-29T09:00:00"
        res = calculate_shift_hours(check_in, check_out, self.shift)
        self.assertEqual(res["status"], "invalid_sequence")
        self.assertTrue(res["flagged"])
        self.assertIn("Corrupted sequence", res["flag_reason"])

    def test_missing_checkout_edge_case(self):
        """Check-in without corresponding check-out must return missing_checkout."""
        check_in = "2026-09-29T09:00:00"
        res = calculate_shift_hours(check_in, None, self.shift)
        self.assertEqual(res["status"], "missing_checkout")
        self.assertTrue(res["flagged"])
        self.assertIn("missing", res["flag_reason"].lower())

    def test_break_deduction(self):
        """Shift of 8 hours gross should have 1 hour break deducted -> 7 net hours."""
        check_in = "2026-09-29T09:00:00"
        check_out = "2026-09-29T17:00:00"
        res = calculate_shift_hours(check_in, check_out, self.shift)
        self.assertEqual(res["gross_hours"], 8.0)
        self.assertEqual(res["net_hours"], 7.0)


class TestFlexibleShiftEngine(unittest.TestCase):
    def setUp(self):
        self.policy = {
            "id": 10,
            "name": "Standard Flexible",
            "shift_type": "flexible",
            "core_start": "11:00",
            "core_end": "16:00",
            "required_daily_hours": 8.0,
            "required_weekly_hours": 40.0,
            "enforcement_mode": "both",
            "allowed_window_start": "07:00",
            "allowed_window_end": "22:00",
            "unpaid_break_minutes": 30,
            "core_hours_enforced": True,
            "core_grace_minutes": 15,
            "overtime_threshold_minutes": 30,
            "half_day_threshold_hours": 4.0,
            "weekly_off_days": "Sat,Sun",
            "week_start_day": "Monday",
            "count_flagged_events_policy": "count_pending"
        }

    def test_exact_required_hours(self):
        """Check-in 09:00, Check-out 17:30 (8.5h gross - 30m break = 8.0h net). Status must be Complete."""
        events = [
            {"event_type": "check_in", "timestamp": "2026-10-14T09:00:00Z"},
            {"event_type": "check_out", "timestamp": "2026-10-14T17:30:00Z"}
        ]
        res = compute_flexible_day(events, self.policy, "2026-10-14", site_timezone="UTC")
        self.assertEqual(res["status"], "Complete")
        self.assertEqual(res["worked_minutes"], 480.0)
        self.assertEqual(res["short_minutes"], 0.0)
        self.assertEqual(res["overtime_minutes"], 0.0)
        self.assertTrue(res["core_coverage"])

    def test_one_minute_short(self):
        """Working 479 minutes against 480 required results in Short Hours status and 1m deficit."""
        events = [
            {"event_type": "check_in", "timestamp": "2026-10-14T09:00:00Z"},
            {"event_type": "check_out", "timestamp": "2026-10-14T17:29:00Z"}
        ]
        res = compute_flexible_day(events, self.policy, "2026-10-14", site_timezone="UTC")
        self.assertEqual(res["status"], "Short Hours")
        self.assertEqual(res["worked_minutes"], 479.0)
        self.assertEqual(res["short_minutes"], 1.0)
        self.assertEqual(res["overtime_minutes"], 0.0)

    def test_multiple_sessions_with_lunch(self):
        """Multiple check-ins and check-outs (lunch break in/out) correctly summed minus break."""
        events = [
            {"event_type": "check_in", "timestamp": "2026-10-14T09:00:00Z"},
            {"event_type": "check_out", "timestamp": "2026-10-14T12:45:00Z"}, # 3h45m
            {"event_type": "check_in", "timestamp": "2026-10-14T13:15:00Z"},
            {"event_type": "check_out", "timestamp": "2026-10-14T18:00:00Z"}  # 4h45m
        ]
        # Total gross 8.5h - 30m break = 8.0h net (480 mins)
        # Core coverage: 11:00-12:45 (105m) + 13:15-16:00 (165m) = 270m >= min required 270m
        res = compute_flexible_day(events, self.policy, "2026-10-14", site_timezone="UTC")
        self.assertEqual(res["status"], "Complete")
        self.assertEqual(res["worked_minutes"], 480.0)
        self.assertEqual(res["sessions_count"], 2)

    def test_core_window_covered_with_grace(self):
        """Checking in at 11:10 (within 15m grace for 11:00 core start) covers core window."""
        events = [
            {"event_type": "check_in", "timestamp": "2026-10-14T11:10:00Z"},
            {"event_type": "check_out", "timestamp": "2026-10-14T19:40:00Z"} # 8.5h gross - 30m = 8h
        ]
        res = compute_flexible_day(events, self.policy, "2026-10-14", site_timezone="UTC")
        self.assertEqual(res["status"], "Complete")
        self.assertTrue(res["core_coverage"])
        self.assertNotIn("core_missed", res["secondary_flags"])

    def test_core_window_missed_without_grace(self):
        """Checking in at 11:20 (past 15m grace limit) results in Core Hours Missed."""
        events = [
            {"event_type": "check_in", "timestamp": "2026-10-14T11:20:00Z"},
            {"event_type": "check_out", "timestamp": "2026-10-14T19:50:00Z"} # 8h net
        ]
        res = compute_flexible_day(events, self.policy, "2026-10-14", site_timezone="UTC")
        self.assertEqual(res["status"], "Core Hours Missed")
        self.assertFalse(res["core_coverage"])
        self.assertIn("core_missed", res["secondary_flags"])

    def test_core_window_fully_missed(self):
        """Working completely outside core hours (evening shift) flags core_missed."""
        events = [
            {"event_type": "check_in", "timestamp": "2026-10-14T17:00:00Z"},
            {"event_type": "check_out", "timestamp": "2026-10-15T01:30:00Z"} # 8h net
        ]
        res = compute_flexible_day(events, self.policy, "2026-10-14", site_timezone="UTC")
        self.assertEqual(res["status"], "Core Hours Missed")
        self.assertIn("core_missed", res["secondary_flags"])

    def test_overtime_threshold_boundary(self):
        """Overtime threshold of 30m: +20m is Complete (0 OT); +35m is Overtime (35m OT)."""
        # Case A: +20 mins excess (not past 30m threshold)
        events_a = [
            {"event_type": "check_in", "timestamp": "2026-10-14T09:00:00Z"},
            {"event_type": "check_out", "timestamp": "2026-10-14T17:50:00Z"} # 8h20m net
        ]
        res_a = compute_flexible_day(events_a, self.policy, "2026-10-14", site_timezone="UTC")
        self.assertEqual(res_a["status"], "Complete")
        self.assertEqual(res_a["overtime_minutes"], 0.0)

        # Case B: +35 mins excess (past 30m threshold)
        events_b = [
            {"event_type": "check_in", "timestamp": "2026-10-14T09:00:00Z"},
            {"event_type": "check_out", "timestamp": "2026-10-14T18:05:00Z"} # 8h35m net
        ]
        res_b = compute_flexible_day(events_b, self.policy, "2026-10-14", site_timezone="UTC")
        self.assertEqual(res_b["status"], "Overtime")
        self.assertEqual(res_b["overtime_minutes"], 35.0)

    def test_half_day_threshold(self):
        """Worked time < 4.0h threshold is Half Day; 5.0h is Short Hours."""
        # Case A: 3.5h worked (210 mins < 240 mins)
        events_a = [
            {"event_type": "check_in", "timestamp": "2026-10-14T09:00:00Z"},
            {"event_type": "check_out", "timestamp": "2026-10-14T13:00:00Z"} # 4h gross - 30m = 3.5h
        ]
        res_a = compute_flexible_day(events_a, self.policy, "2026-10-14", site_timezone="UTC")
        self.assertEqual(res_a["status"], "Half Day")
        self.assertEqual(res_a["worked_minutes"], 210.0)
        self.assertEqual(res_a["short_minutes"], 270.0)

        # Case B: 5.5h worked (330 mins >= 240 mins but < 480)
        events_b = [
            {"event_type": "check_in", "timestamp": "2026-10-14T09:00:00Z"},
            {"event_type": "check_out", "timestamp": "2026-10-14T15:00:00Z"} # 6h gross - 30m = 5.5h
        ]
        res_b = compute_flexible_day(events_b, self.policy, "2026-10-14", site_timezone="UTC")
        self.assertEqual(res_b["status"], "Short Hours")
        self.assertEqual(res_b["short_minutes"], 150.0)

    def test_open_session_today_vs_past_day(self):
        """Open session today is In Progress with live time; past day is Missing Check-out (0h)."""
        events = [{"event_type": "check_in", "timestamp": "2026-10-14T09:00:00Z"}]

        # Case A: Evaluated on the same day at 15:00
        now_today = datetime.datetime(2026, 10, 14, 15, 0, 0, tzinfo=datetime.timezone.utc)
        res_today = compute_flexible_day(events, self.policy, "2026-10-14", site_timezone="UTC", now_dt=now_today)
        self.assertEqual(res_today["status"], "In Progress")
        # 6 hours gross minus 30m break = 5.5h (330 mins)
        self.assertEqual(res_today["worked_minutes"], 330.0)
        self.assertIsNotNone(res_today["earliest_leave_time"])

        # Case B: Evaluated on a past day
        now_later = datetime.datetime(2026, 10, 20, 10, 0, 0, tzinfo=datetime.timezone.utc)
        res_past = compute_flexible_day(events, self.policy, "2026-10-14", site_timezone="UTC", now_dt=now_later)
        self.assertEqual(res_past["status"], "Missing Check-out")
        self.assertEqual(res_past["worked_minutes"], 0.0)
        self.assertEqual(res_past["short_minutes"], 480.0)
        self.assertIn("missing_checkout", res_past["secondary_flags"])

    def test_midnight_crossing_shift(self):
        """Shift starting at 22:00 and ending at 06:30 is attributed to start date."""
        midnight_policy = dict(self.policy)
        midnight_policy["core_hours_enforced"] = False
        events = [
            {"event_type": "check_in", "timestamp": "2026-10-13T22:00:00Z"},
            {"event_type": "check_out", "timestamp": "2026-10-14T06:30:00Z"}
        ]
        # Attributed to Tuesday 2026-10-13 (regular weekday)
        res = compute_flexible_day(events, midnight_policy, "2026-10-13", site_timezone="UTC")
        self.assertEqual(res["status"], "Complete")
        # 8.5h gross - 30m = 8h (480 mins)
        self.assertEqual(res["worked_minutes"], 480.0)

    def test_weekly_deficit_made_up_later(self):
        """A deficit on Day 1 (6h) made up on Day 2 (10h) keeps weekly balance on track."""
        day1_summary = {"date": "2026-10-12", "worked_minutes": 360.0, "required_minutes": 480.0, "status": "Short Hours"}
        day2_summary = {"date": "2026-10-13", "worked_minutes": 600.0, "required_minutes": 480.0, "status": "Overtime"}

        week_calc = compute_flexible_week([day1_summary, day2_summary], self.policy, week_start_date="2026-10-12")
        self.assertEqual(week_calc["week_worked_hours"], 16.0)
        self.assertEqual(week_calc["weekly_balance_hours"], 0.0)
        self.assertTrue(week_calc["is_on_track"])
        self.assertEqual(week_calc["message"], "Week on track")

    def test_weekly_off_day_work(self):
        """Work on weekly off (Saturday 2026-10-17) counts 100% as overtime."""
        # 4 hours on Saturday
        events = [
            {"event_type": "check_in", "timestamp": "2026-10-17T10:00:00Z"},
            {"event_type": "check_out", "timestamp": "2026-10-17T14:30:00Z"} # 4.5h - 30m = 4h
        ]
        res = compute_flexible_day(events, self.policy, "2026-10-17", site_timezone="UTC")
        self.assertEqual(res["status"], "Overtime")
        self.assertEqual(res["required_minutes"], 0.0)
        self.assertEqual(res["overtime_minutes"], 240.0)

        # No work on Sunday -> status Weekly Off
        res_empty = compute_flexible_day([], self.policy, "2026-10-18", site_timezone="UTC")
        self.assertEqual(res_empty["status"], "Weekly Off")
        self.assertEqual(res_empty["worked_minutes"], 0.0)

    def test_flagged_event_pending_vs_rejected(self):
        """Policy count_pending includes pending event; rejected events are excluded."""
        # Pending review
        events_pending = [
            {"event_type": "check_in", "timestamp": "2026-10-14T09:00:00Z", "flagged": 1, "status": "flagged"},
            {"event_type": "check_out", "timestamp": "2026-10-14T17:30:00Z"}
        ]
        res_pending = compute_flexible_day(events_pending, self.policy, "2026-10-14", site_timezone="UTC")
        self.assertEqual(res_pending["worked_minutes"], 480.0)
        self.assertIn("flagged_event_pending", res_pending["secondary_flags"])

        # Rejected review
        events_rejected = [
            {"event_type": "check_in", "timestamp": "2026-10-14T09:00:00Z", "flagged": 1, "review_note": "REJECTED", "status": "flagged"},
            {"event_type": "check_out", "timestamp": "2026-10-14T17:30:00Z"}
        ]
        res_rejected = compute_flexible_day(events_rejected, self.policy, "2026-10-14", site_timezone="UTC")
        self.assertEqual(res_rejected["worked_minutes"], 0.0)
        self.assertIn("flagged_event_rejected", res_rejected["secondary_flags"])

    def test_approved_leave_reduction(self):
        """Approved leave reduces daily required minutes cleanly."""
        leave = {"hours_reduced": 4.0}
        events = [
            {"event_type": "check_in", "timestamp": "2026-10-14T11:00:00Z"},
            {"event_type": "check_out", "timestamp": "2026-10-14T15:30:00Z"} # 4h net
        ]
        res = compute_flexible_day(events, self.policy, "2026-10-14", site_timezone="UTC", approved_leave=leave)
        self.assertEqual(res["required_minutes"], 240.0)
        self.assertEqual(res["status"], "Complete")
        self.assertIn("leave_applied", res["secondary_flags"])

    def test_dst_transition_day(self):
        """DST transition in Europe/London computes duration safely via UTC timestamps."""
        # On 2026-10-25 (autumn fallback), UTC difference accurately computes 8h
        events = [
            {"event_type": "check_in", "timestamp": "2026-10-25T01:00:00Z"},
            {"event_type": "check_out", "timestamp": "2026-10-25T09:30:00Z"}
        ]
        res = compute_flexible_day(events, self.policy, "2026-10-25", site_timezone="Europe/London")
        self.assertEqual(res["worked_minutes"], 480.0)

    def test_shift_policy_validation(self):
        """Server-side validation ensures core window and hour constraints are met."""
        # Valid policy
        valid_p = {"core_start": "11:00", "core_end": "16:00", "required_daily_hours": 8.0, "allowed_window_start": "08:00", "allowed_window_end": "20:00"}
        is_val, err = validate_flexible_shift_policy(valid_p)
        self.assertTrue(is_val)

        # Invalid: core_end earlier than core_start
        rev_p = {"core_start": "16:00", "core_end": "11:00", "required_daily_hours": 8.0}
        is_val, err = validate_flexible_shift_policy(rev_p)
        self.assertFalse(is_val)
        self.assertIn("Core end time must be after", err)

        # Invalid: core window outside allowed window
        out_p = {"core_start": "07:00", "core_end": "16:00", "allowed_window_start": "08:00", "required_daily_hours": 8.0}
        is_val, err = validate_flexible_shift_policy(out_p)
        self.assertFalse(is_val)
        self.assertIn("Allowed earliest check-in", err)


class TestFlexibleShiftRoutes(unittest.TestCase):
    def setUp(self):
        from app import app
        self.app = app
        self.app.config["TESTING"] = True
        self.app.config["WTF_CSRF_ENABLED"] = False
        self.client = self.app.test_client()

    def test_employee_cannot_modify_shifts(self):
        """Employees have no edit access to shifts."""
        with self.client.session_transaction() as sess:
            sess["employee_id"] = 2
            sess["role"] = "employee"

        # Attempting POST to create or edit shift must be denied (redirect to login or 403)
        res = self.client.post("/admin/shifts", data={"name": "Hacked Shift"})
        self.assertIn(res.status_code, (302, 403))

    def test_manager_sees_only_own_team(self):
        """Managers are strictly scoped to their team."""
        with self.client.session_transaction() as sess:
            sess["manager_id"] = 1
            sess["employee_id"] = 1
            sess["role"] = "manager"

        # Manager accessing an out-of-scope employee returns 403
        res = self.client.get("/manager/attendance-records?employee_id=999999")
        self.assertEqual(res.status_code, 403)


if __name__ == "__main__":
    unittest.main()
