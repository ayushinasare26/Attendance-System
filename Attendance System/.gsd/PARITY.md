# PARITY.md — Full Feature, Logic, and Visual Parity Matrix

> **PRIME DIRECTIVE**: This document defines the exact baseline that must be matched byte-for-byte in behavior, calculations, messages, permissions, and visual appearance.
> Every row must be proven and marked `Pass` before final cutover.

---

## 1. Baseline Verification Records (Pre-Port State)

| Metric | Recorded Baseline Value | Verification Source |
|--------|-------------------------|---------------------|
| **Git Baseline Tag** | `pre-nextjs-port` | Commit hash recorded on clean repository |
| **Backend Test Suite** | **99 Passed, 1 Warning, 0 Failed** (18.06s) | `pytest tests/` |
| **HTML Page Snapshots** | **19 Full HTML files** | Saved in `.gsd/snapshots/baseline/` |
| **Responsive Screenshots** | **38 PNG screenshots** (19 Desktop 1280px, 19 Mobile 375px) | Saved in `.gsd/screenshots/baseline/` |
| **Total Jinja Templates** | **22 Templates** (14 Admin, 4 Manager, 4 Employee) | `templates/` directory |
| **Total Flash Messages** | **44 occurrences** | Grep verified across `core/auth.py` and blueprints |
| **Total Confirm / Alert Dialogs**| **25 occurrences** | Grep verified across templates and JS scripts |

---

## 2. Check-In/Out Script Mapping (`templates/employee/check_in_out.html`)

This table maps every function, timer, variable, and event listener in `templates/employee/check_in_out.html` (lines 566–1263) to its designated Next.js React Hook or Component:

| Function / Handler / State in Jinja Inline JS | Purpose & Current Behavior | Target Next.js Owner (Hook / Component) | Target Implementation File | Parity Status |
|-----------------------------------------------|----------------------------|-----------------------------------------|----------------------------|---------------|
| `let currentStream` | Tracks active webcam `MediaStream` | State in `useCamera` hook | `frontend/hooks/useCamera.js` | ✅ Pass |
| `let currentAction` | Switch between `'check_in'` and `'check_out'` | State in `useAttendanceAction` | `frontend/app/(employee)/employee/check-in-out/page.jsx` | ✅ Pass |
| `let userCoords` | `{ lat, lon, accuracy, gps_error }` | State in `useGeolocation` hook | `frontend/hooks/useGeolocation.js` | ✅ Pass |
| `const siteCoords` | Registered site lat, lon, radius, enabled | Props / Query data | `frontend/app/(employee)/employee/check-in-out/page.jsx` | ✅ Pass |
| `updateLiveClock()` | Live 1-second clock with 12h format | Hook with interval + hydration guard | `frontend/hooks/useLiveClock.js` | ✅ Pass |
| `pollLiveFlexibleStatus()` | Polls `/api/employee/live-status` every 60s | Polling interval hook | `frontend/hooks/useLiveStatus.js` | ✅ Pass |
| `setActionMode(mode)` | Toggles UI between Check In (green) and Check Out (red) | State in check-in-out page | `frontend/app/(employee)/employee/check-in-out/page.jsx` | ✅ Pass |
| `updateManualButtonUI()` | Updates manual button style & text based on mode | Reactive styling in CheckInOutPage | `frontend/app/(employee)/employee/check-in-out/page.jsx` | ✅ Pass |
| `selectMethod(method)` | Switches between `face` and `manual` method tabs | State in CheckInOutPage | `frontend/app/(employee)/employee/check-in-out/page.jsx` | ✅ Pass |
| `fetchFreshPolicy()` | Fetches `/employee/api/attendance-policy` | Query helper in check-in-out | `frontend/app/(employee)/employee/check-in-out/page.jsx` | ✅ Pass |
| `window.addEventListener('focus')` | Refreshes policy on tab focus; reloads if changed | `useEffect` window focus listener | `frontend/app/(employee)/employee/check-in-out/page.jsx` | ✅ Pass |
| `calculateHaversine(...)` | Client-side distance calculation in meters | Utility function | `frontend/utils/geo.js` | ✅ Pass |
| `acquireLocation()` | Calls `navigator.geolocation.getCurrentPosition` | `acquireLocation` method in hook | `frontend/hooks/useGeolocation.js` | ✅ Pass |
| `startCamBtn click` | Requests `navigator.mediaDevices.getUserMedia` | `startCamera` method in hook | `frontend/hooks/useCamera.js` | ✅ Pass |
| `stopCamBtn click` | Stops all video tracks cleanly | `stopCamera` method in hook | `frontend/hooks/useCamera.js` | ✅ Pass |
| `actionBtn click` (Face) | Captures 4 burst frames + primary, POSTs payload | `captureBurstAndPrimary` + submit | `frontend/app/(employee)/employee/check-in-out/page.jsx` | ✅ Pass |
| `manualActionBtn click` | Submits GPS-only manual check-in / check-out | `handleManualSubmit` method | `frontend/app/(employee)/employee/check-in-out/page.jsx` | ✅ Pass |
| `confirmModal hidden.bs.modal` | Triggers page refresh when modal is closed | Modal `onRefresh` callback | `frontend/components/employee/ConfirmationModal.jsx` | ✅ Pass |

---

## 3. Comprehensive Page Parity Matrix

### 3.1 Public & Authentication Routes

| Route / Template | Feature / Control / Data | Expected Jinja Behavior | Target Next.js Component | Parity Status | Verification Proof |
|------------------|--------------------------|-------------------------|--------------------------|---------------|-------------------|
| `/` | Role-based Root Redirect | Admin -> `/admin/dashboard`, Manager -> `/manager/dashboard`, Employee -> `/employee/check-in-out`, Unauth -> `/employee/login` | `app/page.jsx` | ✅ Pass | Proved via authContext & redirects |
| `/login` & `/employee/login`<br>`templates/employee/login.html` | Employee Code/Email input | Default `value="29"`, placeholder `e.g. EMP-0029 or 29` | `app/(auth)/employee/login/page.jsx` | ✅ Pass | Next.js Screenshot `employee_login_desktop.png` |
| `/login` & `/employee/login`<br>`templates/employee/login.html` | Password input | Default `value="employee123"`, placeholder `••••••••` | `app/(auth)/employee/login/page.jsx` | ✅ Pass | Next.js Screenshot `employee_login_desktop.png` |
| `/login` & `/employee/login`<br>`templates/employee/login.html` | 4 Quick Demo Shortcut Buttons | 1-click submit for seeded employees (EMP-001, EMP-002, EMP-003, EMP-004) | `app/(auth)/employee/login/page.jsx` | ✅ Pass | Next.js Screenshot `employee_login_desktop.png` |
| `/login` & `/employee/login`<br>`templates/employee/login.html` | Footer Links | Links to `/manager/dashboard` and `/admin/login` | `app/(auth)/employee/login/page.jsx` | ✅ Pass | Next.js Screenshot `employee_login_desktop.png` |
| `/admin/login`<br>`templates/admin/login.html` | Admin Credentials Form | Username (`admin`), Password (`admin123`), error alert on failure | `app/(auth)/admin/login/page.jsx` | ✅ Pass | Next.js Screenshot `admin_login_desktop.png` |
| `/manager/login`<br>`blueprints/manager/routes.py` | Manager Login Alias | Redirects to `/employee/login?portal=manager` | Handled via Flask mirror & Next.js page | ✅ Pass | Verified in scripts/test_manager_portal.py |

---

### 3.2 Employee Portal

| Route / Template | Feature / Control / Data | Expected Jinja Behavior | Target Next.js Component | Parity Status | Verification Proof |
|------------------|--------------------------|-------------------------|--------------------------|---------------|-------------------|
| `/employee/check-in-out`<br>`templates/employee/check_in_out.html` | Live 1s Real-time Clock | Formats local time `HH:MM:SS AM/PM` with 1-second interval | `components/employee/LiveClock.jsx` | ✅ Pass | Next.js Screenshot `employee_check_in_out_desktop.png` |
| `/employee/check-in-out` | Mode Switcher Tabs | Check In (Green `#059669`) vs Check Out (Red `#dc2626`) | `app/(employee)/employee/check-in-out/page.jsx` | ✅ Pass | Next.js Screenshot `employee_check_in_out_desktop.png` |
| `/employee/check-in-out` | Attendance Method Selector | Face Recognition vs Manual Attendance based on site policy | `app/(employee)/employee/check-in-out/page.jsx` | ✅ Pass | Next.js Screenshot `employee_check_in_out_desktop.png` |
| `/employee/check-in-out` | Webcam Scanner Panel | Start/Stop camera buttons, video feed, scanner status | `hooks/useCamera.js` | ✅ Pass | Next.js Screenshot `employee_check_in_out_desktop.png` |
| `/employee/check-in-out` | Liveness Challenge Banner | 4-frame burst indicator progress bar (25%, 50%, 75%, 100%) | `app/(employee)/employee/check-in-out/page.jsx` | ✅ Pass | Mapped in Section 2 |
| `/employee/check-in-out` | GPS Live Badge & Alerts | Accuracy warning if >100m, Geofence violation warning, GPS offline states | `hooks/useGeolocation.js` | ✅ Pass | Next.js Screenshot `employee_check_in_out_desktop.png` |
| `/employee/check-in-out` | Flexible Hours Live Panel | Real-time worked hours, remaining hours, earliest leave guidance, weekly progress bar | `components/employee/FlexiblePanel.jsx` | ✅ Pass | Next.js Screenshot `employee_check_in_out_desktop.png` |
| `/employee/check-in-out` | Today's Attendance Activity | Shows first check-in, last check-out, status badge | `app/(employee)/employee/check-in-out/page.jsx` | ✅ Pass | Next.js Screenshot `employee_check_in_out_desktop.png` |
| `/employee/check-in-out` | Demo Mode Toggle | Checkbox `Demo Mode (simulate location/bypass cooldown)` | `app/(employee)/employee/check-in-out/page.jsx` | ✅ Pass | Next.js Screenshot `employee_check_in_out_desktop.png` |
| `/employee/check-in-out` | Attendance Confirmation Modal | Shows timestamp, address, distance (±accuracy), status badge, photo | `components/employee/ConfirmationModal.jsx` | ✅ Pass | Lines 1075-1135 mapped in Section 2 |
| `/employee/my-attendance`<br>`templates/employee/my_attendance.html` | Attendance History Table | Lists date, check-in, check-out, duration, method badge, status, action button | `app/(employee)/employee/my-attendance/page.jsx` | ✅ Pass | Next.js Screenshot `employee_my_attendance_desktop.png` |
| `/employee/my-attendance` | Date Range & Month Filters | Dropdown for month and year filtering | `app/(employee)/employee/my-attendance/page.jsx` | ✅ Pass | Next.js Screenshot `employee_my_attendance_desktop.png` |
| `/employee/my-attendance` | Correction Request Modal | Submits date, requested change, reason to manager | `components/employee/CorrectionModal.jsx` | ✅ Pass | Form POST `/employee/correction-request` |

---

### 3.3 Manager Portal

| Route / Template | Feature / Control / Data | Expected Jinja Behavior | Target Next.js Component | Parity Status | Verification Proof |
|------------------|--------------------------|-------------------------|--------------------------|---------------|-------------------|
| `/manager/dashboard`<br>`templates/manager/dashboard.html` | Team Overview Metrics | Total Team Members, Present Today, Late/Flagged, Pending Corrections | `app/(manager)/manager/dashboard/page.jsx` | ✅ Pass | Next.js Screenshot `manager_dashboard_desktop.png` |
| `/manager/dashboard` | Attendance Distribution | Metric cards for Checked In, Not Checked In, Late Arrivals | `app/(manager)/manager/dashboard/page.jsx` | ✅ Pass | Next.js Screenshot `manager_dashboard_desktop.png` |
| `/manager/dashboard` | Shift & Dept Filtering | Department & Shift Dropdown Filters with Apply & Reset | `app/(manager)/manager/dashboard/page.jsx` | ✅ Pass | Next.js Screenshot `manager_dashboard_desktop.png` |
| `/manager/dashboard` | Today's Team Activity List | Table of team check-ins with timestamps and site locations | `app/(manager)/manager/dashboard/page.jsx` | ✅ Pass | Next.js Screenshot `manager_dashboard_desktop.png` |
| `/manager/attendance`<br>`templates/manager/attendance_records.html` | Team Attendance Records Table | Date, Employee Code, Name, Site, Shift, In/Out, Total Hours, Status | `app/(manager)/manager/attendance/page.jsx` | ✅ Pass | Next.js Screenshot `manager_attendance_desktop.png` |
| `/manager/attendance` | Team Member & Date Filters | Filter by subordinate employee ID and date range | `app/(manager)/manager/attendance/page.jsx` | ✅ Pass | Next.js Screenshot `manager_attendance_desktop.png` |
| `/manager/correction-requests`<br>`templates/manager/correction_requests.html` | Correction Requests Queue | Shows employee, requested date, original vs requested times, reason | `app/(manager)/manager/correction-requests/page.jsx` | ✅ Pass | Next.js Screenshot `manager_correction_requests_desktop.png` |
| `/manager/correction-requests` | Review Action Modal | Approve / Reject buttons with manager review notes | `components/manager/ReviewCorrectionModal.jsx` | ✅ Pass | Verified via `scripts/test_manager_portal.py` |

---

### 3.4 Admin Portal

| Route / Template | Feature / Control / Data | Expected Jinja Behavior | Target Next.js Component | Parity Status | Verification Proof |
|------------------|--------------------------|-------------------------|--------------------------|---------------|-------------------|
| `/admin/dashboard`<br>`templates/admin/dashboard.html` | Enterprise Stat Cards | Total Sites, Active Employees, Today Attendance, Flagged Events | `app/(admin)/admin/dashboard/page.jsx` | ✅ Pass | Next.js Screenshot `admin_dashboard_desktop.png` |
| `/admin/dashboard` | Real-time Attendance Feed | Live list of recent attendance events with status badges | `app/(admin)/admin/dashboard/page.jsx` | ✅ Pass | Next.js Screenshot `admin_dashboard_desktop.png` |
| `/admin/dashboard` | Workforce Trends Chart | Daily attendance trends across sites | `components/admin/TrendsChart.jsx` | ✅ Pass | Next.js Screenshot `admin_dashboard_desktop.png` |
| `/admin/sites`<br>`templates/admin/sites.html` | Work Sites Grid / Table | Name, Address, Coordinates, Radius, Geofencing Enabled toggle | `app/(admin)/admin/sites/page.jsx` | ✅ Pass | Next.js Screenshot `admin_sites_desktop.png` |
| `/admin/sites` | Create / Edit Site Modal | Forward geocoding lookup, GPS acquisition button, radius slider | `components/admin/SiteModal.jsx` | ✅ Pass | Next.js Screenshot `admin_sites_desktop.png` |
| `/admin/sites` | Delete Site Action | Form submission with `confirm('Remove this work site?')` | `app/(admin)/admin/sites/page.jsx` | ✅ Pass | Confirm #1 in Table 4 |
| `/admin/shifts`<br>`templates/admin/shifts.html` | Shift Schedules List | General, Early, Night, Flexible schedules with grace periods | `app/(admin)/admin/shifts/page.jsx` | ✅ Pass | Next.js Screenshot `admin_shifts_desktop.png` |
| `/admin/shifts` | Create / Edit Shift Modal | Start time, end time, grace minutes, break duration | `components/admin/ShiftModal.jsx` | ✅ Pass | Next.js Screenshot `admin_shifts_desktop.png` |
| `/admin/shifts` | Delete Shift Schedule | Form submission with `confirm('Delete this shift schedule?...')` | `app/(admin)/admin/shifts/page.jsx` | ✅ Pass | Confirm #2 in Table 4 |
| `/admin/shifts` | Recalculate Attendance | Form submission with `confirm('Recalculate attendance summaries...')` | `components/admin/RecalculateModal.jsx` | ✅ Pass | Confirm #3 in Table 4 |
| `/admin/employees`<br>`templates/admin/employees.html` | Employee Directory Table | Code, Name, Role, Department, Site, Shift, Biometric Status, Actions | `app/(admin)/admin/employees/page.jsx` | ✅ Pass | Next.js Screenshot `admin_employees_desktop.png` |
| `/admin/employees` | Toggle Active Status | POST `/admin/employees/<id>/toggle-active` with `confirm('Change active status...')` | `app/(admin)/admin/employees/page.jsx` | ✅ Pass | Confirm #5 in Table 4 |
| `/admin/employees` | Purge Biometrics (GDPR) | POST `/admin/employees/<id>/purge-biometrics` with `confirm('Permanently purge...')` | `app/(admin)/admin/employees/page.jsx` | ✅ Pass | Confirm #6 in Table 4 |
| `/admin/enroll`<br>`templates/admin/add_student.html` | Biometric Face Enrollment | Webcam capture / file upload + explicit biometric consent checkbox | `app/(admin)/admin/enroll/page.jsx` | ✅ Pass | Next.js Screenshot `admin_enroll_desktop.png` |
| `/admin/attendance`<br>`templates/admin/attendance_records.html` | Master Attendance Logs | Multi-filter table (Site, Dept, Date, Status, Method, Search) | `app/(admin)/admin/attendance/page.jsx` | ✅ Pass | Next.js Screenshot `admin_attendance_desktop.png` |
| `/admin/attendance/[id]`<br>`templates/admin/attendance_detail.html` | Attendance Detail Audit Screen | Geotagged watermarked selfie, GPS accuracy circle, facial distance | `app/(admin)/admin/attendance/[id]/page.jsx` | ✅ Pass | Next.js Screenshot `admin_attendance_detail_desktop.png` |
| `/admin/flagged`<br>`templates/admin/flagged_queue.html` | Flagged Review Queue | Review list with flag reasons, Approve / Reject buttons | `app/(admin)/admin/flagged/page.jsx` | ✅ Pass | Next.js Screenshot `admin_flagged_desktop.png` |
| `/admin/payroll-export`<br>`templates/admin/reports.html` | Reports & Payroll CSV Export | Date range filters, Department filter, CSV download buttons | `app/(admin)/admin/payroll-export/page.jsx` | ✅ Pass | Next.js Screenshot `admin_reports_desktop.png` |
| `/admin/settings`<br>`templates/admin/settings.html` | Engine & Policy Configuration | Match threshold slider, GPS accuracy threshold, Attendance Method Policy | `app/(admin)/admin/settings/page.jsx` | ✅ Pass | Next.js Screenshot `admin_settings_desktop.png` |
| `/admin/audit-logs`<br>`templates/admin/audit_logs.html` | Immutable Audit Trail Table | Timestamp, User Role, Action Type, Category, Target ID, Detail | `app/(admin)/admin/audit-logs/page.jsx` | ✅ Pass | Next.js Screenshot `admin_audit_logs_desktop.png` |

---

## 4. Complete Confirm & Alert Dialogs Registry (25 Occurrences)

Every `confirm()` and `alert()` in the codebase is cataloged below and must be preserved identically:

| # | Type | Location (File : Line) | Exact Message / Expression | Trigger Condition | Parity Status |
|---|------|------------------------|----------------------------|-------------------|---------------|
| 1 | `alert` | `templates/employee/check_in_out.html:984` | `"Camera access denied or unavailable: " + e.message` | Webcam permission denied or device error | ✅ Pass |
| 2 | `alert` | `templates/employee/check_in_out.html:1003`| `"Camera is not active. Please click 'Start Camera' first to enable your video feed."` | Action button clicked while camera stream is null | ✅ Pass |
| 3 | `alert` | `templates/employee/check_in_out.html:1137`| `data.message || "Your site now requires Manual Attendance for attendance — please refresh."` | Policy mismatch on face check-in response | ✅ Pass |
| 4 | `alert` | `templates/employee/check_in_out.html:1142`| `data.message || "Face enrollment required before marking attendance."` | Employee lacks facial enrollment reference | ✅ Pass |
| 5 | `alert` | `templates/employee/check_in_out.html:1145`| `"Verification Failed: " + (data.message || "Face or location check failed.")` | Biometric or geofence verification failure | ✅ Pass |
| 6 | `alert` | `templates/employee/check_in_out.html:1148`| `"Network or verification error: " + err.message` | Network fetch failure on face check-in | ✅ Pass |
| 7 | `alert` | `templates/employee/check_in_out.html:1250`| `data.message || "Your site now requires Face Recognition for attendance — please refresh."` | Policy mismatch on manual check-in response | ✅ Pass |
| 8 | `alert` | `templates/employee/check_in_out.html:1254`| `"Attendance Notice: " + (data.message || "Failed to process manual attendance.")` | Server error response on manual check-in | ✅ Pass |
| 9 | `alert` | `templates/employee/check_in_out.html:1257`| `"Network or server error: " + err.message` | Network fetch failure on manual check-in | ✅ Pass |
| 10 | `confirm` | `templates/admin/sites.html:71` | `'Remove this work site?'` | Delete button on work sites table | ✅ Pass |
| 11 | `alert` | `templates/admin/sites.html:249` | `"Could not fetch GPS: " + err.message` | Error acquiring browser coordinates for site | ✅ Pass |
| 12 | `alert` | `templates/admin/sites.html:252` | `"Geolocation is not supported by your browser."` | Browser lacks navigator.geolocation | ✅ Pass |
| 13 | `alert` | `templates/admin/sites.html:271` | `"Please enter an address or landmark first."` | Forward geocode button clicked with empty input | ✅ Pass |
| 14 | `confirm` | `templates/admin/shifts.html:126` | `'Delete this shift schedule? Note: shifts referenced by employees or history will be archived instead of removed.'` | Delete shift button on shift schedule table | ✅ Pass |
| 15 | `confirm` | `templates/admin/shifts.html:402` | `'Recalculate attendance summaries for the selected date range?'` | Recalculate attendance form submit | ✅ Pass |
| 16 | `alert` | `templates/admin/shifts.html:644` | `msg` (Dynamic shift validation warning) | Form validation failure on shift parameters | ✅ Pass |
| 17 | `confirm` | `templates/admin/shifts.html:680` | `msg` (Confirm bulk shift assignment) | Bulk shift reassignment button | ✅ Pass |
| 18 | `alert` | `templates/admin/settings.html:445` | `"Failed to save policy: " + (data.error || "Unknown error")` | Error saving attendance method policy | ✅ Pass |
| 19 | `confirm` | `templates/admin/employees.html:144` | `'Change active status for this employee?'` | Toggle active button on employee row | ✅ Pass |
| 20 | `confirm` | `templates/admin/employees.html:151` | `'Permanently purge reference photos and deep embeddings for this employee (Compliance Right-to-be-Forgotten)?'` | Purge biometrics button on employee row | ✅ Pass |
| 21 | `alert` | `templates/admin/add_student.html:175` | `"Explicit biometric consent is required before enrolling face data."` | Enrollment form submit without consent checkbox | ✅ Pass |
| 22 | `alert` | `templates/admin/add_student.html:202` | `data.error || "Enrollment failed."` | Server error during employee face enrollment | ✅ Pass |
| 23 | `alert` | `templates/admin/add_student.html:205` | `"Server error: " + err.message` | Network error during employee enrollment | ✅ Pass |
| 24 | `alert` | `templates/admin/add_student.html:252` | `"Embedding extraction error: " + upData.error` | Error extracting 128-d embeddings from photo | ✅ Pass |
| 25 | `alert` | `templates/admin/add_student.html:256` | `"Upload failed: " + err.message` | Network error during photo upload | ✅ Pass |

---

## 5. Complete Flash Messages Registry (44 Occurrences)

| Source File | Line | Message String | Category | Target Alert / Toast |
|-------------|------|----------------|----------|----------------------|
| `core/auth.py` | 34 | `"Too many attempts. Please wait a minute and try again."` | `danger` | Auth Rate Limit Toast |
| `core/auth.py` | 61 | `"Access denied: Administrator privileges required."` | `warning` | Role Permission Alert |
| `core/auth.py` | 64 | `"Access denied: You do not have permission to view administrative resources."` | `warning` | Role Permission Alert |
| `core/auth.py` | 90 | `"Access denied: Manager permissions required to view team portal."` | `warning` | Role Permission Alert |
| `blueprints/manager/routes.py` | 40 | `"You have been signed out of the Manager Portal."` | `info` | Sign-out Notice Toast |
| `blueprints/manager/routes.py` | 466 | `f"Correction request #{request_id} has been {new_status}."` | `success` | Correction Review Toast |
| `blueprints/employee/routes.py` | 105 | `"You have been signed out of the employee portal."` | `info` | Sign-out Notice Toast |
| `blueprints/employee/routes.py` | 1233 | `"Please provide the date, reason, and requested correction."` | `danger` | Form Validation Alert |
| `blueprints/employee/routes.py` | 1252 | `"Correction request submitted to your manager for approval."` | `success` | Request Submitted Toast |
| `blueprints/admin/routes.py` | 81 | `"Administrator session terminated safely."` | `info` | Sign-out Notice Toast |
| `blueprints/admin/routes.py` | 478 | `"Name, latitude, and longitude are required."` | `danger` | Form Validation Alert |
| `blueprints/admin/routes.py` | 488 | `"Invalid numeric coordinates or radius."` | `danger` | Form Validation Alert |
| `blueprints/admin/routes.py` | 507 | `f"Work site '{name}' created successfully."` | `success` | Action Success Toast |
| `blueprints/admin/routes.py` | 542 | `f"Site #{site_id} updated successfully."` | `success` | Action Success Toast |
| `blueprints/admin/routes.py` | 553 | `f"Site #{site_id} removed."` | `info` | Action Info Toast |
| `blueprints/admin/routes.py` | 660 | `"Shift name is required."` | `danger` | Form Validation Alert |
| `blueprints/admin/routes.py` | 705 | `err_msg` (Shift creation validation error) | `danger` | Form Validation Alert |
| `blueprints/admin/routes.py` | 764 | `f"{shift_type.capitalize()} shift schedule '{name}' created successfully."` | `success` | Action Success Toast |
| `blueprints/admin/routes.py` | 785 | `"Shift not found."` | `danger` | Error Notice Alert |
| `blueprints/admin/routes.py` | 834 | `err_msg` (Shift edit validation error) | `danger` | Form Validation Alert |
| `blueprints/admin/routes.py` | 887 | `f"Shift schedule '{name}' updated successfully."` | `success` | Action Success Toast |
| `blueprints/admin/routes.py` | 913 | `"Daily required hours must be between 0.5 and 24.0."` | `danger` | Form Validation Alert |
| `blueprints/admin/routes.py` | 962 | `msg` (Flexible hours warning) | `warning` | Warning Alert |
| `blueprints/admin/routes.py` | 1011 | `res_msg` (Bulk assignment result) | `success` | Action Success Toast |
| `blueprints/admin/routes.py` | 1021 | `"Target type and ID are required."` | `danger` | Form Validation Alert |
| `blueprints/admin/routes.py` | 1055 | `"Invalid target type."` | `danger` | Form Validation Alert |
| `blueprints/admin/routes.py` | 1065 | `msg` (Shift assigned result) | `success` | Action Success Toast |
| `blueprints/admin/routes.py` | 1079 | `"Shift not found."` | `danger` | Error Notice Alert |
| `blueprints/admin/routes.py` | 1105 | `msg` (Shift delete warning) | `warning` | Warning Alert |
| `blueprints/admin/routes.py` | 1118 | `f"Policy '{shift_name}' deleted."` | `info` | Action Info Toast |
| `blueprints/admin/routes.py` | 1218 | `"Employee not found."` | `danger` | Error Notice Alert |
| `blueprints/admin/routes.py` | 1230 | `msg` (Employee policy error) | `danger` | Form Validation Alert |
| `blueprints/admin/routes.py` | 1259 | `f"Work policy updated for {emp['name']}."` | `success` | Action Success Toast |
| `blueprints/admin/routes.py` | 1324 | `msg` (Enrollment error) | `danger` | Form Validation Alert |
| `blueprints/admin/routes.py` | 1330 | `"Employee Name and Code/ID are required."` | `danger` | Form Validation Alert |
| `blueprints/admin/routes.py` | 1396 | `f"Employee #{emp_id} ({row['name']}) has been {action_label}."` | `info` | Action Info Toast |
| `blueprints/admin/routes.py` | 1423 | `f"Biometric reference photos and embeddings for Employee #{emp_id} have been permanently purged."` | `warning` | Compliance Warning Toast |
| `blueprints/admin/routes.py` | 1677 | `f"Record #{record_id} marked as {action.upper()}."` | `success` | Action Success Toast |
| `blueprints/admin/routes.py` | 1697 | `"Correction request not found."` | `danger` | Error Notice Alert |
| `blueprints/admin/routes.py` | 1724 | `f"Correction request #{request_id} has been {new_status}."` | `success` | Action Success Toast |
| `blueprints/admin/routes.py` | 1745 | `"Both start date and end date are required for recalculation."` | `danger` | Form Validation Alert |
| `blueprints/admin/routes.py` | 1762 | `f"Successfully recalculated attendance for {res['employees_count']} employees across {from_date} to {to_date}."` | `success` | Action Success Toast |
| `blueprints/admin/routes.py` | 1767 | `f"Recalculation error: {str(e)}"` | `danger` | Error Notice Alert |
| `blueprints/admin/routes.py` | 2014 | `"Recognition engine settings and attendance method policies updated successfully."` | `success` | Action Success Toast |

---

*Last updated: 2026-10-23*
