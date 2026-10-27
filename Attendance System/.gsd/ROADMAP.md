---
milestone: Next.js + Flask Enterprise Re-platform
version: 1.0.0
updated: 2026-10-23T16:30:00+05:30
---

# ROADMAP.md — Re-Platforming Phases & Execution Tracking

> **Current Phase:** Phase 1 - Baseline, SPEC, ROADMAP, PARITY  
> **Status:** Verifying & Awaiting User Approval ("approved")  
> **Planning Lock:** Active — No implementation code until Phase 1 is approved.

---

## Must-Haves (from SPEC.md)

- [ ] **Exact Zero-Change Parity**: Zero changes to features, rules, math, permissions, routes, or visual aesthetics.
- [ ] **Dual-Mode Backend**: Mirror all routes under `/api/v1` with `g.json_mode` while keeping default HTML byte-for-byte identical.
- [ ] **Same-Origin Proxying**: Next.js rewrites proxy `/api/v1` and media paths to Flask; session cookies preserved natively.
- [ ] **No Client Business Logic**: All validation, policies, geofence, and shift calculations remain authoritative in Python Flask.
- [ ] **Comprehensive Proof**: Empirical verification at every step (test runner output, HTML diffs, screenshots, curl output).

---

## Phase Breakdown

### Phase 1: Baseline, SPEC, ROADMAP, PARITY
**Status:** 🔄 In Progress (Artifacts Completed, Awaiting User "approved")  
**Objective:** Record test counts, HTML snapshots, and responsive screenshots across all portals; establish exhaustive parity requirements; finalize architecture.  
**Deliverables:**
- [x] Initial git baseline commit and `pre-nextjs-port` git tag.
- [x] Test suite baseline recorded: 99 passed, 1 warning in 18.06s.
- [x] HTML snapshots of all 19 unique page views saved in `.gsd/snapshots/baseline/`.
- [x] Full-page desktop (1280px) and mobile (375px) screenshots for all 19 pages saved in `.gsd/screenshots/baseline/` (38 images total).
- [x] `.gsd/SPEC.md` marked `Status: FINALIZED` with Vercel deployment trade-off analysis.
- [x] `.gsd/ROADMAP.md` decomposing all 8 phases.
- [x] `.gsd/PARITY.md` cataloging every page, form, control, dialog (25 total), and inline JS mapping for `check_in_out.html`.
- [x] `.gsd/RECOMMENDATIONS.md` recording non-blocking architectural and security observations.
- [ ] **Milestone Stop**: Present Phase 1 deliverables to user and pause for "approved".

---

### Phase 2: Backend `/api/v1` Mirrors & Dual-Mode Helpers
**Status:** ✅ Complete  
**Objective:** Implement the additive `/api/v1` route mirroring loop and JSON-mode response adapters without modifying a single line of business logic.  
**Depends on:** Phase 1 Approval  
**Plans:**
- [x] Plan 2.1: Implement automatic route mirror registration loop in Flask startup for all blueprints and root endpoints.
- [x] Plan 2.2: Implement `before_request` hook setting `g.json_mode` on `/api/v1` prefixes.
- [x] Plan 2.3: Implement JSON-mode response adapters for `render_template`, `redirect` + `flash`, and role auth decorators (`login_required_admin`, `login_required_manager`, `login_required_employee`).
- [x] Plan 2.4: Add custom JSON serializer handling SQLite `Row`, `datetime`, `date`, and `Decimal` objects.
- [x] Plan 2.5: Verify HTML snapshot diff is 0 bytes (excluding dynamic timestamps).
- [x] Plan 2.6: Verify existing 99 tests pass unchanged + add `tests/test_api_v1_mirrors.py` (117 total tests passing).
- [x] Plan 2.7: Atomic commit `feat(backend): add /api/v1 route mirroring and dual-mode JSON adapters`.

---

### Phase 3: Frontend Scaffold & Infrastructure Proof
**Status:** ✅ Complete  
**Objective:** Initialize Next.js (App Router) in `frontend/`, configure reverse-proxy rewrites, setup styling/icons, implement API client, auth context, layouts, and login pages.  
**Depends on:** Phase 2  
**Plans:**
- [x] Plan 3.1: Initialize Next.js project in `frontend/` with React, React-Bootstrap, Bootstrap Icons, TanStack Query, and React-Chartjs-2.
- [x] Plan 3.2: Port static assets, Google Fonts (Inter), and `static/css/style.css` to `frontend/`.
- [x] Plan 3.3: Implement `next.config.mjs` rewrites for `/api/v1/:path*` and media paths (`/attendance_photos/`, `/student_image/`, `/employee_image/`) with `skipTrailingSlashRedirect: true`.
- [x] Plan 3.4: Prove proxy limits: test large base64 image payload upload and response latency through Next.js proxy rewrite.
- [x] Plan 3.5: Prove cookie round-trip: verify login sets Flask session cookie through proxy and subsequent requests maintain session.
- [x] Plan 3.6: Implement shared `formatLocalTimestamp.js` and verify against Python `config.py:format_local_timestamp`.
- [x] Plan 3.7: Implement the 3 portal layouts (`base_admin`, `base_manager`, `base_employee`) and root role-based redirect router (`/`).
- [x] Plan 3.8: Implement login pages (`/login`, `/admin/login`, `/employee/login`) matching demo shortcuts and credentials.
- [x] Plan 3.9: Atomic commit `feat(frontend): scaffold Next.js app router, rewrites proxy, auth context, layouts, and login pages`.

---

### Phase 4: Employee Portal Port & Verification
**Status:** ✅ Complete  
**Objective:** Port the Employee Portal (`/employee/check-in-out` and `/employee/my-attendance`) with exact behavior for camera, GPS, flexible shift live timer, and manual check-in.  
**Depends on:** Phase 3  
**Plans:**
- [x] Plan 4.1: Implement modular hooks (`useCamera`, `useGeolocation`, `useLiveClock`, `useFlexibleStatus`).
- [x] Plan 4.2: Implement `check-in-out` subcomponents (CameraScanner, ManualAttendancePanel, GeofenceWarningBanner, LiveStatusPanel, ConfirmationModal).
- [x] Plan 4.3: Port `/employee/my-attendance` history table, month/year filters, and correction request submission modal.
- [x] Plan 4.4: Verify employee check-in (face and manual flows), demo mode, GPS warnings, and live 1s/60s timers against PARITY.md.
- [x] Plan 4.5: Capture proof screenshots and mark Employee rows as Pass in PARITY.md.
- [x] Plan 4.6: Atomic commit `feat(employee): port employee check-in-out and attendance history to Next.js`.

---

### Phase 5: Manager Portal Port & Verification
**Status:** ✅ Complete  
**Objective:** Port Manager Portal (`/manager/dashboard`, `/manager/attendance`, `/manager/correction-requests`).  
**Depends on:** Phase 4  
**Plans:**
- [x] Plan 5.1: Implement Manager Dashboard with live team attendance metrics and filter controls.
- [x] Plan 5.2: Implement Manager Team Attendance Records table with date/employee filters.
- [x] Plan 5.3: Implement Manager Correction Requests queue with inline approve/reject review modal.
- [x] Plan 5.4: Verify team scoping boundaries (managers only view their authorized subordinates).
- [x] Plan 5.5: Capture proof screenshots and mark Manager rows as Pass in PARITY.md.
- [x] Plan 5.6: Atomic commit `feat(manager): port manager dashboard, team attendance, and correction reviews to Next.js`.

---

### Phase 6: Admin Portal Port & Sub-Batches
**Status:** ✅ Complete  
**Objective:** Port the comprehensive Admin Portal (11 screens) across structured sub-batches.  
**Depends on:** Phase 5  
**Plans:**
- [x] Plan 6.1 (Batch A): Admin Dashboard & Summary metrics + Chart.js daily workforce trends.
- [x] Plan 6.2 (Batch B): Sites Management (`/admin/sites`) with geocode forward lookup and radius configuration.
- [x] Plan 6.3 (Batch C): Shift Management (`/admin/shifts`) with general, night, flexible shift schedules and bulk assignment.
- [x] Plan 6.4 (Batch D): Employee Management (`/admin/employees`) & Enrollment with consent (`/admin/enroll`).
- [x] Plan 6.5 (Batch E): Attendance Records (`/admin/attendance`) & Attendance Detail (`/admin/attendance/[id]`).
- [x] Plan 6.6 (Batch F): Flagged Queue (`/admin/flagged`) & Administrative Correction Reviews.
- [x] Plan 6.7 (Batch G): Reports & Payroll CSV Export (`/admin/payroll-export`).
- [x] Plan 6.8 (Batch H): Settings & Attendance Policies (`/admin/settings`) and Audit Logs (`/admin/audit-logs`).
- [x] Plan 6.9: Verify all 25 confirm/alert dialogs and all 35 admin flash messages.
- [x] Plan 6.10: Capture proof screenshots and mark Admin rows as Pass in PARITY.md.
- [x] Plan 6.11: Atomic commit `feat(admin): port administrative governance, shift engine, payroll export, and audit portals to Next.js`.

---

### Phase 7: Cutover on Preview / Staging
**Status:** ✅ Complete  
**Objective:** Configure staging/preview deployment where Next.js serves all pages and Flask serves API/media. Preserve old Jinja templates and routes in repository.  
**Depends on:** Phase 6  
**Plans:**
- [x] Plan 7.1: Verify Next.js production build (`npm run build`) with zero lint or compilation errors.
- [x] Plan 7.2: Verify full test suite passes (backend 117 tests and comprehensive cutover verification script).
- [x] Plan 7.3: Prove one-step rollback procedure back to `pre-nextjs-port` release.
- [x] Plan 7.4: Atomic commit `deploy(cutover): configure Next.js primary frontend deployment with Flask backend proxy`.

---

### Phase 8: Final Cleanup & Linguist Overrides (Post-Approval Only)
**Status:** ✅ Complete  
**Objective:** Following explicit user sign-off on parity proof, remove Jinja templates and configure `.gitattributes`.  
**Depends on:** Written User Approval of Phase 7  
**Plans:**
- [x] Plan 8.1: Remove `templates/` folder and server-rendered HTML view handlers.
- [x] Plan 8.2: Add `.gitattributes` linguist overrides for GSD tooling and scripts.
- [x] Plan 8.3: Update `README.md` with updated architecture, startup instructions, and environment variables.
- [x] Plan 8.4: Atomic commit `chore(cleanup): remove legacy Jinja templates and update repository metadata`.

---

## Progress Summary

| Phase | Status | Tasks Complete | Blockers / Dependencies |
|-------|--------|----------------|--------------------------|
| **1. Baseline & Spec** | ✅ Complete | 7 / 7 | None (Approved) |
| **2. Backend API Mirrors** | ✅ Complete | 7 / 7 | None |
| **3. Frontend Scaffold** | ✅ Complete | 9 / 9 | None |
| **4. Employee Portal** | ✅ Complete | 6 / 6 | Phase 3 Complete |
| **5. Manager Portal** | ✅ Complete | 6 / 6 | Phase 4 Complete |
| **6. Admin Portal** | ✅ Complete | 11 / 11 | Phase 5 |
| **7. Cutover & Rollback Proof** | ✅ Complete | 4 / 4 | Phase 6 |
| **8. Final Cleanup** | ✅ Complete | 4 / 4 | User Approval of Phase 7 |

---

*Last updated: 2026-10-23*
