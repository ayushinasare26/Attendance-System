'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import FlashBanner from '@/components/FlashBanner';

export default function ManagerLayout({ children }) {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  const managerName = session?.employee_name || 'Manager';
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(managerName)}&background=d97706&color=fff&rounded=true`;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)' }}>
      <style jsx global>{`
        :root {
          --mgr-primary: #d97706;
          --mgr-primary-hover: #b45309;
          --mgr-bg: #fffbeb;
        }

        .manager-navbar {
          background: rgba(15, 23, 42, 0.96);
          backdrop-filter: blur(12px);
          border-bottom: 2px solid #d97706;
          padding: 12px 20px;
        }

        .manager-badge {
          background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
          color: white;
          box-shadow: 0 4px 12px rgba(217, 119, 6, 0.35);
        }

        .nav-link.manager-active {
          color: #f59e0b !important;
          font-weight: 700;
          border-bottom: 2px solid #f59e0b;
        }
      `}</style>

      {/* Manager Navigation Bar */}
      <nav className="navbar navbar-expand-lg manager-navbar sticky-top">
        <div className="container-fluid px-sm-4">
          <Link className="navbar-brand d-flex align-items-center gap-2 text-white" href="/manager/dashboard">
            <div
              className="logo-badge manager-badge"
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
              <i className="bi bi-people-fill"></i>
            </div>
            <div>
              <span className="fw-bold fs-6 text-white">GeoFace Enterprise</span>
              <span className="badge bg-warning text-dark ms-1" style={{ fontSize: '0.7rem', fontWeight: 700 }}>
                Manager Portal
              </span>
            </div>
          </Link>

          <button
            className="navbar-toggler border-0 shadow-none text-white"
            type="button"
            onClick={() => setNavOpen(!navOpen)}
            aria-label="Toggle navigation"
          >
            <i className="bi bi-list fs-4 text-white"></i>
          </button>

          <div className={`collapse navbar-collapse ${navOpen ? 'show' : ''}`} id="mgrNav">
            <ul className="navbar-nav me-auto mb-2 mb-lg-0 ms-lg-4 gap-lg-2">
              <li className="nav-item">
                <Link
                  className={`nav-link py-2 px-3 fw-medium text-light ${
                    pathname === '/manager/' || pathname === '/manager' || pathname.includes('dashboard')
                      ? 'manager-active'
                      : ''
                  }`}
                  href="/manager/dashboard"
                  onClick={() => setNavOpen(false)}
                >
                  <i className="bi bi-speedometer2 me-1"></i> Team Dashboard
                </Link>
              </li>
              <li className="nav-item">
                <Link
                  className={`nav-link py-2 px-3 fw-medium text-light ${
                    pathname.includes('attendance') ? 'manager-active' : ''
                  }`}
                  href="/manager/attendance"
                  onClick={() => setNavOpen(false)}
                >
                  <i className="bi bi-calendar-check me-1"></i> Team Attendance
                </Link>
              </li>
              <li className="nav-item">
                <Link
                  className={`nav-link py-2 px-3 fw-medium text-light ${
                    pathname.includes('correction-requests') ? 'manager-active' : ''
                  }`}
                  href="/manager/correction-requests"
                  onClick={() => setNavOpen(false)}
                >
                  <i className="bi bi-inbox-fill me-1"></i> Correction Queue
                </Link>
              </li>
            </ul>

            <div className="d-flex align-items-center gap-3 pt-2 pt-lg-0 border-top border-lg-0">
              <div className="d-flex align-items-center gap-2">
                <img
                  src={avatarUrl}
                  style={{ width: '34px', height: '34px' }}
                  alt="Manager"
                />
                <div className="lh-sm text-white">
                  <div className="fw-bold small">{managerName}</div>
                  <div className="text-white-50" style={{ fontSize: '0.72rem' }}>
                    Role: Team Lead / Manager
                  </div>
                </div>
              </div>
              <button
                onClick={() => logout('manager')}
                className="btn btn-outline-warning btn-sm rounded-pill px-3"
                title="Sign Out"
              >
                <i className="bi bi-box-arrow-right"></i>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Flash Messages */}
      <div className="container-fluid px-sm-4 pt-3">
        <FlashBanner />
      </div>

      {/* Main Content */}
      <main>{children}</main>
    </div>
  );
}
