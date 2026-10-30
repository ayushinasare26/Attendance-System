# SPEC.md — GeoFace Enterprise Re-Platforming Specification

> **Status**: `FINALIZED`
>
> ⚠️ **Planning Lock**: Requirements and target architecture are locked. Implementation proceeds strictly according to this document and ROADMAP.md after explicit user approval.

---

## 1. Vision & Prime Directive

### 1.1 Vision
Modernize the presentation layer of the GeoFace Enterprise Attendance System by re-platforming from Flask + Jinja server-rendered templates to a Next.js (App Router) frontend, while retaining the existing Python Flask application as the authoritative backend.

### 1.2 Prime Directive
**This is a pure technology port, NOT a product change.**
Every feature, function, rule, permission, message, calculation, screen, and visual detail must behave exactly as it does today:
- If any behavior appears odd, buggy, or insecure, it must NOT be fixed or improved. It is cataloged in `.gsd/RECOMMENDATIONS.md` and left unchanged.
- If any behavior cannot be reproduced with 100% exact fidelity, work must stop immediately to solicit user guidance.
- Non-JSON / default HTML routes must remain byte-for-byte identical until final cutover.

---

## 2. Goals & Non-Goals

### 2.1 Goals
1. **Frontend Re-platforming**: Build a high-fidelity Next.js (App Router) frontend inside `frontend/` using React, TanStack Query, React-Bootstrap (Bootstrap 5.3 + Bootstrap Icons), existing `static/css/style.css`, and React-Chartjs-2.
2. **Backend Dual-Mode Operation (Additive Only)**:
   - Mirror all existing blueprint and root routes under `/api/v1` using the SAME view functions.
   - Detect `/api/v1` requests using a request-scoped flag (`g.json_mode`) to adapt responses:
     - `render_template` returns template context dictionaries as JSON.
     - `redirect` + `flash` returns `{"ok": True, "message": ..., "category": ..., "redirect": "<frontend path>"}`.
     - Auth decorators return HTTP 401/403 with `{"error": ..., "redirect": ...}`.
   - Preserve default HTML responses byte-for-byte for existing routes.
3. **Same-Origin Reverse Proxying**:
   - Next.js rewrites proxy `/api/v1/:path*` and media paths (`/attendance_photos/:path*`, `/student_image/:id`, `/employee_image/:id`) to the Flask backend using server-only environment variable `FLASK_API_URL`.
   - Browser interacts exclusively with the Next.js origin, preserving Flask session cookies natively without JWTs, localStorage tokens, or CORS modifications.
4. **Zero Client-Side Business Logic**:
   - Status evaluation, flexible shift hours math, policy resolution, geofence boundary checks, and permissions remain 100% server-side in Python `core/`.
5. **Exact Visual & Functional Parity**:
   - All 22 Jinja templates reproduced with identical layout, CSS rules, fonts, micro-interactions, alert/confirm dialogs (25 occurrences), and flash notices.
   - Port `local_time` Jinja filter to JavaScript with 100% behavioral matching and hydration safety.

### 2.2 Non-Goals (Strictly Out of Scope)
- No modification of biometric face recognition, liveness detection, or dlib Euclidean distance thresholds.
- No changes to geofencing, geopy calculations, GPS accuracy thresholds, or geocoding cache.
- No changes to shift engines, flexible hour algorithms, or payroll calculations.
- No changes to database schema, tables, SQLite WAL configuration, or migrations.
- No NextAuth, Auth0, JWT, or client-side session management.
- No Next.js Server Actions or Route Handlers (`app/api/*`) executing business logic.
- No upgrading of backend dependencies or refactoring of `core/` modules.
- No styling redesign, UX improvements, or TailwindCSS introduction.

---

## 3. System Architecture & Component Design

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT BROWSER                                    |
|                       Origin: http://localhost:3000                               |
+-----------------------------------------------------------------------------------+
       |                                                    |
       | 1. Page Requests (/employee/check-in-out)          | 2. API & Media Requests
       |    Direct Next.js App Router Page Render           |    (/api/v1/*, /attendance_photos/*)
       v                                                    v
+-------------------------------------+   Rewrites Proxy    +-------------------------------------+
|        NEXT.JS APP ROUTER           | ------------------> |          FLASK BACKEND              |
|        (Presentation Only)          |    (Server-side     |       (Authoritative Core)          |
|                                     |      Proxying)      |                                     |
| - Client Components ('use client')  |                     | - Blueprints: admin, manager, emp   |
| - TanStack Query for Data Fetching  |                     | - Dual Mode: HTML or g.json_mode    |
| - React-Bootstrap + static CSS      |                     | - Biometrics & Liveness (dlib)      |
| - Client-side Camera / Geolocation  |                     | - Geofencing & Shift Calculations   |
| - Hydration-Safe Mounts             |                     | - Session Cookie Authoritative Auth |
+-------------------------------------+                     +-------------------------------------+
```

### 3.1 Backend Architecture: Additive Single Code Path

1. **Mirror Route Registration**:
   - A single startup hook loops over `app.url_map.iter_rules()` and registers mirror routes prefixed with `/api/v1` pointing to the exact same view endpoints.
   - For example:
     - `/admin/dashboard` is mirrored at `/api/v1/admin/dashboard`
     - `/employee/check-in-out` is mirrored at `/api/v1/employee/check-in-out`
     - `/employee/api/employee/live-status` is mirrored at `/api/v1/employee/api/employee/live-status`

2. **JSON-Mode Context Adapter**:
   - `before_request` hook checks if `request.path.startswith("/api/v1")`:
     - If true, sets `g.json_mode = True`.
   - Intercepted helpers:
     - **`render_template` adapter**: When `g.json_mode` is True, serializes the template context variables into JSON using a custom encoder that formats SQLite rows, `datetime` objects, `date` objects, and `Decimal` values.
     - **`redirect` + `flash` adapter**: When `g.json_mode` is True, captured flash messages and redirect targets are returned as:
       ```json
       {
         "ok": true,
         "message": "Work site 'Mumbai HQ' created successfully.",
         "category": "success",
         "redirect": "/admin/sites"
       }
       ```
     - **Auth Decorators (`core/auth.py`)**: When `g.json_mode` is True and authentication/authorization fails, returns HTTP 401 or 403 JSON:
       ```json
       {
         "error": "Unauthorized: Administrator privileges required",
         "redirect": "/admin/login"
       }
       ```
   - Routes already returning JSON (e.g., `/api/check-in`, `/employee/api/employee/live-status`) continue returning the exact same JSON payload.

### 3.2 Frontend Architecture: Next.js App Router

1. **Directory Structure**:
   ```
   frontend/
   ├── app/
   │   ├── (auth)/
   │   │   ├── login/page.jsx                # Maps to /login
   │   │   ├── admin/login/page.jsx          # Maps to /admin/login
   │   │   └── employee/login/page.jsx       # Maps to /employee/login
   │   ├── (admin)/
   │   │   ├── layout.jsx                    # Admin sidebar, header, footer (base_admin.html)
   │   │   └── admin/
   │   │       ├── dashboard/page.jsx
   │   │       ├── sites/page.jsx
   │   │       ├── shifts/page.jsx
   │   │       ├── employees/page.jsx
   │   │       ├── enroll/page.jsx
   │   │       ├── attendance/page.jsx
   │   │       ├── attendance/[id]/page.jsx
   │   │       ├── flagged/page.jsx
   │   │       ├── payroll-export/page.jsx
   │   │       ├── settings/page.jsx
   │   │       └── audit-logs/page.jsx
   │   ├── (manager)/
   │   │   ├── layout.jsx                    # Manager navbar, sidebar, header (base_manager.html)
   │   │   └── manager/
   │   │       ├── dashboard/page.jsx
   │   │       ├── attendance/page.jsx
   │   │       └── correction-requests/page.jsx
   │   ├── (employee)/
   │   │   ├── layout.jsx                    # Employee mobile header, nav (base_employee.html)
   │   │   └── employee/
   │   │       ├── check-in-out/page.jsx
   │   │       └── my-attendance/page.jsx
   │   ├── layout.jsx                        # Root HTML shell, fonts, Bootstrap CSS
   │   └── page.jsx                          # Root / route with role-based redirection
   ├── components/
   │   ├── common/                           # AlertBanners, ConfirmModal, DataTable, StatCard
   │   ├── employee/                         # CameraScanner, GeofenceWarning, LiveClock, FlexiblePanel
   │   ├── admin/                            # SiteModal, ShiftModal, RecalculateModal, EmployeePolicyModal
   │   └── manager/                          # ReviewCorrectionModal, TeamFilters
   ├── hooks/
   │   ├── useCamera.js                      # MediaDevices stream lifecycle, error handling
   │   ├── useGeolocation.js                 # GPS acquisition, accuracy threshold, error states
   │   ├── useLiveStatus.js                  # 60s flexible status polling
   │   ├── useLiveClock.js                   # 1s live clock with hydration guard
   │   └── useAuth.js                        # Client session state & 401 redirect listener
   ├── lib/
   │   ├── api.js                            # Fetch wrapper with credentials: 'include', 401 handling
   │   └── queryClient.js                    # TanStack Query client configuration
   ├── utils/
   │   └── formatLocalTimestamp.js           # Exact port of config.py format_local_timestamp
   └── next.config.mjs                       # Rewrites and proxy configuration
   ```

2. **Next.js Execution Rules**:
   - **Client Components Only for Data**: All pages are Client Components (`'use client'`). Data is fetched in the browser via `TanStack Query` from `/api/v1/...` with `credentials: 'include'`.
   - **No Server-Side Auth Decoding**: Node does not inspect, decrypt, or sign Flask session cookies. A 401/403 API response directly drives client navigation to the corresponding login route.
   - **Media Images via Plain `<img>`**: Attendance photos and employee avatars are rendered using native `<img>` tags (`/attendance_photos/...`, `/employee_image/...`). Next.js `<Image>` optimizer is NOT used for authenticated paths because its external fetcher does not transmit browser session cookies.
   - **Hydration Mismatch Prevention**: All components displaying current time, real-time durations, or formatted local dates render placeholders until mounted (`useEffect`).

---

## 4. Deployment Design (Next.js + Flask on Vercel)

### 4.1 Official Vercel Deployment Options & Trade-Off Analysis

Based on current official Vercel documentation for Next.js App Router and Python Serverless Functions:

| Architecture Option | Configuration Details | Pros | Cons & Blockers | Recommendation |
|---------------------|----------------------|------|-----------------|----------------|
| **Option A: Decoupled / Multi-Project via Rewrites** | Next.js frontend deployed on Vercel; Python Flask backend hosted on containerized runtime (Render/Railway/Fly/ECS) or standalone Vercel Python project. `next.config.mjs` rewrites `/api/v1/:path*` to `process.env.FLASK_API_URL`. | 1. Zero dlib / C++ binary size limits on AWS Lambda.<br>2. Full request body headroom (>10MB).<br>3. Persistent filesystem or persistent SQLite / Postgres.<br>4. No 10-second timeout constraints. | Requires maintaining two deployment environments (one frontend, one backend). | **Recommended for Production** |
| **Option B: Monorepo Single Vercel Project** | Next.js App Router as main framework, Flask backend placed under `/api/index.py` using `@vercel/python` serverless builder. `next.config.mjs` rewrites `/api/v1/:path*` -> `/api/:path*`. | 1. Single repository and single Vercel project deployment.<br>2. Automatic preview deployments on pull requests. | 1. **4.5 MB Request Body Limit**: Burst camera frames + primary selfie can approach this limit.<br>2. **10s / 15s Timeout**: HOG/CNN face matching + liveness can hit timeout on cold start.<br>3. **Ephemeral `/tmp`**: SQLite writes lost on instance cycle.<br>4. **dlib Wheel Size**: Exceeds 250MB uncompressed limit unless slimmed. | **Viable for Demo / Preview** with fallback SQLite seeding |

### 4.2 Next.js Proxy Configuration (`next.config.mjs`)

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  skipTrailingSlashRedirect: true, // Guarantees routes reach Flask unmodified
  async rewrites() {
    const flaskBackendUrl = process.env.FLASK_API_URL || 'http://127.0.0.1:5000';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${flaskBackendUrl}/api/v1/:path*`,
      },
      {
        source: '/attendance_photos/:path*',
        destination: `${flaskBackendUrl}/attendance_photos/:path*`,
      },
      {
        source: '/student_image/:id(\\d+)',
        destination: `${flaskBackendUrl}/student_image/:id`,
      },
      {
        source: '/employee_image/:id(\\d+)',
        destination: `${flaskBackendUrl}/employee_image/:id`,
      },
    ];
  },
};

export default nextConfig;
```

---

## 5. Verification & Testing Strategy

### 5.1 Backend Verification
- **Baseline Test Suite**: Run all 11 existing test files (`pytest tests/`). Baseline count: **99 passed, 1 warning**. Must remain 100% passing across all phases.
- **Mirror Equivalence Tests**: Add `tests/test_api_v1_mirrors.py` testing every `/api/v1` endpoint against its legacy equivalent.
- **HTML Snapshot Diff**: Compare HTML snapshots before and after Phase 2 implementation. The diff must be 0 bytes (excluding dynamic timestamps).

### 5.2 Frontend Verification
- **Component & Hook Unit Tests**: Vitest + React Testing Library for:
  - `useCamera` (mocking success, permission denied, device unavailable)
  - `useGeolocation` (mocking accurate GPS, low accuracy >100m, timeout, permission denied)
  - `formatLocalTimestamp` (tested against Python `config.py:format_local_timestamp` across 20 edge cases)
- **Visual Parity**: Pixel-level comparison against baseline screenshots (`.gsd/screenshots/baseline/*`) at both 1280x800 desktop and 375x667 mobile viewports.
- **End-to-End Smoke Test**: Playwright test executing login, check-in with GPS mock, and verifying the record in the Admin dashboard.

---

*Last updated: 2026-10-23*
