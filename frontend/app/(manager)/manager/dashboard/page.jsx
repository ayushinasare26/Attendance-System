'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const deptParam = searchParams.get('department_id') || '';
  const shiftParam = searchParams.get('shift_id') || '';

  const [departmentId, setDepartmentId] = useState(deptParam);
  const [shiftId, setShiftId] = useState(shiftParam);

  useEffect(() => {
    setDepartmentId(deptParam);
    setShiftId(shiftParam);
  }, [deptParam, shiftParam]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['manager-dashboard', deptParam, shiftParam],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (deptParam) params.append('department_id', deptParam);
      if (shiftParam) params.append('shift_id', shiftParam);
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      return await api.get(`/manager/dashboard${queryStr}`);
    },
    refetchInterval: 30000,
  });

  const handleApplyFilter = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (departmentId) params.append('department_id', departmentId);
    if (shiftId) params.append('shift_id', shiftId);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    router.push(`/manager/dashboard${queryStr}`);
  };

  const handleResetFilter = () => {
    setDepartmentId('');
    setShiftId('');
    router.push('/manager/dashboard');
  };

  const teamMembers = data?.team_members || [];
  const totalTeam = data?.total_team ?? 0;
  const checkedInCount = data?.checked_in_count ?? 0;
  const notCheckedInCount = data?.not_checked_in_count ?? 0;
  const lateCount = data?.late_count ?? 0;
  const pendingCorrections = data?.pending_corrections ?? 0;
  const departments = data?.departments || [];
  const shifts = data?.shifts || [];

  return (
    <div className="container-fluid px-sm-4 py-3">
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h4 className="fw-bold text-dark mb-1">Team Attendance Dashboard</h4>
          <p className="text-muted small mb-0">Real-time team presence, punctuality, and shift adherence for today</p>
        </div>
        <div className="d-flex gap-2">
          {pendingCorrections > 0 && (
            <Link href="/manager/correction-requests" className="btn btn-warning rounded-pill px-3 fw-semibold shadow-sm">
              <i className="bi bi-inbox-fill me-1"></i> {pendingCorrections} Pending Corrections
            </Link>
          )}
          <Link href="/manager/attendance" className="btn btn-outline-secondary rounded-pill px-3 fw-semibold">
            <i className="bi bi-clock-history me-1"></i> Historical Logs
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger rounded-3 shadow-sm py-2 px-3 small mb-4" role="alert">
          <i className="bi bi-exclamation-triangle me-1"></i>
          {error.message || 'Failed to load team dashboard data.'}
        </div>
      )}

      {/* Metric Cards */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
            <div className="text-muted small fw-semibold">Team Members</div>
            <div className="h3 fw-bold text-dark my-1">{isLoading ? '—' : totalTeam}</div>
            <div className="text-secondary small">
              <i className="bi bi-people me-1"></i>Active in your team
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
            <div className="text-muted small fw-semibold">Checked In Today</div>
            <div className="h3 fw-bold text-success my-1">{isLoading ? '—' : checkedInCount}</div>
            <div className="text-success small">
              <i className="bi bi-check-circle me-1"></i>Present on site/field
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
            <div className="text-muted small fw-semibold">Not Yet Checked In</div>
            <div className="h3 fw-bold text-secondary my-1">{isLoading ? '—' : notCheckedInCount}</div>
            <div className="text-secondary small">
              <i className="bi bi-hourglass-split me-1"></i>Awaiting arrival
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
            <div className="text-muted small fw-semibold">Late Arrivals</div>
            <div className="h3 fw-bold text-warning my-1">{isLoading ? '—' : lateCount}</div>
            <div className="text-warning small">
              <i className="bi bi-exclamation-triangle me-1"></i>Beyond shift grace
            </div>
          </div>
        </div>
      </div>

      {/* Quick Department & Shift Filter */}
      <div className="card border-0 shadow-sm rounded-4 p-3 bg-white mb-4">
        <form onSubmit={handleApplyFilter} className="row g-2 align-items-center">
          {departments.length > 0 && (
            <div className="col-md-4">
              <label className="form-label small text-muted mb-1">Filter by Department</label>
              <select
                name="department_id"
                className="form-select form-select-sm rounded-3"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">All Managed Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {shifts.length > 0 && (
            <div className="col-md-4">
              <label className="form-label small text-muted mb-1">Filter by Shift</label>
              <select
                name="shift_id"
                className="form-select form-select-sm rounded-3"
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
              >
                <option value="">All Shifts</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="col-md-4 d-flex align-items-end gap-2 pt-md-4">
            <button type="submit" className="btn btn-sm btn-dark rounded-pill px-3">
              <i className="bi bi-funnel"></i> Apply Filter
            </button>
            <button
              type="button"
              onClick={handleResetFilter}
              className="btn btn-sm btn-outline-secondary rounded-pill px-3"
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Team Members Status Today */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">
        <div className="card-header bg-white border-0 py-3 px-4 d-flex justify-content-between align-items-center">
          <h6 className="fw-bold mb-0 text-dark">
            <i className="bi bi-person-check-fill text-warning me-2"></i>Today's Team Roster & Punctuality
          </h6>
          <span className="badge bg-light text-secondary border">
            {isLoading ? 'Loading...' : `${teamMembers.length} members`}
          </span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.88rem' }}>
            <thead className="table-light text-secondary">
              <tr>
                <th className="ps-4">Employee</th>
                <th>Department</th>
                <th>Work Policy / Shift</th>
                <th>Assigned Site</th>
                <th>Check-In Time</th>
                <th>Check-Out Time</th>
                <th>Today's Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted">
                    <div className="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
                    Loading roster...
                  </td>
                </tr>
              ) : teamMembers.length > 0 ? (
                teamMembers.map((tm) => {
                  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    tm.name
                  )}&background=e2e8f0&color=334155&rounded=true`;

                  return (
                    <tr key={tm.id}>
                      <td className="ps-4">
                        <div className="d-flex align-items-center gap-2">
                          <img
                            src={avatarUrl}
                            style={{ width: '32px', height: '32px' }}
                            alt=""
                          />
                          <div>
                            <div className="fw-bold text-dark">{tm.name}</div>
                            <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                              ID: {tm.code}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{tm.department}</td>
                      <td>
                        <div className="fw-semibold text-dark">{tm.shift}</div>
                        {tm.is_flexible ? (
                          <span
                            className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill"
                            style={{ fontSize: '0.72rem' }}
                          >
                            <i className="bi bi-clock-history me-1"></i>
                            {tm.duration_display}
                          </span>
                        ) : (
                          <span
                            className="badge bg-light text-secondary border rounded-pill"
                            style={{ fontSize: '0.72rem' }}
                          >
                            Fixed
                          </span>
                        )}
                      </td>
                      <td>
                        <span>{tm.site}</span>
                        {!tm.within_geofence && (
                          <span
                            className="badge bg-danger-subtle text-danger ms-1"
                            style={{ fontSize: '0.68rem' }}
                          >
                            Outside Geofence
                          </span>
                        )}
                      </td>
                      <td>
                        {tm.check_in_time && tm.check_in_time !== '—' ? (
                          <span className="badge bg-success-subtle text-success border border-success-subtle">
                            {tm.check_in_time}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {tm.check_out_time && tm.check_out_time !== '—' ? (
                          <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                            {tm.check_out_time}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {tm.status === 'on_time' || tm.status === 'Complete' ? (
                          <span className="badge bg-success rounded-pill px-2 py-1">
                            <i className="bi bi-check-circle me-1"></i>
                            {tm.is_flexible ? 'Complete' : 'On-Time'}
                          </span>
                        ) : tm.status === 'late' || tm.status === 'Short Hours' ? (
                          <span className="badge bg-warning text-dark rounded-pill px-2 py-1">
                            <i className="bi bi-clock me-1"></i>
                            {tm.is_flexible ? 'Short Hours' : 'Late Arrival'}
                          </span>
                        ) : tm.status === 'Core Hours Missed' ? (
                          <span className="badge bg-danger rounded-pill px-2 py-1">
                            <i className="bi bi-exclamation-octagon me-1"></i>Core Missed
                          </span>
                        ) : tm.status === 'overtime' || tm.status === 'Overtime' ? (
                          <span className="badge bg-primary rounded-pill px-2 py-1">
                            <i className="bi bi-lightning-charge me-1"></i>Overtime
                          </span>
                        ) : tm.status === 'In Progress' ? (
                          <span className="badge bg-info-subtle text-info border border-info-subtle rounded-pill px-2 py-1">
                            <i className="bi bi-broadcast me-1"></i>In Progress
                          </span>
                        ) : tm.status === 'Half Day' ? (
                          <span className="badge bg-warning-subtle text-warning border border-warning-subtle rounded-pill px-2 py-1">
                            Half Day
                          </span>
                        ) : tm.status === 'Missing Check-out' ? (
                          <span className="badge bg-danger rounded-pill px-2 py-1">
                            <i className="bi bi-box-arrow-right me-1"></i>Missing Check-out
                          </span>
                        ) : tm.status === 'not_checked_in' || tm.status === 'Absent' ? (
                          <span className="badge bg-light text-muted border rounded-pill px-2 py-1">
                            <i className="bi bi-dash-circle me-1"></i>
                            {tm.is_flexible ? 'Absent' : 'Not Checked In'}
                          </span>
                        ) : tm.status === 'flagged' ? (
                          <span className="badge bg-danger rounded-pill px-2 py-1">
                            <i className="bi bi-exclamation-triangle me-1"></i>Flagged
                          </span>
                        ) : (
                          <span className="badge bg-secondary rounded-pill px-2 py-1">{tm.status}</span>
                        )}

                        {tm.is_flexible && tm.duration_progress && (
                          <div className="small text-muted mt-1" style={{ fontSize: '0.74rem' }}>
                            <i className="bi bi-hourglass me-1"></i>
                            {tm.duration_progress}
                          </div>
                        )}

                        {tm.core_missed && tm.status !== 'Core Hours Missed' && (
                          <span className="badge bg-danger rounded-pill px-2 py-1 ms-1">Core Missed</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted">
                    No employees assigned to your management scope.
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

export default function ManagerDashboardPage() {
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
      <DashboardContent />
    </Suspense>
  );
}
