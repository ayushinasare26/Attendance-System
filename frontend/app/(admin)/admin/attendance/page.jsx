'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

function AdminAttendanceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const searchQ = searchParams.get('search') || '';
  const siteFilter = searchParams.get('site_id') || '';
  const deptFilter = searchParams.get('department_id') || '';
  const shiftFilter = searchParams.get('shift_id') || '';
  const statusFilter = searchParams.get('status') || 'all';

  // Form input states
  const [search, setSearch] = useState(searchQ);
  const [selectedSite, setSelectedSite] = useState(siteFilter);
  const [selectedDept, setSelectedDept] = useState(deptFilter);
  const [selectedShift, setSelectedShift] = useState(shiftFilter);
  const [status, setStatus] = useState(statusFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-attendance', searchQ, siteFilter, deptFilter, shiftFilter, statusFilter],
    queryFn: async () => {
      const qp = [];
      if (searchQ) qp.push(`search=${encodeURIComponent(searchQ)}`);
      if (siteFilter) qp.push(`site_id=${encodeURIComponent(siteFilter)}`);
      if (deptFilter) qp.push(`department_id=${encodeURIComponent(deptFilter)}`);
      if (shiftFilter) qp.push(`shift_id=${encodeURIComponent(shiftFilter)}`);
      if (statusFilter && statusFilter !== 'all') qp.push(`status=${encodeURIComponent(statusFilter)}`);
      const url = `/admin/attendance${qp.length > 0 ? '?' + qp.join('&') : ''}`;
      return await api.get(url);
    },
  });

  const records = data?.records || [];
  const sites = data?.sites || [];
  const departments = data?.departments || [];
  const shifts = data?.shifts || [];

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (selectedSite) params.set('site_id', selectedSite);
    if (selectedDept) params.set('department_id', selectedDept);
    if (selectedShift) params.set('shift_id', selectedShift);
    if (status && status !== 'all') params.set('status', status);
    const query = params.toString();
    router.push(`/admin/attendance${query ? '?' + query : ''}`);
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedSite('');
    setSelectedDept('');
    setSelectedShift('');
    setStatus('all');
    router.push('/admin/attendance');
  };

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
        <div>
          <h4 className="fw-bold mb-1 text-dark">Master Workforce Attendance Records</h4>
          <p className="text-muted small mb-0">
            Company-wide audit trail of all check-in and check-out events, geofence validations, and punctuality flags
          </p>
        </div>
        <div className="d-flex gap-2">
          <Link
            href="/admin/payroll-export"
            className="btn btn-outline-success btn-sm rounded-pill px-3 fw-semibold"
          >
            <i className="bi bi-file-earmark-spreadsheet me-1"></i> Payroll Export
          </Link>
        </div>
      </div>

      {/* Filters Card */}
      <div className="card border-0 shadow-sm rounded-4 p-3 bg-white mb-4">
        <form onSubmit={handleFilterSubmit} className="row g-2 align-items-center">
          <div className="col-md-3">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light border-end-0">
                <i className="bi bi-search"></i>
              </span>
              <input
                type="text"
                name="search"
                className="form-control form-control-sm border-start-0"
                placeholder="Search employee, ID, location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="col-sm-6 col-md-2">
            <select
              name="site_id"
              className="form-select form-select-sm rounded-3"
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
            >
              <option value="">All Sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-sm-6 col-md-2">
            <select
              name="department_id"
              className="form-select form-select-sm rounded-3"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-sm-6 col-md-2">
            <select
              name="shift_id"
              className="form-select form-select-sm rounded-3"
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
            >
              <option value="">All Shifts</option>
              {shifts.map((sh) => (
                <option key={sh.id} value={sh.id}>
                  {sh.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-sm-6 col-md-2">
            <select
              name="status"
              className="form-select form-select-sm rounded-3"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="on_time">On-Time</option>
              <option value="late">Late</option>
              <option value="overtime">Overtime</option>
              <option value="early_leave">Early Leave</option>
              <option value="flagged">Flagged for Audit</option>
            </select>
          </div>

          <div className="col-md-1 d-flex gap-1">
            <button
              type="submit"
              className="btn btn-primary btn-sm rounded-pill w-100 fw-semibold"
              style={{ background: 'var(--admin-primary)', borderColor: 'var(--admin-primary)' }}
            >
              Filter
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="btn btn-light btn-sm rounded-pill border"
              title="Reset Filters"
            >
              <i className="bi bi-arrow-counterclockwise"></i>
            </button>
          </div>
        </form>
      </div>

      {/* Records Table */}
      <div className="card border-0 shadow-sm rounded-4 bg-white overflow-hidden">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.88rem' }}>
            <thead className="table-light text-secondary">
              <tr>
                <th className="ps-4">ID</th>
                <th>Employee</th>
                <th>Event</th>
                <th>Timestamp</th>
                <th>Work Site</th>
                <th>Geofence & Distance</th>
                <th>Punctuality</th>
                <th>Audit Status</th>
                <th className="text-end pe-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="9" className="text-center py-4 text-muted">
                    <div className="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    Loading attendance records...
                  </td>
                </tr>
              ) : records.length > 0 ? (
                records.map((r) => (
                  <tr key={r.id}>
                    <td className="ps-4 text-muted fw-semibold">#{r.id}</td>
                    <td>
                      <div className="fw-bold text-dark">{r.name}</div>
                      <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                        ID: {r.employee_code || '—'} • {r.department_name || 'General'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${r.event_type === 'check_in' ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-primary-subtle text-primary border border-primary-subtle'}`}
                      >
                        {(r.event_type || 'check_in').replace('_', ' ').toUpperCase()}
                      </span>
                      <div className="mt-1">
                        <span
                          className={`badge ${r.attendance_method === 'manual' ? 'bg-secondary-subtle text-secondary border' : 'bg-light text-primary border'}`}
                          style={{ fontSize: '0.68rem' }}
                        >
                          <i
                            className={`bi ${r.attendance_method === 'manual' ? 'bi-pencil-square' : 'bi-camera-video'} me-1`}
                          ></i>
                          {r.attendance_method === 'manual' ? 'Manual' : 'Face'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="text-dark small">{r.time_display}</span>
                    </td>
                    <td>{r.site_name || 'Headquarters'}</td>
                    <td>
                      {r.distance_from_site_meters != null ? (
                        <>
                          <span>{Math.round(r.distance_from_site_meters)}m</span>
                          {r.within_geofence ? (
                            <span className="badge bg-success-subtle text-success ms-1">Within Radius</span>
                          ) : (
                            <span className="badge bg-danger text-white ms-1">Outside Geofence</span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted small">No GPS</span>
                      )}
                    </td>
                    <td>
                      {r.is_flexible ? (
                        <>
                          {['on_time', 'Complete'].includes(r.status) && (
                            <span className="badge bg-success rounded-pill px-2 py-1">
                              <i className="bi bi-check-circle me-1"></i>Complete
                            </span>
                          )}
                          {['late', 'Short Hours'].includes(r.status) && (
                            <span className="badge bg-warning text-dark rounded-pill px-2 py-1">
                              <i className="bi bi-clock me-1"></i>Short Hours
                            </span>
                          )}
                          {r.status === 'Core Hours Missed' && (
                            <span className="badge bg-danger rounded-pill px-2 py-1">
                              <i className="bi bi-exclamation-octagon me-1"></i>Core Missed
                            </span>
                          )}
                          {['overtime', 'Overtime'].includes(r.status) && (
                            <span className="badge bg-primary rounded-pill px-2 py-1">
                              <i className="bi bi-lightning-charge me-1"></i>Overtime
                            </span>
                          )}
                          {r.status === 'In Progress' && (
                            <span className="badge bg-info-subtle text-info border border-info-subtle rounded-pill px-2 py-1">
                              <i className="bi bi-broadcast me-1"></i>In Progress
                            </span>
                          )}
                          {r.status === 'Missing Check-out' && (
                            <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-1">
                              Missing Check-out
                            </span>
                          )}
                          {r.status === 'flagged' && (
                            <span className="badge bg-danger rounded-pill px-2 py-1">Flagged</span>
                          )}
                          {!['on_time', 'Complete', 'late', 'Short Hours', 'Core Hours Missed', 'overtime', 'Overtime', 'In Progress', 'Missing Check-out', 'flagged'].includes(r.status) && (
                            <span className="badge bg-secondary rounded-pill px-2 py-1">{r.status}</span>
                          )}
                          {r.duration_progress && (
                            <div className="text-muted small mt-1" style={{ fontSize: '0.72rem' }}>
                              {r.duration_progress}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {r.status === 'on_time' && (
                            <span className="badge bg-success rounded-pill px-2 py-1">On-Time</span>
                          )}
                          {r.status === 'late' && (
                            <span className="badge bg-warning text-dark rounded-pill px-2 py-1">Late</span>
                          )}
                          {r.status === 'early_leave' && (
                            <span className="badge bg-warning text-dark rounded-pill px-2 py-1">Early Leave</span>
                          )}
                          {r.status === 'overtime' && (
                            <span className="badge bg-primary rounded-pill px-2 py-1">Overtime</span>
                          )}
                          {r.status === 'flagged' && (
                            <span className="badge bg-danger rounded-pill px-2 py-1">Flagged</span>
                          )}
                          {!['on_time', 'late', 'early_leave', 'overtime', 'flagged'].includes(r.status) && (
                            <span className="badge bg-secondary rounded-pill px-2 py-1">
                              {(r.status || '').toUpperCase()}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      {r.flagged ? (
                        <span className="text-danger small fw-semibold" title={r.flag_reason}>
                          <i className="bi bi-flag-fill me-1"></i>Flagged
                        </span>
                      ) : (
                        <span className="text-success small">
                          <i className="bi bi-check2-all me-1"></i>Verified
                        </span>
                      )}
                    </td>
                    <td className="text-end pe-4">
                      <Link
                        href={`/admin/attendance/${r.id}`}
                        className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                      >
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="text-center py-4 text-muted">
                    No attendance records found matching the filter criteria.
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

export default function AdminAttendancePage() {
  return (
    <Suspense fallback={<div className="p-4 text-center text-muted">Loading attendance records...</div>}>
      <AdminAttendanceContent />
    </Suspense>
  );
}
