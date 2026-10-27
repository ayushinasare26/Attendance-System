'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import FlashBanner from '@/components/FlashBanner';

export default function EmployeeLayout({ children }) {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  const employeeName = session?.employee_name || 'Employee';
  const employeeCode = session?.employee_code || '—';
  const deptName = session?.department_name || 'General';
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(employeeName)}&background=10b981&color=fff&rounded=true`;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 50%, #f8fafc 100%)' }}>
      <style jsx global>{`
        :root {
          --portal-primary: #059669;
          --portal-primary-hover: #047857;
          --portal-accent: #10b981;
        }

        .portal-navbar {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(16, 185, 129, 0.2);
          padding: 12px 20px;
        }

        .portal-badge {
          background: linear-gradient(135deg, #059669 0%, #10b981 100%);
          color: white;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
        }

        .nav-link.portal-active {
          color: #059669 !important;
          font-weight: 700;
          border-bottom: 2px solid #059669;
        }

        .badge-ontime { background-color: #10b981; color: white; }
        .badge-late { background-color: #f59e0b; color: white; }
        .badge-early { background-color: #fbbf24; color: #1e293b; }
        .badge-overtime { background-color: #3b82f6; color: white; }
        .badge-flagged { background-color: #ef4444; color: white; }
      `}</style>

      {/* Employee Portal Minimal Header Navigation */}
      <nav className="navbar navbar-expand-lg portal-navbar sticky-top">
        <div className="container-fluid px-sm-4">
          <Link className="navbar-brand d-flex align-items-center gap-2 text-dark" href="/employee/check-in-out">
            <div
              className="logo-badge portal-badge"
              style={{
                width: '36px',
                height: '36px',
                fontSize: '1.1rem',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="bi bi-geo-alt-fill"></i>
            </div>
            <div>
              <span className="fw-bold fs-6">GeoFace Enterprise</span>
              <span className="badge bg-success-subtle text-success ms-1" style={{ fontSize: '0.7rem' }}>
                Employee Portal
              </span>
            </div>
          </Link>

          <button
            className="navbar-toggler border-0 shadow-none"
            type="button"
            onClick={() => setNavOpen(!navOpen)}
            aria-label="Toggle navigation"
          >
            <i className="bi bi-list fs-4"></i>
          </button>

          <div className={`collapse navbar-collapse ${navOpen ? 'show' : ''}`} id="portalNav">
            <ul className="navbar-nav me-auto mb-2 mb-lg-0 ms-lg-4 gap-lg-2">
              <li className="nav-item">
                <Link
                  className={`nav-link py-2 px-3 fw-medium text-secondary ${
                    pathname.includes('check-in-out') || pathname.includes('mark-attendance') || pathname === '/employee/' || pathname === '/employee'
                      ? 'portal-active'
                      : ''
                  }`}
                  href="/employee/check-in-out"
                  onClick={() => setNavOpen(false)}
                >
                  <i className="bi bi-fingerprint me-1"></i> Check In / Out
                </Link>
              </li>
              <li className="nav-item">
                <Link
                  className={`nav-link py-2 px-3 fw-medium text-secondary ${
                    pathname.includes('my-attendance') ? 'portal-active' : ''
                  }`}
                  href="/employee/my-attendance"
                  onClick={() => setNavOpen(false)}
                >
                  <i className="bi bi-calendar2-check me-1"></i> My Attendance
                </Link>
              </li>
            </ul>

            <div className="d-flex align-items-center gap-3 pt-2 pt-lg-0 border-top border-lg-0">
              <div className="d-flex align-items-center gap-2">
                <img
                  src={avatarUrl}
                  style={{ width: '34px', height: '34px' }}
                  alt="User"
                />
                <div className="lh-sm">
                  <div className="fw-bold small text-dark">{employeeName}</div>
                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                    ID: {employeeCode} • {deptName}
                  </div>
                </div>
              </div>
              <button
                onClick={() => logout('employee')}
                className="btn btn-outline-danger btn-sm rounded-pill px-3 d-flex align-items-center gap-1 shadow-sm"
                title="Sign Out of Portal"
              >
                <i className="bi bi-box-arrow-right"></i>
                <span className="d-none d-sm-inline fw-semibold small">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Flash Messages Container */}
      <div className="container-fluid px-sm-4 pt-3">
        <FlashBanner />
      </div>

      {/* Main Content */}
      <main>{children}</main>
    </div>
  );
}
