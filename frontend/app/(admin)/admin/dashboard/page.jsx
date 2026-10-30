'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export default function AdminDashboardPage() {
  const { data: dashboardData, isLoading: isDashLoading, error: dashError } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => {
      return await api.get('/admin/dashboard');
    },
    refetchInterval: 30000,
  });

  const { data: summaryData, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['admin-dashboard-summary'],
    queryFn: async () => {
      return await api.get('/admin/dashboard/summary');
    },
    refetchInterval: 30000,
  });

  const totalEmployees = dashboardData?.total_employees ?? 0;
  const totalSites = dashboardData?.total_sites ?? 0;
  const presentToday = dashboardData?.present_today ?? 0;
  const attendanceRate = dashboardData?.attendance_rate ?? 0.0;
  const overtimeHours = dashboardData?.overtime_hours ?? 0.0;
  const flaggedCount = dashboardData?.flagged_count ?? 0;
  const recentLogs = dashboardData?.recent_logs || [];

  // Chart 1: 14-Day Attendance & Punctuality Trend
  const trendLabels = summaryData?.trend?.labels || [];
  const trendChartData = {
    labels: trendLabels,
    datasets: [
      {
        label: 'On-Time (Fixed)',
        data: summaryData?.trend?.on_time || [],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: false,
        tension: 0.35,
      },
      {
        label: 'Late (Fixed)',
        data: summaryData?.trend?.late || [],
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: false,
        tension: 0.35,
      },
      {
        label: 'Complete (Flex)',
        data: summaryData?.trend?.complete || [],
        borderColor: '#059669',
        backgroundColor: 'rgba(5, 150, 105, 0.1)',
        fill: false,
        tension: 0.35,
      },
      {
        label: 'Short Hours (Flex)',
        data: summaryData?.trend?.short_hours || [],
        borderColor: '#d97706',
        backgroundColor: 'rgba(217, 119, 6, 0.1)',
        fill: false,
        tension: 0.35,
      },
      {
        label: 'Core Missed (Flex)',
        data: summaryData?.trend?.core_missed || [],
        borderColor: '#dc2626',
        backgroundColor: 'rgba(220, 38, 38, 0.1)',
        fill: false,
        tension: 0.35,
      },
      {
        label: 'Flagged Audit',
        data: summaryData?.trend?.flagged || [],
        borderColor: '#991b1b',
        borderDash: [5, 5],
        fill: false,
        tension: 0.35,
      },
    ],
  };

  const trendChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 } },
    },
  };

  // Chart 2: Punctuality Breakdown by Department
  const deptLabels = summaryData?.department_punctuality?.departments || [];
  const deptChartData = {
    labels: deptLabels,
    datasets: [
      {
        label: 'On-Time',
        data: summaryData?.department_punctuality?.on_time || [],
        backgroundColor: '#10b981',
      },
      {
        label: 'Late',
        data: summaryData?.department_punctuality?.late || [],
        backgroundColor: '#f59e0b',
      },
      {
        label: 'Complete (Flex)',
        data: summaryData?.department_punctuality?.complete || [],
        backgroundColor: '#059669',
      },
      {
        label: 'Short Hours (Flex)',
        data: summaryData?.department_punctuality?.short_hours || [],
        backgroundColor: '#d97706',
      },
      {
        label: 'Core Missed (Flex)',
        data: summaryData?.department_punctuality?.core_missed || [],
        backgroundColor: '#dc2626',
      },
    ],
  };

  const deptChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { stacked: true },
      y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
    },
  };

  return (
    <>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
        <div>
          <h4 className="fw-bold mb-1 text-dark">Executive Oversight Dashboard</h4>
          <p className="text-muted small mb-0">
            Multi-site enterprise attendance, geofencing integrity, punctuality, and overtime analytics
          </p>
        </div>
        <div className="d-flex gap-2">
          <Link href="/admin/attendance" className="btn btn-outline-primary btn-sm rounded-pill px-3 fw-semibold">
            <i className="bi bi-list-check me-1"></i> Master Records
          </Link>
          <Link
            href="/admin/payroll-export"
            className="btn btn-success btn-sm rounded-pill px-3 fw-semibold"
            style={{ background: '#059669', borderColor: '#059669' }}
          >
            <i className="bi bi-file-earmark-spreadsheet me-1"></i> Payroll Export
          </Link>
        </div>
      </div>

      {dashError && (
        <div className="alert alert-danger rounded-3 shadow-sm py-2 px-3 small mb-4" role="alert">
          <i className="bi bi-exclamation-triangle me-1"></i>
          {dashError.message || 'Failed to load executive dashboard data.'}
        </div>
      )}

      {/* Key Performance Metric Cards */}
      <div className="row g-3 mb-4">
        <div className="col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="text-muted small fw-semibold">Total Workforce</span>
              <div className="badge rounded-circle p-2 bg-primary-subtle text-primary">
                <i className="bi bi-people-fill fs-5"></i>
              </div>
            </div>
            <h3 className="fw-bold text-dark mb-0">{isDashLoading ? '—' : totalEmployees}</h3>
            <span className="text-muted small">Across {totalSites} active office sites</span>
          </div>
        </div>

        <div className="col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="text-muted small fw-semibold">Checked In Right Now</span>
              <div className="badge rounded-circle p-2 bg-success-subtle text-success">
                <i className="bi bi-check2-circle fs-5"></i>
              </div>
            </div>
            <h3 className="fw-bold text-dark mb-0">{isDashLoading ? '—' : presentToday}</h3>
            <span className="text-success small fw-semibold">{attendanceRate}% Attendance Rate Today</span>
          </div>
        </div>

        <div className="col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="text-muted small fw-semibold">Overtime Accrued</span>
              <div className="badge rounded-circle p-2 bg-info-subtle text-info">
                <i className="bi bi-clock-history fs-5"></i>
              </div>
            </div>
            <h3 className="fw-bold text-primary mb-0">{isDashLoading ? '—' : `${overtimeHours} hrs`}</h3>
            <span className="text-muted small">Company-wide this pay period</span>
          </div>
        </div>

        <div className="col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="text-muted small fw-semibold">Flagged / Anomalies</span>
              <div className="badge rounded-circle p-2 bg-danger-subtle text-danger">
                <i className="bi bi-exclamation-triangle-fill fs-5"></i>
              </div>
            </div>
            <h3 className="fw-bold text-danger mb-0">{isDashLoading ? '—' : flaggedCount}</h3>
            <span className="text-danger small">Geofence violations or audit flags</span>
          </div>
        </div>
      </div>

      {/* Visualizations Row */}
      <div className="row g-4 mb-4">
        {/* Chart 1: 14-Day Attendance & Punctuality Trend */}
        <div className="col-lg-8">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h6 className="fw-bold text-dark mb-0">14-Day Attendance & Punctuality Trend</h6>
                <small className="text-muted">Daily distribution of on-time check-ins, late arrivals, and flagged events</small>
              </div>
              <span className="badge bg-light text-muted border px-2 py-1 small">
                <i className="bi bi-graph-up text-primary me-1"></i> Live Aggregate
              </span>
            </div>
            <div style={{ position: 'relative', height: '260px', width: '100%' }}>
              {isSummaryLoading ? (
                <div className="d-flex align-items-center justify-content-center h-100 text-muted small">
                  <div className="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                  Loading trends...
                </div>
              ) : (
                <Line data={trendChartData} options={trendChartOptions} />
              )}
            </div>
          </div>
        </div>

        {/* Chart 2: Punctuality Breakdown by Department */}
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h6 className="fw-bold text-dark mb-0">Department Punctuality</h6>
                <small className="text-muted">On-Time vs Late breakdown</small>
              </div>
            </div>
            <div style={{ position: 'relative', height: '260px', width: '100%' }}>
              {isSummaryLoading ? (
                <div className="d-flex align-items-center justify-content-center h-100 text-muted small">
                  <div className="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                  Loading department data...
                </div>
              ) : (
                <Bar data={deptChartData} options={deptChartOptions} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Organization-Wide Activity Table */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">
        <div className="card-header bg-white border-0 py-3 px-4 d-flex justify-content-between align-items-center">
          <h6 className="fw-bold mb-0 text-dark">
            <i className="bi bi-activity text-primary me-2"></i>Live Multi-Site Attendance Stream
          </h6>
          <Link href="/admin/attendance" className="text-primary text-decoration-none small fw-semibold">
            View All Records &rarr;
          </Link>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.88rem' }}>
            <thead className="table-light text-secondary">
              <tr>
                <th className="ps-4">Employee</th>
                <th>Event</th>
                <th>Timestamp</th>
                <th>Site Location</th>
                <th>Distance & Geofence</th>
                <th>Work Policy & Status</th>
                <th className="text-end pe-4">Detail</th>
              </tr>
            </thead>
            <tbody>
              {isDashLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted">
                    <div className="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
                    Loading recent attendance logs...
                  </td>
                </tr>
              ) : recentLogs.length > 0 ? (
                recentLogs.map((r) => {
                  const eventTitle = (r.event_type || '').replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                  return (
                    <tr key={r.id}>
                      <td className="ps-4">
                        <div className="fw-bold text-dark">{r.name}</div>
                        <div className="text-muted small">
                          ID: {r.code} • {r.department}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            r.event_type === 'check_in'
                              ? 'bg-success-subtle text-success border border-success-subtle'
                              : 'bg-primary-subtle text-primary border border-primary-subtle'
                          }`}
                        >
                          {eventTitle}
                        </span>
                      </td>
                      <td className="text-muted">{r.time_display}</td>
                      <td>{r.site}</td>
                      <td>
                        {r.distance_meters !== null && r.distance_meters !== undefined ? (
                          <>
                            <span>{Math.round(r.distance_meters)}m</span>
                            {r.within_geofence ? (
                              <span className="badge bg-success-subtle text-success ms-1">Within Radius</span>
                            ) : (
                              <span className="badge bg-danger text-white ms-1">Outside Geofence</span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted">No GPS</span>
                        )}
                      </td>
                      <td>
                        {r.is_flexible ? (
                          <>
                            {r.status === 'on_time' || r.status === 'Complete' ? (
                              <span className="badge bg-success rounded-pill px-2 py-1">
                                <i className="bi bi-check-circle me-1"></i>Complete
                              </span>
                            ) : r.status === 'late' || r.status === 'Short Hours' ? (
                              <span className="badge bg-warning text-dark rounded-pill px-2 py-1">
                                <i className="bi bi-clock me-1"></i>Short Hours
                              </span>
                            ) : r.status === 'Core Hours Missed' ? (
                              <span className="badge bg-danger rounded-pill px-2 py-1">
                                <i className="bi bi-exclamation-octagon me-1"></i>Core Missed
                              </span>
                            ) : r.status === 'overtime' || r.status === 'Overtime' ? (
                              <span className="badge bg-primary rounded-pill px-2 py-1">
                                <i className="bi bi-lightning-charge me-1"></i>Overtime
                              </span>
                            ) : r.status === 'In Progress' ? (
                              <span className="badge bg-info-subtle text-info border border-info-subtle rounded-pill px-2 py-1">
                                <i className="bi bi-broadcast me-1"></i>In Progress
                              </span>
                            ) : r.status === 'Missing Check-out' ? (
                              <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-1">
                                Missing Check-out
                              </span>
                            ) : r.status === 'flagged' ? (
                              <span className="badge bg-danger rounded-pill px-2 py-1">Flagged</span>
                            ) : (
                              <span className="badge bg-secondary rounded-pill px-2 py-1">{r.status}</span>
                            )}
                            <div className="text-muted small mt-1" style={{ fontSize: '0.73rem' }}>
                              {r.duration_progress}
                            </div>
                          </>
                        ) : (
                          <>
                            {r.status === 'on_time' ? (
                              <span className="badge bg-success rounded-pill px-2 py-1">
                                <i className="bi bi-check-circle me-1"></i>On-Time
                              </span>
                            ) : r.status === 'late' ? (
                              <span className="badge bg-warning text-dark rounded-pill px-2 py-1">
                                <i className="bi bi-clock me-1"></i>Late
                              </span>
                            ) : r.status === 'flagged' ? (
                              <span className="badge bg-danger rounded-pill px-2 py-1">Flagged</span>
                            ) : (
                              <span className="badge bg-secondary rounded-pill px-2 py-1">{r.status}</span>
                            )}
                          </>
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
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted">
                    No recent activity logs found.
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
