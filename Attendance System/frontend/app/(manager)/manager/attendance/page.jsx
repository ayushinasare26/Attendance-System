'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

function AttendanceContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const empParam = searchParams.get('employee_id') || '';
  const fromParam = searchParams.get('from') || '';
  const toParam = searchParams.get('to') || '';

  const [employeeId, setEmployeeId] = useState(empParam);
  const [fromDate, setFromDate] = useState(fromParam);
  const [toDate, setToDate] = useState(toParam);

  useEffect(() => {
    setEmployeeId(empParam);
    setFromDate(fromParam);
    setToDate(toParam);
  }, [empParam, fromParam, toParam]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['manager-attendance', empParam, fromParam, toParam],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (empParam) params.append('employee_id', empParam);
      if (fromParam) params.append('from', fromParam);
      if (toParam) params.append('to', toParam);
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      return await api.get(`/manager/attendance${queryStr}`);
    },
  });

  const handleApplyFilter = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (employeeId) params.append('employee_id', employeeId);
    if (fromDate) params.append('from', fromDate);
    if (toDate) params.append('to', toDate);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    router.push(`/manager/attendance${queryStr}`);
  };

  const handleReset = () => {
    setEmployeeId('');
    setFromDate('');
    setToDate('');
    router.push('/manager/attendance');
  };

  const records = data?.records || [];
  const teamMembers = data?.team_members || [];

  return (
    <div className="container-fluid px-sm-4 py-3">
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h4 className="fw-bold text-dark mb-1">Team Attendance Records</h4>
          <p className="text-muted small mb-0">Searchable history strictly scoped to your managed team members</p>
        </div>
        <Link href="/manager/dashboard" className="btn btn-outline-secondary rounded-pill px-3">
          <i className="bi bi-arrow-left me-1"></i> Back to Dashboard
        </Link>
      </div>

      {error && (
        <div className="alert alert-danger rounded-3 shadow-sm py-2 px-3 small mb-4" role="alert">
          <i className="bi bi-exclamation-triangle me-1"></i>
          {error.message || 'Failed to load attendance records.'}
        </div>
      )}

      {/* Filter Bar */}
      <div className="card border-0 shadow-sm rounded-4 p-3 bg-white mb-4">
        <form onSubmit={handleApplyFilter} className="row g-2 align-items-center">
          <div className="col-md-3">
            <label className="form-label small text-muted mb-1">Team Member</label>
            <select
              name="employee_id"
              className="form-select form-select-sm rounded-3"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">All Team Members</option>
              {teamMembers.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name} ({tm.employee_code})
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label small text-muted mb-1">From Date</label>
            <input
              type="date"
              name="from"
              className="form-control form-control-sm rounded-3"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label small text-muted mb-1">To Date</label>
            <input
              type="date"
              name="to"
              className="form-control form-control-sm rounded-3"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="col-md-3 d-flex align-items-end gap-2 pt-md-4">
            <button type="submit" className="btn btn-sm btn-dark rounded-pill px-3">
              <i className="bi bi-funnel"></i> Filter
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="btn btn-sm btn-outline-secondary rounded-pill px-3"
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Records Table */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">
        <div className="card-header bg-white border-0 py-3 px-4 d-flex justify-content-between align-items-center">
          <h6 className="fw-bold mb-0 text-dark">
            <i className="bi bi-list-check text-warning me-2"></i>Attendance Log Entries
          </h6>
          <span className="badge bg-light text-secondary border">
            {isLoading ? 'Loading...' : `${records.length} records`}
          </span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.88rem' }}>
            <thead className="table-light text-secondary">
              <tr>
                <th className="ps-4">Employee</th>
                <th>Event Type</th>
                <th>Timestamp</th>
                <th>Work Site</th>
                <th>Verified Location</th>
                <th>Punctuality</th>
                <th>Audit Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted">
                    <div className="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
                    Loading records...
                  </td>
                </tr>
              ) : records.length > 0 ? (
                records.map((r) => {
                  const truncatedReason =
                    r.flag_reason && r.flag_reason.length > 35
                      ? `${r.flag_reason.substring(0, 35)}...`
                      : r.flag_reason || '—';

                  return (
                    <tr key={r.id}>
                      <td className="ps-4">
                        <div className="fw-bold text-dark">{r.name}</div>
                        <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                          ID: {r.code} • {r.department} • <span className="text-primary">{r.policy_display}</span>
                        </div>
                      </td>
                      <td>
                        {r.event_type === 'check_in' ? (
                          <span className="badge bg-success-subtle text-success border border-success-subtle">
                            <i className="bi bi-box-arrow-in-right me-1"></i>Check-In
                          </span>
                        ) : (
                          <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                            <i className="bi bi-box-arrow-right me-1"></i>Check-Out
                          </span>
                        )}
                        <div className="mt-1">
                          <span
                            className={`badge ${
                              r.attendance_method === 'manual'
                                ? 'bg-secondary-subtle text-secondary border'
                                : 'bg-light text-primary border'
                            }`}
                            style={{ fontSize: '0.68rem' }}
                          >
                            <i
                              className={`bi ${
                                r.attendance_method === 'manual' ? 'bi-pencil-square' : 'bi-camera-video'
                              } me-1`}
                            ></i>
                            {r.attendance_method === 'manual' ? 'Manual' : 'Face'}
                          </span>
                        </div>
                      </td>
                      <td className="text-muted">{r.time_display}</td>
                      <td>{r.site}</td>
                      <td>
                        <span
                          className="text-truncate d-inline-block"
                          style={{ maxWidth: '200px' }}
                          title={r.location_display}
                        >
                          <i className="bi bi-geo-alt me-1 text-secondary"></i>
                          {r.location_display}
                        </span>
                      </td>
                      <td>
                        {r.status === 'on_time' ? (
                          <span className="badge bg-success rounded-pill px-2 py-1">On-Time</span>
                        ) : r.status === 'late' ? (
                          <span className="badge bg-warning text-dark rounded-pill px-2 py-1">Late</span>
                        ) : r.status === 'early_leave' ? (
                          <span className="badge bg-warning text-dark rounded-pill px-2 py-1">Early Leave</span>
                        ) : r.status === 'overtime' ? (
                          <span className="badge bg-primary rounded-pill px-2 py-1">Overtime</span>
                        ) : r.status === 'flagged' ? (
                          <span className="badge bg-danger rounded-pill px-2 py-1">Flagged</span>
                        ) : (
                          <span className="badge bg-secondary rounded-pill px-2 py-1">
                            {(r.status || '').toUpperCase()}
                          </span>
                        )}
                      </td>
                      <td>
                        {r.flagged ? (
                          <span className="text-danger small" title={r.flag_reason}>
                            <i className="bi bi-flag-fill me-1"></i>
                            {truncatedReason}
                          </span>
                        ) : (
                          <span className="text-success small">
                            <i className="bi bi-check2-all me-1"></i>Verified
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted">
                    No attendance records found for your team within this selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ManagerAttendancePage() {
  return (
    <Suspense
      fallback={
        <div className="container-fluid px-sm-4 py-5 text-center">
          <div className="spinner-border text-warning" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      }
    >
      <AttendanceContent />
    </Suspense>
  );
}
