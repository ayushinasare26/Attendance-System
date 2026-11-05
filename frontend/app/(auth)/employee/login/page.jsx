'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import api from '@/lib/api';

export default function EmployeeLoginPage() {
  const router = useRouter();
  const { loginEmployee } = useAuth();
  const [identifier, setIdentifier] = useState('29');
  const [password, setPassword] = useState('employee123');
  const [demoEmployees, setDemoEmployees] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchLoginContext() {
      try {
        const res = await api.get('/employee/login');
        if (!isMounted) return;
        if (res?.redirect) {
          router.push(res.redirect);
          return;
        }
        if (res?.demo_employees) {
          setDemoEmployees(res.demo_employees);
        }
        if (res?.error) {
          setError(res.error);
        }
      } catch (err) {
        // Backend could be unauthenticated or returning initial form context
      }
    }
    fetchLoginContext();
    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await loginEmployee({ identifier, password });
      if (res?.error) {
        setError(res.error);
      }
    } catch (err) {
      setError(err?.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmployeeId) => {
    setError(null);
    setLoading(true);
    try {
      const res = await loginEmployee({ demo_employee_id: demoEmployeeId });
      if (res?.error) {
        setError(res.error);
      }
    } catch (err) {
      setError(err?.message || 'Demo login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 50%, #0d2847 0%, #08162b 60%, #040c18 100%)',
        padding: '24px',
      }}
    >
      <div
        className="login-card"
        style={{
          width: '100%',
          maxWidth: '460px',
          background: '#ffffff',
          borderRadius: '24px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.6)',
          padding: '42px 38px',
        }}
      >
        <div className="text-center mb-4">
          <div
            className="logo-badge mx-auto mb-3"
            style={{
              width: '54px',
              height: '54px',
              fontSize: '1.6rem',
              background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '16px',
              color: 'white',
              boxShadow: '0 8px 20px rgba(29, 78, 216, 0.3)',
            }}
          >
            <i className="bi bi-geo-alt-fill"></i>
          </div>
          <h4 className="fw-bold text-dark mb-1">Workforce Attendance Portal</h4>
          <p className="text-muted small">Geo-Verified Facial Recognition Check-In / Check-Out</p>
        </div>

        {error && (
          <div className="alert alert-danger py-2 px-3 small rounded-3 mb-3 d-flex align-items-center gap-2">
            <i className="bi bi-exclamation-triangle-fill"></i>
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label small fw-semibold text-secondary">Employee Code / ID / Email</label>
            <div className="input-group">
              <span className="input-group-text bg-light border-end-0">
                <i className="bi bi-person-badge text-muted"></i>
              </span>
              <input
                type="text"
                name="identifier"
                className="form-control border-start-0 ps-0"
                placeholder="e.g. EMP-0029 or 29"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="form-label small fw-semibold text-secondary">Password</label>
            <div className="input-group">
              <span className="input-group-text bg-light border-end-0">
                <i className="bi bi-lock text-muted"></i>
              </span>
              <input
                type="password"
                name="password"
                className="form-control border-start-0 ps-0"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn text-white w-100 py-2.5 fw-semibold rounded-3 shadow-sm mb-3"
            style={{ background: '#0e1f38', borderColor: '#0e1f38' }}
          >
            {loading ? 'Signing In...' : 'Sign In to Employee Portal'}
          </button>
        </form>

        {/* Demo Workforce Profiles */}
        {demoEmployees && demoEmployees.length > 0 && (
          <div className="my-3">
            <div
              className="text-muted text-uppercase fw-bold text-center mb-2"
              style={{ fontSize: '0.68rem', letterSpacing: '0.05em' }}
            >
              Or Quick Sign-In As Enrolled Employee:
            </div>
            <div className="d-flex flex-wrap gap-2 justify-content-center">
              {demoEmployees.map((de) => (
                <button
                  key={de.id}
                  type="button"
                  onClick={() => handleDemoLogin(de.id)}
                  disabled={loading}
                  className="btn btn-sm rounded-pill px-3 py-1.5"
                  style={{
                    fontSize: '0.76rem',
                    background: '#f8fafc',
                    borderColor: '#e2e8f0',
                    color: '#334155',
                  }}
                  title={`${de.department_name} • ${de.site_name}`}
                >
                  <i className="bi bi-person-check me-1 text-primary"></i>
                  {de.name} ({de.employee_code})
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 pt-3 border-top d-flex justify-content-between align-items-center">
          <Link href="/manager/dashboard" className="text-decoration-none small text-muted d-flex align-items-center gap-1">
            <i className="bi bi-people-fill text-warning"></i> Manager Portal
          </Link>
          <Link href="/admin/login" className="text-decoration-none small text-muted d-flex align-items-center gap-1">
            <i className="bi bi-shield-lock text-primary"></i> HR / Admin Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
