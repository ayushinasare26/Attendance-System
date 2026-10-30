-- migrations/007_add_flexible_hours_and_summaries.sql
-- Flexible Hours Shift Policy (Core Hours + Required Hours) & Daily Attendance Summaries

-- 1. Extend shifts table with flexible shift schedule fields
ALTER TABLE shifts ADD COLUMN shift_type TEXT DEFAULT 'fixed';
ALTER TABLE shifts ADD COLUMN core_start TEXT DEFAULT NULL;
ALTER TABLE shifts ADD COLUMN core_end TEXT DEFAULT NULL;
ALTER TABLE shifts ADD COLUMN required_daily_hours REAL DEFAULT 8.0;
ALTER TABLE shifts ADD COLUMN required_weekly_hours REAL DEFAULT NULL;
ALTER TABLE shifts ADD COLUMN enforcement_mode TEXT DEFAULT 'daily';
ALTER TABLE shifts ADD COLUMN allowed_window_start TEXT DEFAULT NULL;
ALTER TABLE shifts ADD COLUMN allowed_window_end TEXT DEFAULT NULL;
ALTER TABLE shifts ADD COLUMN unpaid_break_minutes INTEGER DEFAULT 0;
ALTER TABLE shifts ADD COLUMN core_hours_enforced INTEGER DEFAULT 1;
ALTER TABLE shifts ADD COLUMN core_grace_minutes INTEGER DEFAULT 15;
ALTER TABLE shifts ADD COLUMN overtime_threshold_minutes INTEGER DEFAULT 0;
ALTER TABLE shifts ADD COLUMN half_day_threshold_hours REAL DEFAULT 4.0;
ALTER TABLE shifts ADD COLUMN weekly_off_days TEXT DEFAULT 'Sat,Sun';
ALTER TABLE shifts ADD COLUMN week_start_day TEXT DEFAULT 'Monday';
ALTER TABLE shifts ADD COLUMN count_flagged_events_policy TEXT DEFAULT 'count_pending';

-- 2. Add timezone and shift_id to sites table
ALTER TABLE sites ADD COLUMN timezone TEXT DEFAULT 'Asia/Kolkata';
ALTER TABLE sites ADD COLUMN shift_id INTEGER DEFAULT NULL;

-- 3. Add shift_id to departments table
ALTER TABLE departments ADD COLUMN shift_id INTEGER DEFAULT NULL;

-- 4. Create holidays calendar table
CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    holiday_date TEXT NOT NULL UNIQUE, -- 'YYYY-MM-DD'
    description TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(holiday_date);

-- 5. Create daily_attendance_summary table
CREATE TABLE IF NOT EXISTS daily_attendance_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    date TEXT NOT NULL, -- 'YYYY-MM-DD'
    shift_id INTEGER,
    shift_type TEXT NOT NULL DEFAULT 'fixed',
    policy_snapshot TEXT, -- JSON string of policy values used
    worked_minutes REAL DEFAULT 0.0,
    required_minutes REAL DEFAULT 0.0,
    short_minutes REAL DEFAULT 0.0,
    overtime_minutes REAL DEFAULT 0.0,
    status TEXT NOT NULL,
    flags TEXT, -- JSON string of secondary flags
    computed_at TEXT NOT NULL,
    UNIQUE(employee_id, date),
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (shift_id) REFERENCES shifts(id)
);
CREATE INDEX IF NOT EXISTS idx_daily_summary_emp_date ON daily_attendance_summary(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_summary_date ON daily_attendance_summary(date);
