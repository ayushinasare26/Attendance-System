# System Architecture & Codebase Observations (RECOMMENDATIONS.md)

> **PRIME DIRECTIVE COMPLIANCE NOTE**:
> This document records technical, architectural, security, and operational observations identified during the deep analysis and baseline auditing of the GeoFace Enterprise Attendance System codebase.
> **In strict adherence to the project rules, none of these items have been modified, refactored, or "fixed".** All behaviors, quirks, and potential vulnerabilities remain byte-for-byte and logic-for-logic identical to the original application.

---

## 1. Security & Authentication Observations

### 1.1 Hardcoded Fallback `SECRET_KEY`
- **Location**: `config.py` line 150
- **Observation**: `SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "geo-face-attendance-secret-2026")`
- **Analysis**: If `FLASK_SECRET_KEY` is not provided in environment variables, the application defaults to a predictable, publicly exposed secret string. This allows anyone with access to the codebase or git history to forge signed Flask session cookies and impersonate administrative or employee sessions.
- **Recommendation for Future Roadmap**: Require `FLASK_SECRET_KEY` to be set in production environments and raise a startup configuration error if omitted.

### 1.2 Absence of CSRF (Cross-Site Request Forgery) Protection
- **Location**: All POST/PATCH form handlers in `blueprints/admin/routes.py`, `blueprints/employee/routes.py`, `blueprints/manager/routes.py`, and `templates/`
- **Observation**: Forms and API endpoints do not issue or validate CSRF tokens (such as `Flask-WTF` CSRFProtect). 
- **Analysis**: Because authentication relies on browser session cookies (`session`), an authenticated user visiting a malicious third-party site could theoretically be subjected to cross-origin form submissions (e.g. submitting unauthorized correction requests, toggling employee status, or modifying site boundaries) unless browsers enforce strict `SameSite=Lax/Strict` cookie policies.
- **Recommendation for Future Roadmap**: Introduce standard anti-CSRF token middleware (e.g. `Flask-WTF` or Double Submit Cookie pattern) when backend refactoring is scheduled.

### 1.3 In-Memory Rate Limiter in Multi-Instance / Serverless Environments
- **Location**: `core/auth.py` lines 14–40 (`_RATE_LIMITS = {}`)
- **Observation**: The sliding window rate limiter stores client request timestamps in an in-memory Python dictionary `_RATE_LIMITS`.
- **Analysis**: In serverless hosting (e.g. Vercel, AWS Lambda) or multi-worker production WSGI setups (e.g. Gunicorn with multiple worker processes), memory is not shared between instances or requests. As a result, requests hitting different function instances or processes bypass the rate limiter, rendering it ineffective under distributed traffic.
- **Recommendation for Future Roadmap**: Move rate-limiting state to a distributed cache/datastore (e.g., Redis / Upstash Redis KV).

---

## 2. Infrastructure, Hosting & Deployment Observations (Vercel & Serverless)

### 2.1 SQLite Database on Ephemeral Local Filesystem (`/tmp/attendance.db`)
- **Location**: `config.py` lines 115–126
- **Observation**: When running on Vercel (`IS_VERCEL = True`), the database is copied to `/tmp/attendance.db`.
- **Analysis**: Serverless function instances are stateless and ephemeral. The `/tmp` directory is unique to an individual execution container and is destroyed when the container spins down. Any writes made to the SQLite database (such as new check-ins, employee enrollments, site creations, or audit logs) are lost as soon as the instance is recycled or requests hit another instance.
- **Recommendation for Future Roadmap**: Transition from local SQLite to a cloud-hosted managed relational database (e.g., PostgreSQL on Supabase, Neon, or PlanetScale / Turso SQLite over HTTP).

### 2.2 Serverless Function Request Body Size Limits vs Base64 Biometric Payloads
- **Location**: `blueprints/employee/routes.py` lines 476–500, `blueprints/admin/routes.py` lines 1286–1340
- **Observation**: Biometric check-in transmits a primary JPEG image along with 4 burst liveness frames as base64-encoded strings within a single JSON payload.
- **Analysis**: Base64 encoding increases data size by ~33%. A camera payload with 5 JPEG images can reach 1.5MB to 3.5MB. Vercel Serverless Functions impose a strict maximum payload request body limit of **4.5 MB**. If webcam resolution is increased or additional burst frames are configured, requests will fail with HTTP 413 Payload Too Large.
- **Recommendation for Future Roadmap**: Compress client images to maximum 640x480 resolution (as currently configured in `check_in_out.html`), or migrate to pre-signed direct upload URLs to S3/Cloud Storage.

### 2.3 Serverless Execution Timeouts vs Biometric Facial Recognition Processing
- **Location**: `core/face_engine.py`, `vercel.json`
- **Observation**: Facial recognition involves face detection (HOG / CNN), landmark alignment (68-point 2D shape predictor), 128-dimensional deep feature extraction (dlib ResNet), and Euclidean distance matching against all cached enrolled embeddings.
- **Analysis**: On CPU-constrained serverless instances, processing 5 frames can consume 3–8 seconds. Vercel Serverless Functions on the Hobby tier have a default execution timeout of **10 seconds** (configurable up to 15s or 60s on Pro/Enterprise). If cold start latency is added to dlib computation, requests risk timing out (HTTP 504 Gateway Timeout).
- **Recommendation for Future Roadmap**: Offload biometric processing to a dedicated background worker or asynchronous queue, or maintain a warm container instance for face inference.

### 2.4 Binary Wheel Compatibility for `dlib` and `face_recognition` on Serverless Runtimes
- **Location**: `requirements.txt` (`face-recognition==1.3.0`, `face-recognition-models==0.3.0`, `dlib`)
- **Observation**: `dlib` requires C++ compilation and native shared libraries (`CMake`, `libopenblas`, `liblapack`).
- **Analysis**: AWS Lambda / Vercel Serverless Python runtimes have strict zip size limits (250MB uncompressed) and lack native compilation tools during deployment. Pre-compiled Linux `manylinux` wheels must be used. In many Vercel deployments, `dlib` installation fails build limits unless a pre-built Lambda layer or Docker container is deployed.
- **Recommendation for Future Roadmap**: Verify whether face recognition is run serverlessly or hosted on a lightweight dedicated VM / container (e.g., Render, Railway, Fly.io) while Next.js runs on Vercel.

---

## 3. Codebase & Template Quirks

### 3.1 Hardcoded Form Pre-fill Defaults in Login Template
- **Location**: `templates/employee/login.html` lines 54 and 62
- **Observation**:
  - `name="identifier"` has hardcoded default `value="29"`
  - `name="password"` has hardcoded default `value="employee123"`
- **Analysis**: In a production environment, inputs should be blank. Having pre-filled test values directly in the template can cause accidental sign-ins if a user clicks submit without reviewing.
- **Status for Port**: Preserved identically in the Next.js port to maintain 100% exact fidelity with the Jinja app behavior.

### 3.2 Unused Legacy Template `student_detail.html`
- **Location**: `templates/admin/student_detail.html`
- **Observation**: This template exists in the `templates/admin/` folder, but no route in `blueprints/admin/routes.py` or `app.py` renders it. (The active attendance detail route renders `templates/admin/attendance_detail.html`).
- **Analysis**: Legacy artifact from earlier versions of the student-attendance system before rebranding to workforce employee attendance.
- **Status for Port**: Documented in parity checklist; not mounted to any active route because no route renders it.

### 3.3 Duplicate Route Aliases
- **Location**: 
  - `/check-in` and `/api/check-in`
  - `/check-out` and `/api/check-out`
  - `/manual-check-in` and `/api/manual-check-in`
  - `/manual-check-out` and `/api/manual-check-out`
  - `/attendance-policy` and `/api/attendance-policy`
  - `/my-attendance` and `/api/employee/my-attendance`
  - `/admin/shifts` and `/admin/api/admin/shifts`
  - `/admin/sites` and `/admin/api/admin/sites`
  - `/admin/payroll-export` and `/admin/reports`
- **Observation**: Multiple endpoints bind to identical view functions.
- **Status for Port**: Preserved 100% in the backend mirror loop and routing tables so all bookmarks and integrations remain valid.

### 3.4 Inactive Seeded Employee EMP-001
- **Location**: `attendance.db`, `scripts/seed_enterprise_data.py`
- **Observation**: Employee `EMP-001` (Aarav Sharma) is stored with `active = 0`, while EMP-002, EMP-003, and EMP-004 are `active = 1`.
- **Analysis**: This allows the Admin Employees screen (`/admin/employees`) to demonstrate the "Activate / Deactivate" toggle functionality.
- **Status for Port**: Intentionally preserved as part of the baseline test environment.

### 3.5 Manager Dashboard Metric Cards vs Roadmapped Chart Canvases
- **Location**: `templates/manager/dashboard.html`
- **Observation**: While early high-level planning notes referenced donut/bar charts for managers, the baseline Flask Jinja template `templates/manager/dashboard.html` features 4 high-level metric cards (`total_team`, `checked_in_count`, `not_checked_in_count`, `late_count`) and a real-time team roster table with department/shift dropdown filters. Chart.js canvases exist only in Admin Dashboard (`templates/admin/dashboard.html`).
- **Status for Port**: Strictly ported `templates/manager/dashboard.html` 1:1 with identical metric cards, styling, badges, and filters, respecting the Prime Directive.

