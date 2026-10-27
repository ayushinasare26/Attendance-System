# 🔄 GeoFace Enterprise: Cutover Architecture & Rollback Procedures

This document details the staging/production cutover architecture, health verification protocols, and one-step rollback procedures for the Next.js re-platforming project.

---

## 1. Cutover Architecture

In the re-platformed architecture:
- **Primary Client Entry Point**: Next.js App Router (Port 3000 / Production Ingress)
  - Serves all client-side rendered UI routes (Employee Portal, Manager Portal, Admin Portal).
  - Handles client state, responsive layouts, micro-animations, webcam scanner, GPS location acquisition, and Chart.js dashboards.
  - Reverse-proxies all API requests (`/api/v1/:path*`) and static media assets (`/attendance_photos/:path*`, `/employee_image/:id`, `/student_image/:id`) directly to the Flask backend.
- **Backend API & Core Engine**: Python Flask Server (Port 5000 / `FLASK_API_URL`)
  - Executes all business logic, facial recognition pipelines (dlib ResNet-34 128-d vectors), geofencing calculations (Haversine formula), and SQLite database transactions (`attendance.db`).
  - Dual-mode JSON adaptation engine (`core/api_adapter.py`) responds with structured JSON when requested via `/api/v1/`, while preserving original HTML Jinja templates for full fallback compatibility.
  - Native Flask session cookie (`session`) round-trips transparently through Next.js reverse proxy with `SameSite=Lax` and `HttpOnly`.

---

## 2. One-Step Rollback Procedures

The re-platforming project strictly adhered to the **Zero Behavioral Change** and **Zero Schema Change** directives. All historical SQLite tables (`employees`, `attendance_events`, `shifts`, `sites`, `settings`, `audit_logs`, `correction_requests`, `pipeline_logs`) remain byte-for-byte identical.

There are two tested, proven methods for rollback:

### Method 1: Instant Routing / Proxy Rollback (Zero Downtime, < 5 Seconds)

If an issue arises in production or staging, traffic can be redirected directly to the Python Flask backend without modifying database state or pulling code:

#### In Nginx / Cloudflare / Load Balancer:
Point the upstream target from `http://127.0.0.1:3000` (Next.js) back to `http://127.0.0.1:5000` (Flask):

```nginx
# Before Rollback (Next.js Primary):
# proxy_pass http://127.0.0.1:3000;

# After Rollback (Flask Legacy Primary):
proxy_pass http://127.0.0.1:5000;
```

#### In Local / Docker / Environment:
Run the Flask server on the primary port:
```bash
python -c "from app import app; app.run(host='0.0.0.0', port=3000, debug=False)"
```
Because the Flask application retains all server-rendered Jinja templates in `templates/`, browsing to `http://<domain>/` immediately serves the original SSR pages.

---

### Method 2: Git Tag Rollback (Full Codebase Restoration)

At the start of Phase 1, the repository state was snapshot and committed with release tag `pre-nextjs-port`:

```bash
# 1. Checkout the pristine baseline release tag
git checkout pre-nextjs-port

# 2. Start Flask backend directly
python -c "from app import app; app.run(host='0.0.0.0', port=5000, debug=False)"
```

**Verification Proof**:
- No database migrations or schema adjustments were made.
- All attendance records, employee biometric templates, and audit logs created during the Next.js execution remain valid and readable by the legacy Jinja views.

---

## 3. Staging Smoke Test & Parity Verification

To verify the cutover environment before promoting to production:
1. Start Flask backend daemon:
   ```bash
   python -c "from app import app; app.run(host='127.0.0.1', port=5000, debug=False)"
   ```
2. Build & start Next.js production server:
   ```bash
   cd frontend
   npm run build
   npx next start -p 3000
   ```
3. Run comprehensive verification suite:
   ```bash
   node scripts/verify_phase7_cutover.js
   python -m pytest tests/
   ```
