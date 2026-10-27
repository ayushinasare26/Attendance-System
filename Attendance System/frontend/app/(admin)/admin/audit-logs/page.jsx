'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export default function AdminAuditLogsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => {
      return await api.get('/admin/audit-logs');
    },
  });

  const logs = data?.logs || [];

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h4 className="fw-bold text-dark mb-1">Audit Trail & Access Governance</h4>
          <p className="text-muted small mb-0">
            Immutable record of biometric data access, enrollments, payroll exports, and administrative overrides
          </p>
        </div>
        <span className="badge bg-light text-secondary border px-3 py-2">
          <i className="bi bi-shield-check text-success me-1"></i> Data Access Auditing: Active
        </span>
      </div>

      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white mb-4">
        <div className="card-header bg-white border-0 py-3 px-4 d-flex justify-content-between align-items-center">
          <h6 className="fw-bold mb-0 text-dark">
            <i className="bi bi-journal-text text-primary me-2"></i>Recent Access & Action Events
          </h6>
          <span className="badge bg-light text-secondary border">
            {isLoading ? '...' : `${logs.length} log entries`}
          </span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.88rem' }}>
            <thead className="table-light text-secondary">
              <tr>
                <th className="ps-4">Timestamp</th>
                <th>Actor ID</th>
                <th>Role</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="text-center py-4 text-muted">
                    <div className="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length > 0 ? (
                logs.map((l) => (
                  <tr key={l.id}>
                    <td className="ps-4 text-muted small">{l.created_display}</td>
                    <td className="fw-semibold text-dark">#{l.actor_id}</td>
                    <td>
                      {l.actor_role === 'admin' ? (
                        <span className="badge bg-danger rounded-pill px-2 py-1">Admin</span>
                      ) : l.actor_role === 'manager' ? (
                        <span className="badge bg-warning text-dark rounded-pill px-2 py-1">Manager</span>
                      ) : (
                        <span className="badge bg-secondary rounded-pill px-2 py-1">Employee</span>
                      )}
                    </td>
                    <td>
                      <code className="fw-bold text-primary">{l.action}</code>
                    </td>
                    <td>
                      <span className="badge bg-light text-dark border">{l.resource_type}</span>
                      {l.resource_id && (
                        <span className="text-muted small ms-1">#{l.resource_id}</span>
                      )}
                    </td>
                    <td className="text-secondary small">{l.details || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="text-center py-4 text-muted">
                    No audit logs recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
