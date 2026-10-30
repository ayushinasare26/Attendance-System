"""
blueprints/admin/routes.py - Enterprise Workforce Admin Portal Routes
Comprehensive Administrative Governance:
- Executive Dashboard (Sites, Attendance Rate, Flagged, Overtime, Analytics)
- Multi-Site Management (Geofence radius, lat/lon, remote/field policy toggle)
- Shift Management (Start/End times, Grace period, Break duration)
- Employee Management (Biometric consent capture, Site/Shift/Dept assignments, Deactivation, Biometric Purge)
- Master Attendance Records (Multi-filter, check-in/out pairing)
- Flagged & Audit Queue (Geofence violations, liveness failures, correction requests)
- Payroll-Ready CSV Export
- Biometric Access Audit Trail
"""

import os
import io
import time
import datetime
from flask import (
    render_template, request, jsonify, redirect,
    url_for, session, flash, abort, send_file
)
from . import admin_bp
from core.db import (
    get_db_connection, get_setting, set_setting, log_audit,
    get_effective_attendance_policy, get_all_sites_attendance_policies,
    update_attendance_policies, VALID_ATTENDANCE_POLICIES,
    get_effective_work_policy, resolve_employee_shift
)
from core.auth import (
    login_required_admin,
    authenticate_admin,
    rate_limit
)
from core.face_engine import (
    enroll_student_photo,
    load_embeddings_cache
)
from core.shift_engine import calculate_shift_hours
from core.geotag import forward_geocode
from config import Config, get_utc_now, get_local_now, format_local_timestamp

# ========================================================
# 1. Admin Authentication
# ========================================================
@admin_bp.route("/login", methods=["GET", "POST"])
@rate_limit(max_requests=10, window_seconds=60, scope="admin_login")
def login():
    if session.get("role") == "admin" and session.get("admin_id"):
        return redirect(url_for("admin.dashboard"))

    error = None
    if request.method == "POST":
        data = (request.get_json(silent=True) or {}) if request.is_json else (request.form or {})
        username = str(data.get("username") or "").strip()
        password = str(data.get("password") or "").strip()
        demo_admin = str(data.get("demo_admin")).lower() in ("true", "1")

        if demo_admin:
            admin = authenticate_admin(Config.ADMIN_USERNAME, Config.ADMIN_PASSWORD)
        else:
            admin = authenticate_admin(username, password)

        if admin:
            session.clear()
            session["role"] = "admin"
            session["admin_id"] = admin["id"]
            session["admin_name"] = admin["name"]
            session["admin_username"] = admin["username"]
            return redirect(url_for("admin.dashboard"))
        else:
            error = "Invalid administrator credentials. Access restricted to authorized personnel."

    return render_template("admin/login.html", error=error)

@admin_bp.route("/logout")
def logout():
    aid = session.get("admin_id")
    if aid:
        log_audit(aid, "admin", "LOGOUT", "auth", aid, "Admin logged out")
    session.clear()
    flash("Administrator session terminated safely.", "info")
    return redirect(url_for("admin.login"))

# ========================================================
# 2. Executive Multi-Site Dashboard
# ========================================================
@admin_bp.route("/")
@admin_bp.route("/dashboard")
@login_required_admin
def dashboard():
    conn = get_db_connection()
    c = conn.cursor()

    # 1. Total Active Employees
    c.execute("SELECT COUNT(id) FROM employees WHERE active = 1")
    total_employees = c.fetchone()[0] or 0
    if total_employees == 0:
        c.execute("SELECT COUNT(id) FROM students")
        total_employees = c.fetchone()[0] or 0

    # 2. Total Sites
    c.execute("SELECT COUNT(id) FROM sites")
    total_sites = c.fetchone()[0] or 0

    # 3. Checked In Right Now Today
    today_str = get_local_now().date().isoformat()
    c.execute("""
        SELECT COUNT(DISTINCT employee_id) FROM attendance_events
        WHERE date(timestamp) = ? AND event_type = 'check_in'
    """, (today_str,))
    present_today = c.fetchone()[0] or 0

    # Fallback to attendance table if events empty
    if present_today == 0:
        c.execute("SELECT COUNT(DISTINCT student_id) FROM attendance WHERE date(timestamp) = ?", (today_str,))
        present_today = c.fetchone()[0] or 0

    # 4. Total Flagged Events
    c.execute("SELECT COUNT(*) FROM attendance_events WHERE flagged = 1")
    flagged_count = c.fetchone()[0] or 0
    if flagged_count == 0:
        c.execute("SELECT COUNT(*) FROM attendance WHERE status = 'flagged'")
        flagged_count = c.fetchone()[0] or 0

    # 5. Overtime Hours Accrued This Pay Period (Current Month)
    first_of_month = get_local_now().date().replace(day=1).isoformat()
    c.execute("""
        SELECT e.id, e.shift_id
        FROM employees e
        WHERE e.active = 1
    """)
    active_emps = c.fetchall()
    
    c.execute("SELECT id, name, start_time, end_time, grace_period_minutes, break_duration_minutes FROM shifts")
    shifts_dict = {s["id"]: dict(s) for s in c.fetchall()}

    total_overtime_hours = 0.0
    for emp in active_emps:
        sh = shifts_dict.get(emp["shift_id"]) or {
            "start_time": "09:00", "end_time": "18:00", "grace_period_minutes": 15, "break_duration_minutes": 60
        }
        c.execute("""
            SELECT event_type, timestamp FROM attendance_events
            WHERE employee_id = ? AND date(timestamp) >= ?
            ORDER BY timestamp ASC
        """, (emp["id"], first_of_month))
        evs = [dict(r) for r in c.fetchall()]
        
        # Group by date
        days_g = {}
        for ev in evs:
            d_key = ev["timestamp"][:10]
            if d_key not in days_g: days_g[d_key] = {"in": None, "out": None}
            if ev["event_type"] == "check_in" and not days_g[d_key]["in"]:
                days_g[d_key]["in"] = ev["timestamp"]
            elif ev["event_type"] == "check_out":
                days_g[d_key]["out"] = ev["timestamp"]

        for d_key, pair in days_g.items():
            if pair["in"] and pair["out"]:
                calc = calculate_shift_hours(pair["in"], pair["out"], sh)
                total_overtime_hours += calc.get("overtime_hours", 0.0)

    # 6. Recent attendance logs across company
    c.execute("""
        SELECT a.id, a.employee_id, a.event_type, a.timestamp, a.latitude, a.longitude,
               a.address, a.distance_from_site_meters, a.within_geofence, a.status,
               a.flagged, a.flag_reason, a.geotagged_photo_path, a.attendance_method,
               e.name, e.employee_code, d.name AS department_name, s.name AS site_name,
               sh.shift_type,
               das.status AS daily_status, das.flags AS daily_flags,
               das.worked_minutes, das.short_minutes, das.overtime_minutes
        FROM attendance_events a
        JOIN employees e ON a.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN sites s ON a.site_id = s.id
        LEFT JOIN shifts sh ON e.shift_id = sh.id
        LEFT JOIN daily_attendance_summary das ON das.employee_id = a.employee_id AND das.date = date(a.timestamp)
        ORDER BY a.timestamp DESC
        LIMIT 10
    """)
    raw_recent = c.fetchall()

    recent_logs = []
    for r in raw_recent:
        pol = get_effective_work_policy(r["employee_id"], date=r["timestamp"][:10], conn=conn)
        is_flex = (pol.get("shift_type") == "flexible")
        req_h = pol.get("required_daily_hours", 8.0)
        req_str = f"{int(req_h)}h" if req_h == int(req_h) else f"{req_h}h"
        worked_min = r["worked_minutes"] or 0
        w_h = worked_min // 60
        w_m = worked_min % 60
        duration_progress = f"Worked {w_h}h {w_m}m of {req_str}" if worked_min > 0 else f"— of {req_str}"

        if is_flex:
            if r["daily_status"]:
                disp_status = r["daily_status"]
            elif r["event_type"] == "check_in" and r["timestamp"][:10] == today_str:
                disp_status = "In Progress"
            elif r["event_type"] == "check_in" and r["timestamp"][:10] != today_str:
                disp_status = "Missing Check-out"
            else:
                disp_status = "Complete"
        else:
            disp_status = r["status"] or "on_time"

        recent_logs.append({
            "id": r["id"],
            "employee_id": r["employee_id"],
            "name": r["name"],
            "code": r["employee_code"],
            "department": r["department_name"] or "General",
            "site": r["site_name"] or "Headquarters",
            "event_type": r["event_type"],
            "time_display": format_local_timestamp(r["timestamp"], include_year=True),
            "status": disp_status,
            "shift_type": pol.get("shift_type", "flexible"),
            "is_flexible": is_flex,
            "duration_progress": duration_progress,
            "required_daily_hours": req_h,
            "policy_display": pol.get("duration_display", f"Flexible · {req_str}/day"),
            "within_geofence": bool(r["within_geofence"]),
            "distance_meters": r["distance_from_site_meters"],
            "flagged": bool(r["flagged"]),
            "flag_reason": r["flag_reason"] or "—",
            "photo_path": r["geotagged_photo_path"],
            "attendance_method": r["attendance_method"] if "attendance_method" in r.keys() and r["attendance_method"] else "face"
        })

    # Fallback to legacy attendance if no recent in attendance_events
    if not recent_logs:
        c.execute("""
            SELECT a.id, a.student_id AS employee_id, 'check_in' as event_type, a.timestamp, a.latitude, a.longitude,
                   a.address, a.distance_from_site_meters, a.within_geofence, a.status,
                   a.flagged, a.flag_reason, a.geotagged_photo_path, a.attendance_method,
                   s.name, s.roll AS employee_code, s.class AS department_name
            FROM attendance a
            LEFT JOIN students s ON a.student_id = s.id
            ORDER BY a.timestamp DESC
            LIMIT 10
        """)
        for r in c.fetchall():
            recent_logs.append({
                "id": r["id"],
                "employee_id": r["employee_id"],
                "name": r["name"] or "Employee",
                "code": r["employee_code"] or "—",
                "department": r["department_name"] or "General",
                "site": "Headquarters",
                "event_type": r["event_type"],
                "time_display": format_local_timestamp(r["timestamp"], include_year=True),
                "status": r["status"] or "success",
                "shift_type": "fixed",
                "is_flexible": False,
                "within_geofence": bool(r["within_geofence"]) if r["within_geofence"] is not None else True,
                "distance_meters": r["distance_from_site_meters"],
                "flagged": bool(r["flagged"]) if r["flagged"] is not None else (r["status"] == "flagged"),
                "flag_reason": r["flag_reason"] or "—",
                "photo_path": r["geotagged_photo_path"],
                "attendance_method": r["attendance_method"] if "attendance_method" in r.keys() and r["attendance_method"] else "face"
            })

    conn.close()

    attendance_rate = round((present_today / total_employees * 100), 1) if total_employees > 0 else 0.0

    return render_template(
        "admin/dashboard.html",
        total_employees=total_employees,
        total_sites=total_sites,
        present_today=present_today,
        attendance_rate=attendance_rate,
        flagged_count=flagged_count,
        overtime_hours=round(total_overtime_hours, 1),
        recent_logs=recent_logs
    )

@admin_bp.route("/dashboard/summary")
@login_required_admin
def dashboard_summary():
    """
    JSON feed for Chart.js admin visualizations:
    1. Attendance & punctuality rate trend (last 14 days) - on-time, late, complete, short, core-missed
    2. Punctuality breakdown by department
    3. Overtime hours by department
    4. Geofence violations over time
    """
    conn = get_db_connection()
    c = conn.cursor()

    # 1. 14-day trend: fixed (on-time, late) and flexible (complete, short, core_missed), plus flagged
    last_14_days = [(datetime.date.today() - datetime.timedelta(days=i)) for i in range(13, -1, -1)]
    labels = [d.strftime("%b %d") for d in last_14_days]
    trend_ontime = []
    trend_late = []
    trend_complete = []
    trend_short = []
    trend_core_missed = []
    trend_flagged = []

    for d in last_14_days:
        d_str = d.isoformat()
        # Fixed
        c.execute("""
            SELECT COUNT(*) FROM attendance_events ae
            JOIN employees e ON ae.employee_id = e.id
            LEFT JOIN shifts sh ON e.shift_id = sh.id
            WHERE date(ae.timestamp) = ? AND (sh.shift_type = 'fixed' OR sh.shift_type IS NULL) AND ae.status = 'on_time'
        """, (d_str,))
        trend_ontime.append(c.fetchone()[0] or 0)

        c.execute("""
            SELECT COUNT(*) FROM attendance_events ae
            JOIN employees e ON ae.employee_id = e.id
            LEFT JOIN shifts sh ON e.shift_id = sh.id
            WHERE date(ae.timestamp) = ? AND (sh.shift_type = 'fixed' OR sh.shift_type IS NULL) AND ae.status = 'late'
        """, (d_str,))
        trend_late.append(c.fetchone()[0] or 0)

        # Flexible
        c.execute("""
            SELECT COUNT(*) FROM daily_attendance_summary
            WHERE date = ? AND shift_type = 'flexible' AND status IN ('Complete', 'Overtime')
        """, (d_str,))
        trend_complete.append(c.fetchone()[0] or 0)

        c.execute("""
            SELECT COUNT(*) FROM daily_attendance_summary
            WHERE date = ? AND shift_type = 'flexible' AND status = 'Short Hours'
        """, (d_str,))
        trend_short.append(c.fetchone()[0] or 0)

        c.execute("""
            SELECT COUNT(*) FROM daily_attendance_summary
            WHERE date = ? AND shift_type = 'flexible' AND (status = 'Core Hours Missed' OR flags LIKE '%core_missed%')
        """, (d_str,))
        trend_core_missed.append(c.fetchone()[0] or 0)

        # Flagged
        c.execute("SELECT COUNT(*) FROM attendance_events WHERE date(timestamp)=? AND flagged=1", (d_str,))
        trend_flagged.append(c.fetchone()[0] or 0)

    # 2. Punctuality by Department
    c.execute("SELECT id, name FROM departments")
    depts = [dict(r) for r in c.fetchall()]
    dept_labels = [d["name"] for d in depts]
    dept_ontime = []
    dept_late = []
    dept_complete = []
    dept_short = []
    dept_core_missed = []

    for d in depts:
        c.execute("""
            SELECT COUNT(*) FROM attendance_events ae
            JOIN employees e ON ae.employee_id = e.id
            LEFT JOIN shifts sh ON e.shift_id = sh.id
            WHERE e.department_id = ? AND (sh.shift_type = 'fixed' OR sh.shift_type IS NULL) AND ae.status = 'on_time'
        """, (d["id"],))
        dept_ontime.append(c.fetchone()[0] or 0)

        c.execute("""
            SELECT COUNT(*) FROM attendance_events ae
            JOIN employees e ON ae.employee_id = e.id
            LEFT JOIN shifts sh ON e.shift_id = sh.id
            WHERE e.department_id = ? AND (sh.shift_type = 'fixed' OR sh.shift_type IS NULL) AND ae.status = 'late'
        """, (d["id"],))
        dept_late.append(c.fetchone()[0] or 0)

        c.execute("""
            SELECT COUNT(*) FROM daily_attendance_summary das
            JOIN employees e ON das.employee_id = e.id
            WHERE e.department_id = ? AND das.shift_type = 'flexible' AND das.status IN ('Complete', 'Overtime')
        """, (d["id"],))
        dept_complete.append(c.fetchone()[0] or 0)

        c.execute("""
            SELECT COUNT(*) FROM daily_attendance_summary das
            JOIN employees e ON das.employee_id = e.id
            WHERE e.department_id = ? AND das.shift_type = 'flexible' AND das.status = 'Short Hours'
        """, (d["id"],))
        dept_short.append(c.fetchone()[0] or 0)

        c.execute("""
            SELECT COUNT(*) FROM daily_attendance_summary das
            JOIN employees e ON das.employee_id = e.id
            WHERE e.department_id = ? AND das.shift_type = 'flexible' AND (das.status = 'Core Hours Missed' OR das.flags LIKE '%core_missed%')
        """, (d["id"],))
        dept_core_missed.append(c.fetchone()[0] or 0)

    # 3. Geofence Violations over time
    c.execute("SELECT COUNT(*) FROM attendance_events WHERE within_geofence = 0 OR flag_reason LIKE '%Geofence violation%'")
    total_geofence_violations = c.fetchone()[0] or 0

    c.execute("SELECT COUNT(id) FROM employees WHERE active = 1")
    total_employees = c.fetchone()[0] or 0
    if total_employees == 0:
        c.execute("SELECT COUNT(id) FROM students")
        total_employees = c.fetchone()[0] or 0
    c.execute("""
        SELECT 
            SUM(CASE WHEN confidence >= 0.85 THEN 1 ELSE 0 END),
            SUM(CASE WHEN confidence >= 0.65 AND confidence < 0.85 THEN 1 ELSE 0 END),
            SUM(CASE WHEN confidence < 0.65 THEN 1 ELSE 0 END)
        FROM attendance_events
    """)
    conf_row = c.fetchone()
    high_c = (conf_row[0] or 0) if conf_row else 0
    med_c = (conf_row[1] or 0) if conf_row else 0
    low_c = (conf_row[2] or 0) if conf_row else 0

    conn.close()

    return jsonify({
        "total_enrolled": total_employees,
        "trend": {
            "labels": labels,
            "on_time": trend_ontime,
            "late": trend_late,
            "complete": trend_complete,
            "short_hours": trend_short,
            "core_missed": trend_core_missed,
            "flagged": trend_flagged
        },
        "department_punctuality": {
            "departments": dept_labels,
            "on_time": dept_ontime,
            "late": dept_late,
            "complete": dept_complete,
            "short_hours": dept_short,
            "core_missed": dept_core_missed
        },
        "total_geofence_violations": total_geofence_violations,
        "confidence_distribution": {
            "labels": ["High (>=85%)", "Medium (65-84%)", "Low (<65%)"],
            "counts": [high_c, med_c, low_c]
        }
    })

# ========================================================
# 3. Site Management Page & API
# ========================================================
@admin_bp.route("/sites", methods=["GET"])
@login_required_admin
def site_management():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        SELECT s.*, COUNT(e.id) AS employee_count
        FROM sites s
        LEFT JOIN employees e ON e.site_id = s.id AND e.active = 1
        GROUP BY s.id
        ORDER BY s.id ASC
    """)
    sites = [dict(r) for r in c.fetchall()]
    conn.close()

    for s in sites:
        s["created_display"] = format_local_timestamp(s["created_at"], include_year=False)

    return render_template("admin/sites.html", sites=sites)

@admin_bp.route("/sites", methods=["POST"])
@admin_bp.route("/api/admin/sites", methods=["POST"])
@login_required_admin
def create_site():
    data = request.form if request.form else (request.get_json() or {})
    name = data.get("name", "").strip()
    address = data.get("address", "").strip()
    lat = data.get("latitude")
    lon = data.get("longitude")
    radius = data.get("geofence_radius_meters", 200.0)
    enabled = 1 if str(data.get("geofencing_enabled", "1")).lower() in ("1", "true", "yes") else 0

    if not name or lat is None or lon is None:
        if request.is_json:
            return jsonify({"success": False, "error": "Name, latitude, and longitude are required."}), 400
        flash("Name, latitude, and longitude are required.", "danger")
        return redirect(url_for("admin.site_management"))

    try:
        lat = float(lat)
        lon = float(lon)
        radius = float(radius)
    except ValueError:
        if request.is_json:
            return jsonify({"success": False, "error": "Invalid numeric coordinates or radius."}), 400
        flash("Invalid numeric coordinates or radius.", "danger")
        return redirect(url_for("admin.site_management"))

    conn = get_db_connection()
    c = conn.cursor()
    now = get_utc_iso()
    c.execute("""
        INSERT INTO sites (name, address, latitude, longitude, geofence_radius_meters, geofencing_enabled, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (name, address, lat, lon, radius, enabled, now))
    site_id = c.lastrowid
    conn.commit()
    conn.close()

    log_audit(session.get("admin_id"), "admin", "CREATE_SITE", "site", site_id, f"Created {name}")

    if request.is_json:
        return jsonify({"success": True, "site_id": site_id, "message": f"Site '{name}' created."}), 201

    flash(f"Work site '{name}' created successfully.", "success")
    return redirect(url_for("admin.site_management"))

@admin_bp.route("/sites/<int:site_id>/edit", methods=["POST"])
@admin_bp.route("/api/admin/sites/<int:site_id>", methods=["PATCH", "POST"])
@login_required_admin
def edit_site(site_id):
    data = request.form if request.form else (request.get_json() or {})
    name = data.get("name", "").strip()
    address = data.get("address", "").strip()
    lat = data.get("latitude")
    lon = data.get("longitude")
    radius = data.get("geofence_radius_meters", 200.0)
    enabled = 1 if str(data.get("geofencing_enabled", "1")).lower() in ("1", "true", "yes") else 0

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        UPDATE sites
        SET name = COALESCE(NULLIF(?, ''), name),
            address = ?,
            latitude = ?,
            longitude = ?,
            geofence_radius_meters = ?,
            geofencing_enabled = ?
        WHERE id = ?
    """, (name, address, float(lat), float(lon), float(radius), enabled, site_id))
    conn.commit()
    conn.close()

    log_audit(session.get("admin_id"), "admin", "EDIT_SITE", "site", site_id, f"Updated {name}")

    if request.is_json:
        return jsonify({"success": True, "message": f"Site #{site_id} updated."})

    flash(f"Site #{site_id} updated successfully.", "success")
    return redirect(url_for("admin.site_management"))

@admin_bp.route("/sites/<int:site_id>/delete", methods=["POST"])
@login_required_admin
def delete_site(site_id):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM sites WHERE id = ?", (site_id,))
    conn.commit()
    conn.close()
    flash(f"Site #{site_id} removed.", "info")
    return redirect(url_for("admin.site_management"))

@admin_bp.route("/api/geocode/forward", methods=["POST"])
@admin_bp.route("/api/admin/geocode/forward", methods=["POST"])
@login_required_admin
@rate_limit(max_requests=10, window_seconds=10)
def api_forward_geocode():
    """
    Forward-geocodes an address string to coordinates using the configured geocoder (Nominatim).
    Admin-only endpoint with rate limiting.
    """
    data = (request.get_json(silent=True) or {}) if request.is_json else (request.form or {})
    address = (data.get("address") or "").strip()
    if not address:
        return jsonify({"success": False, "message": "Address is required for coordinate lookup."}), 400

    result = forward_geocode(address)
    if not result:
        return jsonify({
            "success": False,
            "message": f"Could not find coordinates for '{address}'. Please verify the address or enter coordinates manually."
        }), 404

    return jsonify({
        "success": True,
        "latitude": result["latitude"],
        "longitude": result["longitude"],
        "address": result["address"]
    }), 200

# ========================================================
# 4. Shift Management Page & API
# ========================================================
@admin_bp.route("/shifts", methods=["GET"])
@login_required_admin
def shift_management():
    filter_mode = request.args.get("filter", "active")  # 'active' or 'legacy' or 'all'
    conn = get_db_connection()
    c = conn.cursor()

    query = """
        SELECT s.*, COUNT(e.id) AS employee_count
        FROM shifts s
        LEFT JOIN employees e ON e.shift_id = s.id AND e.active = 1
    """
    if filter_mode == "legacy":
        query += " WHERE s.is_archived = 1"
    elif filter_mode == "active":
        query += " WHERE (s.is_archived = 0 OR s.is_archived IS NULL)"

    query += " GROUP BY s.id ORDER BY s.id ASC"
    c.execute(query)
    shifts = [dict(r) for r in c.fetchall()]

    # Active flexible shifts for assignment dropdowns (hide legacy by default)
    c.execute("SELECT * FROM shifts WHERE (is_archived = 0 OR is_archived IS NULL) ORDER BY name ASC")
    active_shifts = [dict(r) for r in c.fetchall()]

    c.execute("SELECT id, name, shift_id FROM departments ORDER BY name")
    departments = [dict(r) for r in c.fetchall()]

    c.execute("SELECT id, name, shift_id, timezone FROM sites ORDER BY name")
    sites = [dict(r) for r in c.fetchall()]

    c.execute("""
        SELECT e.id, e.name, e.employee_code, e.shift_id, e.department_id, e.site_id,
               e.required_daily_hours, e.required_weekly_hours,
               d.name AS department_name, s.name AS site_name
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN sites s ON e.site_id = s.id
        WHERE e.active = 1
        ORDER BY e.name ASC
    """)
    employees = [dict(r) for r in c.fetchall()]

    conn.close()

    for s in shifts:
        s["created_display"] = format_local_timestamp(s["created_at"], include_year=False)

    return render_template(
        "admin/shifts.html",
        shifts=shifts,
        active_shifts=active_shifts,
        departments=departments,
        sites=sites,
        employees=employees,
        filter_mode=filter_mode
    )

@admin_bp.route("/shifts", methods=["POST"])
@admin_bp.route("/api/admin/shifts", methods=["POST"])
@login_required_admin
def create_shift():
    from core.shift_engine import validate_flexible_shift_policy

    data = request.form if request.form else (request.get_json() or {})
    shift_type = data.get("shift_type", "flexible").strip().lower()
    if shift_type not in ("fixed", "flexible"):
        shift_type = "flexible"

    name = data.get("name", "").strip()
    if not name:
        if request.is_json:
            return jsonify({"success": False, "error": "Shift name is required."}), 400
        flash("Shift name is required.", "danger")
        return redirect(url_for("admin.shift_management"))

    if shift_type == "flexible":
        core_start = data.get("core_start", "11:00").strip()
        core_end = data.get("core_end", "16:00").strip()
        req_daily = float(data.get("required_daily_hours", 8.0) or 8.0)
        req_weekly_raw = data.get("required_weekly_hours")
        req_weekly = float(req_weekly_raw) if req_weekly_raw not in (None, "", "None") else None
        enforcement = data.get("enforcement_mode", "daily").strip()
        allowed_start = data.get("allowed_window_start", "").strip() or None
        allowed_end = data.get("allowed_window_end", "").strip() or None
        unpaid_break = int(data.get("unpaid_break_minutes", 0) or 0)
        core_enforced = 1 if str(data.get("core_hours_enforced", "1")).lower() in ("1", "true", "on", "yes") else 0
        core_grace = int(data.get("core_grace_minutes", 15) or 15)
        ot_thresh = int(data.get("overtime_threshold_minutes", 0) or 0)
        half_day_thresh = float(data.get("half_day_threshold_hours", 4.0) or 4.0)
        weekly_offs = data.get("weekly_off_days", "Sat,Sun").strip() or "Sat,Sun"
        week_start = data.get("week_start_day", "Monday").strip() or "Monday"
        flag_policy = data.get("count_flagged_events_policy", "count_pending").strip()

        shift_dict = {
            "shift_type": "flexible",
            "name": name,
            "core_start": core_start,
            "core_end": core_end,
            "required_daily_hours": req_daily,
            "required_weekly_hours": req_weekly,
            "enforcement_mode": enforcement,
            "allowed_window_start": allowed_start,
            "allowed_window_end": allowed_end,
            "unpaid_break_minutes": unpaid_break,
            "core_hours_enforced": core_enforced,
            "core_grace_minutes": core_grace,
            "overtime_threshold_minutes": ot_thresh,
            "half_day_threshold_hours": half_day_thresh,
            "weekly_off_days": weekly_offs,
            "week_start_day": week_start,
            "count_flagged_events_policy": flag_policy
        }

        is_valid, err_msg = validate_flexible_shift_policy(shift_dict)
        if not is_valid:
            if request.is_json:
                return jsonify({"success": False, "error": err_msg}), 400
            flash(err_msg, "danger")
            return redirect(url_for("admin.shift_management"))

        start_time = core_start
        end_time = core_end
        grace = core_grace
        brk = unpaid_break
    else:
        # Fixed Shift
        start_time = data.get("start_time", "09:00").strip()
        end_time = data.get("end_time", "18:00").strip()
        grace = int(data.get("grace_period_minutes", 15) or 15)
        brk = int(data.get("break_duration_minutes", 60) or 60)
        core_start = None
        core_end = None
        req_daily = 8.0
        req_weekly = None
        enforcement = "daily"
        allowed_start = None
        allowed_end = None
        unpaid_break = brk
        core_enforced = 0
        core_grace = 15
        ot_thresh = 0
        half_day_thresh = 4.0
        weekly_offs = "Sat,Sun"
        week_start = "Monday"
        flag_policy = "count_pending"

    conn = get_db_connection()
    c = conn.cursor()
    now = get_utc_iso()
    c.execute("""
        INSERT INTO shifts (
            name, start_time, end_time, grace_period_minutes, break_duration_minutes,
            shift_type, core_start, core_end, required_daily_hours, required_weekly_hours,
            enforcement_mode, allowed_window_start, allowed_window_end, unpaid_break_minutes,
            core_hours_enforced, core_grace_minutes, overtime_threshold_minutes,
            half_day_threshold_hours, weekly_off_days, week_start_day, count_flagged_events_policy,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        name, start_time, end_time, grace, brk,
        shift_type, core_start, core_end, req_daily, req_weekly,
        enforcement, allowed_start, allowed_end, unpaid_break,
        core_enforced, core_grace, ot_thresh,
        half_day_thresh, weekly_offs, week_start, flag_policy,
        now
    ))
    shift_id = c.lastrowid
    conn.commit()
    conn.close()

    admin_id = session.get("admin_id")
    log_audit(admin_id, "admin", "CREATE_SHIFT", "shift", shift_id, f"Created {shift_type.upper()} shift '{name}'")

    if request.is_json:
        return jsonify({"success": True, "shift_id": shift_id, "shift_type": shift_type, "message": f"{shift_type.capitalize()} shift '{name}' created."}), 201

    flash(f"{shift_type.capitalize()} shift schedule '{name}' created successfully.", "success")
    return redirect(url_for("admin.shift_management"))

@admin_bp.route("/shifts/<int:shift_id>/edit", methods=["POST"])
@admin_bp.route("/api/admin/shifts/<int:shift_id>/edit", methods=["POST"])
@login_required_admin
def edit_shift(shift_id):
    """
    Edits a shift schedule without rewriting historical attendance summaries.
    Historical daily attendance summaries preserve their policy snapshots.
    """
    from core.shift_engine import validate_flexible_shift_policy

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM shifts WHERE id = ?", (shift_id,))
    old_shift = c.fetchone()
    if not old_shift:
        conn.close()
        if request.is_json:
            return jsonify({"success": False, "error": "Shift not found"}), 404
        flash("Shift not found.", "danger")
        return redirect(url_for("admin.shift_management"))

    data = request.form if request.form else (request.get_json() or {})
    shift_type = data.get("shift_type", old_shift["shift_type"] or "fixed").strip().lower()
    name = data.get("name", old_shift["name"]).strip()

    if shift_type == "flexible":
        core_start = data.get("core_start", old_shift["core_start"] or "11:00").strip()
        core_end = data.get("core_end", old_shift["core_end"] or "16:00").strip()
        req_daily = float(data.get("required_daily_hours", old_shift["required_daily_hours"] or 8.0))
        req_weekly_raw = data.get("required_weekly_hours")
        req_weekly = float(req_weekly_raw) if req_weekly_raw not in (None, "", "None") else None
        enforcement = data.get("enforcement_mode", old_shift["enforcement_mode"] or "daily").strip()
        allowed_start = data.get("allowed_window_start", "").strip() or None
        allowed_end = data.get("allowed_window_end", "").strip() or None
        unpaid_break = int(data.get("unpaid_break_minutes", 0) or 0)
        core_enforced = 1 if str(data.get("core_hours_enforced", "1")).lower() in ("1", "true", "on", "yes") else 0
        core_grace = int(data.get("core_grace_minutes", 15) or 15)
        ot_thresh = int(data.get("overtime_threshold_minutes", 0) or 0)
        half_day_thresh = float(data.get("half_day_threshold_hours", 4.0) or 4.0)
        weekly_offs = data.get("weekly_off_days", "Sat,Sun").strip() or "Sat,Sun"
        week_start = data.get("week_start_day", "Monday").strip() or "Monday"
        flag_policy = data.get("count_flagged_events_policy", "count_pending").strip()

        shift_dict = {
            "shift_type": "flexible",
            "name": name,
            "core_start": core_start,
            "core_end": core_end,
            "required_daily_hours": req_daily,
            "required_weekly_hours": req_weekly,
            "enforcement_mode": enforcement,
            "allowed_window_start": allowed_start,
            "allowed_window_end": allowed_end,
            "unpaid_break_minutes": unpaid_break,
            "core_hours_enforced": core_enforced,
            "core_grace_minutes": core_grace,
            "overtime_threshold_minutes": ot_thresh,
            "half_day_threshold_hours": half_day_thresh,
            "weekly_off_days": weekly_offs,
            "week_start_day": week_start,
            "count_flagged_events_policy": flag_policy
        }
        is_valid, err_msg = validate_flexible_shift_policy(shift_dict)
        if not is_valid:
            conn.close()
            if request.is_json:
                return jsonify({"success": False, "error": err_msg}), 400
            flash(err_msg, "danger")
            return redirect(url_for("admin.shift_management"))

        start_time = core_start
        end_time = core_end
        grace = core_grace
        brk = unpaid_break
    else:
        start_time = data.get("start_time", old_shift["start_time"] or "09:00").strip()
        end_time = data.get("end_time", old_shift["end_time"] or "18:00").strip()
        grace = int(data.get("grace_period_minutes", old_shift["grace_period_minutes"] or 15))
        brk = int(data.get("break_duration_minutes", old_shift["break_duration_minutes"] or 60))
        core_start = None
        core_end = None
        req_daily = 8.0
        req_weekly = None
        enforcement = "daily"
        allowed_start = None
        allowed_end = None
        unpaid_break = brk
        core_enforced = 0
        core_grace = 15
        ot_thresh = 0
        half_day_thresh = 4.0
        weekly_offs = "Sat,Sun"
        week_start = "Monday"
        flag_policy = "count_pending"

    c.execute("""
        UPDATE shifts SET
            name = ?, start_time = ?, end_time = ?, grace_period_minutes = ?, break_duration_minutes = ?,
            shift_type = ?, core_start = ?, core_end = ?, required_daily_hours = ?, required_weekly_hours = ?,
            enforcement_mode = ?, allowed_window_start = ?, allowed_window_end = ?, unpaid_break_minutes = ?,
            core_hours_enforced = ?, core_grace_minutes = ?, overtime_threshold_minutes = ?,
            half_day_threshold_hours = ?, weekly_off_days = ?, week_start_day = ?, count_flagged_events_policy = ?
        WHERE id = ?
    """, (
        name, start_time, end_time, grace, brk,
        shift_type, core_start, core_end, req_daily, req_weekly,
        enforcement, allowed_start, allowed_end, unpaid_break,
        core_enforced, core_grace, ot_thresh,
        half_day_thresh, weekly_offs, week_start, flag_policy,
        shift_id
    ))
    conn.commit()
    conn.close()

    admin_id = session.get("admin_id")
    log_audit(admin_id, "admin", "EDIT_SHIFT", "shift", shift_id, f"Updated {shift_type} shift '{name}'")

    if request.is_json:
        return jsonify({"success": True, "shift_id": shift_id, "message": f"Shift '{name}' updated."}), 200

    flash(f"Shift schedule '{name}' updated successfully.", "success")
    return redirect(url_for("admin.shift_management"))

@admin_bp.route("/shifts/assign", methods=["POST"])
@admin_bp.route("/api/admin/shifts/assign", methods=["POST"])
@login_required_admin
def assign_shift():
    """
    Assigns shift policy to employees (individual or bulk), departments, or sites.
    Supports bulk selection (all, department, site, or selected IDs) with optional
    per-employee duration overrides (required_daily_hours, required_weekly_hours).
    """
    data = request.form if request.form else (request.get_json() or {})
    assignment_mode = data.get("assignment_mode")  # 'bulk' or 'single'
    shift_id_raw = data.get("shift_id")
    shift_id = int(shift_id_raw) if shift_id_raw and str(shift_id_raw).isdigit() else None

    # Duration overrides (optional)
    daily_raw = data.get("required_daily_hours") or data.get("override_daily_hours")
    weekly_raw = data.get("required_weekly_hours") or data.get("override_weekly_hours")
    override_daily = float(daily_raw) if daily_raw not in (None, "", "None") else None
    override_weekly = float(weekly_raw) if weekly_raw not in (None, "", "None") else None

    if override_daily is not None and (override_daily < 0.5 or override_daily > 24.0):
        if request.is_json:
            return jsonify({"success": False, "error": "Daily required hours must be between 0.5 and 24.0."}), 400
        flash("Daily required hours must be between 0.5 and 24.0.", "danger")
        return redirect(url_for("admin.shift_management"))

    conn = get_db_connection()
    c = conn.cursor()
    admin_id = session.get("admin_id")

    shift_name = "Flexible Policy"
    if shift_id:
        c.execute("SELECT name FROM shifts WHERE id = ?", (shift_id,))
        sh_row = c.fetchone()
        if sh_row:
            shift_name = sh_row["name"]

    is_bulk = (assignment_mode == "bulk") or bool(data.get("bulk")) or bool(data.get("scope"))
    from core.shift_engine import recompute_affected_day
    from config import get_local_now
    today_str = get_local_now().date().isoformat()

    if is_bulk:
        scope = data.get("scope", "all")  # 'all', 'department', 'site', 'selected'
        dept_filter = data.get("filter_department_id")
        site_filter = data.get("filter_site_id")
        selected_ids = request.form.getlist("employee_ids") if request.form else data.get("employee_ids", [])
        if isinstance(selected_ids, str):
            selected_ids = [int(x.strip()) for x in selected_ids.split(",") if x.strip().isdigit()]

        emp_query = "SELECT id, name FROM employees WHERE active = 1"
        emp_params = []
        if scope == "department" and dept_filter:
            emp_query += " AND department_id = ?"
            emp_params.append(dept_filter)
        elif scope == "site" and site_filter:
            emp_query += " AND site_id = ?"
            emp_params.append(site_filter)
        elif scope == "selected" and selected_ids:
            ph = ",".join("?" for _ in selected_ids)
            emp_query += f" AND id IN ({ph})"
            emp_params.extend(selected_ids)

        c.execute(emp_query, tuple(emp_params))
        target_employees = c.fetchall()
        target_ids = [e["id"] for e in target_employees]

        if not target_ids:
            conn.close()
            msg = "No employees matched the chosen selection scope."
            if request.is_json:
                return jsonify({"success": False, "error": msg}), 400
            flash(msg, "warning")
            return redirect(url_for("admin.shift_management"))

        ph_ids = ",".join("?" for _ in target_ids)
        if override_daily is not None or override_weekly is not None:
            c.execute(f"""
                UPDATE employees
                SET shift_id = ?, required_daily_hours = ?, required_weekly_hours = ?
                WHERE id IN ({ph_ids})
            """, (shift_id, override_daily, override_weekly, *target_ids))
            c.execute(f"""
                UPDATE students
                SET shift_id = ?, required_daily_hours = ?, required_weekly_hours = ?
                WHERE id IN ({ph_ids})
            """, (shift_id, override_daily, override_weekly, *target_ids))
        else:
            c.execute(f"""
                UPDATE employees
                SET shift_id = ?
                WHERE id IN ({ph_ids})
            """, (shift_id, *target_ids))
            c.execute(f"""
                UPDATE students
                SET shift_id = ?
                WHERE id IN ({ph_ids})
            """, (shift_id, *target_ids))

        conn.commit()

        override_text = f" (Override: {override_daily}h/day)" if override_daily else ""
        audit_msg = f"Bulk assigned '{shift_name}'{override_text} to {len(target_ids)} staff (Scope: {scope})"
        log_audit(admin_id, "admin", "ASSIGN_SHIFTS_BULK", "employees", shift_id, audit_msg, db_conn=conn)

        for eid in target_ids:
            try:
                recompute_affected_day(eid, today_str, conn=conn)
            except Exception:
                pass

        conn.close()
        res_msg = f"Successfully assigned policy '{shift_name}' to {len(target_ids)} staff members."
        if request.is_json:
            return jsonify({
                "success": True,
                "message": res_msg,
                "employees_affected": len(target_ids),
                "policy_name": shift_name
            }), 200

        flash(res_msg, "success")
        return redirect(url_for("admin.shift_management"))

    # Single target assignment
    target_type = data.get("target_type")  # 'employee', 'department', 'site'
    target_id = data.get("target_id")
    if not target_type or not target_id:
        conn.close()
        if request.is_json:
            return jsonify({"success": False, "error": "target_type and target_id are required."}), 400
        flash("Target type and ID are required.", "danger")
        return redirect(url_for("admin.shift_management"))

    target_id_int = int(target_id)
    if target_type == "employee":
        c.execute("""
            UPDATE employees
            SET shift_id = ?,
                required_daily_hours = COALESCE(?, required_daily_hours),
                required_weekly_hours = COALESCE(?, required_weekly_hours)
            WHERE id = ?
        """, (shift_id, override_daily, override_weekly, target_id_int))
        c.execute("""
            UPDATE students
            SET shift_id = ?,
                required_daily_hours = COALESCE(?, required_daily_hours),
                required_weekly_hours = COALESCE(?, required_weekly_hours)
            WHERE id = ?
        """, (shift_id, override_daily, override_weekly, target_id_int))
        log_audit(admin_id, "admin", "ASSIGN_SHIFT", "employee", target_id_int, f"Assigned policy #{shift_id} to employee #{target_id_int}")
        try:
            recompute_affected_day(target_id_int, today_str, conn=conn)
        except Exception:
            pass
    elif target_type == "department":
        c.execute("UPDATE departments SET shift_id = ? WHERE id = ?", (shift_id, target_id_int))
        log_audit(admin_id, "admin", "ASSIGN_SHIFT", "department", target_id_int, f"Assigned policy #{shift_id} to department #{target_id_int}")
    elif target_type == "site":
        c.execute("UPDATE sites SET shift_id = ? WHERE id = ?", (shift_id, target_id_int))
        log_audit(admin_id, "admin", "ASSIGN_SHIFT", "site", target_id_int, f"Assigned policy #{shift_id} to site #{target_id_int}")
    else:
        conn.close()
        if request.is_json:
            return jsonify({"success": False, "error": "Invalid target_type"}), 400
        flash("Invalid target type.", "danger")
        return redirect(url_for("admin.shift_management"))

    conn.commit()
    conn.close()

    msg = f"Shift policy '{shift_name}' assigned to {target_type} #{target_id}."
    if request.is_json:
        return jsonify({"success": True, "message": msg}), 200

    flash(msg, "success")
    return redirect(url_for("admin.shift_management"))

@admin_bp.route("/shifts/<int:shift_id>/delete", methods=["POST"])
@login_required_admin
def delete_shift(shift_id):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT name FROM shifts WHERE id = ?", (shift_id,))
    sh_row = c.fetchone()
    if not sh_row:
        conn.close()
        if request.is_json:
            return jsonify({"success": False, "error": "Shift not found"}), 404
        flash("Shift not found.", "danger")
        return redirect(url_for("admin.shift_management"))

    shift_name = sh_row["name"]

    # Block deleting if referenced by employees, departments, sites, or daily summaries
    c.execute("SELECT COUNT(*) FROM employees WHERE shift_id = ? OR previous_shift_id = ?", (shift_id, shift_id))
    emp_refs = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM daily_attendance_summary WHERE shift_id = ?", (shift_id,))
    summary_refs = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM departments WHERE shift_id = ?", (shift_id,))
    dept_refs = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM sites WHERE shift_id = ?", (shift_id,))
    site_refs = c.fetchone()[0]

    total_refs = emp_refs + summary_refs + dept_refs + site_refs
    if total_refs > 0:
        c.execute("UPDATE shifts SET is_archived = 1 WHERE id = ?", (shift_id,))
        conn.commit()
        conn.close()
        msg = f"Cannot delete policy '{shift_name}': It is referenced by active staff ({emp_refs}) or past attendance summaries ({summary_refs}). It has been archived instead to protect historical audit records."
        if request.is_json:
            return jsonify({"success": False, "error": msg, "archived": True}), 400
        flash(msg, "warning")
        return redirect(url_for("admin.shift_management"))

    c.execute("DELETE FROM shifts WHERE id = ?", (shift_id,))
    conn.commit()
    conn.close()

    admin_id = session.get("admin_id")
    log_audit(admin_id, "admin", "DELETE_SHIFT", "shift", shift_id, f"Deleted unused policy '{shift_name}'")

    if request.is_json:
        return jsonify({"success": True, "message": f"Policy '{shift_name}' deleted."}), 200

    flash(f"Policy '{shift_name}' deleted.", "info")
    return redirect(url_for("admin.shift_management"))

# ========================================================
# 5. Employee Management & Enrollment (Consent & Retention)
# ========================================================
@admin_bp.route("/employees", methods=["GET"])
@login_required_admin
def employee_management():
    policy_filter = request.args.get("policy_id")
    sort_by = request.args.get("sort", "name")  # 'hours_desc', 'hours_asc', 'name'

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        SELECT e.*, d.name AS department_name, s.name AS site_name, sh.name AS shift_name,
               m.name AS manager_name
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN sites s ON e.site_id = s.id
        LEFT JOIN shifts sh ON e.shift_id = sh.id
        LEFT JOIN employees m ON e.manager_id = m.id
        ORDER BY e.active DESC, e.name ASC
    """)
    employees = [dict(r) for r in c.fetchall()]

    c.execute("SELECT id, name FROM departments ORDER BY name")
    departments = [dict(r) for r in c.fetchall()]

    c.execute("SELECT id, name FROM sites ORDER BY name")
    sites = [dict(r) for r in c.fetchall()]

    # Active flexible shifts for policy assignment
    c.execute("SELECT * FROM shifts WHERE (is_archived = 0 OR is_archived IS NULL) ORDER BY name ASC")
    shifts = [dict(r) for r in c.fetchall()]

    c.execute("SELECT id, name FROM employees WHERE role IN ('manager', 'admin') AND active = 1 ORDER BY name")
    managers = [dict(r) for r in c.fetchall()]

    for emp in employees:
        emp["created_display"] = format_local_timestamp(emp["created_at"], include_year=False)
        emp["consent_display"] = format_local_timestamp(emp["biometric_consent_timestamp"], include_year=True) if emp.get("biometric_consent_timestamp") else "Pending"

        # Single source of truth for work policy & duration
        eff_policy = get_effective_work_policy(emp["id"], conn=conn)
        emp["work_policy"] = eff_policy
        emp["policy_name"] = eff_policy["policy_name"]
        emp["policy_display"] = eff_policy["display_string"]
        emp["duration_display"] = eff_policy["duration_display"]
        emp["weekly_display"] = eff_policy["weekly_display"]
        emp["is_override"] = eff_policy["is_override"]
        emp["effective_daily_hours"] = eff_policy["required_daily_hours"]
        emp["effective_weekly_hours"] = eff_policy["required_weekly_hours"]

    conn.close()

    if policy_filter:
        try:
            pid = int(policy_filter)
            employees = [e for e in employees if e["work_policy"]["policy_id"] == pid]
        except Exception:
            pass

    if sort_by == "hours_desc":
        employees.sort(key=lambda x: (x.get("active", 1), x["work_policy"]["required_daily_hours"]), reverse=True)
    elif sort_by == "hours_asc":
        employees.sort(key=lambda x: (-x.get("active", 1), x["work_policy"]["required_daily_hours"]))

    return render_template(
        "admin/employees.html",
        employees=employees,
        departments=departments,
        sites=sites,
        shifts=shifts,
        managers=managers,
        selected_policy=policy_filter,
        sort_by=sort_by
    )

@admin_bp.route("/employees/<int:emp_id>/policy", methods=["POST"])
@admin_bp.route("/api/admin/employees/<int:emp_id>/policy", methods=["POST"])
@login_required_admin
def update_employee_policy(emp_id):
    """
    Updates a single employee's work policy and duration overrides directly from the roster.
    Immediately recalculates today's summary while preserving past summaries.
    """
    data = request.form if request.form else (request.get_json() or {})
    shift_id_raw = data.get("shift_id")
    daily_raw = data.get("required_daily_hours")
    weekly_raw = data.get("required_weekly_hours")

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id, name FROM employees WHERE id = ?", (emp_id,))
    emp = c.fetchone()
    if not emp:
        conn.close()
        if request.is_json:
            return jsonify({"success": False, "error": "Employee not found"}), 404
        flash("Employee not found.", "danger")
        return redirect(url_for("admin.employee_management"))

    shift_id = int(shift_id_raw) if shift_id_raw and str(shift_id_raw).isdigit() else None
    daily_h = float(daily_raw) if daily_raw not in (None, "", "None") else None
    weekly_h = float(weekly_raw) if weekly_raw not in (None, "", "None") else None

    if daily_h is not None and (daily_h < 0.5 or daily_h > 24.0):
        conn.close()
        msg = "Required daily hours must be between 0.5 and 24.0."
        if request.is_json:
            return jsonify({"success": False, "error": msg}), 400
        flash(msg, "danger")
        return redirect(url_for("admin.employee_management"))

    c.execute("""
        UPDATE employees
        SET shift_id = ?, required_daily_hours = ?, required_weekly_hours = ?
        WHERE id = ?
    """, (shift_id, daily_h, weekly_h, emp_id))
    c.execute("""
        UPDATE students
        SET shift_id = ?, required_daily_hours = ?, required_weekly_hours = ?
        WHERE id = ?
    """, (shift_id, daily_h, weekly_h, emp_id))
    conn.commit()

    admin_id = session.get("admin_id")
    detail_str = f"Updated policy for {emp['name']}: Shift={shift_id}, DailyOverride={daily_h}h, WeeklyOverride={weekly_h}h"
    log_audit(admin_id, "admin", "UPDATE_EMPLOYEE_WORK_POLICY", "employee", emp_id, detail_str, db_conn=conn)

    from core.shift_engine import recompute_affected_day
    from config import get_local_now
    today_str = get_local_now().date().isoformat()
    recompute_affected_day(emp_id, today_str, conn=conn)

    conn.close()

    if request.is_json:
        return jsonify({"success": True, "message": f"Work policy updated for {emp['name']}."}), 200

    flash(f"Work policy updated for {emp['name']}.", "success")
    return redirect(url_for("admin.employee_management"))

@admin_bp.route("/enroll", methods=["GET", "POST"])
@admin_bp.route("/employees/enroll", methods=["GET", "POST"])
@admin_bp.route("/api/admin/employees", methods=["POST"])
@login_required_admin
def enroll_employee():
    """
    Enrolls a new employee with explicit, timestamped biometric consent.
    Compliance: Requires biometric consent checkbox before enrollment.
    """
    if request.method == "GET":
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT id, name FROM departments ORDER BY name")
        departments = c.fetchall()
        c.execute("SELECT id, name FROM sites ORDER BY name")
        sites = c.fetchall()
        c.execute("SELECT id, name, shift_type, required_daily_hours FROM shifts WHERE is_archived = 0 ORDER BY name")
        shifts = c.fetchall()
        c.execute("SELECT id, name FROM employees WHERE role IN ('manager', 'admin') AND active = 1 ORDER BY name")
        managers = c.fetchall()
        c.execute("SELECT value FROM settings WHERE key = 'company_default_shift_id'")
        def_row = c.fetchone()
        default_shift_id = int(def_row["value"]) if def_row and def_row["value"] else 9
        conn.close()
        return render_template(
            "admin/add_student.html",
            departments=departments,
            sites=sites,
            shifts=shifts,
            managers=managers,
            default_shift_id=default_shift_id
        )

    data = request.form if request.form else (request.get_json() or {})
    name = data.get("name", "").strip()
    code = data.get("employee_code") or data.get("roll", "").strip()
    email = data.get("email", "").strip()
    dept_id = data.get("department_id") or None
    site_id = data.get("site_id") or 1
    shift_id = data.get("shift_id")
    if not shift_id:
        conn_t = get_db_connection()
        def_row = conn_t.execute("SELECT value FROM settings WHERE key = 'company_default_shift_id'").fetchone()
        conn_t.close()
        shift_id = int(def_row["value"]) if def_row and def_row["value"] else 9
    else:
        shift_id = int(shift_id)

    req_daily = data.get("required_daily_hours")
    req_weekly = data.get("required_weekly_hours")
    req_daily = float(req_daily) if req_daily not in (None, "") else None
    req_weekly = float(req_weekly) if req_weekly not in (None, "") else None

    mgr_id = data.get("manager_id") or None
    role = data.get("role", "employee").strip()
    
    # Biometric Consent Verification (Required by DPDP / GDPR / BIPA scaffolding)
    consent = data.get("biometric_consent") in ("1", "true", "on", True)
    if not consent:
        msg = "Biometric Consent Required: An explicit informed consent record must be confirmed before enrolling facial biometric templates."
        if request.is_json:
            return jsonify({"success": False, "error": msg}), 400
        flash(msg, "danger")
        return redirect(url_for("admin.enroll_employee"))

    if not name or not code:
        if request.is_json:
            return jsonify({"success": False, "error": "Employee Name and Code/ID are required."}), 400
        flash("Employee Name and Code/ID are required.", "danger")
        return redirect(url_for("admin.enroll_employee"))

    from werkzeug.security import generate_password_hash
    pw_hash = generate_password_hash("employee123")
    now = get_utc_iso()

    conn = get_db_connection()
    c = conn.cursor()
    try:
        # Insert into employees table
        c.execute("""
            INSERT INTO employees (
                name, employee_code, department_id, site_id, shift_id, manager_id,
                role, email, password_hash, active, biometric_consent,
                biometric_consent_timestamp, created_at,
                required_daily_hours, required_weekly_hours
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)
        """, (name, code, dept_id, site_id, shift_id, mgr_id, role, email, pw_hash, now, now, req_daily, req_weekly))
        eid = c.lastrowid

        # Keep legacy students table synchronized
        c.execute("""
            INSERT OR REPLACE INTO students (
                id, name, roll, class, email, password_hash, role,
                department_id, site_id, shift_id, manager_id, active,
                biometric_consent, biometric_consent_timestamp, created_at,
                required_daily_hours, required_weekly_hours
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)
        """, (eid, name, code, f"Dept-{dept_id}", email, pw_hash, role, dept_id, site_id, shift_id, mgr_id, now, now, req_daily, req_weekly))

        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": f"Database enrollment error: {str(e)}"}), 400
    finally:
        conn.close()

    os.makedirs(os.path.join(Config.DATASET_DIR, str(eid)), exist_ok=True)
    log_audit(session.get("admin_id"), "admin", "ENROLL_EMPLOYEE", "employee", eid, f"Enrolled {name} with biometric consent")

    return jsonify({"success": True, "employee_id": eid, "student_id": eid, "name": name})

@admin_bp.route("/employees/<int:emp_id>/toggle-active", methods=["POST"])
@login_required_admin
def toggle_employee_active(emp_id):
    """
    Deactivates / offboards or reactivates an employee.
    Deactivated employees cannot mark attendance, but historical records are retained.
    """
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id, name, active FROM employees WHERE id = ?", (emp_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        abort(404)

    new_active = 0 if row["active"] == 1 else 1
    c.execute("UPDATE employees SET active = ? WHERE id = ?", (new_active, emp_id))
    c.execute("UPDATE students SET active = ? WHERE id = ?", (new_active, emp_id))
    conn.commit()
    conn.close()

    action_label = "reactivated" if new_active == 1 else "deactivated (offboarded)"
    log_audit(session.get("admin_id"), "admin", "TOGGLE_ACTIVE", "employee", emp_id, f"Status: {action_label}")
    flash(f"Employee #{emp_id} ({row['name']}) has been {action_label}.", "info")
    return redirect(url_for("admin.employee_management"))

@admin_bp.route("/employees/<int:emp_id>/purge-biometrics", methods=["POST"])
@login_required_admin
def purge_employee_biometrics(emp_id):
    """
    Biometric Data Retention & Right-to-be-Forgotten Purge:
    Permanently deletes raw reference photos and 128-d deep face templates,
    fulfilling data minimization upon offboarding request.
    Historical payroll attendance logs are preserved.
    """
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM embeddings WHERE student_id = ?", (emp_id,))
    c.execute("UPDATE employees SET biometric_consent = 0 WHERE id = ?", (emp_id,))
    c.execute("UPDATE students SET biometric_consent = 0 WHERE id = ?", (emp_id,))
    conn.commit()
    conn.close()

    folder = os.path.join(Config.DATASET_DIR, str(emp_id))
    if os.path.isdir(folder):
        import shutil
        shutil.rmtree(folder, ignore_errors=True)

    load_embeddings_cache(force_reload=True)
    log_audit(session.get("admin_id"), "admin", "PURGE_BIOMETRICS", "employee", emp_id, "Permanently purged biometric embeddings and dataset photos")
    flash(f"Biometric reference photos and embeddings for Employee #{emp_id} have been permanently purged.", "warning")
    return redirect(url_for("admin.employee_management"))

# ========================================================
# 6. Master Attendance Records & Flagged Review Queue
# ========================================================
@admin_bp.route("/attendance")
@admin_bp.route("/attendance-records")
@login_required_admin
def attendance_records():
    site_filter = request.args.get("site_id")
    dept_filter = request.args.get("department_id")
    shift_filter = request.args.get("shift_id")
    status_filter = request.args.get("status", "all")
    from_date = request.args.get("from")
    to_date = request.args.get("to")
    search_q = request.args.get("search", "").strip()

    conn = get_db_connection()
    c = conn.cursor()

    query = """
        SELECT a.id, a.employee_id, a.event_type, a.timestamp, a.latitude, a.longitude,
               a.address, a.distance_from_site_meters, a.within_geofence, a.status,
               a.flagged, a.flag_reason, a.geotagged_photo_path, a.attendance_method,
               e.name, e.employee_code, d.name AS department_name, s.name AS site_name,
               sh.name AS shift_name
        FROM attendance_events a
        JOIN employees e ON a.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN sites s ON a.site_id = s.id
        LEFT JOIN shifts sh ON e.shift_id = sh.id
        WHERE 1=1
    """
    params = []

    if site_filter:
        query += " AND a.site_id = ?"
        params.append(site_filter)
    if dept_filter:
        query += " AND e.department_id = ?"
        params.append(dept_filter)
    if shift_filter:
        query += " AND e.shift_id = ?"
        params.append(shift_filter)
    if status_filter in ("on_time", "late", "early_leave", "overtime", "flagged"):
        query += " AND (a.status = ? OR (a.flagged = 1 AND ? = 'flagged'))"
        params.extend([status_filter, status_filter])
    if from_date:
        query += " AND date(a.timestamp) >= ?"
        params.append(from_date)
    if to_date:
        query += " AND date(a.timestamp) <= ?"
        params.append(to_date)
    if search_q:
        query += " AND (e.name LIKE ? OR e.employee_code LIKE ? OR a.address LIKE ?)"
        like_term = f"%{search_q}%"
        params.extend([like_term, like_term, like_term])

    query += " ORDER BY a.timestamp DESC LIMIT 1000"
    c.execute(query, tuple(params))
    rows = [dict(r) for r in c.fetchall()]

    # Fallback to legacy attendance table if empty
    if not rows:
        c.execute("""
            SELECT a.id, a.student_id AS employee_id, a.event_type, a.timestamp, a.latitude, a.longitude,
                   a.address, a.distance_from_site_meters, a.within_geofence, a.status,
                   a.flagged, a.flag_reason, a.geotagged_photo_path, a.attendance_method,
                   s.name, s.roll AS employee_code, s.class AS department_name, 'Headquarters' AS site_name, 'General Shift' AS shift_name
            FROM attendance a
            LEFT JOIN students s ON a.student_id = s.id
            ORDER BY a.timestamp DESC LIMIT 1000
        """)
        rows = [dict(r) for r in c.fetchall()]

    for r in rows:
        r["time_display"] = format_local_timestamp(r["timestamp"], include_year=True)
        r["within_geofence"] = bool(r.get("within_geofence", 1))
        r["attendance_method"] = r.get("attendance_method") or "face"

        eid = r.get("employee_id")
        date_str = r["timestamp"][:10]
        pol = get_effective_work_policy(eid, date=date_str, conn=conn)
        is_flex = (pol.get("shift_type") == "flexible")
        r["is_flexible"] = is_flex
        req_h = pol.get("required_daily_hours", 8.0)
        req_str = f"{int(req_h)}h" if req_h == int(req_h) else f"{req_h}h"
        r["required_daily_hours"] = req_h
        r["policy_display"] = pol.get("duration_display", f"Flexible · {req_str}/day")

        c.execute("SELECT status, worked_minutes, flags FROM daily_attendance_summary WHERE employee_id = ? AND date = ?", (eid, date_str))
        d_row = c.fetchone()
        if d_row:
            worked_min = d_row["worked_minutes"] or 0
            if is_flex:
                r["status"] = d_row["status"]
        else:
            worked_min = 0
            if is_flex and r["status"] in ("on_time", "success"):
                r["status"] = "In Progress"

        w_h = worked_min // 60
        w_m = worked_min % 60
        r["worked_minutes"] = worked_min
        r["duration_progress"] = f"Worked {w_h}h {w_m}m of {req_str}" if worked_min > 0 else f"— of {req_str}"

    c.execute("SELECT id, name FROM sites ORDER BY name")
    sites = c.fetchall()
    c.execute("SELECT id, name FROM departments ORDER BY name")
    departments = c.fetchall()
    c.execute("SELECT id, name FROM shifts WHERE is_archived = 0 ORDER BY name")
    shifts = c.fetchall()

    conn.close()

    return render_template(
        "admin/attendance_records.html",
        records=rows,
        sites=sites,
        departments=departments,
        shifts=shifts,
        selected_site=site_filter or "",
        selected_dept=dept_filter or "",
        selected_shift=shift_filter or "",
        status_filter=status_filter,
        from_date=from_date or "",
        to_date=to_date or "",
        search_q=search_q
    )

@admin_bp.route("/flagged")
@admin_bp.route("/flagged-queue")
@login_required_admin
def flagged_queue():
    """Flagged & Audit Queue: Geofence violations, liveness failures, and correction requests."""
    conn = get_db_connection()
    c = conn.cursor()

    # 1. Flagged attendance events
    c.execute("""
        SELECT a.id, a.employee_id, a.event_type, a.timestamp, a.latitude, a.longitude,
               a.address, a.distance_from_site_meters, a.within_geofence, a.confidence,
               a.status, a.flagged, a.flag_reason, a.geotagged_photo_path, a.review_note,
               a.attendance_method,
               e.name, e.employee_code, d.name AS department_name, s.name AS site_name
        FROM attendance_events a
        JOIN employees e ON a.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN sites s ON a.site_id = s.id
        WHERE a.flagged = 1 OR a.status = 'flagged' OR a.within_geofence = 0
        ORDER BY a.timestamp DESC
    """)
    flagged_events = [dict(r) for r in c.fetchall()]

    if not flagged_events:
        c.execute("""
            SELECT a.id, a.student_id AS employee_id, a.event_type, a.timestamp, a.latitude, a.longitude,
                   a.address, a.distance_from_site_meters, a.within_geofence, a.confidence,
                   a.status, a.flagged, a.flag_reason, a.geotagged_photo_path, a.review_note,
                   a.attendance_method,
                   s.name, s.roll AS employee_code, s.class AS department_name, 'Headquarters' AS site_name
            FROM attendance a
            LEFT JOIN students s ON a.student_id = s.id
            WHERE a.status = 'flagged' OR a.flagged = 1
            ORDER BY a.timestamp DESC
        """)
        flagged_events = [dict(r) for r in c.fetchall()]

    for f in flagged_events:
        f["time_display"] = format_local_timestamp(f["timestamp"], include_year=True)
        eid = f.get("employee_id")
        date_str = f["timestamp"][:10]
        pol = get_effective_work_policy(eid, date=date_str, conn=conn)
        f["is_flexible"] = (pol.get("shift_type") == "flexible")
        req_h = pol.get("required_daily_hours", 8.0)
        req_str = f"{int(req_h)}h" if req_h == int(req_h) else f"{req_h}h"
        f["required_daily_hours"] = req_h
        f["policy_display"] = pol.get("duration_display", f"Flexible · {req_str}/day")

        c.execute("SELECT status, worked_minutes FROM daily_attendance_summary WHERE employee_id = ? AND date = ?", (eid, date_str))
        d_row = c.fetchone()
        worked_min = d_row["worked_minutes"] if d_row and d_row["worked_minutes"] else 0
        w_h = worked_min // 60
        w_m = worked_min % 60
        f["duration_progress"] = f"Worked {w_h}h {w_m}m of {req_str}" if worked_min > 0 else f"— of {req_str}"

    # 2. Pending correction requests across company
    c.execute("""
        SELECT cr.*, e.name, e.employee_code, d.name AS department_name
        FROM correction_requests cr
        JOIN employees e ON cr.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE cr.status = 'pending'
        ORDER BY cr.created_at DESC
    """)
    pending_corrections = [dict(r) for r in c.fetchall()]
    conn.close()

    for cr in pending_corrections:
        cr["created_display"] = format_local_timestamp(cr["created_at"], include_year=False)

    return render_template(
        "admin/flagged_queue.html",
        records=flagged_events,
        pending_corrections=pending_corrections
    )

@admin_bp.route("/flagged/<int:record_id>/review", methods=["POST"])
@login_required_admin
def review_flagged(record_id):
    admin_id = session.get("admin_id")
    action = request.form.get("action", "approve")
    note = request.form.get("note", "").strip()

    new_status = "on_time" if action == "approve" else "flagged"
    new_flag = 0 if action == "approve" else 1

    conn = get_db_connection()
    c = conn.cursor()
    # Fetch affected employee and event timestamp
    c.execute("SELECT employee_id, timestamp FROM attendance_events WHERE id = ?", (record_id,))
    ev_row = c.fetchone()
    target_emp_id = ev_row["employee_id"] if ev_row else None
    target_ts = ev_row["timestamp"] if ev_row else None

    c.execute("""
        UPDATE attendance_events
        SET status = ?,
            flagged = ?,
            reviewed_by = ?,
            review_note = ?
        WHERE id = ?
    """, (new_status, new_flag, admin_id, note or f"Reviewed by Admin #{admin_id} ({action})", record_id))
    c.execute("""
        UPDATE attendance
        SET status = ?,
            flagged = ?,
            reviewed_by_admin_id = ?,
            review_note = ?
        WHERE id = ?
    """, (new_status, new_flag, admin_id, note or f"Reviewed by Admin #{admin_id} ({action})", record_id))
    conn.commit()
    conn.close()

    # Recompute daily attendance summary
    if target_emp_id and target_ts:
        try:
            from core.shift_engine import recompute_affected_day
            recompute_affected_day(target_emp_id, target_ts)
        except Exception:
            pass

    log_audit(admin_id, "admin", f"REVIEW_{action.upper()}", "attendance_event", record_id, note)
    flash(f"Record #{record_id} marked as {action.upper()}.", "success")
    return redirect(url_for("admin.flagged_queue"))

@admin_bp.route("/corrections/<int:request_id>/review", methods=["POST"])
@login_required_admin
def admin_review_correction(request_id):
    """Admin resolution of attendance correction requests across the enterprise."""
    admin_id = session.get("admin_id")
    action = request.form.get("action", "approve")
    note = request.form.get("review_note", "").strip()

    new_status = "approved" if action == "approve" else "rejected"

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id, employee_id, attendance_date FROM correction_requests WHERE id = ?", (request_id,))
    cr = c.fetchone()

    if not cr:
        conn.close()
        flash("Correction request not found.", "danger")
        return redirect(url_for("admin.flagged_queue"))

    target_emp_id = cr["employee_id"]
    target_date = cr["attendance_date"]
    now_iso = get_local_now().isoformat()
    note_text = note or f"Reviewed by Admin #{admin_id} ({new_status.title()})"

    c.execute("""
        UPDATE correction_requests
        SET status = ?,
            reviewed_by = ?,
            review_note = ?,
            reviewed_at = ?
        WHERE id = ?
    """, (new_status, admin_id, note_text, now_iso, request_id))
    conn.commit()
    conn.close()

    # Recompute daily summary
    try:
        from core.shift_engine import recompute_affected_day
        recompute_affected_day(target_emp_id, target_date)
    except Exception:
        pass

    log_audit(admin_id, "admin", f"CORRECTION_{new_status.upper()}", "correction_request", request_id, note_text)
    flash(f"Correction request #{request_id} has been {new_status}.", "success")
    return redirect(url_for("admin.flagged_queue"))

@admin_bp.route("/shifts/recalculate", methods=["POST"])
@admin_bp.route("/api/admin/recalculate", methods=["POST"])
@login_required_admin
def recalculate_attendance_range():
    """
    Explicit administrative recalculation action for a historical date range.
    Applies current shift rules to historical dates and logs action to audit trail.
    """
    admin_id = session.get("admin_id")
    data = request.form if request.form else (request.get_json() or {})
    from_date = data.get("from_date") or data.get("from")
    to_date = data.get("to_date") or data.get("to")
    shift_id = data.get("shift_id")
    emp_id = data.get("employee_id")

    if not from_date or not to_date:
        if request.is_json:
            return jsonify({"success": False, "error": "from_date and to_date are required."}), 400
        flash("Both start date and end date are required for recalculation.", "danger")
        return redirect(url_for("admin.shift_management"))

    try:
        from core.shift_engine import recalculate_range_action
        shift_id_int = int(shift_id) if shift_id and str(shift_id).isdigit() else None
        emp_id_int = int(emp_id) if emp_id and str(emp_id).isdigit() else None
        res = recalculate_range_action(
            from_date=from_date,
            to_date=to_date,
            employee_id=emp_id_int,
            shift_id=shift_id_int,
            actor_id=admin_id,
            actor_role="admin"
        )
        if request.is_json:
            return jsonify(res), 200
        flash(f"Successfully recalculated attendance for {res['employees_count']} employees across {from_date} to {to_date}.", "success")
        return redirect(url_for("admin.shift_management"))
    except Exception as e:
        if request.is_json:
            return jsonify({"success": False, "error": str(e)}), 500
        flash(f"Recalculation error: {str(e)}", "danger")
        return redirect(url_for("admin.shift_management"))

# ========================================================
# 7. Payroll Export Page & CSV Generation
# ========================================================
@admin_bp.route("/reports")
@admin_bp.route("/payroll-export")
@login_required_admin
def payroll_export_page():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id, name FROM sites ORDER BY name")
    sites = c.fetchall()
    c.execute("SELECT id, name FROM departments ORDER BY name")
    departments = c.fetchall()
    conn.close()
    return render_template("admin/reports.html", sites=sites, departments=departments)

@admin_bp.route("/reports/csv")
@login_required_admin
def reports_csv():
    from_date = request.args.get("from")
    to_date = request.args.get("to")
    student_id = request.args.get("student_id")

    conn = get_db_connection()
    c = conn.cursor()
    query = """
        SELECT a.id, a.student_id, a.name, s.roll, s.class, a.timestamp,
               a.latitude, a.longitude, a.address, a.confidence, a.status
        FROM attendance a
        LEFT JOIN students s ON a.student_id = s.id
        WHERE 1=1
    """
    params = []
    if from_date:
        query += " AND date(a.timestamp) >= ?"
        params.append(from_date)
    if to_date:
        query += " AND date(a.timestamp) <= ?"
        params.append(to_date)
    if student_id:
        query += " AND a.student_id = ?"
        params.append(student_id)

    query += " ORDER BY a.timestamp DESC"
    c.execute(query, tuple(params))
    rows = c.fetchall()
    conn.close()

    output = io.StringIO()
    output.write("ID,Student ID,Name,Roll No,Class,Timestamp,Latitude,Longitude,Address,Confidence,Status\n")
    for r in rows:
        conf_str = f"{round((r['confidence'] or 0.0) * 100, 2)}%"
        clean_addr = f'"{r["address"]}"' if r["address"] else '""'
        local_time_str = format_local_timestamp(r["timestamp"], include_year=True)
        output.write(f'{r["id"]},{r["student_id"]},{r["name"]},{r["roll"] or ""},{r["class"] or ""},"{local_time_str}",{r["latitude"] or ""},{r["longitude"] or ""},{clean_addr},{conf_str},{r["status"]}\n')

    mem = io.BytesIO()
    mem.write(output.getvalue().encode("utf-8"))
    mem.seek(0)
    return send_file(mem, as_attachment=True, download_name=f"admin_attendance_report_{datetime.date.today().isoformat()}.csv", mimetype="text/csv")

@admin_bp.route("/payroll-export/csv")
@admin_bp.route("/api/admin/payroll-export")
@login_required_admin
def export_payroll_csv():
    """
    Exports Payroll-Ready CSV format:
    Columns:
    Employee ID, Employee Code, Full Name, Department, Site, Regular Hours,
    Overtime Hours, Total Worked Hours, Late Days Count, Flagged Events Count, Total Active Days
    """
    from_date = request.args.get("from")
    to_date = request.args.get("to")
    site_id = request.args.get("site_id")
    dept_id = request.args.get("department_id")

    if not from_date:
        from_date = get_local_now().date().replace(day=1).isoformat()
    if not to_date:
        to_date = get_local_now().date().isoformat()

    conn = get_db_connection()
    c = conn.cursor()

    # Query active employees matching filters
    emp_q = """
        SELECT e.id, e.name, e.employee_code, e.shift_id,
               d.name AS department_name, s.name AS site_name,
               sh.name AS shift_name, sh.start_time, sh.end_time,
               sh.grace_period_minutes, sh.break_duration_minutes
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN sites s ON e.site_id = s.id
        LEFT JOIN shifts sh ON e.shift_id = sh.id
        WHERE e.active = 1
    """
    params = []
    if site_id:
        emp_q += " AND e.site_id = ?"
        params.append(site_id)
    if dept_id:
        emp_q += " AND e.department_id = ?"
        params.append(dept_id)

    emp_q += " ORDER BY e.name ASC"
    c.execute(emp_q, tuple(params))
    employees = [dict(r) for r in c.fetchall()]

    payroll_rows = []
    from core.db import resolve_employee_shift
    from core.shift_engine import get_or_compute_daily_summary

    for emp in employees:
        eid = emp["id"]
        eff_policy = get_effective_work_policy(eid, conn=conn)
        policy_name = eff_policy.get("name", "Flexible 8h")
        emp_shift_type = eff_policy.get("shift_type", "flexible")

        # Query events in date range to find active dates
        c.execute("""
            SELECT DISTINCT date(timestamp) AS event_date
            FROM attendance_events
            WHERE employee_id = ? AND date(timestamp) >= ? AND date(timestamp) <= ?
            ORDER BY event_date ASC
        """, (eid, from_date, to_date))
        event_dates = [r["event_date"] for r in c.fetchall()]

        # Also check existing daily_attendance_summary rows in date range
        c.execute("""
            SELECT DISTINCT date FROM daily_attendance_summary
            WHERE employee_id = ? AND date >= ? AND date <= ?
        """, (eid, from_date, to_date))
        summary_dates = [r["date"] for r in c.fetchall()]

        all_dates = sorted(list(set(event_dates + summary_dates)))

        emp_req_h = 0.0
        emp_worked_h = 0.0
        emp_short_h = 0.0
        emp_ot_h = 0.0
        core_missed_count = 0
        late_days = 0
        flagged_count = 0

        for d_str in all_dates:
            sum_res = get_or_compute_daily_summary(eid, d_str, conn=conn)
            emp_req_h += sum_res.get("required_hours", 0.0)
            emp_worked_h += sum_res.get("worked_hours", 0.0)
            emp_short_h += sum_res.get("short_hours", 0.0)
            emp_ot_h += sum_res.get("overtime_hours", 0.0)

            sec_flags = sum_res.get("secondary_flags", [])
            if "core_missed" in sec_flags or sum_res.get("status") == "Core Hours Missed":
                core_missed_count += 1
            if sum_res.get("status") in ("late", "late_checkin"):
                late_days += 1
            if "flagged_event_pending" in sec_flags or "flagged" in sec_flags:
                flagged_count += 1

        total_days = len(all_dates)

        payroll_rows.append({
            "employee_id": eid,
            "employee_code": emp["employee_code"],
            "name": emp["name"],
            "department": emp["department_name"] or "General",
            "site": emp["site_name"] or "Headquarters",
            "policy_name": policy_name,
            "shift_type": emp_shift_type,
            "required_hours": round(emp_req_h, 2),
            "worked_hours": round(emp_worked_h, 2),
            "short_hours": round(emp_short_h, 2),
            "overtime_hours": round(emp_ot_h, 2),
            "core_missed_days": core_missed_count,
            "late_count": late_days,
            "flagged_count": flagged_count,
            "active_days": total_days
        })

    conn.close()

    admin_id = session.get("admin_id")
    log_audit(admin_id, "admin", "EXPORT_PAYROLL", "payroll", None, f"Range: {from_date} to {to_date}")

    output = io.StringIO()
    output.write("Employee ID,Employee Code,Full Name,Department,Site,Policy Name,Shift Type,Required Hours,Worked Hours,Short Hours,Overtime Hours,Core Missed Days,Late Days,Flagged Events,Total Work Days\n")
    for r in payroll_rows:
        output.write(f'{r["employee_id"]},"{r["employee_code"]}","{r["name"]}","{r["department"]}","{r["site"]}","{r["policy_name"]}",{r["shift_type"]},{r["required_hours"]},{r["worked_hours"]},{r["short_hours"]},{r["overtime_hours"]},{r["core_missed_days"]},{r["late_count"]},{r["flagged_count"]},{r["active_days"]}\n')

    mem = io.BytesIO()
    mem.write(output.getvalue().encode("utf-8"))
    mem.seek(0)
    filename = f"payroll_attendance_export_{from_date}_to_{to_date}.csv"
    return send_file(mem, as_attachment=True, download_name=filename, mimetype="text/csv")

# ========================================================
# 8. Audit Logs View
# ========================================================
@admin_bp.route("/audit-logs")
@login_required_admin
def audit_logs():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        SELECT * FROM audit_logs
        ORDER BY created_at DESC
        LIMIT 250
    """)
    logs = [dict(r) for r in c.fetchall()]
    conn.close()

    for l in logs:
        l["created_display"] = format_local_timestamp(l["created_at"], include_year=True)

    return render_template("admin/audit_logs.html", logs=logs)

# ========================================================
# 9. Settings
# ========================================================
@admin_bp.route("/settings", methods=["GET", "POST"])
@login_required_admin
def settings():
    admin_id = session.get("admin_id")
    if request.method == "POST":
        match_th = request.form.get("match_threshold", "0.48")
        review_th = request.form.get("review_threshold", "0.44")
        cooldown = request.form.get("duplicate_cooldown_seconds", "300")
        geocoding_prov = request.form.get("geocoding_provider", "nominatim")

        set_setting("match_threshold", match_th)
        set_setting("review_threshold", review_th)
        set_setting("duplicate_cooldown_seconds", cooldown)
        set_setting("geocoding_provider", geocoding_prov)

        # Handle Attendance Method Policy form data if submitted
        global_pol = request.form.get("global_attendance_policy")
        if global_pol in VALID_ATTENDANCE_POLICIES:
            site_overrides = {}
            for k, v in request.form.items():
                if k.startswith("site_policy_"):
                    s_id = k.replace("site_policy_", "")
                    site_overrides[s_id] = v
            update_attendance_policies(global_pol, site_overrides, actor_id=admin_id, actor_role="admin")

        flash("Recognition engine settings and attendance method policies updated successfully.", "success")

    match_th = get_setting("match_threshold", str(Config.MATCH_THRESHOLD))
    review_th = get_setting("review_threshold", str(Config.REVIEW_THRESHOLD))
    cooldown = get_setting("duplicate_cooldown_seconds", str(Config.DUPLICATE_COOLDOWN_SECONDS))
    geocoding_prov = get_setting("geocoding_provider", Config.GEOCODING_PROVIDER)
    global_attendance_policy = get_setting("global_attendance_policy", "both")
    sites_policies = get_all_sites_attendance_policies()

    return render_template(
        "admin/settings.html",
        match_threshold=match_th,
        review_threshold=review_th,
        cooldown=cooldown,
        geocoding_provider=geocoding_prov,
        global_attendance_policy=global_attendance_policy,
        sites_policies=sites_policies
    )

@admin_bp.route("/api/admin/settings/attendance-policy", methods=["GET", "POST"])
@login_required_admin
def api_attendance_policy():
    admin_id = session.get("admin_id")
    if request.method == "POST":
        data = request.get_json(silent=True) or request.form or {}
        global_pol = data.get("global_attendance_policy") or "both"
        site_overrides = data.get("site_overrides") or {}

        # Handle form-encoded format if not JSON dict
        if not site_overrides:
            for k, v in data.items():
                if k.startswith("site_policy_"):
                    s_id = k.replace("site_policy_", "")
                    site_overrides[s_id] = v

        if global_pol not in VALID_ATTENDANCE_POLICIES:
            return jsonify({"success": False, "error": f"Invalid policy: '{global_pol}'"}), 400

        res = update_attendance_policies(global_pol, site_overrides, actor_id=admin_id, actor_role="admin")
        updated_sites = get_all_sites_attendance_policies()
        return jsonify({
            "success": True,
            "message": "Attendance method policies updated successfully. Changes take effect immediately.",
            "global_policy": global_pol,
            "sites": updated_sites,
            "changes": res
        })

    # GET
    return jsonify({
        "success": True,
        "global_attendance_policy": get_setting("global_attendance_policy", "both"),
        "sites": get_all_sites_attendance_policies()
    })

# Face upload endpoint
@admin_bp.route("/upload-face", methods=["POST"])
@login_required_admin
def upload_face():
    student_id = request.form.get("student_id") or request.form.get("employee_id")
    if not student_id:
        return jsonify({"error": "employee_id is required"}), 400

    files = request.files.getlist("images[]")
    if not files and "image" in request.files:
        files = [request.files["image"]]

    if not files:
        return jsonify({"error": "No face photos received"}), 400

    folder = os.path.join(Config.DATASET_DIR, str(student_id))
    os.makedirs(folder, exist_ok=True)

    saved = 0
    embeddings_generated = 0
    errors = []

    for f in files:
        try:
            content = f.read()
            fname = f"{time.time():.6f}_{saved}.jpg"
            path = os.path.join(folder, fname)
            with open(path, "wb") as out:
                out.write(content)
            saved += 1

            success, err = enroll_student_photo(int(student_id), content)
            if success:
                embeddings_generated += 1
            elif err:
                errors.append(err)
        except Exception as e:
            errors.append(str(e))

    load_embeddings_cache(force_reload=True)

    if embeddings_generated > 0:
        return jsonify({
            "success": True,
            "saved": saved,
            "embeddings_generated": embeddings_generated,
            "message": f"Enrolled successfully! Generated {embeddings_generated} deep face template(s)."
        })
    else:
        return jsonify({
            "success": False,
            "saved": saved,
            "error": "Face detection failed: " + (errors[0] if errors else "No clear face found")
        }), 400

@admin_bp.route("/attendance/<int:record_id>")
@login_required_admin
def api_attendance_detail(record_id):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        SELECT a.*, e.name, e.employee_code, d.name AS department_name, s.name AS site_name
        FROM attendance_events a
        LEFT JOIN employees e ON a.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN sites s ON a.site_id = s.id
        WHERE a.id = ?
    """, (record_id,))
    row = c.fetchone()
    if not row:
        c.execute("""
            SELECT a.*, s.roll AS employee_code, s.class AS department_name, 'Headquarters' AS site_name
            FROM attendance a
            LEFT JOIN students s ON a.student_id = s.id
            WHERE a.id = ?
        """, (record_id,))
        row = c.fetchone()

    if not row:
        conn.close()
        return jsonify({"error": "Record not found"}), 404

    c.execute("""
        SELECT stage, status, message, created_at
        FROM pipeline_logs
        WHERE attendance_id = ?
        ORDER BY id ASC
    """, (record_id,))
    stages = [dict(s) for s in c.fetchall()]
    conn.close()

    data = dict(row)
    eid = data.get("employee_id") or data.get("student_id")

    # Resolve Employee Code
    emp_code = data.get("employee_code") or data.get("roll")
    if not emp_code and eid:
        conn = get_db_connection()
        erow = conn.execute("SELECT employee_code FROM employees WHERE id = ?", (eid,)).fetchone()
        if erow and erow[0]:
            emp_code = erow[0]
        else:
            srow = conn.execute("SELECT roll FROM students WHERE id = ?", (eid,)).fetchone()
            if srow and srow[0]:
                emp_code = srow[0]
        conn.close()

    if not emp_code and eid:
        emp_code = f"EMP-{eid:04d}"

    data["employee_code"] = emp_code or "—"
    data["roll"] = data["employee_code"]
    data["employee_id"] = eid
    data["student_id"] = eid
    data["profile_photo_url"] = f"/employee_image/{eid}" if eid else None

    # Resolve Geotagged Proof Photo with fuzzy second-stamp fallback
    photo_rel = data.get("geotagged_photo_path")
    if photo_rel:
        full_path = os.path.join(Config.BASE_DIR, photo_rel)
        if not os.path.isfile(full_path):
            base_fname = os.path.basename(photo_rel)
            import difflib
            candidates = [f for f in os.listdir(Config.ATTENDANCE_PHOTOS_DIR) if f.startswith(f"{eid}_")]
            if candidates:
                closest = difflib.get_close_matches(base_fname, candidates, n=1, cutoff=0.5)
                if closest:
                    data["geotagged_photo_path"] = f"attendance_photos/{closest[0]}"
                else:
                    candidates.sort(key=lambda f: os.path.getmtime(os.path.join(Config.ATTENDANCE_PHOTOS_DIR, f)), reverse=True)
                    data["geotagged_photo_path"] = f"attendance_photos/{candidates[0]}"

    data["photo_url"] = f"/{data['geotagged_photo_path']}" if data.get("geotagged_photo_path") else None
    data["stages"] = stages
    data["time_display"] = format_local_timestamp(data["timestamp"], include_year=True)
    data["confidence_pct"] = round((data.get("confidence") or 0.0) * 100, 1)

    pol = get_effective_work_policy(eid, date=data["timestamp"][:10])
    data["is_flexible"] = (pol.get("shift_type") == "flexible")
    req_h = pol.get("required_daily_hours", 8.0)
    req_str = f"{int(req_h)}h" if req_h == int(req_h) else f"{req_h}h"
    data["required_daily_hours"] = req_h
    data["policy_name"] = pol.get("name", "Flexible 8h")
    data["policy_display"] = pol.get("duration_display", f"Flexible · {req_str}/day")
    data["display_string"] = pol.get("display_string", f"Flexible · {req_str}/day")

    accept = request.headers.get("Accept", "")
    if "application/json" in accept or request.is_json or request.args.get("format") == "json":
        return jsonify(data)

    return render_template("admin/attendance_detail.html", record=data)
