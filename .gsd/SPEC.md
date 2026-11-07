# SPEC.md — Replace All Flagging with Check-In vs Check-Out Location Mismatch

> **Status**: `FINALIZED`
>
> ⚠️ **Planning Lock**: This specification governs the complete replacement of all legacy attendance flagging rules with a single rule: **Check-In vs Check-Out Location Mismatch**. No implementation code will be committed until this specification is explicitly reviewed and approved by the user.

---

## 1. Executive Summary & Goals

### 1.1 Goal
Remove all existing "flagged" behaviors from attendance marking across both biometric face recognition and manual attendance workflows. Check-in and check-out events must no longer be flagged for:
1. Being outside the site geofence, or uncertain geofence boundary overlap;
2. Low GPS accuracy, missing GPS coordinates, or denied location permissions;
3. Borderline facial recognition match confidence;
4. Shift-window, core-hours, late arrival, early departure, short hours, or any other schedule/punctuality condition.

Employees must never see warnings, notices, or badges mentioning flags or administrative audit during check-in or check-out.

### 1.2 The Single Remaining Flag Rule
The **ONLY** remaining condition that produces `flagged = 1` across the entire system:
> **Check-In vs Check-Out Location Mismatch**:
> When an employee checks out, if the geodesic distance between the check-out location and the check-in location of the **SAME session** exceeds `LOCATION_MATCH_RADIUS_METERS` (default: 200 meters), the check-out event is recorded normally and flagged (`flagged = 1`) with an explicit reason (e.g. `"Check-out location differs from check-in by 1,240 m (allowed 200 m)"`), and the measured distance is stored in `checkin_checkout_distance_meters`.
> Otherwise, the event is recorded with `flagged = 0` and `flag_reason = None`.

All conditions that currently reject attempts (spoof/liveness failure, no face match, ambiguous identity, attendance method policy block, cooldowns) continue to reject exactly as today.

---

## 2. Complete Inventory & Classification (REMOVE, KEEP, CHANGE)

Every location in the codebase where flags are created, evaluated, stored, displayed, filtered, or counted has been surveyed:

| File / Component | Code Item / Location | Classification | Rationale & Action Plan |
|---|---|---|---|
| **`core/geofence.py`** | `flagged: True` on outside geofence (`classification: "violation"`, lines 282-283) | **REMOVE** | Geofence violation no longer flags events. Set `flagged: False`, `flag_reason: None`. Distance and `within_geofence: False` remain recorded as plain metadata. |
| **`core/geofence.py`** | `flagged: True` on uncertain location boundary overlap (lines 263-264) | **REMOVE** | Boundary overlap no longer flags. Set `flagged: False`, `flag_reason: None`. Keep `classification: "uncertain"` as telemetry. |
| **`core/geofence.py`** | `flagged: True` on low GPS accuracy (`acc_val > threshold`, lines 221-222) | **REMOVE** | Low accuracy no longer flags. Set `flagged: False`, `flag_reason: None`. Accuracy is logged neutrally. |
| **`core/geofence.py`** | `flagged: True` on missing GPS / location denied (lines 169-170, 198-199) | **REMOVE** | Missing/invalid coordinates do not flag. Set `flagged: False`, `flag_reason: None`. |
| **`core/geofence.py`** | Neutral geofence calculation (`geodesic_distance`, `within_geofence`, `distance_meters`, `accuracy_meters`) | **KEEP** | Essential for recording location telemetry, watermarking, and site distance without flagging. |
| **`core/face_engine.py`** | `status = "flagged"`, borderline confidence (`review_threshold < distance <= match_threshold` or `margin < 0.05`, lines 281-282) | **REMOVE** | Borderline match within allowable threshold is treated as normal `success` with `flagged = 0`. Rejections (`distance > match_threshold`) still reject with `no_match`. |
| **`core/pipeline.py`** | `is_flagged = geofence_res["flagged"]` (line 361) | **CHANGE** | Do not inherit flag from geofence. Start check-in/out evaluation with `is_flagged = False, flag_reason = None`. |
| **`core/pipeline.py`** | Missing GPS flag in stage 4 (lines 376-378) | **REMOVE** | Remove flagging message and `is_flagged = True`. Record neutral stage log: `"GPS coordinates not provided"`. |
| **`core/pipeline.py`** | Early check-in outside allowed window flag (lines 417-419) | **REMOVE** | Shift window timing does not set `flagged = True` or `flag_reason` on the event. |
| **`core/pipeline.py`** | Flexible shift check-out flags: `core_missed`, `outside_allowed_window` (lines 449-455) | **REMOVE** | Daily flexible status and secondary flags still compute for daily hours math, but DO NOT set `flagged = True` on the check-out event. |
| **`core/pipeline.py`** | Late check-in punctuality setting `flag_reason` (lines 459-463) | **REMOVE** | Late check-in retains status `status = 'late'`, but `flagged` remains `0` and `flag_reason` is `None`. |
| **`core/pipeline.py`** | Fixed shift hours evaluation flags (early departure, short hours, lines 483-490) | **REMOVE** | Remove shift engine flag inheritance. Status remains `early_leave`, `on_time`, or `overtime`, but `flagged = 0`. |
| **`core/pipeline.py`** | New Check-In vs Check-Out Location Mismatch evaluator | **CHANGE** | **Add single flag rule**: on check-out, find the matching check-in of the session. Compute geodesic distance. If `> LOCATION_MATCH_RADIUS_METERS`, set `is_flagged = True`, `flag_reason = f"Check-out location differs from check-in by {dist:,.0f} m (allowed {radius:,.0f} m)"`, and store distance in `checkin_checkout_distance_meters`. |
| **`core/pipeline.py`** | Watermark geotag status stamp (line 505) | **CHANGE** | Pass `event_status` directly; only use `"flagged"` if location mismatch occurred. |
| **`core/shift_engine.py`** | `evaluate_check_in` flag reasons for late (line 109) | **REMOVE** | Set `flag_reason: None`. Status remains `"late"`. |
| **`core/shift_engine.py`** | `evaluate_check_out` flag reasons for early leave (line 164) | **REMOVE** | Set `flag_reason: None`. Status remains `"early_leave"`. |
| **`core/shift_engine.py`** | `calculate_shift_hours` flags for invalid sequence, short hours, half day, early departure (lines 202, 237, 255, 271, 290, 310) | **REMOVE** | Set `flagged: False, flag_reason: None`. Calculation of hours, status, and deductions remains intact. |
| **`core/shift_engine.py`** | `evaluate_flexible_shift` `secondary_flags` (`core_missed`, `outside_allowed_window`, `missing_checkout`, `leave_applied`) | **KEEP** | **KEEP**: These secondary indicators are day-level work summary attributes in `daily_attendance_summary.flags` used for hours computation, not event flags. |
| **`core/shift_engine.py`** | `count_flagged_events_policy` (`count_pending` vs `exclude_until_approved`) | **KEEP** | **KEEP**: Governs whether hours from a session flagged for location mismatch are credited tentatively pending admin review or excluded. Policy logic remains unchanged. |
| **`core/geotag.py`** | Watermark border color `if status == "flagged" or not within_geofence:` (line 213) | **CHANGE** | Change to `if status == "flagged":` (red border only for actual flagged events, not for remote/geofence excursions). |
| **`core/db.py`** | `attendance_events` and `attendance` schema | **CHANGE** | Add column `checkin_checkout_distance_meters REAL DEFAULT NULL` safely via `init_db` check and migration `009`. |
| **`config.py`** | `LOCATION_MATCH_RADIUS_METERS` configuration | **CHANGE** | Add `LOCATION_MATCH_RADIUS_METERS = float(os.environ.get("LOCATION_MATCH_RADIUS_METERS", 200.0))`. |
| **`blueprints/employee/routes.py`** | `manual_attendance` (lines 626, 635, 659, 690, 714) | **CHANGE** | Remove geofence, missing GPS, and shift rule flags. Apply the exact same location mismatch rule for manual check-out as pipeline. |
| **`blueprints/employee/routes.py`** | `my_attendance` summary & filters (`total_flagged_days`, `status_filter == 'flagged'`) | **REMOVE** | Remove `total_flagged_days` calculation, remove flagged filter, and remove `flagged` from employee history presentation. |
| **`blueprints/admin/routes.py`** | Dashboard `flagged_count` query (lines 118-123) | **CHANGE** | Query only `attendance_events WHERE flagged = 1`. Remove any `within_geofence = 0` or legacy geofence condition. |
| **`blueprints/admin/routes.py`** | `flagged_queue` query (lines 610-645) | **CHANGE** | Fetch records where `flagged = 1`. Display `checkin_checkout_distance_meters` and mismatch flag reason. |
| **`blueprints/admin/routes.py`** | `all_attendance` filter (lines 400-500) | **CHANGE** | Status filter for `flagged` filters strictly on `flagged = 1` (no `within_geofence = 0` fallback). |
| **`blueprints/admin/routes.py`** | `engine_settings` GET & POST (lines 1100-1250) | **CHANGE** | Expose `location_match_radius_meters`. Validate positive float/int, update database `settings`, write audit trail entry (`UPDATE_SETTING`). |
| **`blueprints/admin/routes.py`** | Payroll CSV Export (lines 1850-1975) | **CHANGE** | "Flagged Events" count represents strictly location mismatch flags for new records (and legacy flags for historic records). |
| **`blueprints/manager/routes.py`** | Manager dashboard and team attendance (lines 124, 201, 272, 290) | **KEEP / CHANGE** | Scoped team view continues to show `flagged` only if an event is flagged (now location mismatch). |
| **`frontend/hooks/useGeolocation.js`** | Warnings: `"Low GPS Accuracy Warning... will be flagged"`, `"Location Warning... will be flagged"`, `"Uncertain Geofence... marked as uncertain for review"` (lines 49-65) | **REMOVE** | Strip all warning messages that mention flags, audits, or consequences. |
| **`frontend/app/(employee)/employee/check-in-out/page.jsx`** | Geofence warning banner `#geofenceWarningBanner` & `#geofenceWarningText` | **REMOVE** | Remove the warning alert box that warned employees they will be flagged. |
| **`frontend/app/(employee)/employee/check-in-out/page.jsx`** | GPS accuracy pill and distance metadata | **KEEP (Neutral)** | Keep clean, neutral metadata: `"GPS Ready (±Xm)"` and site distance `"• Site Radius: Xm"` without warning or flag language. |
| **`frontend/app/(employee)/employee/check-in-out/page.jsx`** | Recent events list badge `ev.status === 'flagged'` and `(Outside Geofence)` red tag (lines 830, 844) | **REMOVE** | Remove `'flagged'` status badge and remove `(Outside Geofence)` warning from employee view. |
| **`frontend/components/employee/ConfirmationModal.jsx`** | `#confirmFlagNotice` alert and `flagged` danger badge (lines 23, 145-155) | **REMOVE** | Remove flag alert box and danger styling. A check-out flagged for mismatch shows normal check-out success modal to the employee. |
| **`frontend/app/(employee)/employee/my-attendance/page.jsx`** | "Flagged for Audit" summary card (lines 226-240) | **REMOVE** | Remove card from the top metric cards. |
| **`frontend/app/(employee)/employee/my-attendance/page.jsx`** | `<option value="flagged">Flagged for Audit</option>` (line 328) | **REMOVE** | Remove flagged filter from employee filter dropdown. |
| **`frontend/app/(employee)/employee/my-attendance/page.jsx`** | `<th>Flags & Audit</th>` table column and cell renderer (lines 368, 532, 605) | **REMOVE** | Remove the Flags & Audit column and badge from both flexible and fixed tables. |
| **`frontend/app/(admin)/admin/dashboard/page.jsx`** | "Flagged / Anomalies" card subtitle `"Geofence violations or audit flags"` (line 242) | **CHANGE** | Change subtitle to `"Check-in/out location mismatches"`. |
| **`frontend/app/(admin)/admin/flagged/page.jsx`** | Queue header description (lines 107-108) | **CHANGE** | Update description to: `"Events flagged due to check-in versus check-out location mismatches"`. |
| **`frontend/app/(admin)/admin/flagged/page.jsx`** | Table headers & row renderer | **CHANGE** | Add columns/details for check-in vs check-out distance (e.g. `1,240m mismatch (allowed 200m)`) and coordinate links. |
| **`frontend/app/(admin)/admin/attendance/[id]/page.jsx`** | Attendance detail inspection | **CHANGE** | Display check-in/out mismatch distance and paired session coordinates. |
| **`frontend/app/(admin)/admin/settings/page.jsx`** | Engine Settings form | **CHANGE** | Add control for `Location Match Radius (Meters)` (`location_match_radius_meters`), default 200m, with save action. |
| **`README.md`** | Geofence, Shift, Flagging documentation | **CHANGE** | Update documentation to specify that geofence boundaries no longer flag events, and describe the single check-in vs check-out location mismatch rule. |

---

## 3. The Location Mismatch Rule Specification

### 3.1 Pairing Protocol
1. For every `check_out` event (biometric or manual), query historical events for the employee in ascending timestamp order:
   ```sql
   SELECT id, event_type, timestamp, latitude, longitude, within_geofence, status
   FROM attendance_events
   WHERE employee_id = ?
   ORDER BY timestamp ASC
   ```
2. Scan events to identify the active session:
   - Walk events in sequence, pairing each `check_in` with the first subsequent `check_out`.
   - The check-in corresponding to the current check-out is the **most recent unpaired `check_in`** immediately preceding it.
   - If an employee has multiple sessions in one day (e.g. Session 1: 09:00 - 12:00, Session 2: 13:00 - 18:00), Session 1's check-out is compared solely against Session 1's check-in, and Session 2's check-out is compared solely against Session 2's check-in.

### 3.2 Geodesic Distance Evaluation
1. Extract coordinates:
   - Check-In: `(in_lat, in_lon)`
   - Check-Out: `(out_lat, out_lon)`
2. Coordinates validation via `is_valid_coordinate`:
   - If either check-in or check-out coordinates are missing, `None`, or invalid (e.g. permission denied, `(0, 0)`, NaN):
     - **No comparison is made**.
     - Set `is_flagged = False`, `flag_reason = None`, `checkin_checkout_distance_meters = None`.
     - Record check-out normally without a flag.
3. If both coordinates are valid:
   - Calculate distance:
     ```python
     mismatch_dist = geodesic_distance(in_lat, in_lon, out_lat, out_lon)
     ```
   - Store `checkin_checkout_distance_meters = round(mismatch_dist, 1)`.
   - Retrieve threshold: `allowed_radius = get_location_match_radius_meters()` (default 200.0m).
   - **Evaluation**:
     - If `mismatch_dist > allowed_radius`:
       - `is_flagged = True`
       - `flag_reason = f"Check-out location differs from check-in by {int(mismatch_dist):,} m (allowed {int(allowed_radius):,} m)"`
     - Else (`mismatch_dist <= allowed_radius`):
       - `is_flagged = False`
       - `flag_reason = None`

### 3.3 No Check-In to Compare
If an employee triggers a check-out with no matching prior check-in (unpaired check-out):
- Handled as today: recorded normally, `is_flagged = False`, `flag_reason = None`, `checkin_checkout_distance_meters = None`.

### 3.4 Non-Blocking Guarantee
- Under NO circumstance will a location mismatch block or reject a check-out attempt.
- The check-out transaction always commits successfully.

### 3.5 Shift Summary & Hours Recalculation
- Immediately after recording the check-out, the day's `daily_attendance_summary` is recomputed using `compute_flexible_day` or `calculate_shift_hours`.
- `count_flagged_events_policy` (`count_pending` vs `exclude_until_approved`) operates as configured on shifts: if `exclude_until_approved` is selected, the flagged session's hours are withheld from total approved hours until an admin reviews the flag; if `count_pending`, hours count provisionally.

---

## 4. Employee-Facing Experience Specification

### 4.1 Decision on Neutral Location Information
In accordance with Section 4 of the requirements:
- **KEPT (Neutral Information)**:
  - GPS readiness status: `"GPS Ready"`
  - GPS accuracy readout: `"±Xm"` (plain metric, no `"will be flagged"` warning)
  - Distance from registered site anchor: `"{dist}m from Site"` (informative metadata)
- **REMOVED**:
  - The warning banner stating `"This check-in will be flagged for administrative audit"`.
  - The low-accuracy alert box stating `"Location accuracy is lower than normal... will be flagged"`.
  - The uncertain geofence alert stating `"This event will be marked as uncertain for review"`.
  - The confirmation modal notice `#confirmFlagNotice` (`"Event flagged for manager review"`).
  - Status badge `"FLAGGED"` or danger-red highlight on employee confirmation modals.
  - The `(Outside Geofence)` red tag on recent employee check-ins.
  - The "Flagged for Audit" summary card on Employee My Attendance.
  - The "Flagged for Audit" filter option on Employee My Attendance.
  - The "Flags & Audit" table column on Employee My Attendance.

---

## 5. Administrative & Manager Experience Specification

### 5.1 Admin Dashboard
- **Card Title**: `Flagged / Anomalies`
- **Card Subtitle**: `Check-in/out location mismatches`
- **Query**: Count of records where `flagged = 1`. Removed all `within_geofence = 0` and legacy `status = 'flagged'` conditions from count logic.

### 5.2 Flagged & Audit Queue
- **Records**: Lists pending events where `flagged = 1`.
- **Columns**: Displays Employee, Event Type, Timestamp, Check-In Coordinates, Check-Out Coordinates, Mismatch Distance, and Action buttons (Approve / Reject).
- **Map Link**: Where coordinates are present, provides map view links for both check-in and check-out locations.

### 5.3 Engine Settings (`/admin/settings`)
- **Setting Key**: `location_match_radius_meters`
- **Default Value**: `200.0`
- **Control**: Number input (allowed range: `10` to `50000` meters)
- **Persistence**: Saved via `POST /admin/settings` into `settings` table.
- **Audit Trail**: Every update writes to `audit_logs` table (`actor_id`, `actor_role='admin'`, `action='UPDATE_SETTING'`, `resource_type='settings'`, `resource_id='location_match_radius_meters'`, `details='Changed location match radius from {old}m to {new}m'`).

---

## 6. Database Schema & Migration Specification

### 6.1 Migration File: `migrations/009_add_location_mismatch_distance.sql`
```sql
-- Migration 009: Add checkin_checkout_distance_meters to attendance_events and attendance tables
ALTER TABLE attendance_events ADD COLUMN checkin_checkout_distance_meters REAL DEFAULT NULL;
ALTER TABLE attendance ADD COLUMN checkin_checkout_distance_meters REAL DEFAULT NULL;
```

### 6.2 Idempotent Schema Migration in `core/db.py`
In `init_db()`:
- Inspect `PRAGMA table_info(attendance_events)` and `PRAGMA table_info(attendance)`.
- If `checkin_checkout_distance_meters` does not exist, execute `ALTER TABLE ... ADD COLUMN checkin_checkout_distance_meters REAL DEFAULT NULL`.
- Seed `location_match_radius_meters` default (`"200.0"`) in `settings` table if not present.

---

## 7. Existing Data & Backward Compatibility

1. **No Data Mutation**: Existing events, historical flags, and existing daily summaries remain strictly untouched.
2. **Reviewability**: Existing flagged records in the database remain accessible in the Flagged & Audit Queue for resolution.
3. **Queue & Dashboard Handling**:
   - The queue displays `flagged_reason` dynamically: for legacy records, it shows their original reason (e.g. legacy geofence/liveness); for new records, it shows the location mismatch distance.
4. **Future Clear**: An optional bulk-clear script of legacy flags can be added in a future administrative task if requested.

---

## 8. Test Plan & Proof Strategy

Every requirement will be verified with concrete automated tests in `tests/`:

1. **`tests/test_location_mismatch.py` (New dedicated suite)**:
   - Same location check-in and check-out (GPS jitter < 20m): `flagged == 0`, `flag_reason is None`.
   - Location mismatch exceeding threshold (e.g. 1,240m > 200m): `flagged == 1`, `flag_reason` contains `"Check-out location differs from check-in by 1,240 m (allowed 200 m)"`, and `checkin_checkout_distance_meters == 1240.0`.
   - Boundary condition: Distance exactly at radius (200.0m) -> not flagged; distance at 200.1m -> flagged.
   - Multiple sessions in one day paired independently.
   - Missing coordinates on check-in or check-out -> not flagged.
   - Check-out with no prior check-in -> not flagged.
   - Manual attendance check-out location mismatch -> flagged identically.
   - Changing `location_match_radius_meters` in settings updates subsequent check-out evaluations and writes audit log.
2. **Updated Existing Tests**:
   - `tests/test_geofence.py`: Verify outside-geofence events return `flagged = False, flag_reason = None`.
   - `tests/test_pipeline_e2e.py`: Verify check-in outside geofence succeeds with `flagged = 0`.
   - `tests/test_manual_attendance.py`: Verify manual check-in outside geofence succeeds with `flagged = 0`.
   - `tests/test_shift_engine.py`: Verify late arrivals, early departures, and core missed do not set event `flagged = True`.
   - `tests/test_geotag.py`: Verify watermark border logic.
3. **Frontend Build Verification**:
   - `npm --prefix frontend run build` must compile cleanly with 0 errors.

---

## 9. Deliverables List

1. `.gsd/SPEC.md` (this document, marked `Status: FINALIZED`).
2. Migration: `migrations/009_add_location_mismatch_distance.sql`.
3. Backend logic: `core/geofence.py`, `core/pipeline.py`, `core/face_engine.py`, `core/shift_engine.py`, `core/geotag.py`, `core/db.py`, `config.py`, `blueprints/admin/routes.py`, `blueprints/employee/routes.py`, `blueprints/manager/routes.py`.
4. Frontend updates: `frontend/hooks/useGeolocation.js`, `frontend/components/employee/ConfirmationModal.jsx`, `frontend/app/(employee)/employee/check-in-out/page.jsx`, `frontend/app/(employee)/employee/my-attendance/page.jsx`, `frontend/app/(admin)/admin/dashboard/page.jsx`, `frontend/app/(admin)/admin/flagged/page.jsx`, `frontend/app/(admin)/admin/attendance/page.jsx`, `frontend/app/(admin)/admin/attendance/[id]/page.jsx`, `frontend/app/(admin)/admin/settings/page.jsx`.
5. Test suite updates and proof execution output.
6. Documentation: Updated `README.md` reflecting the new single-flag rule.
