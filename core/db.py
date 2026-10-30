import os
import sqlite3
import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from config import Config, get_utc_iso

def get_db_connection(db_path=None):
    """Returns a SQLite connection with Row factory and WAL mode enabled."""
    path = db_path or Config.DB_PATH
    conn = sqlite3.connect(path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
    except Exception:
        pass
    return conn

def init_db(db_path=None):
    """
    Initializes database schema and executes migration-safe ALTER TABLE
    statements for the enterprise workforce domain model.
    """
    conn = get_db_connection(db_path)
    c = conn.cursor()
    now = get_utc_iso()
    
    # 1. Base legacy students table (maintained for backward compatibility)
    c.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            roll TEXT,
            class TEXT,
            section TEXT,
            reg_no TEXT,
            email TEXT,
            password_hash TEXT,
            role TEXT DEFAULT 'employee',
            department_id INTEGER,
            site_id INTEGER,
            shift_id INTEGER,
            manager_id INTEGER,
            active INTEGER DEFAULT 1,
            biometric_consent INTEGER DEFAULT 0,
            biometric_consent_timestamp TEXT,
            created_at TEXT NOT NULL
        )
    """)
    
    # Migration safety for students table
    c.execute("PRAGMA table_info(students)")
    existing_student_cols = [row["name"] for row in c.fetchall()]
    student_col_defs = [
        ("email", "TEXT"),
        ("password_hash", "TEXT"),
        ("role", "TEXT DEFAULT 'employee'"),
        ("department_id", "INTEGER"),
        ("site_id", "INTEGER"),
        ("shift_id", "INTEGER"),
        ("manager_id", "INTEGER"),
        ("active", "INTEGER DEFAULT 1"),
        ("biometric_consent", "INTEGER DEFAULT 0"),
        ("biometric_consent_timestamp", "TEXT"),
        ("previous_shift_id", "INTEGER DEFAULT NULL"),
        ("required_daily_hours", "REAL DEFAULT NULL"),
        ("required_weekly_hours", "REAL DEFAULT NULL")
    ]
    for col_name, col_type in student_col_defs:
        if col_name not in existing_student_cols:
            try:
                c.execute(f"ALTER TABLE students ADD COLUMN {col_name} {col_type}")
            except Exception:
                pass

    # 2. Dedicated admins table
    c.execute("""
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            email TEXT,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    
    # 3. Base attendance table (extended with enterprise fields)
    c.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            name TEXT,
            timestamp TEXT NOT NULL,
            latitude REAL,
            longitude REAL,
            address TEXT,
            confidence REAL,
            liveness_passed INTEGER DEFAULT 1,
            geotagged_photo_path TEXT,
            status TEXT DEFAULT 'success',
            reviewed_by_admin_id INTEGER,
            review_note TEXT,
            event_type TEXT DEFAULT 'check_in',
            site_id INTEGER,
            distance_from_site_meters REAL,
            within_geofence INTEGER DEFAULT 1,
            flagged INTEGER DEFAULT 0,
            flag_reason TEXT,
            attendance_method TEXT DEFAULT 'face'
        )
    """)
    
    c.execute("PRAGMA table_info(attendance)")
    existing_att_cols = [row["name"] for row in c.fetchall()]
    att_col_defs = [
        ("latitude", "REAL"),
        ("longitude", "REAL"),
        ("address", "TEXT"),
        ("confidence", "REAL"),
        ("liveness_passed", "INTEGER DEFAULT 1"),
        ("geotagged_photo_path", "TEXT"),
        ("status", "TEXT DEFAULT 'success'"),
        ("reviewed_by_admin_id", "INTEGER"),
        ("review_note", "TEXT"),
        ("event_type", "TEXT DEFAULT 'check_in'"),
        ("site_id", "INTEGER"),
        ("distance_from_site_meters", "REAL"),
        ("within_geofence", "INTEGER DEFAULT 1"),
        ("flagged", "INTEGER DEFAULT 0"),
        ("flag_reason", "TEXT"),
        ("attendance_method", "TEXT DEFAULT 'face'"),
        ("accuracy_meters", "REAL")
    ]
    for col_name, col_type in att_col_defs:
        if col_name not in existing_att_cols:
            try:
                c.execute(f"ALTER TABLE attendance ADD COLUMN {col_name} {col_type}")
            except Exception:
                pass
            
    # 4. Embeddings table (128-d deep ResNet vectors)
    c.execute("""
        CREATE TABLE IF NOT EXISTS embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            embedding TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        )
    """)
    
    # 5. Pipeline logs table
    c.execute("""
        CREATE TABLE IF NOT EXISTS pipeline_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            attendance_id INTEGER,
            run_id TEXT,
            stage TEXT NOT NULL,
            status TEXT NOT NULL,
            message TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE
        )
    """)
    c.execute("PRAGMA table_info(pipeline_logs)")
    pcols = [row["name"] for row in c.fetchall()]
    if "run_id" not in pcols:
        c.execute("ALTER TABLE pipeline_logs ADD COLUMN run_id TEXT")
    
    # 6. Sites Table (Office locations, branches, and remote policies)
    c.execute("""
        CREATE TABLE IF NOT EXISTS sites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            geofence_radius_meters REAL DEFAULT 200.0,
            geofencing_enabled INTEGER DEFAULT 1,
            attendance_policy TEXT DEFAULT NULL,
            created_at TEXT NOT NULL
        )
    """)

    c.execute("PRAGMA table_info(sites)")
    existing_site_cols = [row["name"] for row in c.fetchall()]
    if "attendance_policy" not in existing_site_cols:
        try:
            c.execute("ALTER TABLE sites ADD COLUMN attendance_policy TEXT DEFAULT NULL")
        except Exception:
            pass
    if "timezone" not in existing_site_cols:
        try:
            c.execute("ALTER TABLE sites ADD COLUMN timezone TEXT DEFAULT 'Asia/Kolkata'")
        except Exception:
            pass
    if "shift_id" not in existing_site_cols:
        try:
            c.execute("ALTER TABLE sites ADD COLUMN shift_id INTEGER DEFAULT NULL")
        except Exception:
            pass

    # 7. Shifts Table (Industrial shifts)
    c.execute("""
        CREATE TABLE IF NOT EXISTS shifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            grace_period_minutes INTEGER DEFAULT 15,
            break_duration_minutes INTEGER DEFAULT 60,
            shift_type TEXT DEFAULT 'fixed',
            core_start TEXT DEFAULT NULL,
            core_end TEXT DEFAULT NULL,
            required_daily_hours REAL DEFAULT 8.0,
            required_weekly_hours REAL DEFAULT NULL,
            enforcement_mode TEXT DEFAULT 'daily',
            allowed_window_start TEXT DEFAULT NULL,
            allowed_window_end TEXT DEFAULT NULL,
            unpaid_break_minutes INTEGER DEFAULT 0,
            core_hours_enforced INTEGER DEFAULT 1,
            core_grace_minutes INTEGER DEFAULT 15,
            overtime_threshold_minutes INTEGER DEFAULT 0,
            half_day_threshold_hours REAL DEFAULT 4.0,
            weekly_off_days TEXT DEFAULT 'Sat,Sun',
            week_start_day TEXT DEFAULT 'Monday',
            count_flagged_events_policy TEXT DEFAULT 'count_pending',
            created_at TEXT NOT NULL
        )
    """)

    c.execute("PRAGMA table_info(shifts)")
    existing_shift_cols = [row["name"] for row in c.fetchall()]
    shift_col_defs = [
        ("shift_type", "TEXT DEFAULT 'fixed'"),
        ("core_start", "TEXT DEFAULT NULL"),
        ("core_end", "TEXT DEFAULT NULL"),
        ("required_daily_hours", "REAL DEFAULT 8.0"),
        ("required_weekly_hours", "REAL DEFAULT NULL"),
        ("enforcement_mode", "TEXT DEFAULT 'daily'"),
        ("allowed_window_start", "TEXT DEFAULT NULL"),
        ("allowed_window_end", "TEXT DEFAULT NULL"),
        ("unpaid_break_minutes", "INTEGER DEFAULT 0"),
        ("core_hours_enforced", "INTEGER DEFAULT 1"),
        ("core_grace_minutes", "INTEGER DEFAULT 15"),
        ("overtime_threshold_minutes", "INTEGER DEFAULT 0"),
        ("half_day_threshold_hours", "REAL DEFAULT 4.0"),
        ("weekly_off_days", "TEXT DEFAULT 'Sat,Sun'"),
        ("week_start_day", "TEXT DEFAULT 'Monday'"),
        ("count_flagged_events_policy", "TEXT DEFAULT 'count_pending'"),
        ("is_archived", "INTEGER DEFAULT 0")
    ]
    for col_name, col_type in shift_col_defs:
        if col_name not in existing_shift_cols:
            try:
                c.execute(f"ALTER TABLE shifts ADD COLUMN {col_name} {col_type}")
            except Exception:
                pass

    # Ensure existing shifts default to 'fixed' and is_archived is set
    try:
        c.execute("UPDATE shifts SET shift_type = 'fixed' WHERE shift_type IS NULL")
        c.execute("UPDATE shifts SET is_archived = 0 WHERE is_archived IS NULL")
    except Exception:
        pass

    # 8. Departments Table
    c.execute("""
        CREATE TABLE IF NOT EXISTS departments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            manager_id INTEGER,
            shift_id INTEGER DEFAULT NULL,
            created_at TEXT NOT NULL
        )
    """)
    c.execute("PRAGMA table_info(departments)")
    existing_dept_cols = [row["name"] for row in c.fetchall()]
    if "shift_id" not in existing_dept_cols:
        try:
            c.execute("ALTER TABLE departments ADD COLUMN shift_id INTEGER DEFAULT NULL")
        except Exception:
            pass

    # Holidays Calendar Table
    c.execute("""
        CREATE TABLE IF NOT EXISTS holidays (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            holiday_date TEXT NOT NULL UNIQUE,
            description TEXT,
            created_at TEXT NOT NULL
        )
    """)

    # Daily Attendance Summary Table
    c.execute("""
        CREATE TABLE IF NOT EXISTS daily_attendance_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            shift_id INTEGER,
            shift_type TEXT NOT NULL DEFAULT 'fixed',
            policy_snapshot TEXT,
            worked_minutes REAL DEFAULT 0.0,
            required_minutes REAL DEFAULT 0.0,
            short_minutes REAL DEFAULT 0.0,
            overtime_minutes REAL DEFAULT 0.0,
            status TEXT NOT NULL,
            flags TEXT,
            computed_at TEXT NOT NULL,
            UNIQUE(employee_id, date),
            FOREIGN KEY (employee_id) REFERENCES employees(id),
            FOREIGN KEY (shift_id) REFERENCES shifts(id)
        )
    """)

    # 9. Employees Table (Full enterprise domain model)
    c.execute("""
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            employee_code TEXT UNIQUE NOT NULL,
            department_id INTEGER,
            site_id INTEGER,
            shift_id INTEGER,
            manager_id INTEGER,
            role TEXT DEFAULT 'employee',
            email TEXT UNIQUE,
            password_hash TEXT NOT NULL,
            active INTEGER DEFAULT 1,
            biometric_consent INTEGER DEFAULT 0,
            biometric_consent_timestamp TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (department_id) REFERENCES departments(id),
            FOREIGN KEY (site_id) REFERENCES sites(id),
            FOREIGN KEY (shift_id) REFERENCES shifts(id),
            FOREIGN KEY (manager_id) REFERENCES employees(id)
        )
    """)

    c.execute("PRAGMA table_info(employees)")
    existing_emp_cols = [row["name"] for row in c.fetchall()]
    emp_col_defs = [
        ("previous_shift_id", "INTEGER DEFAULT NULL"),
        ("required_daily_hours", "REAL DEFAULT NULL"),
        ("required_weekly_hours", "REAL DEFAULT NULL")
    ]
    for col_name, col_type in emp_col_defs:
        if col_name not in existing_emp_cols:
            try:
                c.execute(f"ALTER TABLE employees ADD COLUMN {col_name} {col_type}")
            except Exception:
                pass

    # 10. Attendance Events Table (Paired check-in and check-out)
    c.execute("""
        CREATE TABLE IF NOT EXISTS attendance_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            latitude REAL,
            longitude REAL,
            address TEXT,
            site_id INTEGER,
            distance_from_site_meters REAL,
            within_geofence INTEGER DEFAULT 1,
            confidence REAL,
            liveness_passed INTEGER DEFAULT 1,
            geotagged_photo_path TEXT,
            status TEXT DEFAULT 'on_time',
            flagged INTEGER DEFAULT 0,
            flag_reason TEXT,
            reviewed_by INTEGER,
            review_note TEXT,
            attendance_method TEXT DEFAULT 'face',
            created_at TEXT NOT NULL,
            FOREIGN KEY (employee_id) REFERENCES employees(id),
            FOREIGN KEY (site_id) REFERENCES sites(id)
        )
    """)

    c.execute("PRAGMA table_info(attendance_events)")
    existing_event_cols = [row["name"] for row in c.fetchall()]
    if "attendance_method" not in existing_event_cols:
        try:
            c.execute("ALTER TABLE attendance_events ADD COLUMN attendance_method TEXT DEFAULT 'face'")
        except Exception:
            pass
    if "accuracy_meters" not in existing_event_cols:
        try:
            c.execute("ALTER TABLE attendance_events ADD COLUMN accuracy_meters REAL")
        except Exception:
            pass

    # Geocode cache table for persistent reverse geocoding
    c.execute("""
        CREATE TABLE IF NOT EXISTS geocode_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cache_key TEXT UNIQUE NOT NULL,
            address TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    try:
        c.execute("CREATE INDEX IF NOT EXISTS idx_geocode_cache_key ON geocode_cache(cache_key)")
    except Exception:
        pass

    # 11. Correction Requests Table
    c.execute("""
        CREATE TABLE IF NOT EXISTS correction_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            attendance_date TEXT NOT NULL,
            reason TEXT NOT NULL,
            requested_change TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            reviewed_by INTEGER,
            review_note TEXT,
            reviewed_at TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (employee_id) REFERENCES employees(id),
            FOREIGN KEY (reviewed_by) REFERENCES employees(id)
        )
    """)

    # 12. Audit Logs Table
    c.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_id INTEGER,
            actor_role TEXT,
            action TEXT NOT NULL,
            resource_type TEXT NOT NULL,
            resource_id TEXT,
            details TEXT,
            created_at TEXT NOT NULL
        )
    """)

    # 13. Settings table
    c.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    
    default_settings = {
        "match_threshold": str(Config.MATCH_THRESHOLD),
        "review_threshold": str(Config.REVIEW_THRESHOLD),
        "duplicate_cooldown_seconds": str(Config.DUPLICATE_COOLDOWN_SECONDS),
        "geocoding_provider": Config.GEOCODING_PROVIDER,
        "global_attendance_policy": "both"
    }
    for k, v in default_settings.items():
        c.execute("""
            INSERT OR IGNORE INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
        """, (k, v, now))
        
    # 14. Seed initial admin account if none exists
    c.execute("SELECT COUNT(*) FROM admins")
    if c.fetchone()[0] == 0:
        admin_hash = generate_password_hash(Config.ADMIN_PASSWORD)
        c.execute("""
            INSERT INTO admins (name, username, email, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, ("System Administrator", Config.ADMIN_USERNAME, "admin@geoface.edu", admin_hash, now))

    # 15. Seed default Site if none exists
    c.execute("SELECT COUNT(*) FROM sites")
    if c.fetchone()[0] == 0:
        c.execute("""
            INSERT INTO sites (name, address, latitude, longitude, geofence_radius_meters, geofencing_enabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, ("Tech Park Headquarters (Mumbai)", "Bandra Kurla Complex, Bandra East, Mumbai, Maharashtra 400051", 19.0657, 72.8687, 200.0, 1, now))
        c.execute("""
            INSERT INTO sites (name, address, latitude, longitude, geofence_radius_meters, geofencing_enabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, ("Bengaluru Tech Hub", "Electronic City Phase 1, Bengaluru, Karnataka 560100", 12.8452, 77.6602, 250.0, 1, now))
        c.execute("""
            INSERT INTO sites (name, address, latitude, longitude, geofence_radius_meters, geofencing_enabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, ("Remote / Field Operations (No Geofence)", "Pan-India Field Staff / Sales Operations", 28.6139, 77.2090, 0.0, 0, now))

    # 16. Seed default Shifts if none exists
    c.execute("SELECT COUNT(*) FROM shifts")
    if c.fetchone()[0] == 0:
        c.execute("""
            INSERT INTO shifts (name, start_time, end_time, grace_period_minutes, break_duration_minutes, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, ("General Shift (09:00 - 18:00)", "09:00", "18:00", 15, 60, now))
        c.execute("""
            INSERT INTO shifts (name, start_time, end_time, grace_period_minutes, break_duration_minutes, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, ("Early Morning Shift (07:00 - 15:30)", "07:00", "15:30", 10, 45, now))
        c.execute("""
            INSERT INTO shifts (name, start_time, end_time, grace_period_minutes, break_duration_minutes, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, ("Evening Shift (13:00 - 22:00)", "13:00", "22:00", 15, 60, now))
        c.execute("""
            INSERT INTO shifts (name, start_time, end_time, grace_period_minutes, break_duration_minutes, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, ("Flexible Shift (09:00 - 18:00, 30m grace)", "09:00", "18:00", 30, 60, now))

    # 16b. Seed and Migrate to Company-Wide Flexible Shift Policies
    try:
        # Fix misleading names on legacy fixed schedules
        c.execute("""
            UPDATE shifts 
            SET name = 'Legacy Fixed 09:00-18:00 (30m grace)', is_archived = 1
            WHERE name = 'Flexible Shift (09:00 - 18:00, 30m grace)' AND (shift_type = 'fixed' OR shift_type IS NULL)
        """)
        c.execute("""
            UPDATE shifts 
            SET name = 'Legacy Fixed Field Shift (09:30 - 18:30)', is_archived = 1
            WHERE name = 'Flexible Field Shift' AND (shift_type = 'fixed' OR shift_type IS NULL)
        """)
        # Archive remaining legacy fixed shifts
        c.execute("UPDATE shifts SET is_archived = 1 WHERE shift_type = 'fixed' AND (is_archived = 0 OR is_archived IS NULL)")

        # Seed Flexible 8h (Default company policy)
        c.execute("SELECT id FROM shifts WHERE name = 'Flexible 8h'")
        f8_row = c.fetchone()
        if not f8_row:
            c.execute("""
                INSERT INTO shifts (
                    name, shift_type, start_time, end_time,
                    required_daily_hours, required_weekly_hours,
                    core_start, core_end, core_hours_enforced,
                    unpaid_break_minutes, break_duration_minutes,
                    core_grace_minutes, overtime_threshold_minutes,
                    half_day_threshold_hours, weekly_off_days, week_start_day,
                    enforcement_mode, allowed_window_start, allowed_window_end,
                    count_flagged_events_policy, is_archived, created_at
                ) VALUES (
                    'Flexible 8h', 'flexible', '09:00', '18:00',
                    8.0, 40.0,
                    '11:00', '16:00', 1,
                    60, 60,
                    15, 30,
                    4.0, 'Sat,Sun', 'Monday',
                    'daily', '07:00', '22:00',
                    'count_pending', 0, ?
                )
            """, (now,))
            flex8_id = c.lastrowid
        else:
            flex8_id = f8_row["id"]

        # Seed Flexible 6h
        c.execute("SELECT id FROM shifts WHERE name = 'Flexible 6h'")
        if not c.fetchone():
            c.execute("""
                INSERT INTO shifts (
                    name, shift_type, start_time, end_time,
                    required_daily_hours, required_weekly_hours,
                    core_start, core_end, core_hours_enforced,
                    unpaid_break_minutes, break_duration_minutes,
                    core_grace_minutes, overtime_threshold_minutes,
                    half_day_threshold_hours, weekly_off_days, week_start_day,
                    enforcement_mode, allowed_window_start, allowed_window_end,
                    count_flagged_events_policy, is_archived, created_at
                ) VALUES (
                    'Flexible 6h', 'flexible', '10:00', '17:00',
                    6.0, 30.0,
                    '11:00', '15:00', 1,
                    60, 60,
                    15, 30,
                    3.0, 'Sat,Sun', 'Monday',
                    'daily', '08:00', '20:00',
                    'count_pending', 0, ?
                )
            """, (now,))

        # Seed Flexible 9h
        c.execute("SELECT id FROM shifts WHERE name = 'Flexible 9h'")
        if not c.fetchone():
            c.execute("""
                INSERT INTO shifts (
                    name, shift_type, start_time, end_time,
                    required_daily_hours, required_weekly_hours,
                    core_start, core_end, core_hours_enforced,
                    unpaid_break_minutes, break_duration_minutes,
                    core_grace_minutes, overtime_threshold_minutes,
                    half_day_threshold_hours, weekly_off_days, week_start_day,
                    enforcement_mode, allowed_window_start, allowed_window_end,
                    count_flagged_events_policy, is_archived, created_at
                ) VALUES (
                    'Flexible 9h', 'flexible', '09:00', '19:00',
                    9.0, 45.0,
                    '11:00', '16:00', 1,
                    60, 60,
                    15, 30,
                    4.5, 'Sat,Sun', 'Monday',
                    'daily', '07:00', '22:00',
                    'count_pending', 0, ?
                )
            """, (now,))

        # Set default shift policy setting
        c.execute("""
            INSERT INTO settings (key, value, updated_at)
            VALUES ('company_default_shift_id', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
        """, (str(flex8_id), now))

        # Reversible shift assignment migration:
        # Step A: Preserve previous_shift_id before reassignment
        c.execute("""
            UPDATE employees
            SET previous_shift_id = shift_id
            WHERE previous_shift_id IS NULL AND shift_id IS NOT NULL
        """)
        # Step B: Reassign active employees to company default flexible policy
        c.execute("""
            UPDATE employees
            SET shift_id = ?
            WHERE active = 1 AND (shift_id IS NULL OR shift_id NOT IN (SELECT id FROM shifts WHERE shift_type = 'flexible'))
        """, (flex8_id,))

        c.execute("""
            UPDATE students
            SET previous_shift_id = COALESCE(previous_shift_id, shift_id),
                shift_id = ?
            WHERE active = 1 AND (shift_id IS NULL OR shift_id NOT IN (SELECT id FROM shifts WHERE shift_type = 'flexible'))
        """, (flex8_id,))

        # Audit log for migration
        c.execute("SELECT COUNT(*) FROM audit_logs WHERE action = 'MIGRATE_FLEXIBLE_WORK_POLICY'")
        if c.fetchone()[0] == 0:
            c.execute("""
                INSERT INTO audit_logs (actor_id, actor_role, action, resource_type, resource_id, details, created_at)
                VALUES (NULL, 'system', 'MIGRATE_FLEXIBLE_WORK_POLICY', 'shifts', ?, 'Migrated workforce to default Flexible 8h policy with reversible previous_shift_id', ?)
            """, (str(flex8_id), now))
    except Exception:
        pass

    # 17. Seed default Departments if none exists
    c.execute("SELECT COUNT(*) FROM departments")
    if c.fetchone()[0] == 0:
        c.execute("""
            INSERT INTO departments (name, manager_id, created_at)
            VALUES (?, ?, ?)
        """, ("Engineering & Architecture", None, now))
        c.execute("""
            INSERT INTO departments (name, manager_id, created_at)
            VALUES (?, ?, ?)
        """, ("Operations & Logistics", None, now))
        c.execute("""
            INSERT INTO departments (name, manager_id, created_at)
            VALUES (?, ?, ?)
        """, ("Field Sales & Services", None, now))

    # 18. Synchronize existing students into employees table if employees table is empty
    c.execute("SELECT COUNT(*) FROM employees")
    if c.fetchone()[0] == 0:
        c.execute("SELECT * FROM students")
        existing_students = c.fetchall()
        for s in existing_students:
            s_dict = dict(s)
            emp_code = s_dict.get("roll") or f"EMP-{s_dict['id']:04d}"
            pw = s_dict.get("password_hash") or generate_password_hash("employee123")
            role_val = s_dict.get("role") or "employee"
            if role_val == "user": role_val = "employee"
            try:
                c.execute("""
                    INSERT OR IGNORE INTO employees (
                        id, name, employee_code, department_id, site_id, shift_id,
                        manager_id, role, email, password_hash, active,
                        biometric_consent, biometric_consent_timestamp, created_at
                    ) VALUES (?, ?, ?, 1, 1, 1, NULL, ?, ?, ?, 1, 1, ?, ?)
                """, (
                    s_dict["id"],
                    s_dict["name"],
                    emp_code,
                    role_val,
                    s_dict.get("email") or f"emp{s_dict['id']}@enterprise.corp",
                    pw,
                    now,
                    s_dict.get("created_at") or now
                ))
            except Exception:
                pass

    # Ensure all employees & students have a default password and consent
    default_emp_hash = generate_password_hash("employee123")
    c.execute("""
        UPDATE students
        SET password_hash = COALESCE(password_hash, ?),
            role = CASE WHEN role = 'user' THEN 'employee' ELSE COALESCE(role, 'employee') END,
            active = COALESCE(active, 1),
            biometric_consent = COALESCE(biometric_consent, 1),
            biometric_consent_timestamp = COALESCE(biometric_consent_timestamp, ?)
        WHERE password_hash IS NULL OR password_hash = '' OR biometric_consent IS NULL
    """, (default_emp_hash, now))

    c.execute("""
        UPDATE employees
        SET biometric_consent = 1,
            biometric_consent_timestamp = COALESCE(biometric_consent_timestamp, ?)
        WHERE biometric_consent IS NULL OR biometric_consent = 0
    """, (now,))

    # Indices
    c.execute("CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance(timestamp)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_attendance_student_time ON attendance(student_id, timestamp)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_embeddings_student_id ON embeddings(student_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_pipeline_logs_attendance_id ON pipeline_logs(attendance_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_employees_site ON employees(site_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_att_events_emp_time ON attendance_events(employee_id, timestamp)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_att_events_flagged ON attendance_events(flagged)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_corr_reqs_emp ON correction_requests(employee_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_corr_reqs_status ON correction_requests(status)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_daily_summary_emp_date ON daily_attendance_summary(employee_id, date)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_daily_summary_date ON daily_attendance_summary(date)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(holiday_date)")
    
    conn.commit()
    conn.close()

def log_audit(actor_id, actor_role, action, resource_type, resource_id=None, details=None, db_conn=None):
    """
    Inserts a record into the audit_logs table for enterprise audit trail.
    """
    close_at_end = False
    if db_conn is None:
        db_conn = get_db_connection()
        close_at_end = True
    try:
        now = get_utc_iso()
        db_conn.execute("""
            INSERT INTO audit_logs (actor_id, actor_role, action, resource_type, resource_id, details, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (actor_id, actor_role, action, resource_type, str(resource_id) if resource_id else None, str(details) if details else None, now))
        db_conn.commit()
    except Exception:
        pass
    finally:
        if close_at_end:
            db_conn.close()

def get_setting(key, default=None):
    """Retrieve runtime setting value from database or fallback."""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT value FROM settings WHERE key=?", (key,))
    row = c.fetchone()
    conn.close()
    if row:
        return row["value"]
    return default

def set_setting(key, value):
    """Update runtime setting value."""
    conn = get_db_connection()
    c = conn.cursor()
    now = get_utc_iso()
    c.execute("""
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    """, (key, str(value), now))
    conn.commit()
    conn.close()

# ========================================================
# Attendance Method Policy Helpers (Global & Per-Site)
# ========================================================
VALID_ATTENDANCE_POLICIES = ("face_only", "manual_only", "both")

def get_effective_attendance_policy(site_id=None):
    """
    Resolves the effective attendance policy for a given site:
    - If site_id is provided and the site has an explicit override ('face_only', 'manual_only', 'both'),
      that override is returned.
    - Otherwise (or if site_id is None / site not found / override is NULL or 'inherit'),
      the company-wide global default policy is returned (defaulting to 'both').
    Returns one of: 'face_only', 'manual_only', 'both'.
    """
    global_policy = get_setting("global_attendance_policy", "both")
    if global_policy not in VALID_ATTENDANCE_POLICIES:
        global_policy = "both"

    if site_id is not None:
        try:
            conn = get_db_connection()
            c = conn.cursor()
            c.execute("SELECT attendance_policy FROM sites WHERE id = ?", (site_id,))
            row = c.fetchone()
            conn.close()
            if row and row["attendance_policy"] in VALID_ATTENDANCE_POLICIES:
                return row["attendance_policy"]
        except Exception:
            pass

    return global_policy

def get_site_attendance_policy_info(site_id):
    """
    Returns policy metadata for a specific site:
    {
        'site_id': int,
        'site_name': str,
        'override_policy': str or None,
        'global_policy': str,
        'effective_policy': str,
        'is_override': bool
    }
    """
    global_policy = get_setting("global_attendance_policy", "both")
    if global_policy not in VALID_ATTENDANCE_POLICIES:
        global_policy = "both"

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id, name, attendance_policy FROM sites WHERE id = ?", (site_id,))
    row = c.fetchone()
    conn.close()

    if not row:
        return {
            "site_id": site_id,
            "site_name": "Unknown Site",
            "override_policy": None,
            "global_policy": global_policy,
            "effective_policy": global_policy,
            "is_override": False
        }

    raw_override = row["attendance_policy"]
    has_override = raw_override in VALID_ATTENDANCE_POLICIES
    effective = raw_override if has_override else global_policy

    return {
        "site_id": row["id"],
        "site_name": row["name"],
        "override_policy": raw_override if has_override else None,
        "global_policy": global_policy,
        "effective_policy": effective,
        "is_override": has_override
    }

def get_all_sites_attendance_policies():
    """
    Returns list of all sites with explicit overrides, effective policies, and employee counts.
    """
    global_policy = get_setting("global_attendance_policy", "both")
    if global_policy not in VALID_ATTENDANCE_POLICIES:
        global_policy = "both"

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        SELECT s.id, s.name, s.address, s.attendance_policy,
               COUNT(e.id) AS employee_count
        FROM sites s
        LEFT JOIN employees e ON e.site_id = s.id AND e.active = 1
        GROUP BY s.id
        ORDER BY s.id ASC
    """)
    rows = c.fetchall()
    conn.close()

    result = []
    for r in rows:
        raw_override = r["attendance_policy"]
        has_override = raw_override in VALID_ATTENDANCE_POLICIES
        effective = raw_override if has_override else global_policy
        result.append({
            "id": r["id"],
            "name": r["name"],
            "address": r["address"],
            "override_policy": raw_override if has_override else None,
            "effective_policy": effective,
            "is_override": has_override,
            "employee_count": r["employee_count"]
        })
    return result

def update_attendance_policies(global_policy, site_overrides=None, actor_id=None, actor_role="admin"):
    """
    Persists global policy and per-site overrides, logging tamper-evident audit trail entries.
    """
    if global_policy not in VALID_ATTENDANCE_POLICIES:
        raise ValueError(f"Invalid global attendance policy: '{global_policy}'. Must be one of {VALID_ATTENDANCE_POLICIES}")

    old_global = get_setting("global_attendance_policy", "both")
    if old_global not in VALID_ATTENDANCE_POLICIES:
        old_global = "both"

    global_changed = (old_global != global_policy)
    if global_changed:
        set_setting("global_attendance_policy", global_policy)
        log_audit(
            actor_id=actor_id,
            actor_role=actor_role,
            action="UPDATE_GLOBAL_ATTENDANCE_POLICY",
            resource_type="settings",
            resource_id="global_attendance_policy",
            details=f"Changed company-wide attendance policy from '{old_global}' to '{global_policy}'"
        )

    site_changes = []
    if site_overrides:
        conn = get_db_connection()
        c = conn.cursor()
        for s_id_raw, override_val in site_overrides.items():
            try:
                s_id = int(s_id_raw)
            except (ValueError, TypeError):
                continue

            c.execute("SELECT name, attendance_policy FROM sites WHERE id = ?", (s_id,))
            site_row = c.fetchone()
            if not site_row:
                continue

            site_name = site_row["name"]
            current_override = site_row["attendance_policy"]

            cleaned_override = None
            if override_val in VALID_ATTENDANCE_POLICIES:
                cleaned_override = override_val
            elif override_val in (None, "", "inherit", "null", "None"):
                cleaned_override = None
            else:
                continue # ignore unrecognized values

            if current_override != cleaned_override:
                c.execute("UPDATE sites SET attendance_policy = ? WHERE id = ?", (cleaned_override, s_id))
                effective_now = cleaned_override if cleaned_override else global_policy
                log_audit(
                    actor_id=actor_id,
                    actor_role=actor_role,
                    action="UPDATE_SITE_ATTENDANCE_POLICY",
                    resource_type="site",
                    resource_id=s_id,
                    details=f"Changed site '{site_name}' policy override from '{current_override or 'inherit'}' to '{cleaned_override or 'inherit'}' (Effective: {effective_now})",
                    db_conn=conn
                )
                site_changes.append({
                    "site_id": s_id,
                    "site_name": site_name,
                    "old_override": current_override,
                    "new_override": cleaned_override,
                    "effective_policy": effective_now
                })

        conn.commit()
        conn.close()

    return {
        "global_policy": global_policy,
        "global_changed": global_changed,
        "site_changes": site_changes
    }

def get_cached_geocode(cache_key, db_path=None, ttl_days=None):
    """
    Look up a cached reverse-geocoded address by cache key (e.g. '19.0657,72.8687').
    Checks TTL and purges expired entries.
    """
    if ttl_days is None:
        ttl_days = getattr(Config, "GEOCODING_CACHE_TTL_DAYS", 30)
    conn = get_db_connection(db_path)
    c = conn.cursor()
    try:
        c.execute("SELECT address, created_at FROM geocode_cache WHERE cache_key = ?", (cache_key,))
        row = c.fetchone()
        if not row:
            return None
        created_at_str = row["created_at"]
        if created_at_str:
            try:
                created_dt = datetime.datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                if created_dt.tzinfo is None:
                    created_dt = created_dt.replace(tzinfo=datetime.timezone.utc)
                age_days = (datetime.datetime.now(datetime.timezone.utc) - created_dt).total_seconds() / 86400.0
                if age_days > ttl_days:
                    c.execute("DELETE FROM geocode_cache WHERE cache_key = ?", (cache_key,))
                    conn.commit()
                    return None
            except Exception:
                pass
        return row["address"]
    except Exception:
        return None
    finally:
        conn.close()

def set_cached_geocode(cache_key, address, db_path=None):
    """Saves or updates a reverse-geocoded address in the persistent geocode_cache table."""
    if not cache_key or not address:
        return
    conn = get_db_connection(db_path)
    c = conn.cursor()
    now = get_utc_iso()
    try:
        c.execute("""
            INSERT OR REPLACE INTO geocode_cache (cache_key, address, created_at)
            VALUES (?, ?, ?)
        """, (cache_key, address, now))
        conn.commit()
    except Exception:
        pass
    finally:
        conn.close()

def get_effective_work_policy(employee_id, date=None, conn=None):
    """
    Resolves the effective work policy for an employee on a given date (or currently):
    Resolution Order:
    1. Employee duration override (employees.required_daily_hours / required_weekly_hours)
    2. Employee assigned policy (employees.shift_id)
    3. Department default policy (departments.shift_id)
    4. Site default policy (sites.shift_id)
    5. Company default policy (settings 'company_default_shift_id' or first active flexible shift)

    If date is in the past (before today) and a daily_attendance_summary row exists with
    a valid policy_snapshot, that historical snapshot is returned to preserve immutable history.

    Returns a unified dict with:
        id, policy_id, name, policy_name, shift_type,
        required_daily_hours, required_daily_minutes,
        required_weekly_hours, required_weekly_minutes,
        core_start, core_end, core_hours_enforced, core_grace_minutes,
        unpaid_break_minutes, break_duration_minutes,
        overtime_threshold_minutes, half_day_threshold_hours,
        weekly_off_days, week_start_day,
        allowed_window_start, allowed_window_end,
        count_flagged_events_policy,
        is_override, has_daily_override, has_weekly_override,
        employee_override_daily_hours, employee_override_weekly_hours,
        resolution_source,
        display_string, duration_display, weekly_display
    """
    from config import get_local_now
    import json

    close_at_end = False
    if conn is None:
        conn = get_db_connection()
        close_at_end = True

    try:
        c = conn.cursor()

        # 1. Check if date is in the past and historical snapshot exists in daily_attendance_summary
        if date is not None and employee_id is not None:
            date_str = str(date)[:10]
            today_str = get_local_now().date().isoformat()
            if date_str < today_str:
                c.execute("""
                    SELECT shift_id, shift_type, policy_snapshot
                    FROM daily_attendance_summary
                    WHERE employee_id = ? AND date = ?
                """, (employee_id, date_str))
                snap_row = c.fetchone()
                if snap_row and snap_row["policy_snapshot"]:
                    try:
                        snap = json.loads(snap_row["policy_snapshot"])
                        if isinstance(snap, dict) and snap:
                            req_d_h = float(snap.get("required_daily_hours", 8.0) or 8.0)
                            req_w_h_raw = snap.get("required_weekly_hours")
                            req_w_h = float(req_w_h_raw) if req_w_h_raw not in (None, "", "None") else None
                            s_type = snap.get("shift_type", snap_row["shift_type"] or "flexible")
                            is_over = bool(snap.get("is_override", False))

                            dur_disp = f"{req_d_h:g}h/day" + (" (override)" if is_over else "")
                            wk_disp = f"{req_w_h:g}h/week" if req_w_h is not None else ""
                            core_s = snap.get("core_start")
                            core_e = snap.get("core_end")
                            core_disp = f"Core {core_s}-{core_e}" if (core_s and core_e) else ""

                            if s_type == "flexible":
                                parts = ["Flexible", dur_disp]
                                if wk_disp:
                                    parts.append(wk_disp)
                                if core_disp:
                                    parts.append(core_disp)
                                disp_str = " · ".join(parts)
                            else:
                                disp_str = f"Fixed · {snap.get('start_time', '09:00')}-{snap.get('end_time', '18:00')}"

                            res = {
                                "id": snap.get("shift_id") or snap_row["shift_id"],
                                "policy_id": snap.get("shift_id") or snap_row["shift_id"],
                                "name": snap.get("shift_name") or "Historical Policy",
                                "policy_name": snap.get("shift_name") or "Historical Policy",
                                "shift_type": s_type,
                                "start_time": snap.get("start_time", "09:00"),
                                "end_time": snap.get("end_time", "18:00"),
                                "grace_period_minutes": snap.get("grace_period_minutes", 15),
                                "required_daily_hours": req_d_h,
                                "required_daily_minutes": round(req_d_h * 60.0, 1),
                                "required_weekly_hours": req_w_h,
                                "required_weekly_minutes": round(req_w_h * 60.0, 1) if req_w_h else None,
                                "core_start": core_s,
                                "core_end": core_e,
                                "core_hours_enforced": snap.get("core_hours_enforced", 1),
                                "core_grace_minutes": snap.get("core_grace_minutes", 15),
                                "unpaid_break_minutes": snap.get("unpaid_break_minutes", 60),
                                "break_duration_minutes": snap.get("break_duration_minutes", 60),
                                "overtime_threshold_minutes": snap.get("overtime_threshold_minutes", 30),
                                "half_day_threshold_hours": snap.get("half_day_threshold_hours", 4.0),
                                "weekly_off_days": snap.get("weekly_off_days", "Sat,Sun"),
                                "week_start_day": snap.get("week_start_day", "Monday"),
                                "allowed_window_start": snap.get("allowed_window_start"),
                                "allowed_window_end": snap.get("allowed_window_end"),
                                "count_flagged_events_policy": snap.get("count_flagged_events_policy", "count_pending"),
                                "is_override": is_over,
                                "has_daily_override": is_over,
                                "has_weekly_override": False,
                                "employee_override_daily_hours": req_d_h if is_over else None,
                                "employee_override_weekly_hours": req_w_h if is_over else None,
                                "resolution_source": "historical_snapshot",
                                "display_string": disp_str,
                                "duration_display": dur_disp,
                                "weekly_display": wk_disp
                            }
                            return res
                    except Exception:
                        pass

        # 2. Query employee, department, site assignments and duration overrides
        emp_row = None
        if employee_id is not None:
            c.execute("""
                SELECT e.id, e.name, e.shift_id AS emp_shift_id, e.department_id, e.site_id,
                       e.required_daily_hours AS emp_req_daily,
                       e.required_weekly_hours AS emp_req_weekly,
                       d.shift_id AS dept_shift_id,
                       s.shift_id AS site_shift_id
                FROM employees e
                LEFT JOIN departments d ON e.department_id = d.id
                LEFT JOIN sites s ON e.site_id = s.id
                WHERE e.id = ?
            """, (employee_id,))
            emp_row = c.fetchone()

        target_shift_id = None
        source = None
        emp_req_daily = None
        emp_req_weekly = None

        if emp_row:
            emp_req_daily = emp_row["emp_req_daily"]
            emp_req_weekly = emp_row["emp_req_weekly"]
            if emp_row["emp_shift_id"]:
                target_shift_id = emp_row["emp_shift_id"]
                source = "employee"
            elif emp_row["dept_shift_id"]:
                target_shift_id = emp_row["dept_shift_id"]
                source = "department"
            elif emp_row["site_shift_id"]:
                target_shift_id = emp_row["site_shift_id"]
                source = "site"

        # 3. Fallback to Company Default Policy
        if not target_shift_id:
            c.execute("SELECT value FROM settings WHERE key = 'company_default_shift_id'")
            def_s = c.fetchone()
            if def_s and def_s["value"]:
                try:
                    target_shift_id = int(def_s["value"])
                    source = "company_default"
                except Exception:
                    pass

        if not target_shift_id:
            c.execute("SELECT id FROM shifts WHERE shift_type = 'flexible' AND (is_archived = 0 OR is_archived IS NULL) ORDER BY id ASC LIMIT 1")
            row_flex = c.fetchone()
            if row_flex:
                target_shift_id = row_flex["id"]
                source = "company_default"

        shift_record = None
        if target_shift_id:
            c.execute("SELECT * FROM shifts WHERE id = ?", (target_shift_id,))
            sh_row = c.fetchone()
            if sh_row:
                shift_record = dict(sh_row)

        if not shift_record:
            # Fallback policy
            shift_record = {
                "id": None,
                "name": "Flexible 8h",
                "shift_type": "flexible",
                "start_time": "09:00",
                "end_time": "18:00",
                "grace_period_minutes": 15,
                "required_daily_hours": 8.0,
                "required_weekly_hours": 40.0,
                "core_start": "11:00",
                "core_end": "16:00",
                "core_hours_enforced": 1,
                "core_grace_minutes": 15,
                "unpaid_break_minutes": 60,
                "break_duration_minutes": 60,
                "overtime_threshold_minutes": 30,
                "half_day_threshold_hours": 4.0,
                "weekly_off_days": "Sat,Sun",
                "week_start_day": "Monday",
                "enforcement_mode": "daily",
                "allowed_window_start": "07:00",
                "allowed_window_end": "22:00",
                "count_flagged_events_policy": "count_pending",
                "is_archived": 0
            }
            if not source:
                source = "company_default"

        # 4. Resolve Duration Overrides (Admin-configured per-employee)
        has_daily_override = (emp_req_daily is not None)
        has_weekly_override = (emp_req_weekly is not None)
        is_override = has_daily_override or has_weekly_override

        effective_daily_h = float(emp_req_daily) if has_daily_override else float(shift_record.get("required_daily_hours") or 8.0)

        base_weekly_h = shift_record.get("required_weekly_hours")
        if has_weekly_override:
            effective_weekly_h = float(emp_req_weekly)
        elif base_weekly_h not in (None, "", "None"):
            effective_weekly_h = float(base_weekly_h)
        else:
            effective_weekly_h = None

        req_daily_m = round(effective_daily_h * 60.0, 1)
        req_weekly_m = round(effective_weekly_h * 60.0, 1) if effective_weekly_h is not None else None

        # Build display strings
        s_type = shift_record.get("shift_type", "flexible")
        dur_disp = f"{effective_daily_h:g}h/day" + (" (override)" if is_override else "")
        wk_disp = f"{effective_weekly_h:g}h/week" if effective_weekly_h is not None else ""
        core_s = shift_record.get("core_start")
        core_e = shift_record.get("core_end")
        core_disp = f"Core {core_s}-{core_e}" if (core_s and core_e) else ""

        if s_type == "flexible":
            parts = ["Flexible", dur_disp]
            if wk_disp:
                parts.append(wk_disp)
            if core_disp:
                parts.append(core_disp)
            disp_str = " · ".join(parts)
        else:
            disp_str = f"Fixed · {shift_record.get('start_time')}-{shift_record.get('end_time')} · {shift_record.get('grace_period_minutes', 15)}m grace"

        res = dict(shift_record)
        res["policy_id"] = shift_record.get("id")
        res["policy_name"] = shift_record.get("name")
        res["required_daily_hours"] = effective_daily_h
        res["required_daily_minutes"] = req_daily_m
        res["required_weekly_hours"] = effective_weekly_h
        res["required_weekly_minutes"] = req_weekly_m
        res["is_override"] = is_override
        res["has_daily_override"] = has_daily_override
        res["has_weekly_override"] = has_weekly_override
        res["employee_override_daily_hours"] = float(emp_req_daily) if has_daily_override else None
        res["employee_override_weekly_hours"] = float(emp_req_weekly) if has_weekly_override else None
        res["resolution_source"] = source
        res["display_string"] = disp_str
        res["duration_display"] = dur_disp
        res["weekly_display"] = wk_disp
        return res
    finally:
        if close_at_end:
            conn.close()

def resolve_employee_shift(employee_id, conn=None):
    """
    Resolves the effective shift for an employee using get_effective_work_policy.
    Maintains full backward compatibility with any callers expecting a shift dict.
    """
    return get_effective_work_policy(employee_id, conn=conn)

def get_site_timezone_str(site_id, conn=None):
    """Returns the configured timezone string for a site, or defaults to 'Asia/Kolkata'."""
    if not site_id:
        return "Asia/Kolkata"
    close_at_end = False
    if conn is None:
        conn = get_db_connection()
        close_at_end = True
    try:
        c = conn.cursor()
        c.execute("SELECT timezone FROM sites WHERE id = ?", (site_id,))
        row = c.fetchone()
        if row and row["timezone"]:
            return row["timezone"]
        return "Asia/Kolkata"
    except Exception:
        return "Asia/Kolkata"
    finally:
        if close_at_end:
            conn.close()

def get_holidays_map(from_date=None, to_date=None, conn=None):
    """Returns a dict of {holiday_date: holiday_name} within the optional date range."""
    close_at_end = False
    if conn is None:
        conn = get_db_connection()
        close_at_end = True
    try:
        c = conn.cursor()
        query = "SELECT holiday_date, name, description FROM holidays WHERE 1=1"
        params = []
        if from_date:
            query += " AND holiday_date >= ?"
            params.append(from_date)
        if to_date:
            query += " AND holiday_date <= ?"
            params.append(to_date)
        c.execute(query, tuple(params))
        return {r["holiday_date"]: dict(r) for r in c.fetchall()}
    except Exception:
        return {}
    finally:
        if close_at_end:
            conn.close()

