-- migrations/008_make_flexible_hours_company_work_policy.sql
-- Migration: Make Flexible Hours the Work Policy for Every Employee
-- Reversible migration: saves employees.previous_shift_id, archives fixed shifts,
-- seeds default flexible policies, and reassigns active employees.

-- 1. Extend shifts table with archive flag
ALTER TABLE shifts ADD COLUMN is_archived INTEGER DEFAULT 0;

-- 2. Extend employees table with reversible shift backup and duration overrides
ALTER TABLE employees ADD COLUMN previous_shift_id INTEGER DEFAULT NULL;
ALTER TABLE employees ADD COLUMN required_daily_hours REAL DEFAULT NULL;
ALTER TABLE employees ADD COLUMN required_weekly_hours REAL DEFAULT NULL;

-- 3. Also extend students table for backwards compatibility
ALTER TABLE students ADD COLUMN previous_shift_id INTEGER DEFAULT NULL;
ALTER TABLE students ADD COLUMN required_daily_hours REAL DEFAULT NULL;
ALTER TABLE students ADD COLUMN required_weekly_hours REAL DEFAULT NULL;

-- 4. Fix misleading names on legacy fixed schedules
UPDATE shifts 
SET name = 'Legacy Fixed 09:00-18:00 (30m grace)', is_archived = 1
WHERE name = 'Flexible Shift (09:00 - 18:00, 30m grace)' AND shift_type = 'fixed';

UPDATE shifts 
SET name = 'Legacy Fixed Field Shift (09:30 - 18:30)', is_archived = 1
WHERE name = 'Flexible Field Shift' AND shift_type = 'fixed';

-- 5. Mark remaining legacy fixed shifts as archived
UPDATE shifts SET is_archived = 1 WHERE shift_type = 'fixed';

-- 6. Seed Flexible Work Policies (if not already existing)
-- Default company policy: Flexible 8h
INSERT INTO shifts (
    name, shift_type, start_time, end_time,
    required_daily_hours, required_weekly_hours,
    core_start, core_end, core_hours_enforced,
    unpaid_break_minutes, break_duration_minutes,
    core_grace_minutes, overtime_threshold_minutes,
    half_day_threshold_hours, weekly_off_days, week_start_day,
    enforcement_mode, allowed_window_start, allowed_window_end,
    count_flagged_events_policy, is_archived, created_at
) SELECT
    'Flexible 8h', 'flexible', '09:00', '18:00',
    8.0, 40.0,
    '11:00', '16:00', 1,
    60, 60,
    15, 30,
    4.0, 'Sat,Sun', 'Monday',
    'daily', '07:00', '22:00',
    'count_pending', 0, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE name = 'Flexible 8h');

-- Example policy: Flexible 6h
INSERT INTO shifts (
    name, shift_type, start_time, end_time,
    required_daily_hours, required_weekly_hours,
    core_start, core_end, core_hours_enforced,
    unpaid_break_minutes, break_duration_minutes,
    core_grace_minutes, overtime_threshold_minutes,
    half_day_threshold_hours, weekly_off_days, week_start_day,
    enforcement_mode, allowed_window_start, allowed_window_end,
    count_flagged_events_policy, is_archived, created_at
) SELECT
    'Flexible 6h', 'flexible', '10:00', '17:00',
    6.0, 30.0,
    '11:00', '15:00', 1,
    60, 60,
    15, 30,
    3.0, 'Sat,Sun', 'Monday',
    'daily', '08:00', '20:00',
    'count_pending', 0, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE name = 'Flexible 6h');

-- Example policy: Flexible 9h
INSERT INTO shifts (
    name, shift_type, start_time, end_time,
    required_daily_hours, required_weekly_hours,
    core_start, core_end, core_hours_enforced,
    unpaid_break_minutes, break_duration_minutes,
    core_grace_minutes, overtime_threshold_minutes,
    half_day_threshold_hours, weekly_off_days, week_start_day,
    enforcement_mode, allowed_window_start, allowed_window_end,
    count_flagged_events_policy, is_archived, created_at
) SELECT
    'Flexible 9h', 'flexible', '09:00', '19:00',
    9.0, 45.0,
    '11:00', '16:00', 1,
    60, 60,
    15, 30,
    4.5, 'Sat,Sun', 'Monday',
    'daily', '07:00', '22:00',
    'count_pending', 0, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE name = 'Flexible 9h');

-- 7. Backup employee shift assignments for reversibility
UPDATE employees
SET previous_shift_id = shift_id
WHERE previous_shift_id IS NULL;

-- 8. Reassign active employees to company default Flexible 8h shift
UPDATE employees
SET shift_id = (SELECT id FROM shifts WHERE name = 'Flexible 8h' LIMIT 1)
WHERE active = 1 AND (shift_id IS NULL OR shift_id NOT IN (SELECT id FROM shifts WHERE shift_type = 'flexible'));

UPDATE students
SET previous_shift_id = shift_id,
    shift_id = (SELECT id FROM shifts WHERE name = 'Flexible 8h' LIMIT 1)
WHERE active = 1 AND (shift_id IS NULL OR shift_id NOT IN (SELECT id FROM shifts WHERE shift_type = 'flexible'));

-- 9. Set company default shift policy setting
INSERT OR REPLACE INTO settings (key, value, updated_at)
VALUES (
    'company_default_shift_id',
    (SELECT CAST(id AS TEXT) FROM shifts WHERE name = 'Flexible 8h' LIMIT 1),
    datetime('now')
);

-- ==============================================================================
-- ROLLBACK INSTRUCTIONS:
-- To revert this migration, execute the following SQL:
--
-- 1. Restore previous shift assignments:
--    UPDATE employees SET shift_id = previous_shift_id WHERE previous_shift_id IS NOT NULL;
--    UPDATE students SET shift_id = previous_shift_id WHERE previous_shift_id IS NOT NULL;
--
-- 2. Unarchive legacy shifts:
--    UPDATE shifts SET is_archived = 0;
--
-- 3. Restore original shift names:
--    UPDATE shifts SET name = 'Flexible Shift (09:00 - 18:00, 30m grace)' WHERE name = 'Legacy Fixed 09:00-18:00 (30m grace)';
--    UPDATE shifts SET name = 'Flexible Field Shift' WHERE name = 'Legacy Fixed Field Shift (09:30 - 18:30)';
--
-- 4. Delete seeded flexible policies if desired:
--    DELETE FROM shifts WHERE name IN ('Flexible 8h', 'Flexible 6h', 'Flexible 9h')
--      AND id NOT IN (SELECT shift_id FROM employees WHERE shift_id IS NOT NULL)
--      AND id NOT IN (SELECT shift_id FROM daily_attendance_summary WHERE shift_id IS NOT NULL);
--
-- 5. Clear company default setting:
--    DELETE FROM settings WHERE key = 'company_default_shift_id';
-- ==============================================================================
