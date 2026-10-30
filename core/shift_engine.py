"""
core/shift_engine.py - Industrial Shift Scheduling & Punctuality Engine
Matches check-in and check-out events against shift schedules to automatically
compute: on-time, late, early leave, overtime, absent, and hours worked.
"""

import datetime
from typing import Dict, Any, Optional, Tuple

def parse_time_str(time_str: str) -> datetime.time:
    """Parses 'HH:MM' or 'HH:MM:SS' string into a datetime.time object."""
    if not time_str:
        return datetime.time(9, 0)
    parts = time_str.strip().split(":")
    hour = int(parts[0])
    minute = int(parts[1]) if len(parts) > 1 else 0
    second = int(parts[2]) if len(parts) > 2 else 0
    return datetime.time(hour, minute, second)

def parse_iso_datetime(dt_val) -> Optional[datetime.datetime]:
    """Parses ISO string or returns datetime object."""
    if dt_val is None:
        return None
    if isinstance(dt_val, datetime.datetime):
        return dt_val
    try:
        clean_str = str(dt_val).replace("Z", "+00:00")
        return datetime.datetime.fromisoformat(clean_str)
    except Exception:
        return None

from config import get_app_timezone
from core.db import get_effective_work_policy

def normalize_datetimes_to_naive(dt1: datetime.datetime, dt2: Optional[datetime.datetime] = None):
    """Normalizes one or two datetimes to comparable naive datetimes in the application timezone."""
    app_tz = get_app_timezone()
    if dt1.tzinfo is not None:
        dt1 = dt1.astimezone(app_tz).replace(tzinfo=None)
    if dt2 is not None:
        if dt2.tzinfo is not None:
            dt2 = dt2.astimezone(app_tz).replace(tzinfo=None)
        return dt1, dt2
    return dt1

def evaluate_check_in(
    check_in_dt: Any,
    shift: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Evaluates a check-in event against the assigned shift schedule.
    
    Shift dict should contain:
        - start_time: 'HH:MM' (e.g. '09:00')
        - end_time: 'HH:MM' (e.g. '18:00')
        - grace_period_minutes: int (e.g. 15)
        
    Returns:
        {
            "status": "on_time" | "late",
            "minutes_late": float,
            "scheduled_start": str,
            "grace_limit": str,
            "flagged": bool,
            "flag_reason": Optional[str],
            "message": str
        }
    """
    dt = parse_iso_datetime(check_in_dt)
    if dt is None:
        return {
            "status": "unknown",
            "minutes_late": 0.0,
            "scheduled_start": "09:00",
            "grace_limit": "09:15",
            "flagged": False,
            "flag_reason": None,
            "message": "Invalid check-in timestamp"
        }

    dt = normalize_datetimes_to_naive(dt)

    start_t = parse_time_str(shift.get("start_time", "09:00"))
    grace_mins = int(shift.get("grace_period_minutes", 15))

    scheduled_start = datetime.datetime.combine(dt.date(), start_t)
    grace_limit = scheduled_start + datetime.timedelta(minutes=grace_mins)

    if dt <= grace_limit:
        mins_early = max(0.0, (scheduled_start - dt).total_seconds() / 60.0)
        return {
            "status": "on_time",
            "minutes_late": 0.0,
            "scheduled_start": scheduled_start.strftime("%I:%M %p"),
            "grace_limit": grace_limit.strftime("%I:%M %p"),
            "flagged": False,
            "flag_reason": None,
            "message": f"Checked in on time (within {grace_mins}m grace period)"
        }
    else:
        minutes_late = round((dt - scheduled_start).total_seconds() / 60.0, 1)
        reason = f"Late check-in: {minutes_late} minutes past scheduled start ({scheduled_start.strftime('%I:%M %p')})"
        return {
            "status": "late",
            "minutes_late": minutes_late,
            "scheduled_start": scheduled_start.strftime("%I:%M %p"),
            "grace_limit": grace_limit.strftime("%I:%M %p"),
            "flagged": False,  # Late is a punctuality status, not necessarily a security flag
            "flag_reason": reason,
            "message": f"Late check-in by {int(minutes_late)} minutes"
        }

def evaluate_check_out(
    check_out_dt: Any,
    shift: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Evaluates a check-out event against the assigned shift schedule.
    
    Returns:
        {
            "status": "on_time" | "early_leave" | "overtime",
            "minutes_early": float,
            "minutes_overtime": float,
            "scheduled_end": str,
            "flagged": bool,
            "flag_reason": Optional[str],
            "message": str
        }
    """
    dt = parse_iso_datetime(check_out_dt)
    if dt is None:
        return {
            "status": "unknown",
            "minutes_early": 0.0,
            "minutes_overtime": 0.0,
            "scheduled_end": "18:00",
            "flagged": False,
            "flag_reason": None,
            "message": "Invalid check-out timestamp"
        }

    dt = normalize_datetimes_to_naive(dt)

    end_t = parse_time_str(shift.get("end_time", "18:00"))
    scheduled_end = datetime.datetime.combine(dt.date(), end_t)

    # Shift crosses midnight? (e.g. 22:00 to 06:00)
    start_t = parse_time_str(shift.get("start_time", "09:00"))
    if end_t < start_t:
        # Scheduled end is on the next day
        scheduled_end += datetime.timedelta(days=1)

    if dt < scheduled_end:
        minutes_early = round((scheduled_end - dt).total_seconds() / 60.0, 1)
        # Tolerance of 5 minutes before shift end is considered acceptable
        if minutes_early > 5.0:
            return {
                "status": "early_leave",
                "minutes_early": minutes_early,
                "minutes_overtime": 0.0,
                "scheduled_end": scheduled_end.strftime("%I:%M %p"),
                "flagged": False,
                "flag_reason": f"Early leave: {int(minutes_early)}m before scheduled end ({scheduled_end.strftime('%I:%M %p')})",
                "message": f"Early departure by {int(minutes_early)} minutes"
            }
        else:
            return {
                "status": "on_time",
                "minutes_early": 0.0,
                "minutes_overtime": 0.0,
                "scheduled_end": scheduled_end.strftime("%I:%M %p"),
                "flagged": False,
                "flag_reason": None,
                "message": "Checked out at scheduled shift end"
            }
    else:
        minutes_overtime = round((dt - scheduled_end).total_seconds() / 60.0, 1)
        status = "overtime" if minutes_overtime >= 15.0 else "on_time"
        return {
            "status": status,
            "minutes_early": 0.0,
            "minutes_overtime": minutes_overtime,
            "scheduled_end": scheduled_end.strftime("%I:%M %p"),
            "flagged": False,
            "flag_reason": None,
            "message": f"Shift completed ({int(minutes_overtime)}m extra logged)" if minutes_overtime >= 15.0 else "Shift completed on time"
        }

def calculate_shift_hours(
    check_in_dt: Any,
    check_out_dt: Any,
    shift: Dict[str, Any],
    allow_in_progress: bool = False
) -> Dict[str, Any]:
    """
    Computes regular hours, overtime hours, net duration, and overall daily status.
    
    Edge cases handled:
        - In-progress shift: When allow_in_progress=True and check_out is None, calculates elapsed hours and retains check-in punctuality
        - Missing check-out: status='missing_checkout', hours=0
        - Check-out earlier than check-in: status='invalid_sequence', flagged=True
        - Break duration deduction: Deducted only if gross duration >= break duration
        - Overtime calculation: Worked time exceeding scheduled shift duration
    """
    in_dt = parse_iso_datetime(check_in_dt)
    out_dt = parse_iso_datetime(check_out_dt)

    if in_dt is None and out_dt is None:
        return {
            "status": "absent",
            "gross_hours": 0.0,
            "net_hours": 0.0,
            "regular_hours": 0.0,
            "overtime_hours": 0.0,
            "flagged": False,
            "flag_reason": "No check-in or check-out recorded for the day"
        }

    if in_dt is not None and out_dt is None:
        in_eval = evaluate_check_in(in_dt, shift)
        if allow_in_progress:
            in_naive = normalize_datetimes_to_naive(in_dt)
            now_dt = datetime.datetime.now()
            elapsed_sec = max(0.0, (now_dt - in_naive).total_seconds())
            elapsed_hours = round(elapsed_sec / 3600.0, 1)
            elapsed_hours = min(elapsed_hours, 12.0)
            return {
                "status": in_eval["status"],
                "shift_state": "in_progress",
                "gross_hours": elapsed_hours,
                "net_hours": elapsed_hours,
                "regular_hours": elapsed_hours,
                "overtime_hours": 0.0,
                "check_in_status": in_eval["status"],
                "flagged": False,
                "flag_reason": None,
                "is_active_shift": True
            }
        return {
            "status": "missing_checkout",
            "gross_hours": 0.0,
            "net_hours": 0.0,
            "regular_hours": 0.0,
            "overtime_hours": 0.0,
            "check_in_status": in_eval["status"],
            "flagged": True,
            "flag_reason": "Incomplete attendance: Checked in but check-out timestamp is missing",
            "is_active_shift": False
        }

    if in_dt is None and out_dt is not None:
        return {
            "status": "missing_checkin",
            "gross_hours": 0.0,
            "net_hours": 0.0,
            "regular_hours": 0.0,
            "overtime_hours": 0.0,
            "flagged": True,
            "flag_reason": "Incomplete attendance: Check-out recorded without matching check-in"
        }

    # Normalize both
    in_dt, out_dt = normalize_datetimes_to_naive(in_dt, out_dt)

    # Edge Case: check_out before check_in
    if out_dt < in_dt:
        return {
            "status": "invalid_sequence",
            "gross_hours": 0.0,
            "net_hours": 0.0,
            "regular_hours": 0.0,
            "overtime_hours": 0.0,
            "flagged": True,
            "flag_reason": f"Corrupted sequence: check_out ({out_dt.strftime('%H:%M')}) is earlier than check_in ({in_dt.strftime('%H:%M')})"
        }

    # Gross duration in hours
    gross_seconds = (out_dt - in_dt).total_seconds()
    gross_hours = round(gross_seconds / 3600.0, 2)

    # Break duration in hours
    break_mins = int(shift.get("break_duration_minutes", 60))
    break_hours = round(break_mins / 60.0, 2)

    # Only deduct break if shift was long enough (>= 4 hours)
    if gross_hours >= 4.0:
        net_hours = max(0.0, round(gross_hours - break_hours, 2))
    else:
        net_hours = gross_hours

    # Scheduled shift duration
    start_t = parse_time_str(shift.get("start_time", "09:00"))
    end_t = parse_time_str(shift.get("end_time", "18:00"))
    ref_date = in_dt.date()
    sch_start = datetime.datetime.combine(ref_date, start_t)
    sch_end = datetime.datetime.combine(ref_date, end_t)
    if sch_end < sch_start:
        sch_end += datetime.timedelta(days=1)
        
    sch_gross_hours = (sch_end - sch_start).total_seconds() / 3600.0
    sch_regular_hours = max(0.0, round(sch_gross_hours - (break_hours if sch_gross_hours >= 4.0 else 0.0), 2))

    # Overtime & Regular split
    if net_hours > sch_regular_hours:
        regular_hours = sch_regular_hours
        overtime_hours = round(net_hours - sch_regular_hours, 2)
    else:
        regular_hours = net_hours
        overtime_hours = 0.0

    in_eval = evaluate_check_in(in_dt, shift)
    out_eval = evaluate_check_out(out_dt, shift)

    # Synthesize daily status:
    # Priority: flagged -> overtime -> late -> early_leave -> on_time
    if overtime_hours > 0.0:
        daily_status = "overtime"
    elif in_eval["status"] == "late":
        daily_status = "late"
    elif out_eval["status"] == "early_leave":
        daily_status = "early_leave"
    else:
        daily_status = "on_time"

    flagged = in_eval["flagged"] or out_eval["flagged"]
    flag_reasons = [r for r in [in_eval.get("flag_reason"), out_eval.get("flag_reason")] if r]

    return {
        "status": daily_status,
        "check_in_status": in_eval["status"],
        "check_out_status": out_eval["status"],
        "gross_hours": gross_hours,
        "net_hours": net_hours,
        "regular_hours": regular_hours,
        "overtime_hours": overtime_hours,
        "scheduled_regular_hours": sch_regular_hours,
        "minutes_late": in_eval["minutes_late"],
        "minutes_early": out_eval["minutes_early"],
        "flagged": flagged,
        "flag_reason": "; ".join(flag_reasons) if flag_reasons else None
    }

# ==============================================================================
# Flexible Hours Shift Policy Engine (Core Hours + Required Hours)
# ==============================================================================
"""
STATUS PRECEDENCE HIERARCHY (Flexible Hours Shift Policy):
1. Holiday / Weekly Off:
   - If non-working day and worked_minutes == 0: 'Holiday' or 'Weekly Off'.
   - If work occurred on a weekly off or holiday: all hours are overtime -> 'Overtime'.
2. Missing Check-out:
   - Past day with an unclosed check-in session -> 'Missing Check-out' (contributes 0 hours).
3. In Progress:
   - Today with an open check-in session -> 'In Progress' (live elapsed time counted).
4. Absent:
   - Scheduled working day with 0 worked minutes and no sessions -> 'Absent'.
5. Half Day:
   - Closed sessions where worked_minutes < half_day_threshold_hours * 60.
6. Short Hours:
   - Closed sessions where worked_minutes < required_daily_hours * 60.
   - Note: 'core_missed' secondary flag co-exists if core window was also missed.
7. Core Hours Missed:
   - Required hours met (worked_minutes >= required_daily_hours * 60) without exceeding
     overtime threshold, but core hours window was not covered within grace tolerance.
8. Overtime:
   - Required hours met and exceeded by more than overtime_threshold_minutes.
9. Complete:
   - Required hours met, core hours window covered within grace, within overtime threshold.

SECONDARY FLAGS:
- 'core_missed': Raised whenever core_hours_enforced=True and core window was not covered within grace.
- 'flagged_event_pending': Raised when an attendance event is flagged and pending admin review.
- 'flagged_event_excluded': Raised when a flagged event was excluded from worked hours by policy.
- 'flagged_event_rejected': Raised when an attendance event was rejected by an admin.
- 'outside_allowed_window': Raised when an event occurred outside allowed_window_start/end.
- 'missing_checkout': Raised on past day open session.
- 'leave_applied': Raised when an approved leave reduced required hours.
- 'correction_applied': Raised when an approved correction request modified attendance.
"""

import json
from typing import List, Union

try:
    import zoneinfo
except ImportError:
    from backports import zoneinfo

def resolve_site_tz(tz_input) -> datetime.tzinfo:
    """Resolves a timezone input (string, ZoneInfo, or None) to a tzinfo object."""
    if tz_input is None:
        return get_app_timezone()
    if isinstance(tz_input, datetime.tzinfo):
        return tz_input
    if isinstance(tz_input, str):
        try:
            return zoneinfo.ZoneInfo(tz_input)
        except Exception:
            return get_app_timezone()
    return get_app_timezone()

def validate_flexible_shift_policy(policy: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Server-side validation for flexible shifts:
    - Core window inside allowed window if one is set
    - core_end after core_start
    - Required hours between sensible bounds (0.5 to 24.0)
    - Core window length must not exceed required hours unreasonably
    """
    shift_type = policy.get("shift_type", "fixed")
    if shift_type == "fixed" and not policy.get("core_start") and not policy.get("required_daily_hours"):
        return True, None

    req_daily = policy.get("required_daily_hours")
    if req_daily is not None:
        try:
            req_daily = float(req_daily)
            if req_daily <= 0.0 or req_daily > 24.0:
                return False, "Required daily hours must be between 0.5 and 24.0 hours."
        except (ValueError, TypeError):
            return False, "Invalid required daily hours."

    req_weekly = policy.get("required_weekly_hours")
    if req_weekly not in (None, "", "None"):
        try:
            req_weekly = float(req_weekly)
            if req_weekly <= 0.0 or req_weekly > 168.0:
                return False, "Required weekly hours must be between 1.0 and 168.0 hours."
            if req_daily and req_weekly < req_daily:
                return False, "Required weekly hours cannot be less than daily required hours."
        except (ValueError, TypeError):
            return False, "Invalid required weekly hours."

    core_enforced = bool(policy.get("core_hours_enforced", 1))
    core_start_str = policy.get("core_start")
    core_end_str = policy.get("core_end")

    if core_enforced:
        if not core_start_str or not core_end_str:
            return False, "Core start and core end times are required when core hours are enforced."

    if core_start_str and core_end_str:
        core_s = parse_time_str(core_start_str)
        core_e = parse_time_str(core_end_str)
        if core_e <= core_s:
            return False, "Core end time must be after core start time."

        core_duration_hours = ((core_e.hour * 60 + core_e.minute) - (core_s.hour * 60 + core_s.minute)) / 60.0
        if req_daily and core_duration_hours > (req_daily + 4.0):
            return False, f"Core window length ({core_duration_hours:.1f}h) unreasonably exceeds required daily hours ({req_daily:.1f}h)."

    allow_start_str = policy.get("allowed_window_start")
    allow_end_str = policy.get("allowed_window_end")

    if allow_start_str and allow_end_str:
        allow_s = parse_time_str(allow_start_str)
        allow_e = parse_time_str(allow_end_str)
        if allow_e <= allow_s:
            return False, "Allowed window end time must be after allowed window start time."

    if allow_start_str and core_start_str:
        allow_s = parse_time_str(allow_start_str)
        core_s = parse_time_str(core_start_str)
        if core_s < allow_s:
            return False, "Allowed earliest check-in cannot be later than core window start time."

    if allow_end_str and core_end_str:
        allow_e = parse_time_str(allow_end_str)
        core_e = parse_time_str(core_end_str)
        if core_e > allow_e:
            return False, "Allowed latest check-out cannot be earlier than core window end time."

    return True, None

def _localize_event_time(dt_val, site_tz: datetime.tzinfo) -> Tuple[datetime.datetime, datetime.datetime]:
    """
    Parses datetime value and returns (dt_localized_to_site_tz, dt_utc).
    Ensures safe, daylight-saving-resilient comparisons.
    """
    if dt_val is None:
        raise ValueError("Cannot localize None datetime")
    if isinstance(dt_val, datetime.datetime):
        dt = dt_val
    else:
        clean_str = str(dt_val).replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(clean_str)

    if dt.tzinfo is None:
        # Assume stored naive timestamp was UTC
        dt_utc = dt.replace(tzinfo=datetime.timezone.utc)
    else:
        dt_utc = dt.astimezone(datetime.timezone.utc)

    dt_site = dt_utc.astimezone(site_tz)
    return dt_site, dt_utc

def compute_flexible_day(
    events: List[Dict[str, Any]],
    shift_policy: Dict[str, Any],
    date: Union[datetime.date, str],
    site_timezone: Any = None,
    now_dt: Optional[datetime.datetime] = None,
    holidays: Optional[Union[List[str], Dict[str, Any], set]] = None,
    approved_leave: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Pure, easily testable calculation of a flexible hours shift day.
    Evaluates:
      - Worked minutes across multiple paired sessions (minus break)
      - Core window coverage within grace tolerance
      - Required minutes, short minutes deficit, overtime
      - Open sessions (In Progress today vs Missing Check-out past day)
      - Work on weekly off / holidays treated as overtime
      - Allowed window bounds
      - Status and secondary flags list
    """
    site_tz = resolve_site_tz(site_timezone)
    
    if isinstance(date, str):
        target_date = datetime.date.fromisoformat(date[:10])
    elif isinstance(date, datetime.date):
        target_date = date
    else:
        raise ValueError("Invalid date format")

    if now_dt is None:
        now_dt = datetime.datetime.now(site_tz)
    else:
        if now_dt.tzinfo is None:
            now_dt = now_dt.replace(tzinfo=site_tz)
        else:
            now_dt = now_dt.astimezone(site_tz)

    is_today = (target_date == now_dt.date())

    # 1. Parse and sort all events chronologically in UTC
    parsed_events = []
    for ev in events:
        ts = ev.get("timestamp")
        if not ts:
            continue
        try:
            dt_site, dt_utc = _localize_event_time(ts, site_tz)
            parsed_events.append({
                "raw": ev,
                "event_type": ev.get("event_type", "check_in"),
                "dt_site": dt_site,
                "dt_utc": dt_utc,
                "flagged": bool(ev.get("flagged")),
                "status": ev.get("status"),
                "reviewed_by": ev.get("reviewed_by") or ev.get("reviewed_by_admin_id"),
                "review_note": ev.get("review_note")
            })
        except Exception:
            continue

    parsed_events.sort(key=lambda x: x["dt_utc"])

    # 2. Debounce / Deduplicate sub-minute events
    clean_events = []
    for pe in parsed_events:
        if not clean_events:
            clean_events.append(pe)
            continue
        prev = clean_events[-1]
        diff_sec = abs((pe["dt_utc"] - prev["dt_utc"]).total_seconds())
        # Ignore duplicate or sub-minute events of same type or within 60s
        if diff_sec < 60.0 and pe["event_type"] == prev["event_type"]:
            continue
        clean_events.append(pe)

    # 3. Pair into sessions and attribute midnight-crossing shifts to session start date
    sessions = []
    i = 0
    secondary_flags = []
    has_flagged_pending = False
    has_flagged_rejected = False
    has_flagged_excluded = False

    flag_policy = shift_policy.get("count_flagged_events_policy", "count_pending")

    while i < len(clean_events):
        ev = clean_events[i]
        if ev["event_type"] == "check_in":
            # Check if matching check_out exists later
            out_ev = None
            j = i + 1
            while j < len(clean_events):
                if clean_events[j]["event_type"] == "check_out":
                    out_ev = clean_events[j]
                    break
                j += 1

            session_start_site = ev["dt_site"]
            if session_start_site.date() == target_date:
                # This session belongs to target_date (even if out_ev is past midnight!)
                sessions.append({
                    "in_ev": ev,
                    "out_ev": out_ev,
                    "start_site": session_start_site,
                    "end_site": out_ev["dt_site"] if out_ev else None,
                    "start_utc": ev["dt_utc"],
                    "end_utc": out_ev["dt_utc"] if out_ev else None,
                    "is_open": (out_ev is None)
                })
            i = (j + 1) if out_ev else (i + 1)
        else:
            i += 1

    # 4. Allowed Window Verification
    allow_start_str = shift_policy.get("allowed_window_start")
    allow_end_str = shift_policy.get("allowed_window_end")
    if allow_start_str or allow_end_str:
        allow_s = parse_time_str(allow_start_str) if allow_start_str else None
        allow_e = parse_time_str(allow_end_str) if allow_end_str else None

        for s in sessions:
            in_t = s["start_site"].time()
            if allow_s and in_t < allow_s:
                if "outside_allowed_window" not in secondary_flags:
                    secondary_flags.append("outside_allowed_window")
            if s["end_site"] and allow_e:
                out_t = s["end_site"].time()
                # If checkout is same day and past allowed end
                if s["end_site"].date() == target_date and out_t > allow_e:
                    if "outside_allowed_window" not in secondary_flags:
                        secondary_flags.append("outside_allowed_window")

    # 5. Calculate gross worked minutes per session
    total_gross_minutes = 0.0
    has_open_session = False
    has_open_past_session = False
    first_check_in = None
    last_check_out = None

    for s in sessions:
        if first_check_in is None:
            first_check_in = s["start_site"].isoformat()

        # Check flagging on session events
        is_session_flagged = s["in_ev"]["flagged"] or (s["out_ev"]["flagged"] if s["out_ev"] else False)
        # Check if rejected by admin
        is_rejected = False
        for target_ev in [s["in_ev"], s["out_ev"]]:
            if target_ev and target_ev.get("review_note") and "reject" in str(target_ev.get("review_note")).lower():
                is_rejected = True
                has_flagged_rejected = True

        if is_session_flagged:
            if is_rejected:
                if "flagged_event_rejected" not in secondary_flags:
                    secondary_flags.append("flagged_event_rejected")
                continue # Skip rejected session entirely
            
            if flag_policy == "exclude_until_approved" and not s["in_ev"].get("reviewed_by"):
                has_flagged_excluded = True
                if "flagged_event_excluded" not in secondary_flags:
                    secondary_flags.append("flagged_event_excluded")
                continue # Exclude from worked minutes until approved
            else:
                has_flagged_pending = True
                if "flagged_event_pending" not in secondary_flags:
                    secondary_flags.append("flagged_event_pending")

        if s["is_open"]:
            has_open_session = True
            if is_today:
                # Live elapsed time for today's active session
                now_utc = now_dt.astimezone(datetime.timezone.utc)
                elapsed_sec = max(0.0, (now_utc - s["start_utc"]).total_seconds())
                s["gross_minutes"] = elapsed_sec / 60.0
                total_gross_minutes += s["gross_minutes"]
            else:
                has_open_past_session = True
                s["gross_minutes"] = 0.0
        else:
            last_check_out = s["end_site"].isoformat()
            duration_sec = max(0.0, (s["end_utc"] - s["start_utc"]).total_seconds())
            s["gross_minutes"] = duration_sec / 60.0
            total_gross_minutes += s["gross_minutes"]

    # Deduct unpaid break minutes (only if there was gross worked time)
    unpaid_break_mins = float(shift_policy.get("unpaid_break_minutes", 0) or 0)
    if total_gross_minutes > 0.0 and total_gross_minutes >= unpaid_break_mins:
        worked_minutes = max(0.0, round(total_gross_minutes - unpaid_break_mins, 1))
    else:
        worked_minutes = max(0.0, round(total_gross_minutes, 1))

    # 6. Core hours evaluation
    core_enforced = bool(shift_policy.get("core_hours_enforced", 1))
    core_start_str = shift_policy.get("core_start")
    core_end_str = shift_policy.get("core_end")
    core_grace_mins = float(shift_policy.get("core_grace_minutes", 15) or 0)

    core_minutes_present = 0.0
    core_coverage = True

    if core_enforced and core_start_str and core_end_str:
        core_s_t = parse_time_str(core_start_str)
        core_e_t = parse_time_str(core_end_str)
        core_start_dt = datetime.datetime.combine(target_date, core_s_t, tzinfo=site_tz)
        core_end_dt = datetime.datetime.combine(target_date, core_e_t, tzinfo=site_tz)
        core_window_minutes = (core_end_dt - core_start_dt).total_seconds() / 60.0

        core_start_grace = core_start_dt + datetime.timedelta(minutes=core_grace_mins)
        core_end_grace = core_end_dt - datetime.timedelta(minutes=core_grace_mins)

        # Calculate presence inside the core window across all sessions
        has_covered_start = False
        has_covered_end = False

        for s in sessions:
            s_start = s["start_site"]
            s_end = s["end_site"] if s["end_site"] else (now_dt if is_today else s_start)

            if s_start <= core_start_grace and s_end >= core_start_dt:
                has_covered_start = True
            if s_end >= core_end_grace and s_start <= core_end_dt:
                has_covered_end = True

            # Overlap with core window
            overlap_start = max(s_start, core_start_dt)
            overlap_end = min(s_end, core_end_dt)
            if overlap_end > overlap_start:
                core_minutes_present += (overlap_end - overlap_start).total_seconds() / 60.0

        core_minutes_present = round(core_minutes_present, 1)
        min_required_core_mins = max(0.0, core_window_minutes - (2 * core_grace_mins))

        if not sessions:
            core_coverage = False
        elif has_covered_start and has_covered_end and (core_minutes_present >= min_required_core_mins):
            core_coverage = True
        else:
            core_coverage = False

        if not core_coverage and (sessions or not is_today):
            if "core_missed" not in secondary_flags:
                secondary_flags.append("core_missed")
    else:
        core_coverage = True
        core_minutes_present = 0.0

    # 7. Check for Weekly Off / Holiday
    weekly_off_str = shift_policy.get("weekly_off_days", "Sat,Sun") or "Sat,Sun"
    off_days = [d.strip().lower() for d in weekly_off_str.split(",") if d.strip()]
    day_short = target_date.strftime("%a").lower()
    day_long = target_date.strftime("%A").lower()
    is_weekly_off = (day_short in off_days or day_long in off_days)

    is_holiday = False
    if holidays:
        date_iso = target_date.isoformat()
        if date_iso in holidays or target_date in holidays:
            is_holiday = True

    # 8. Required hours & Status Precedence Logic
    required_daily_h = float(shift_policy.get("required_daily_hours", 8.0) or 8.0)
    required_minutes = round(required_daily_h * 60.0, 1)

    if approved_leave:
        reduced_h = float(approved_leave.get("hours_reduced", 0.0) or 0.0)
        required_minutes = max(0.0, round(required_minutes - (reduced_h * 60.0), 1))
        if approved_leave.get("waive_core") or reduced_h > 0:
            core_coverage = True
            if "core_missed" in secondary_flags:
                secondary_flags.remove("core_missed")
        if "leave_applied" not in secondary_flags:
            secondary_flags.append("leave_applied")

    overtime_threshold_mins = float(shift_policy.get("overtime_threshold_minutes", 0) or 0)
    half_day_threshold_h = float(shift_policy.get("half_day_threshold_hours", 4.0) or 4.0)
    half_day_mins = half_day_threshold_h * 60.0

    # Work on weekly off or holiday counts entirely as overtime
    if is_weekly_off or is_holiday:
        required_minutes = 0.0
        short_minutes = 0.0
        if worked_minutes > 0.0:
            status = "Overtime"
            overtime_minutes = worked_minutes
        else:
            status = "Holiday" if is_holiday else "Weekly Off"
            overtime_minutes = 0.0
    elif has_open_past_session:
        # Open session on a past day becomes Missing Check-out and contributes zero hours
        status = "Missing Check-out"
        worked_minutes = 0.0
        short_minutes = required_minutes
        overtime_minutes = 0.0
        if "missing_checkout" not in secondary_flags:
            secondary_flags.append("missing_checkout")
    elif has_open_session and is_today:
        status = "In Progress"
        short_minutes = max(0.0, round(required_minutes - worked_minutes, 1))
        excess = worked_minutes - required_minutes
        overtime_minutes = round(excess, 1) if excess > overtime_threshold_mins else 0.0
    elif worked_minutes == 0.0:
        status = "Absent"
        short_minutes = required_minutes
        overtime_minutes = 0.0
    else:
        # Closed regular working day
        if worked_minutes < half_day_mins:
            status = "Half Day"
            short_minutes = max(0.0, round(required_minutes - worked_minutes, 1))
            overtime_minutes = 0.0
        elif worked_minutes < required_minutes:
            status = "Short Hours"
            short_minutes = max(0.0, round(required_minutes - worked_minutes, 1))
            overtime_minutes = 0.0
        else:
            # required_minutes met
            excess = worked_minutes - required_minutes
            if excess > overtime_threshold_mins:
                status = "Overtime"
                overtime_minutes = round(excess, 1)
                short_minutes = 0.0
            else:
                overtime_minutes = 0.0
                short_minutes = 0.0
                if not core_coverage and core_enforced:
                    status = "Core Hours Missed"
                else:
                    status = "Complete"

    # Earliest leave time calculation if currently clocked in
    earliest_leave_str = None
    if has_open_session and is_today and sessions:
        last_s = sessions[-1]
        if last_s["is_open"]:
            # Minutes completed prior to current session
            prior_gross = sum(s.get("gross_minutes", 0) for s in sessions[:-1])
            needed_total_gross = required_minutes + unpaid_break_mins
            needed_in_current = max(0.0, needed_total_gross - prior_gross)
            leave_dt = last_s["start_site"] + datetime.timedelta(minutes=needed_in_current)
            earliest_leave_str = f"Leave by {leave_dt.strftime('%H:%M')} to complete {required_daily_h:g}h"

    return {
        "date": target_date.isoformat(),
        "worked_minutes": worked_minutes,
        "worked_hours": round(worked_minutes / 60.0, 2),
        "required_minutes": required_minutes,
        "required_hours": round(required_minutes / 60.0, 2),
        "short_minutes": short_minutes,
        "short_hours": round(short_minutes / 60.0, 2),
        "overtime_minutes": overtime_minutes,
        "overtime_hours": round(overtime_minutes / 60.0, 2),
        "core_minutes_present": core_minutes_present,
        "core_coverage": core_coverage,
        "status": status,
        "secondary_flags": secondary_flags,
        "first_check_in": first_check_in,
        "last_check_out": last_check_out,
        "is_today": is_today,
        "has_open_session": has_open_session,
        "earliest_leave_time": earliest_leave_str,
        "sessions_count": len(sessions)
    }

def compute_flexible_week(
    daily_summaries: List[Dict[str, Any]],
    shift_policy: Dict[str, Any],
    week_start_date: Optional[Union[datetime.date, str]] = None,
    site_timezone: Any = None
) -> Dict[str, Any]:
    """
    Computes week-to-date worked vs required hours and weekly balance.
    Allows early deficit to be made up later in the week.
    """
    total_worked_mins = sum(s.get("worked_minutes", 0.0) for s in daily_summaries)
    
    req_weekly_h = shift_policy.get("required_weekly_hours")
    if req_weekly_h not in (None, "", "None"):
        week_required_mins = float(req_weekly_h) * 60.0
    else:
        week_required_mins = sum(s.get("required_minutes", 0.0) for s in daily_summaries)

    # Week to date expected required
    week_to_date_required_mins = sum(s.get("required_minutes", 0.0) for s in daily_summaries)

    weekly_balance_mins = round(total_worked_mins - week_to_date_required_mins, 1)
    remaining_mins = max(0.0, round(week_required_mins - total_worked_mins, 1))

    progress_pct = 0.0
    if week_required_mins > 0:
        progress_pct = min(100.0, round((total_worked_mins / week_required_mins) * 100.0, 1))

    is_on_track = (weekly_balance_mins >= 0.0)

    return {
        "week_worked_minutes": round(total_worked_mins, 1),
        "week_worked_hours": round(total_worked_mins / 60.0, 2),
        "week_required_minutes": round(week_required_mins, 1),
        "week_required_hours": round(week_required_mins / 60.0, 2),
        "weekly_balance_minutes": weekly_balance_mins,
        "weekly_balance_hours": round(weekly_balance_mins / 60.0, 2),
        "remaining_minutes": remaining_mins,
        "remaining_hours": round(remaining_mins / 60.0, 2),
        "is_on_track": is_on_track,
        "progress_percent": progress_pct,
        "message": "Week on track" if is_on_track else f"Deficit: {abs(round(weekly_balance_mins / 60.0, 1))}h"
    }

# ==============================================================================
# Daily Attendance Summary Persistence and Recalculation
# ==============================================================================

def record_daily_summary(employee_id: int, date_str: str, summary: Dict[str, Any], shift: Dict[str, Any], conn=None) -> int:
    """
    Stores computed daily attendance summary into daily_attendance_summary table.
    Snapshots the policy used so future shift modifications do not rewrite history.
    """
    from core.db import get_db_connection
    from config import get_utc_iso

    close_at_end = False
    if conn is None:
        conn = get_db_connection()
        close_at_end = True

    try:
        c = conn.cursor()
        now = get_utc_iso()
        policy_snapshot = json.dumps({
            "shift_id": shift.get("id"),
            "shift_name": shift.get("name"),
            "shift_type": shift.get("shift_type", "fixed"),
            "core_start": shift.get("core_start"),
            "core_end": shift.get("core_end"),
            "required_daily_hours": shift.get("required_daily_hours", 8.0),
            "required_weekly_hours": shift.get("required_weekly_hours"),
            "enforcement_mode": shift.get("enforcement_mode", "daily"),
            "unpaid_break_minutes": shift.get("unpaid_break_minutes", 0),
            "core_hours_enforced": shift.get("core_hours_enforced", 1),
            "core_grace_minutes": shift.get("core_grace_minutes", 15),
            "overtime_threshold_minutes": shift.get("overtime_threshold_minutes", 0),
            "half_day_threshold_hours": shift.get("half_day_threshold_hours", 4.0),
            "weekly_off_days": shift.get("weekly_off_days", "Sat,Sun"),
            "count_flagged_events_policy": shift.get("count_flagged_events_policy", "count_pending"),
            "is_override": shift.get("is_override", False),
            "display_string": shift.get("display_string", "")
        })
        flags_json = json.dumps(summary.get("secondary_flags", []))

        c.execute("""
            INSERT INTO daily_attendance_summary (
                employee_id, date, shift_id, shift_type, policy_snapshot,
                worked_minutes, required_minutes, short_minutes, overtime_minutes,
                status, flags, computed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(employee_id, date) DO UPDATE SET
                shift_id = excluded.shift_id,
                shift_type = excluded.shift_type,
                policy_snapshot = excluded.policy_snapshot,
                worked_minutes = excluded.worked_minutes,
                required_minutes = excluded.required_minutes,
                short_minutes = excluded.short_minutes,
                overtime_minutes = excluded.overtime_minutes,
                status = excluded.status,
                flags = excluded.flags,
                computed_at = excluded.computed_at
        """, (
            employee_id,
            date_str,
            shift.get("id"),
            shift.get("shift_type", "fixed"),
            policy_snapshot,
            summary.get("worked_minutes", 0.0),
            summary.get("required_minutes", 0.0),
            summary.get("short_minutes", 0.0),
            summary.get("overtime_minutes", 0.0),
            summary.get("status", "Absent"),
            flags_json,
            now
        ))
        conn.commit()
        return c.lastrowid
    finally:
        if close_at_end:
            conn.close()

def get_or_compute_daily_summary(
    employee_id: int,
    date_str: str,
    site_timezone: Any = None,
    conn=None,
    force_recompute: bool = False
) -> Dict[str, Any]:
    """
    Lazy calculation / cache retrieval of daily attendance summary.
    If date is past and summary exists, returns stored summary with historical policy snapshot.
    If today, or not yet computed, or force_recompute=True: computes live and stores.
    """
    from core.db import get_db_connection, get_effective_work_policy, resolve_employee_shift, get_site_timezone_str, get_holidays_map
    from config import get_local_now

    close_at_end = False
    if conn is None:
        conn = get_db_connection()
        close_at_end = True

    try:
        c = conn.cursor()
        today_str = get_local_now().date().isoformat()
        is_today = (date_str == today_str)

        if not force_recompute and not is_today:
            c.execute("""
                SELECT * FROM daily_attendance_summary
                WHERE employee_id = ? AND date = ?
            """, (employee_id, date_str))
            row = c.fetchone()
            if row:
                res = dict(row)
                try:
                    res["policy_snapshot"] = json.loads(row["policy_snapshot"]) if row["policy_snapshot"] else {}
                except Exception:
                    res["policy_snapshot"] = {}
                try:
                    res["secondary_flags"] = json.loads(row["flags"]) if row["flags"] else []
                except Exception:
                    res["secondary_flags"] = []
                res["worked_hours"] = round(row["worked_minutes"] / 60.0, 2)
                res["required_hours"] = round(row["required_minutes"] / 60.0, 2)
                res["short_hours"] = round(row["short_minutes"] / 60.0, 2)
                res["overtime_hours"] = round(row["overtime_minutes"] / 60.0, 2)
                return res

        # Recompute from scratch using effective work policy
        shift = get_effective_work_policy(employee_id, date=date_str, conn=conn)

        # Fetch employee site timezone
        c.execute("SELECT site_id FROM employees WHERE id = ?", (employee_id,))
        emp_r = c.fetchone()
        site_id = emp_r["site_id"] if emp_r else None
        site_tz_str = get_site_timezone_str(site_id, conn=conn)
        site_tz = resolve_site_tz(site_timezone or site_tz_str)

        # Fetch events for that day
        # Broad fetch to handle shifts crossing midnight: from 1 day before to 1 day after
        c.execute("""
            SELECT * FROM attendance_events
            WHERE employee_id = ?
            ORDER BY timestamp ASC
        """, (employee_id,))
        raw_events = [dict(r) for r in c.fetchall()]

        # Fetch holidays map
        holidays_map = get_holidays_map(conn=conn)

        if shift.get("shift_type") == "flexible":
            summary = compute_flexible_day(
                events=raw_events,
                shift_policy=shift,
                date=date_str,
                site_timezone=site_tz,
                holidays=holidays_map
            )
        else:
            # Fixed shift calculation adapted into summary structure
            day_events = [e for e in raw_events if e["timestamp"][:10] == date_str]
            ins = [e for e in day_events if e.get("event_type") == "check_in"]
            outs = [e for e in day_events if e.get("event_type") == "check_out"]
            in_ts = ins[0]["timestamp"] if ins else None
            out_ts = outs[-1]["timestamp"] if outs else None

            fixed_calc = calculate_shift_hours(in_ts, out_ts, shift, allow_in_progress=is_today)
            net_h = fixed_calc.get("net_hours", 0.0)
            reg_h = fixed_calc.get("regular_hours", 0.0)
            ot_h = fixed_calc.get("overtime_hours", 0.0)
            status_val = fixed_calc.get("status", "absent")

            sec_flags = []
            if fixed_calc.get("flagged"):
                sec_flags.append("flagged")

            req_daily_mins = (fixed_calc.get("scheduled_regular_hours", 8.0) or 8.0) * 60.0
            summary = {
                "date": date_str,
                "worked_minutes": round(net_h * 60.0, 1),
                "worked_hours": net_h,
                "required_minutes": req_daily_mins,
                "required_hours": round(req_daily_mins / 60.0, 2),
                "short_minutes": max(0.0, req_daily_mins - (net_h * 60.0)) if status_val in ("absent", "early_leave") else 0.0,
                "short_hours": round(max(0.0, req_daily_mins - (net_h * 60.0)) / 60.0, 2),
                "overtime_minutes": round(ot_h * 60.0, 1),
                "overtime_hours": ot_h,
                "core_minutes_present": 0.0,
                "core_coverage": True,
                "status": status_val,
                "secondary_flags": sec_flags,
                "first_check_in": in_ts,
                "last_check_out": out_ts,
                "is_today": is_today,
                "has_open_session": (in_ts is not None and out_ts is None)
            }

        record_daily_summary(employee_id, date_str, summary, shift, conn=conn)
        return summary
    finally:
        if close_at_end:
            conn.close()

def recompute_affected_day(employee_id: int, date_or_timestamp: Any, conn=None) -> Dict[str, Any]:
    """Recomputes and updates the daily attendance summary for the given employee and date."""
    if not date_or_timestamp:
        return {}
    date_str = str(date_or_timestamp)[:10]
    return get_or_compute_daily_summary(employee_id, date_str, conn=conn, force_recompute=True)

def recalculate_range_action(
    from_date: str,
    to_date: str,
    employee_id: Optional[int] = None,
    shift_id: Optional[int] = None,
    actor_id: Optional[int] = None,
    actor_role: str = "admin"
) -> Dict[str, Any]:
    """
    Explicit administrative recalculation action for a historical date range.
    Applies current shift policies across history and logs action to audit trail.
    """
    from core.db import get_db_connection, log_audit

    conn = get_db_connection()
    c = conn.cursor()

    emp_query = "SELECT id, name FROM employees WHERE active = 1"
    params = []
    if employee_id:
        emp_query += " AND id = ?"
        params.append(employee_id)
    if shift_id:
        emp_query += " AND shift_id = ?"
        params.append(shift_id)

    c.execute(emp_query, tuple(params))
    emps = c.fetchall()

    start_d = datetime.date.fromisoformat(from_date[:10])
    end_d = datetime.date.fromisoformat(to_date[:10])
    days_count = (end_d - start_d).days + 1

    recalculated_count = 0
    for emp in emps:
        curr = start_d
        while curr <= end_d:
            d_str = curr.isoformat()
            get_or_compute_daily_summary(emp["id"], d_str, conn=conn, force_recompute=True)
            recalculated_count += 1
            curr += datetime.timedelta(days=1)

    details_msg = f"Recalculated {recalculated_count} summaries for {len(emps)} staff across range {from_date} to {to_date}"
    log_audit(actor_id, actor_role, "RECALCULATE_RANGE", "attendance", None, details_msg, db_conn=conn)

    conn.close()
    return {
        "success": True,
        "employees_count": len(emps),
        "days_count": days_count,
        "total_summaries_recalculated": recalculated_count,
        "message": details_msg
    }

