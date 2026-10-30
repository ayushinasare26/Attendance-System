'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';

export default function AdminLoginPage() {
  const router = useRouter();
  const { loginAdmin } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await loginAdmin({ username, password });
      if (res?.error) {
        setError(res.error);
      }
    } catch (err) {
      setError(err?.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoAdminLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await loginAdmin({ demo_admin: 'true' });
      if (res?.error) {
        setError(res.error);
      }
    } catch (err) {
      setError(err?.message || 'Demo admin login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #090d16 100%)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        padding: '20px',
      }}
    >
      <style jsx>{`
        .admin-card {
          background: rgba(30, 41, 59, 0.85);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(99, 102, 241, 0.25);
          border-radius: 20px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
          width: 100%;
          max-width: 440px;
          padding: 36px;
        }

        .admin-badge {
          width: 60px;
          height: 60px;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          color: white;
          box-shadow: 0 8px 24px rgba(79, 70, 229, 0.4);
          margin: 0 auto 20px auto;
        }

        .form-control-admin {
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid #334155;
          color: #f8fafc;
          padding: 12px 16px;
          border-radius: 10px;
          transition: all 0.2s ease;
        }

        .form-control-admin:focus {
          background: rgba(15, 23, 42, 0.95);
          border-color: #6366f1;
          color: white;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
        }

        .btn-admin-primary {
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          border: none;
          color: white;
          font-weight: 600;
          padding: 12px;
          border-radius: 10px;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
        }

        .btn-admin-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(79, 70, 229, 0.5);
          color: white;
        }
      `}</style>

      <div className="admin-card">
        <div className="text-center">
          <div className="admin-badge">
            <i className="bi bi-shield-lock-fill"></i>
          </div>
          <h4 className="fw-bold mb-1 text-white">Administrator Portal</h4>
          <p className="text-secondary small mb-4">Elevated privileges required to proceed</p>
        </div>

        {error && (
          <div className="alert alert-danger py-2 px-3 small rounded-3 mb-3 border-0 bg-danger text-white">
            <i className="bi bi-exclamation-triangle-fill me-1"></i> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label small fw-semibold text-light mb-1">Admin Username</label>
            <div className="input-group">
              <span className="input-group-text bg-dark border-secondary text-secondary">
                <i className="bi bi-person-fill"></i>
              </span>
              <input
                type="text"
                name="username"
                className="form-control form-control-admin"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="form-label small fw-semibold text-light mb-1">Secret Password</label>
            <div className="input-group">
              <span className="input-group-text bg-dark border-secondary text-secondary">
                <i className="bi bi-key-fill"></i>
              </span>
              <input
                type="password"
                name="password"
                className="form-control form-control-admin"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn btn-admin-primary w-100 mb-3">
            <i className="bi bi-lock-fill me-1"></i> {loading ? 'Authenticating...' : 'Authenticate & Enter'}
          </button>
        </form>

        {/* Quick Demo Shortcut */}
        <div className="mt-2">
          <button
            type="button"
            onClick={handleDemoAdminLogin}
            disabled={loading}
            className="btn btn-sm btn-outline-light w-100 rounded-pill py-2 opacity-75 hover-opacity-100"
            style={{ borderStyle: 'dashed', fontSize: '0.8rem' }}
          >
            <i className="bi bi-lightning-charge-fill text-warning me-1"></i> Quick Demo Admin Login (admin / admin123)
          </button>
        </div>

        <div className="text-center mt-4 pt-3 border-top border-secondary border-opacity-25">
          <span className="text-muted small">Not an administrator?</span>
          <Link href="/employee/login" className="text-info small fw-semibold ms-1 text-decoration-none">
            Go to Employee Portal &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
