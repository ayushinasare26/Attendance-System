'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import CorrectionModal from '@/components/employee/CorrectionModal';

export default function MyAttendancePage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (params.from) q.set('from', params.from);
      if (params.to) q.set('to', params.to);
      if (params.status && params.status !== 'all') q.set('status', params.status);

      const queryStr = q.toString() ? `?${q.toString()}` : '';
      const res = await api.get(`/employee/my-attendance${queryStr}`);
      if (res) {
        setData(res);
        setFromDate(res.from_date || '');
        setToDate(res.to_date || '');
        setStatusFilter(res.status_filter || 'all');
      }
    } catch (e) {
      console.error('Failed to load my-attendance data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    fetchData({ from: fromDate, to: toDate, status: statusFilter });
  };

  const handleReset = () => {
    setFromDate('');
    setToDate('');
    setStatusFilter('all');
    fetchData({});
  };

  if (loading && !data) {
    return (
      <div className="d-flex align-items-center justify-content-center py-5">
        <div className="spinner-border text-success" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  const isFlexible = Boolean(data?.is_flexible);
  const flexSummary = data?.flexible_summary;
  const records = data?.records || [];
  const correctionRequests = data?.correction_requests || [];

  return (
    <div className="container-fluid px-sm-4 py-3">
      {/* Header & Monthly Summary Cards */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h4 className="fw-bold text-dark mb-1">My Attendance History & Hours</h4>
          <p className="text-muted small mb-0">Daily check-in / check-out pairs, punctuality, and overtime tracking</p>
        </div>
        <button
          className="btn btn-primary rounded-pill px-4 fw-semibold shadow-sm"
          onClick={() => setShowCorrectionModal(true)}
        >
          <i className="bi bi-pencil-square me-1"></i> Submit Correction Request
        </button>
      </div>

      {/* Monthly Summary Stat Cards */}
      <div className="row g-3 mb-4">
        {isFlexible && flexSummary ? (
          <>
            <div className="col-6 col-md">
              <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
                <div className="text-muted small fw-semibold">Days Complete</div>
                <div className="h3 fw-bold text-success my-1">
                  {flexSummary.days_complete}{' '}
                  <span className="fs-6 fw-normal text-muted">/ {data.total_days_worked} days</span>
                </div>
                <div className="text-success small">
                  <i className="bi bi-check-circle-fill me-1"></i>Required hours met
                </div>
              </div>
            </div>
            <div className="col-6 col-md">
              <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
                <div className="text-muted small fw-semibold">Total Worked</div>
                <div className="h3 fw-bold text-dark my-1">{flexSummary.total_worked} hrs</div>
                <div className="text-secondary small">
                  {data.is_currently_checked_in ? (
                    <>
                      <i className="bi bi-clock-history me-1"></i>
                      {data.today_active_hours}h active today
                    </>
                  ) : (
                    <>
                      <i className="bi bi-clock-history me-1"></i>In selected period
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="col-6 col-md">
              <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
                <div className="text-muted small fw-semibold">Total Required</div>
                <div className="h3 fw-bold text-primary my-1">{flexSummary.total_required || 0.0} hrs</div>
                <div className="text-secondary small">
                  <i className="bi bi-calendar-check me-1"></i>Policy benchmark
                </div>
              </div>
            </div>
            <div className="col-6 col-md">
              <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
                <div className="text-muted small fw-semibold">Total Short Hours</div>
                <div
                  className={`h3 fw-bold ${flexSummary.total_short > 0 ? 'text-warning' : 'text-muted'} my-1`}
                >
                  {flexSummary.total_short} hrs
                </div>
                <div className={`${flexSummary.total_short > 0 ? 'text-warning' : 'text-muted'} small`}>
                  <i className="bi bi-hourglass-bottom me-1"></i>Hour deficits
                </div>
              </div>
            </div>
            <div className="col-6 col-md">
              <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
                <div className="text-muted small fw-semibold">Overtime Accrued</div>
                <div className="h3 fw-bold text-primary my-1">{flexSummary.total_overtime} hrs</div>
                <div className="text-primary small">
                  <i className="bi bi-graph-up-arrow me-1"></i>Beyond daily target
                </div>
              </div>
            </div>
            <div className="col-6 col-md">
              <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
                <div className="text-muted small fw-semibold">Core Misses</div>
                <div
                  className={`h3 fw-bold ${flexSummary.core_misses > 0 ? 'text-danger' : 'text-muted'} my-1`}
                >
                  {flexSummary.core_misses}
                </div>
                <div className={`${flexSummary.core_misses > 0 ? 'text-danger' : 'text-muted'} small`}>
                  <i className="bi bi-exclamation-triangle-fill me-1"></i>
                  {flexSummary.core_misses > 0 ? 'Window missed' : 'Compliant'}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="col-6 col-md">
              <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
                <div className="text-muted small fw-semibold">Days Present</div>
                <div className="h3 fw-bold text-success my-1">
                  {data?.total_days_worked}{' '}
                  <span className="fs-6 fw-normal text-muted">
                    day{data?.total_days_worked !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="text-success small">
                  {data?.is_currently_checked_in ? (
                    <>
                      <i className="bi bi-broadcast me-1"></i>Checked in today
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check-circle-fill me-1"></i>Attendance logged
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="col-6 col-md">
              <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
                <div className="text-muted small fw-semibold">Total Hours Worked</div>
                <div className="h3 fw-bold text-dark my-1">{data?.total_hours} hrs</div>
                <div className="text-secondary small">
                  {data?.is_currently_checked_in ? (
                    <>
                      <i className="bi bi-clock-history me-1"></i>
                      {data?.today_active_hours}h active today
                    </>
                  ) : (
                    <>
                      <i className="bi bi-clock-history me-1"></i>In selected period
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="col-6 col-md">
              <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
                <div className="text-muted small fw-semibold">Overtime Accrued</div>
                <div className="h3 fw-bold text-primary my-1">{data?.total_overtime} hrs</div>
                <div className="text-primary small">
                  <i className="bi bi-graph-up-arrow me-1"></i>Beyond shift end
                </div>
              </div>
            </div>
            <div className="col-6 col-md">
              <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
                <div className="text-muted small fw-semibold">Late Days</div>
                <div className="h3 fw-bold text-warning my-1">{data?.total_late_days}</div>
                <div className="text-warning small">
                  <i className="bi bi-clock me-1"></i>Past shift grace
                </div>
              </div>
            </div>
            <div className="col-6 col-md">
              <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
                <div className="text-muted small fw-semibold">Flagged for Audit</div>
                <div
                  className={`h3 fw-bold ${
                    data?.total_flagged_days > 0 ? 'text-danger' : 'text-muted'
                  } my-1`}
                >
                  {data?.total_flagged_days}
                </div>
                <div className={`${data?.total_flagged_days > 0 ? 'text-danger' : 'text-muted'} small`}>
                  <i className="bi bi-flag-fill me-1"></i>
                  {data?.total_flagged_days > 0 ? 'Geofence / Audit review' : 'No audit flags'}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Active Shift Status Banner */}
      {data?.is_currently_checked_in && (
        <div
          className="alert alert-success border-0 shadow-sm rounded-4 d-flex flex-wrap align-items-center justify-content-between p-3 mb-4 gap-3"
          style={{
            background:
              'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.08) 100%)',
            borderLeft: '5px solid #10b981 !important',
          }}
        >
          <div className="d-flex align-items-center gap-3">
            <div
              className="bg-success text-white rounded-circle p-2 d-flex align-items-center justify-content-center shadow-sm"
              style={{ width: '44px', height: '44px' }}
            >
              <i className="bi bi-person-check-fill fs-4"></i>
            </div>
            <div>
              <div className="fw-bold text-success-emphasis fs-6">Today's Attendance Verified & Active</div>
              <div className="small text-secondary">
                Your check-in was successfully verified and recorded. You currently have{' '}
                <strong>{data.today_active_hours} hrs</strong> in progress. Don't forget to check out when leaving.
              </div>
            </div>
          </div>
          <Link
            href="/employee/check-in-out"
            className="btn btn-sm btn-outline-danger rounded-pill px-3 fw-semibold shadow-sm"
          >
            <i className="bi bi-box-arrow-right me-1"></i> Go to Check Out
          </Link>
        </div>
      )}

      {/* Filter Bar */}
      <div className="card border-0 shadow-sm rounded-4 p-3 bg-white mb-4">
        <form onSubmit={handleFilterSubmit} className="row g-2 align-items-center">
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
          <div className="col-md-3">
            <label className="form-label small text-muted mb-1">Status Filter</label>
            <select
              name="status"
              className="form-select form-select-sm rounded-3"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Records</option>
              {isFlexible ? (
                <>
                  <option value="Complete">Complete</option>
                  <option value="Short Hours">Short Hours</option>
                  <option value="Core Hours Missed">Core Hours Missed</option>
                  <option value="Half Day">Half Day</option>
                  <option value="Overtime">Overtime</option>
                </>
              ) : (
                <>
                  <option value="on_time">On Time</option>
                  <option value="late">Late</option>
                  <option value="overtime">Overtime</option>
                  <option value="early_leave">Early Leave</option>
                </>
              )}
              <option value="flagged">Flagged for Audit</option>
            </select>
          </div>
          <div className="col-md-3 d-flex align-items-end gap-2 pt-md-4">
            <button type="submit" className="btn btn-sm btn-success rounded-pill px-3">
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

      {/* Daily Log Table */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white mb-4">
        <div className="card-header bg-white border-0 py-3 px-4 d-flex justify-content-between align-items-center">
          <h6 className="fw-bold mb-0 text-dark">
            <i className="bi bi-calendar3 me-2 text-success"></i>Daily Attendance Log
          </h6>
          <span className="badge bg-light text-secondary border">{records.length} days recorded</span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.88rem' }}>
            <thead className="table-light text-secondary">
              {isFlexible ? (
                <tr>
                  <th className="ps-4">Date</th>
                  <th>First In</th>
                  <th>Last Out</th>
                  <th>Method</th>
                  <th>Required</th>
                  <th>Worked</th>
                  <th>Short Hours</th>
                  <th>Overtime</th>
                  <th>Status</th>
                  <th>Flags & Audit</th>
                </tr>
              ) : (
                <tr>
                  <th className="ps-4">Date</th>
                  <th>Check-In Time</th>
                  <th>Check-Out Time</th>
                  <th>Method</th>
                  <th>Regular Hours</th>
                  <th>Overtime</th>
                  <th>Total Net</th>
                  <th>Punctuality Status</th>
                  <th>Audit & Notes</th>
                </tr>
              )}
            </thead>
            <tbody>
              {records.length > 0 ? (
                records.map((r, idx) => (
                  <tr key={idx}>
                    <td className="ps-4 fw-bold text-dark">{r.date}</td>
                    <td>
                      {r.check_in_time !== '—' ? (
                        <span className="badge bg-success-subtle text-success border border-success-subtle">
                          {r.check_in_time}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {r.is_active_today ? (
                        <>
                          <span className="badge bg-info-subtle text-info border border-info-subtle px-2 py-1">
                            <i className="bi bi-broadcast me-1"></i>Shift In Progress
                          </span>
                          <Link
                            href="/employee/check-in-out"
                            className="btn btn-xs btn-outline-danger py-0 px-2 ms-1 rounded-pill"
                            style={{ fontSize: '0.72rem' }}
                          >
                            Check Out
                          </Link>
                        </>
                      ) : r.check_out_time !== '—' ? (
                        <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                          {r.check_out_time}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {r.check_in_time !== '—' || r.check_out_time !== '—' ? (
                        r.check_in_method === r.check_out_method && r.check_in_method !== '—' ? (
                          <span
                            className={`badge ${
                              r.check_in_method === 'manual'
                                ? 'bg-secondary-subtle text-secondary border'
                                : 'bg-primary-subtle text-primary border border-primary-subtle'
                            }`}
                          >
                            <i
                              className={`bi ${
                                r.check_in_method === 'manual' ? 'bi-pencil-square' : 'bi-camera-video'
                              } me-1`}
                            ></i>
                            {r.check_in_method ? r.check_in_method.charAt(0).toUpperCase() + r.check_in_method.slice(1) : ''}
                          </span>
                        ) : (
                          <div className="d-flex flex-column gap-1" style={{ fontSize: '0.72rem' }}>
                            {r.check_in_time !== '—' && (
                              <span
                                className={`badge text-start ${
                                  r.check_in_method === 'manual'
                                    ? 'bg-secondary-subtle text-secondary border'
                                    : 'bg-primary-subtle text-primary border border-primary-subtle'
                                }`}
                              >
                                In: {r.check_in_method ? r.check_in_method.charAt(0).toUpperCase() + r.check_in_method.slice(1) : 'Face'}
                              </span>
                            )}
                            {r.check_out_time !== '—' && (
                              <span
                                className={`badge text-start ${
                                  r.check_out_method === 'manual'
                                    ? 'bg-secondary-subtle text-secondary border'
                                    : 'bg-primary-subtle text-primary border border-primary-subtle'
                                }`}
                              >
                                Out: {r.check_out_method ? r.check_out_method.charAt(0).toUpperCase() + r.check_out_method.slice(1) : 'Face'}
                              </span>
                            )}
                          </div>
                        )
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>

                    {isFlexible ? (
                      <>
                        <td>
                          <span className="text-secondary">{r.required_hours} hrs</span>
                        </td>
                        <td>
                          <span className="fw-bold text-dark">{r.hours_worked} hrs</span>
                        </td>
                        <td>
                          {r.short_hours > 0 ? (
                            <span className="fw-semibold text-warning">-{r.short_hours} hrs</span>
                          ) : (
                            <span className="text-muted">0.0</span>
                          )}
                        </td>
                        <td>
                          {r.overtime_hours > 0 ? (
                            <span className="fw-bold text-primary">+{r.overtime_hours} hrs</span>
                          ) : (
                            <span className="text-muted">0.0</span>
                          )}
                        </td>
                        <td>
                          {r.status === 'Complete' || r.status === 'Overtime' ? (
                            <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1">
                              <i className="bi bi-check-circle me-1"></i>
                              {r.status}
                            </span>
                          ) : r.status === 'Short Hours' ? (
                            <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2 py-1">
                              <i className="bi bi-clock me-1"></i>Short Hours
                            </span>
                          ) : r.status === 'Core Hours Missed' ? (
                            <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-1">
                              <i className="bi bi-exclamation-octagon me-1"></i>Core Missed
                            </span>
                          ) : r.status === 'Half Day' ? (
                            <span className="badge bg-warning-subtle text-warning border border-warning-subtle rounded-pill px-2 py-1">
                              <i className="bi bi-pie-chart me-1"></i>Half Day
                            </span>
                          ) : r.status === 'In Progress' ? (
                            <span className="badge bg-info-subtle text-info border border-info-subtle rounded-pill px-2 py-1">
                              <i className="bi bi-broadcast me-1"></i>In Progress
                            </span>
                          ) : r.status === 'Missing Check-out' ? (
                            <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-1">
                              <i className="bi bi-box-arrow-right me-1"></i>Missing Check-out
                            </span>
                          ) : (
                            <span className="badge bg-secondary-subtle text-secondary border rounded-pill px-2 py-1">
                              {r.status}
                            </span>
                          )}

                          {r.core_missed && r.status !== 'Core Hours Missed' && (
                            <span
                              className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-1 ms-1"
                              title="Core Hours Window Missed"
                            >
                              <i className="bi bi-exclamation-triangle-fill me-1"></i>Core Missed
                            </span>
                          )}
                        </td>
                        <td>
                          {r.flagged ? (
                            <>
                              <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2 py-1">
                                <i className="bi bi-exclamation-triangle-fill text-warning me-1"></i>Audit Review
                              </span>
                              <div className="text-danger small mt-1" style={{ fontSize: '0.76rem' }} title={r.flag_reason}>
                                <i className="bi bi-flag-fill me-1"></i>
                                {r.flag_reason && r.flag_reason.length > 45 ? `${r.flag_reason.substring(0, 45)}...` : r.flag_reason}
                              </div>
                            </>
                          ) : (
                            <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1">
                              <i className="bi bi-shield-check me-1"></i>Verified
                            </span>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          {r.is_active_today ? (
                            <span className="text-primary fw-semibold">
                              {r.hours_worked} hrs <small className="text-muted">(Active)</small>
                            </span>
                          ) : (
                            <span>{r.regular_hours} hrs</span>
                          )}
                        </td>
                        <td>
                          {r.overtime_hours > 0 ? (
                            <span className="fw-bold text-primary">+{r.overtime_hours} hrs</span>
                          ) : (
                            <span className="text-muted">0.0</span>
                          )}
                        </td>
                        <td>
                          <span className="fw-bold text-dark">{r.hours_worked} hrs</span>
                          {r.is_active_today && (
                            <span className="badge bg-light text-muted border ms-1" style={{ fontSize: '0.7rem' }}>
                              Active
                            </span>
                          )}
                        </td>
                        <td>
                          {r.status === 'on_time' ? (
                            <span className="badge badge-ontime rounded-pill px-2 py-1">
                              <i className="bi bi-check-circle me-1"></i>On-Time
                            </span>
                          ) : r.status === 'late' ? (
                            <span className="badge badge-late rounded-pill px-2 py-1">
                              <i className="bi bi-clock me-1"></i>Late
                            </span>
                          ) : r.status === 'early_leave' ? (
                            <span className="badge badge-early rounded-pill px-2 py-1">
                              <i className="bi bi-box-arrow-left me-1"></i>Early Leave
                            </span>
                          ) : r.status === 'overtime' ? (
                            <span className="badge badge-overtime rounded-pill px-2 py-1">
                              <i className="bi bi-lightning-charge me-1"></i>Overtime
                            </span>
                          ) : (
                            <span className="badge bg-secondary rounded-pill px-2 py-1">
                              {r.status ? r.status.toUpperCase() : ''}
                            </span>
                          )}

                          {r.is_active_today && (
                            <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1 ms-1">
                              <i className="bi bi-check-circle-fill me-1"></i>Present
                            </span>
                          )}
                        </td>
                        <td>
                          {r.flagged ? (
                            <>
                              <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2 py-1">
                                <i className="bi bi-exclamation-triangle-fill text-warning me-1"></i>Audit Review
                              </span>
                              <div className="text-danger small mt-1" style={{ fontSize: '0.76rem' }} title={r.flag_reason}>
                                <i className="bi bi-flag-fill me-1"></i>
                                {r.flag_reason && r.flag_reason.length > 45 ? `${r.flag_reason.substring(0, 45)}...` : r.flag_reason}
                              </div>
                            </>
                          ) : (
                            <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1">
                              <i className="bi bi-shield-check me-1"></i>Verified
                            </span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={isFlexible ? 10 : 9} className="text-center py-4 text-muted">
                    No attendance records found for this criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* My Submitted Correction Requests */}
      {correctionRequests.length > 0 && (
        <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">
          <div className="card-header bg-white border-0 py-3 px-4">
            <h6 className="fw-bold mb-0 text-dark">
              <i className="bi bi-inbox-fill me-2 text-primary"></i>My Submitted Correction Requests
            </h6>
          </div>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.86rem' }}>
              <thead className="table-light text-secondary">
                <tr>
                  <th className="ps-4">Date to Correct</th>
                  <th>Reason Given</th>
                  <th>Requested Change</th>
                  <th>Status</th>
                  <th>Manager Note</th>
                </tr>
              </thead>
              <tbody>
                {correctionRequests.map((cr, idx) => (
                  <tr key={idx}>
                    <td className="ps-4 fw-bold">{cr.attendance_date}</td>
                    <td>{cr.reason}</td>
                    <td>{cr.requested_change}</td>
                    <td>
                      {cr.status === 'approved' ? (
                        <span className="badge bg-success rounded-pill px-2 py-1">
                          <i className="bi bi-check me-1"></i>Approved
                        </span>
                      ) : cr.status === 'rejected' ? (
                        <span className="badge bg-danger rounded-pill px-2 py-1">
                          <i className="bi bi-x me-1"></i>Rejected
                        </span>
                      ) : (
                        <span className="badge bg-warning text-dark rounded-pill px-2 py-1">
                          <i className="bi bi-hourglass-split me-1"></i>Pending Review
                        </span>
                      )}
                    </td>
                    <td className="text-muted small">{cr.review_note || 'Awaiting manager response'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Correction Modal */}
      <CorrectionModal
        show={showCorrectionModal}
        onHide={() => setShowCorrectionModal(false)}
        defaultDate={fromDate}
        onSuccess={() => fetchData({ from: fromDate, to: toDate, status: statusFilter })}
      />
    </div>
  );
}
