'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import FlashBanner from '@/components/FlashBanner';

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const adminName = session?.admin_name || 'Administrator';

  const navItems = [
    { section: 'Main Overview' },
    { href: '/admin/dashboard', icon: 'bi-speedometer2', label: 'Dashboard', match: (p) => p === '/admin/dashboard' || p === '/admin' || p === '/admin/' },
    { href: '/admin/attendance', icon: 'bi-clipboard2-data', label: 'All Attendance', match: (p) => p.startsWith('/admin/attendance') },
    { href: '/admin/flagged', icon: 'bi-shield-exclamation', label: 'Flagged & Audit Queue', match: (p) => p.startsWith('/admin/flagged') },

    { section: 'Workforce & Operations' },
    { href: '/admin/sites', icon: 'bi-geo-alt', label: 'Sites & Geofencing', match: (p) => p.startsWith('/admin/sites') },
    { href: '/admin/shifts', icon: 'bi-clock-history', label: 'Shifts & Hours', match: (p) => p.startsWith('/admin/shifts') },
    { href: '/admin/employees', icon: 'bi-people', label: 'Employee Roster', match: (p) => p.startsWith('/admin/employees') },
    { href: '/admin/enroll', icon: 'bi-person-bounding-box', label: 'Enroll Face (Consent)', match: (p) => p.startsWith('/admin/enroll') },

    { section: 'Payroll & Governance' },
    { href: '/admin/payroll-export', icon: 'bi-cash-stack', label: 'Payroll CSV Export', match: (p) => p.startsWith('/admin/payroll-export') || p.startsWith('/admin/reports') },
    { href: '/admin/audit-logs', icon: 'bi-journal-text', label: 'Audit Trail', match: (p) => p.startsWith('/admin/audit-logs') },
    { href: '/admin/settings', icon: 'bi-sliders2', label: 'Engine Settings', match: (p) => p.startsWith('/admin/settings') },
  ];

  return (
    <div className="admin-wrapper" style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <style jsx global>{`
        :root {
          --admin-primary: #4f46e5;
          --admin-primary-hover: #4338ca;
          --admin-accent: #6366f1;
          --admin-sidebar-bg: #0f172a;
          --admin-sidebar-border: #1e293b;
        }

        body {
          background-color: #f8fafc;
          color: #1e293b;
        }

        .admin-sidebar {
          width: 270px;
          background: var(--admin-sidebar-bg);
          color: #f1f5f9;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--admin-sidebar-border);
          position: fixed;
          top: 0;
          bottom: 0;
          left: 0;
          z-index: 1040;
          transition: transform 0.3s ease;
        }

        .admin-sidebar .sidebar-logo {
          padding: 22px 20px;
          border-bottom: 1px solid #1e293b;
        }

        .admin-sidebar-nav {
          padding: 14px 12px;
          flex-grow: 1;
          overflow-y: auto;
        }

        .admin-nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 9px 14px;
          color: #94a3b8;
          font-size: 0.86rem;
          font-weight: 500;
          border-radius: 8px;
          text-decoration: none;
          transition: all 0.15s ease;
          margin-bottom: 3px;
        }

        .admin-nav-item:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.06);
        }

        .admin-nav-item.active {
          color: #ffffff;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);
          font-weight: 600;
        }

        .admin-nav-item i {
          font-size: 1.05rem;
        }

        .nav-category {
          font-size: 0.70rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #64748b;
          font-weight: 700;
          padding: 14px 12px 6px;
        }

        .admin-main {
          margin-left: 270px;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .admin-topbar {
          height: 64px;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid #e2e8f0;
          padding: 0 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 1020;
        }

        .admin-content {
          padding: 28px;
          flex-grow: 1;
        }

        @media (max-width: 991.98px) {
          .admin-sidebar {
            transform: translateX(-100%);
          }

          .admin-sidebar.show {
            transform: translateX(0);
          }

          .admin-main {
            margin-left: 0;
          }
        }
      `}</style>

      {/* Admin Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'show' : ''}`} id="adminSidebar">
        <div className="sidebar-logo d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-3">
            <div
              style={{
                width: '38px',
                height: '38px',
                background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '1.15rem',
                boxShadow: '0 4px 10px rgba(99, 102, 241, 0.3)',
              }}
            >
              <i className="bi bi-shield-lock-fill"></i>
            </div>
            <div>
              <div className="fw-bold text-white fs-6 lh-1">GeoFace HR</div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>Enterprise Governance</div>
            </div>
          </div>
          <button
            className="btn btn-sm btn-dark d-lg-none border-0 text-white"
            id="closeSidebarBtn"
            onClick={() => setSidebarOpen(false)}
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <nav className="admin-sidebar-nav">
          {navItems.map((item, idx) => {
            if (item.section) {
              return (
                <div key={idx} className={`nav-category ${idx > 0 ? 'mt-2' : ''}`}>
                  {item.section}
                </div>
              );
            }
            const isActive = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <i className={`bi ${item.icon}`}></i> {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3" style={{ borderTop: '1px solid #1e293b', background: 'rgba(0,0,0,0.15)' }}>
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2">
              <div className="bg-primary rounded-circle" style={{ width: '8px', height: '8px' }}></div>
              <span className="small text-light fw-medium">{adminName}</span>
            </div>
            <button
              onClick={() => logout('admin')}
              className="text-danger bg-transparent border-0 p-0 text-decoration-none small fw-semibold"
              title="Sign out admin"
            >
              <i className="bi bi-box-arrow-right fs-5"></i>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Container */}
      <div className="admin-main">
        <header className="admin-topbar">
          <div className="d-flex align-items-center gap-3">
            <button
              className="btn btn-sm btn-light border d-lg-none"
              id="openSidebarBtn"
              onClick={() => setSidebarOpen(true)}
            >
              <i className="bi bi-list fs-5"></i>
            </button>
            <div className="d-flex align-items-center gap-2">
              <span className="text-muted small">GeoFace Enterprise</span>
              <span className="text-muted small">/</span>
              <span className="fw-semibold text-dark small">
                {pathname === '/admin/dashboard' || pathname === '/admin' || pathname === '/admin/'
                  ? 'Executive Oversight Dashboard'
                  : pathname.startsWith('/admin/attendance')
                  ? 'Organization-Wide Attendance Master Records'
                  : pathname.startsWith('/admin/flagged')
                  ? 'Audit & Suspicious Activity Resolution Queue'
                  : pathname.startsWith('/admin/sites')
                  ? 'Work Sites & Geofencing Policies'
                  : pathname.startsWith('/admin/shifts')
                  ? 'Shift Schedules & Flexible Working Policies'
                  : pathname.startsWith('/admin/employees')
                  ? 'Workforce Employee Directory'
                  : pathname.startsWith('/admin/enroll')
                  ? 'Biometric Face Enrollment with Consent'
                  : pathname.startsWith('/admin/payroll-export') || pathname.startsWith('/admin/reports')
                  ? 'Payroll & Overtime Compliance CSV Export'
                  : pathname.startsWith('/admin/audit-logs')
                  ? 'System Audit Trail & Compliance Log'
                  : pathname.startsWith('/admin/settings')
                  ? 'Biometric Verification Engine & Attendance Policies'
                  : 'Administrative Console'}
              </span>
            </div>
          </div>

          <div className="d-flex align-items-center gap-3">
            <span className="badge bg-light text-secondary border px-3 py-2">
              <i className="bi bi-hdd-network text-success me-1"></i> Multi-Site Mode: Active
            </span>
            <Link
              href="/employee/check-in-out"
              className="btn btn-sm btn-outline-primary rounded-pill px-3"
              title="Test employee check-in view"
            >
              <i className="bi bi-box-arrow-up-right me-1"></i> Employee Portal
            </Link>
          </div>
        </header>

        {/* Flash Notification Banners */}
        <div className="px-4 pt-3">
          <FlashBanner />
        </div>

        <div className="admin-content">
          {children}
        </div>

        <footer className="mt-auto py-3 px-4 border-top bg-white text-muted small d-flex justify-content-between">
          <span>&copy; 2026 GeoFace Enterprise Facial Recognition Attendance Platform</span>
        </footer>
      </div>
    </div>
  );
}
