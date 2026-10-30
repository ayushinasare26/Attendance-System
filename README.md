# Geo-Verified Facial Recognition Attendance System for Enterprise Workforce Management

An enterprise-grade, full-stack biometric attendance and workforce governance platform engineered for organizations with multiple physical work sites, shift-based staff, and remote/field personnel. Built with high-precision face recognition (128-dimensional deep metric embeddings), interactive multi-frame liveness verification, Haversine geofence validation, industrial shift rules, role-scoped portals, and payroll-ready reporting.

---

## 🏢 Architectural Overview: Three-Portal Division

The system enforces strict multi-tenant role isolation across three purpose-built web portals:

1. **Employee Portal (`/employee/*`)**: Mobile-first portal optimized for rapid field and on-premise check-ins. Provides a single dynamic check-in/check-out button, real-time geofence proximity alerts prior to submission, daily hours/overtime breakdown, and a correction request workflow.
2. **Manager Portal (`/manager/*`)**: Team-scoped supervision console for department leads and supervisors. Automatically restricted server-side to the manager's supervisees. Features real-time team status (Checked In, Late, Not Checked In), team history logs with sanitized coordinates, and a pending correction approval workflow.
3. **Admin Console (`/admin/*`)**: Comprehensive human resources and operations headquarters. Enables multi-site geofence registration, shift rule definition, employee lifecycle onboarding with biometric consent, company-wide attendance auditing, flagged anomaly resolution, and payroll-ready CSV exports.

---

## 🌟 Key Enterprise Capabilities

### 1. Multi-Site Geofencing Engine (`core/geofence.py`)
- **Haversine Spherical Distance**: Calculates high-precision distance in meters between user GPS coordinates and the assigned site anchor point.
- **Configurable Boundary Radius**: Office sites enforce strict radial perimeters (e.g., 200m or 250m). Check-in attempts beyond the radius are captured, geotagged, and flagged for supervisor review rather than silently accepted or dropped.
- **Field & Remote Exemption Policy**: Sites marked with `geofencing_enabled = 0` (e.g., Pan-India Field Operations or Remote Sales) bypass distance rejection while permanently recording GPS coordinates and reverse-geocoded street addresses for auditability.
- **Pre-Submission Warning**: The employee camera UI computes distance client-side prior to capture, warning workers if they are outside office bounds (e.g., *"You appear to be 850m from your registered office — this will be flagged for review"*).

### 2. Industrial Shift Scheduling & Punctuality Engine (`core/shift_engine.py`)
- **Configurable Shifts**: Supports arbitrary shift schedules (e.g., General 09:00–18:00, Early 07:00–16:00, Night 22:00–06:00, Flexible Remote).
- **Grace Period Evaluation**: Check-ins within the grace period (e.g. 15 minutes) are recorded as `on_time`. Arrivals after the grace threshold are automatically classified as `late` with exact minutes past scheduled start.
- **Early Departure & Overtime**: Check-outs before shift completion are flagged as `early_leave`. Work extending beyond scheduled shift hours is classified as `overtime` with net hours calculated.
- **Mandatory Break Deductions**: Deducts scheduled lunch/rest periods (e.g., 60 minutes) only when gross worked time exceeds the break duration.
- **Edge-Case Resilience**: Evaluates inverted timestamps (check-out earlier than check-in), missing check-outs, and overnight shifts crossing midnight.

### 3. Biometric Verification & Liveness Proof
- **128-D Deep Metric Embeddings**: In-memory vector cache with cosine/Euclidean distance matching against enrolled reference angles.
- **Interactive Multi-Frame Liveness**: Eye Aspect Ratio (EAR) blink detection over burst capture frames prevents spoofing with printed photographs, digital screens, or looped video.
- **Anti-Proxy Identity Matching**: Cross-references the authenticated session ID with the recognized facial embedding. If an employee attempts to check in using a colleague's face, the system flags the attempt and returns HTTP 403 Forbidden.
- **Forensic Watermark Stamping (`core/geotag.py`)**: Geocodes GPS coordinates into street addresses via OpenStreetMap Nominatim and burns an unalterable forensic watermark badge (name, employee code, timestamp, site name, distance, geofence status) into proof photos stored in `attendance_photos/`.

### 4. Regulatory Compliance & Biometric Scaffolding
- **Explicit Biometric Consent**: Onboarding captures affirmative biometric consent with an immutable UTC timestamp (`biometric_consent = 1`, `biometric_consent_timestamp = ISO-8601`) before face encoding is permitted (supporting GDPR Art. 9, DPDP Act, and BIPA technical prerequisites).
- **Data Retention & Right to Erasure**: Admin interface provides a 1-click **Purge Biometrics** action upon employee offboarding, permanently destroying raw reference portraits from `dataset/{id}/` and deleting embeddings from the database.
- **Data Minimization & Coordinate Obfuscation**: Managers can view attendance status and city/neighborhood locations, but precise lat/long coordinates and raw biometric images are strictly restricted to administrators and the individual employee.
- **Tamper-Evident Audit Logging (`audit_logs`)**: Centralized logging tracks administrative logins, site creations, shift modifications, employee enrollments, biometric purges, and payroll exports.

### 5. Admin-Controlled Attendance Method Policy (`core/db.py`)
- **Two-Tier Inheritance Architecture**:
  - **Company-Wide Global Default** (`settings.global_attendance_policy`): Sets the baseline policy across all workforce locations (`face_only`, `manual_only`, or `both`).
  - **Per-Site Overrides** (`sites.attendance_policy`): Allows physical offices (e.g. Corporate HQ) to mandate strict facial recognition while remote hubs or field branches permit manual check-ins. If unset (`NULL` / `"inherit"`), the site seamlessly inherits the global default. Changing the global policy updates all inheriting sites while preserving explicit overrides.
- **Server-Side Enforcement**: Bypassing the client UI is impossible — the check-in and check-out submission endpoints evaluate `get_effective_attendance_policy(site_id)` and immediately reject prohibited attendance methods with HTTP 403 Forbidden.
- **Dynamic Portal UX**: When only one method is permitted (`face_only` or `manual_only`), the Employee Portal completely hides the method switcher cards to avoid confusing employees with disabled controls, automatically presenting the required workflow with an active policy badge.
- **Mid-Session Policy Invalidation**: If an administrator changes a site policy while staff have the portal open, the next submission verifies fresh policy state and instructs the employee to refresh rather than failing ambiguously.
- **Biometric Enrollment Guard**: When `face_only` is active, employees without registered facial embeddings are surfaced an enrollment requirement alert advising them to contact administration.
- **Tamper-Evident Audit Trail**: Every policy change (who modified it, from what, to what, when) is automatically recorded in `audit_logs` for compliance auditing.

---

## 🗄️ Database Domain Model

```
sites
├── id (INTEGER PK)
├── name (TEXT)
├── address (TEXT)
├── latitude (REAL)
├── longitude (REAL)
├── geofence_radius_meters (REAL DEFAULT 200.0)
├── geofencing_enabled (INTEGER DEFAULT 1)
├── attendance_policy (TEXT DEFAULT NULL: 'face_only', 'manual_only', 'both', or NULL)
└── created_at (TEXT)

shifts
├── id (INTEGER PK)
├── name (TEXT)
├── start_time (TEXT, 'HH:MM')
├── end_time (TEXT, 'HH:MM')
├── grace_period_minutes (INTEGER DEFAULT 15)
├── break_duration_minutes (INTEGER DEFAULT 60)
└── created_at (TEXT)

departments
├── id (INTEGER PK)
├── name (TEXT)
├── manager_id (INTEGER FK -> employees.id)
└── created_at (TEXT)

employees
├── id (INTEGER PK)
├── name (TEXT)
├── employee_code (TEXT UNIQUE)
├── department_id (INTEGER FK -> departments.id)
├── site_id (INTEGER FK -> sites.id)
├── shift_id (INTEGER FK -> shifts.id)
├── manager_id (INTEGER FK -> employees.id)
├── role (TEXT: 'employee', 'manager', 'admin')
├── email (TEXT UNIQUE)
├── password_hash (TEXT)
├── active (INTEGER DEFAULT 1)
├── biometric_consent (INTEGER DEFAULT 0)
├── biometric_consent_timestamp (TEXT)
└── created_at (TEXT)

attendance_events
├── id (INTEGER PK)
├── employee_id (INTEGER FK -> employees.id)
├── event_type (TEXT: 'check_in', 'check_out')
├── timestamp (TEXT ISO-8601)
├── latitude (REAL)
├── longitude (REAL)
├── address (TEXT)
├── site_id (INTEGER FK -> sites.id)
├── distance_from_site_meters (REAL)
├── within_geofence (INTEGER DEFAULT 1)
├── confidence (REAL)
├── liveness_passed (INTEGER DEFAULT 1)
├── geotagged_photo_path (TEXT)
├── status (TEXT: 'on_time', 'late', 'early_leave', 'overtime', 'flagged')
├── flagged (INTEGER DEFAULT 0)
├── flag_reason (TEXT)
├── reviewed_by (INTEGER FK -> employees.id)
├── review_note (TEXT)
└── created_at (TEXT)

correction_requests
├── id (INTEGER PK)
├── employee_id (INTEGER FK -> employees.id)
├── attendance_date (TEXT 'YYYY-MM-DD')
├── reason (TEXT)
├── requested_change (TEXT)
├── status (TEXT: 'pending', 'approved', 'rejected')
├── reviewed_by (INTEGER FK -> employees.id)
├── review_note (TEXT)
├── reviewed_at (TEXT)
└── created_at (TEXT)

audit_logs
├── id (INTEGER PK)
├── actor_id (INTEGER)
├── actor_role (TEXT)
├── action (TEXT)
├── resource_type (TEXT)
├── resource_id (TEXT/INT)
├── details (TEXT)
└── created_at (TEXT)
```

---

## 📁 Project Directory Structure

```
enterprise-attendance-system/
├── app.py                          # Blueprint registrations, root routing, protected media delivery
├── config.py                       # Application settings, geocoding timeouts, threshold configs
├── requirements.txt                # Python dependencies
├── attendance.db                   # SQLite WAL-mode enterprise database
├── core/
│   ├── auth.py                     # Multi-role decorators & server-side manager scoping
│   ├── db.py                       # Database migrations, default seeders, audit logger
│   ├── face_engine.py              # ResNet-128 metric embeddings & vector similarity cache
│   ├── geofence.py                 # Haversine distance calculator & site boundary validator
│   ├── geotag.py                   # Reverse geocoding & Pillow watermark badge stamper
│   ├── liveness.py                 # Multi-frame EAR blink liveness detector
│   ├── pipeline.py                 # 9-stage event pipeline (Check-in / Check-out)
│   └── shift_engine.py             # Industrial shift evaluation, grace periods, & overtime
├── blueprints/
│   ├── employee/
│   │   ├── __init__.py
│   │   └── routes.py               # Employee camera toggle, history, correction requests
│   ├── manager/
│   │   ├── __init__.py
│   │   └── routes.py               # Team-scoped dashboard, logs, & correction queue
│   └── admin/
│       ├── __init__.py
│       └── routes.py               # Sites, shifts, employee roster, review queue, payroll CSV
├── frontend/                       # Next.js 16 (App Router, JavaScript/JSX) Primary Frontend
│   ├── app/
│   │   ├── (auth)/                 # Login routes (Employee, Manager, Admin)
│   │   ├── (employee)/             # Employee Portal (Check-in/out, History)
│   │   ├── (manager)/              # Manager Portal (Dashboard, Team Attendance, Corrections)
│   │   ├── (admin)/                # Admin Portal (11 Governance & Settings Screens)
│   │   ├── layout.jsx              # Root layout with TanStack Query & AuthProvider
│   │   └── page.jsx                # Role-based root redirect
│   ├── components/                 # Modals, Panels, LiveClock, Charts
│   ├── hooks/                      # useCamera, useGeolocation, useLiveStatus
│   ├── lib/                        # api client with session credential handling
│   └── next.config.mjs             # Rewrites reverse-proxy (/api/v1, /attendance_photos, etc.)
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_add_roles_and_review_fields.sql
│   └── 003_add_sites_shifts_departments.sql
├── dataset/                        # Enrolled face images partitioned by employee ID
├── attendance_photos/              # Forensic watermarked proof-of-attendance photos
├── scripts/
│   ├── seed_enterprise_data.py    # Multi-site enterprise seeder (sites, shifts, employees, cycles)
│   ├── verify_phase7_cutover.js    # Comprehensive cutover & rollback verification
│   └── capture_screenshots.js     # Responsive automated screenshot suite
├── tests/                          # 117 Pytest automated regression & security tests
└── .gsd/                           # GSD Specifications, Roadmap, Parity Matrix, and Rollback Guide
```

---

## 🚀 Quickstart & Setup

### 1. Environment Installation
```bash
# Clone repository
git clone https://github.com/ayushinasare26/Attendance-System.git
cd Attendance-System

# Create and activate virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install Python backend dependencies
pip install -r requirements.txt

# Install Next.js frontend dependencies
cd frontend
npm install
cd ..
```

### 2. Seed Enterprise Demo Data
Run the enterprise seeding script to populate sites, shifts, departments, managers, employees, and full-day attendance cycles:
```bash
python scripts/seed_enterprise_data.py
```

### 3. Run Application (Two-Server Architecture)

The system runs as a decoupled Next.js primary frontend reverse-proxying API calls to the Python Flask engine:

#### Terminal 1 — Start Python Flask Backend (Port 5000):
```bash
python -c "from app import app; app.run(host='127.0.0.1', port=5000, debug=False)"
```

#### Terminal 2 — Start Next.js Production Frontend (Port 3000):
```bash
cd frontend
npm run build
npm start
```

Open your browser at `http://127.0.0.1:3000`.

### 4. Environment Variables

| Variable | Default Value | Description |
|---|---|---|
| `FLASK_API_URL` | `http://127.0.0.1:5000` | Target URL for Next.js API & media reverse proxy |
| `PORT` | `3000` | Port for Next.js web application |
| `SECRET_KEY` | `dev_secret_key...` | Flask session encryption key |
| `GEOCODING_PROVIDER` | `nominatim` | Reverse geocoder provider (`nominatim` or `google`) |

### 5. Instant One-Step Rollback
If needed, traffic can instantly revert to Flask legacy SSR by pointing ingress traffic directly to `http://127.0.0.1:5000` or checking out release tag `git checkout pre-nextjs-port`. See [`.gsd/ROLLBACK.md`](.gsd/ROLLBACK.md) for full disaster recovery documentation.

---

## 👥 Demo Credentials for Testing

| Role | Username / Identifier | Password | Managed Entity / Site |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` | Company-wide governance across all sites |
| **Manager 1** | `vikram.sharma@enterprise.internal` | `password123` | Engineering Department (Aarav, Aditya) |
| **Manager 2** | `priya.patel@enterprise.internal` | `password123` | Operations & Field Sales (Rohan, Sneha) |
| **Employee 1** | `aarav@enterprise.internal` | `password123` | Mumbai Corporate HQ (General Shift) |
| **Employee 2** | `rohan@enterprise.internal` | `password123` | Bengaluru Tech Hub (General Shift) |
| **Employee 3** | `sneha@enterprise.internal` | `password123` | Remote Field Operations (Flexible Shift) |

---

## ⏱️ Flexible Hours Shift Policy (Core Hours + Required Hours)

The system supports two shift paradigms:
1. **Fixed Shifts (`fixed`)**: Traditional schedules with fixed start and end times, grace periods, late arrival flags, and early departure penalties.
2. **Flexible Shifts (`flexible`)**: Fluid work schedules where employees choose their arrival and departure times, subject to:
   - **Core Hours Window**: A mandatory presence window (e.g., 11:00 to 16:00) during which employees must be on-premise or actively clocked in, with configurable grace tolerance.
   - **Required Hours**: A minimum worked time requirement per day (e.g., 8.0h) and optionally per week (e.g., 40.0h).
   - **"Short Hours" replaces "Late"**: In flexible shifts, late check-in penalties do not apply. Punctuality is evaluated strictly against daily required hours and core window compliance.

### 1. Flexible Shift Attributes & Server Validation
- `core_start` & `core_end`: Mandatory presence window. Validated: `core_end` must be strictly after `core_start`.
- `required_daily_hours`: Daily worked time threshold (0.5h to 24.0h).
- `required_weekly_hours`: Optional weekly target (1.0h to 168.0h).
- `enforcement_mode`: `daily`, `weekly`, or `both`.
- `allowed_window_start` & `allowed_window_end`: Optional bounds outside of which events are flagged for administrative review.
- `unpaid_break_minutes`: Auto-deducted from gross worked time if gross time meets or exceeds break.
- `core_hours_enforced` & `core_grace_minutes`: Toggle for core compliance and start/end grace tolerance (default 15m).
- `overtime_threshold_minutes`: Buffer beyond required hours before overtime hours begin accruing.
- `half_day_threshold_hours`: Minimum worked threshold below which attendance is marked `Half Day`.
- `weekly_off_days` & `week_start_day`: Configurable rest days (e.g., `Sat,Sun`) and week anchor day (default Monday).
- `count_flagged_events_policy`:
  - `count_pending` (default): Flagged events are tentatively credited towards worked time pending manager/admin review; recalculated if rejected.
  - `exclude_until_approved`: Flagged events do not contribute to worked time until explicitly approved.

### 2. Status Precedence Hierarchy
Attendance on flexible days is evaluated deterministically in `core/shift_engine.py` following this exact precedence order:
1. **Holiday / Weekly Off**: If non-working day with 0 worked time -> `Holiday` or `Weekly Off`. If work occurred on a rest day -> `Overtime` (100% of time counts as overtime).
2. **Missing Check-out**: An unclosed session on a past day -> `Missing Check-out` (contributes 0 hours until an approved correction request closes it).
3. **In Progress**: An open session on the current day -> `In Progress` (computes live elapsed time in real time).
4. **Absent**: Scheduled working day with 0 minutes recorded -> `Absent`.
5. **Half Day**: Closed sessions with worked time below `half_day_threshold_hours`.
6. **Short Hours**: Closed sessions with worked time below `required_daily_hours`.
7. **Core Hours Missed**: Required hours fully met, but core window was not covered within grace tolerance.
8. **Overtime**: Required hours met and exceeded by more than `overtime_threshold_minutes`.
9. **Complete**: Required hours met, core window covered, within overtime threshold.

*Note*: `core_missed` is also tracked as an independent secondary flag, allowing employees with Short Hours who also missed core hours to display both conditions clearly.

### 3. Weekly Balance & Deficit Recovery
When `enforcement_mode` is set to `weekly` or `both`, daily shortfalls can be redeemed later in the same work week. The system computes week-to-date worked vs. scheduled hours. An employee with a deficit on Tuesday who plans to make it up on Thursday receives the reassuring status: **"Short today, week on track"**.

### 4. Storage, Lazy Recalculation & Explicit Range Recomputation
- Daily attendance results are persisted in `daily_attendance_summary` with a JSON snapshot of the shift policy values active on that date.
- **Automatic Recalculation**: Automatically triggered whenever an employee checks in/out, a correction request is approved, or an admin approves/rejects a flagged event.
- **Lazy Recalculation**: On serverless hosting without scheduled background workers, summaries are computed lazily on demand when requested if stale or missing.
- **Historical Immutability & Explicit Range Recompute**: Editing a shift policy never modifies historical records silently. Administrators can run an explicit **Recalculate Range** action (`POST /admin/shifts/recalculate`) across selected date intervals, with before-and-after audit logs committed to `audit_logs`.

---

## ⏱️ Work Policy: Flexible Hours

GeoFace Enterprise implements **Flexible Hours** as the universal work policy for all active employees. There are no rigid or fixed start times for any employee. Punctuality is governed by required daily/weekly duration and core hours compliance.

### 1. Core Principles
- **No Fixed Clock-In**: Employees arrive at their convenience within site operating hours.
- **Duration Commitment**: Every employee is assigned a required daily duration (default **8.0 hours**) and an optional weekly duration (default **40.0 hours**).
- **Core Hours Presence**: A mandatory core window (e.g. **11:00 to 16:00**, with 15-minute grace tolerance) ensures organizational collaboration while offering scheduling freedom.
- **Transparent Duration Displays**: Admin portals, Manager team rosters, Employee dashboards (`/employee/check-in-out`), and Payroll exports display duration uniformly from a single source of truth.

### 2. Single Source of Truth: `get_effective_work_policy(employee_id, date)`
All calculations and UI views query `get_effective_work_policy(employee_id, date)` in `core/db.py`. Policy resolution strictly follows a 5-tier order:
1. **Per-Employee Direct Override**: Admin-configured `required_daily_hours` / `required_weekly_hours` on `employees` (e.g. part-time 5h/day, 25h/week). Marked with `(override)` in admin roster.
2. **Employee Assigned Policy**: The specific flexible policy referenced by `employees.shift_id`.
3. **Department Default**: Fallback to `departments.shift_id`.
4. **Site Default**: Fallback to `sites.shift_id`.
5. **Company Default**: Fallback to `settings.company_default_shift_id` (defaults to **Flexible 8h**, Shift ID 9).

### 3. Historical Snapshot Preservation & Mid-Week Policy Changes
- **Daily Snapshot Immutability**: Each day's attendance summary in `daily_attendance_summary` stores an immutable JSON snapshot (`policy_snapshot`) of the policy active on that date. Past attendance and payroll figures are never altered when policies are edited.
- **Mid-Week Policy Handling**: When an employee's policy or duration override changes mid-week, weekly required hours are calculated per day from the policy snapshot in effect on that day. Past days retain their snapshot, while the remainder of the week tracks under the new duration.
- **Explicit Recalculation**: Administrators can recompute past ranges using the **Recalculate Range** action, which is logged to the Audit Trail.

### 4. Seeded Flexible Work Policies
| Policy Name | Daily Target | Weekly Target | Core Hours | Unpaid Break | Core Grace |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Flexible 8h** *(Company Default)* | 8.0 hrs | 40.0 hrs | 11:00 - 16:00 | 60 mins | 15 mins |
| **Flexible 6h** *(Part-Time / Senior)* | 6.0 hrs | 30.0 hrs | 11:00 - 15:00 | 45 mins | 15 mins |
| **Flexible 9h** *(Extended Production)* | 9.0 hrs | 45.0 hrs | 10:30 - 16:30 | 60 mins | 15 mins |

### 5. Migration & Reversibility
- **Migration 008** (`migrations/008_make_flexible_hours_company_work_policy.sql`):
  - Adds `shifts.is_archived`, `employees.previous_shift_id`, `employees.required_daily_hours`, `employees.required_weekly_hours`.
  - Backs up previous shift IDs into `previous_shift_id` on all active employees.
  - Reassigns active staff to `Flexible 8h`.
  - Renames misleading fixed schedules to remove "Flexible" prefixes (e.g. `Legacy Fixed 09:00-18:00 (30m grace)` and `Legacy Fixed Field Shift (09:30 - 18:30)`).
  - Archives fixed shifts (`is_archived = 1`) and protects referenced shifts against deletion.
  - Logs `MIGRATE_FLEXIBLE_WORK_POLICY` in `audit_logs`.
- **Rollback Instructions**:
  ```sql
  -- Rollback active employees to previous shift assignments
  UPDATE employees SET shift_id = previous_shift_id WHERE previous_shift_id IS NOT NULL;
  UPDATE students SET shift_id = (SELECT shift_id FROM employees WHERE employees.id = students.id);
  ```

---

## 📊 Payroll Export Specification (`GET /admin/payroll-export/csv`)

The administrative payroll export generates a standardized, payroll-engine-compatible CSV supporting flexible and legacy shifts:

| Column Header | Data Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `Employee ID` | String | Unique company employee identifier | `EMP-001` |
| `Name` | String | Full legal name of employee | `Aarav Sharma` |
| `Department` | String | Assigned organizational department | `Engineering & Architecture` |
| `Site` | String | Assigned primary work location | `Tech Park Headquarters (Mumbai)` |
| `Policy Name` | String | Effective flexible work policy name | `Flexible 8h` |
| `Shift` | String | Legacy shift identifier (for backward compatibility) | `Flexible 8h` |
| `Shift Type` | String | Shift policy paradigm (`flexible` or `fixed`) | `flexible` |
| `Days Present` | Integer | Total days with verified check-in | `22` |
| `Total Regular Hours` | Float | Scheduled working hours completed (fixed shifts) | `176.00` |
| `Required Hours` | Float | Total required working hours (flexible policy) | `176.00` |
| `Worked Hours` | Float | Actual net worked hours | `182.50` |
| `Short Hours` | Float | Total deficit hours below required | `2.00` |
| `Overtime Hours` | Float | Net approved overtime hours accrued | `8.50` |
| `Core Missed Days` | Integer | Total days where core window was missed | `1` |
| `Late Check-ins` | Integer | Number of check-ins beyond grace period (fixed) | `0` |
| `Early Departures` | Integer | Number of check-outs before scheduled end (fixed) | `0` |
| `Flagged Incidents` | Integer | Number of geofence or proxy violations | `0` |

---

## 🧪 Automated Test Suite

Run all 38 automated test suites across geofencing, shift calculations, role authorization, and pipelines:
```bash
python -m unittest discover tests
```

### Covered Test Categories:
1. **`test_geofence.py` (7 tests)**:
   - Within geofence center calculation.
   - Exact boundary coordinate evaluation ($\le 200\text{m}$).
   - Boundary breach outside registered perimeter.
   - Zero-distance origin point validation.
   - Remote/field bypass policy (`geofencing_enabled = 0`).
   - Missing/invalid GPS coordinate handling.
   - Cross-country / inter-city distance calculation.

2. **`test_shift_engine.py` (8 tests)**:
   - On-time arrival within 15-minute grace period.
   - Late arrival beyond grace limit with exact minute calculation.
   - On-time shift departure.
   - Early leave departure with minute calculation.
   - Overtime calculation with threshold cutoff.
   - Net worked hours with automatic 60-minute break deduction.
   - Edge case: Missing check-out detection (`missing_checkout`).
   - Edge case: Corrupted sequence where check-out precedes check-in (`invalid_sequence`).

3. **`test_auth_boundaries.py` (8 tests)**:
   - Employee portal isolation (employees cannot see other employees' data).
   - Employee forbidden from accessing manager or admin endpoints.
   - Manager scoped queries (manager cannot view employees from other departments).
   - Manager cannot approve correction requests for employees outside their team.
   - Biometric proxy prevention (detects and blocks face mismatches).
   - Role-based media protection for attendance photos.

---

## ⚖️ Compliance Scaffolding & Legal Disclaimer

> [!WARNING]
> **Legal Disclaimer**: This platform provides technical scaffolding to support compliance with biometric privacy frameworks (such as GDPR Article 9, India's Digital Personal Data Protection Act, and the Illinois Biometric Information Privacy Act). Implementing this software does not constitute legal certification. Before production deployment, the deploying organization must review their configuration with qualified legal and HR counsel for their specific operating jurisdiction.
