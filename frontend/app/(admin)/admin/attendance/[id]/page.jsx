'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export default function AdminAttendanceDetailPage() {
  const params = useParams();
  const recordId = params?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-attendance-detail', recordId],
    queryFn: async () => {
      return await api.get(`/admin/attendance/${recordId}`);
    },
    enabled: !!recordId,
  });

  const record = data?.record || data || {};

  if (isLoading) {
    return (
      <div className="p-5 text-center text-muted">
        <div className="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
        Loading audit evidence and verification pipeline logs...
      </div>
    );
  }

  if (error || !record || !record.id) {
    return (
      <div className="card border-0 shadow-sm rounded-4 p-4 bg-white text-center">
        <div className="text-danger mb-2">
          <i className="bi bi-exclamation-triangle fs-1"></i>
        </div>
        <h5 className="fw-bold text-dark">Attendance Record Not Found</h5>
        <p className="text-muted small">Record #{recordId} does not exist or has been purged.</p>
        <div>
          <Link href="/admin/attendance" className="btn btn-primary rounded-pill px-4 btn-sm">
            Back to Attendance Records
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
        <div>
          <Link
            href="/admin/attendance"
            className="text-decoration-none small text-muted mb-1 d-inline-block"
          >
            <i className="bi bi-arrow-left me-1"></i> Back to Attendance Records
          </Link>
          <h4 className="fw-bold mb-0 text-dark">Verification Evidence & Audit Details</h4>
          <span className="text-muted small">
            Record #{record.id} &bull; {record.time_display}
          </span>
        </div>
        <div className="d-flex gap-2">
          <Link href="/admin/employees" className="btn btn-outline-primary btn-sm rounded-pill px-3">
            <i className="bi bi-people me-1"></i> View Employees
          </Link>
        </div>
      </div>

      <div className="row g-4">
        {/* Proof Photo & Result Card */}
        <div className="col-lg-5">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
            {/* Employee Profile Header */}
            <div className="d-flex align-items-center gap-3 p-3 bg-light rounded-4 mb-3 border">
              <div className="position-relative">
                {record.profile_photo_url ? (
                  <img
                    src={record.profile_photo_url}
                    alt={record.name}
                    className="rounded-circle border shadow-sm"
                    style={{ width: '54px', height: '54px', objectFit: 'cover' }}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = '/static/img/avatar_placeholder.png';
                    }}
                  />
                ) : (
                  <div
                    className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center fw-bold fs-5 shadow-sm"
                    style={{ width: '54px', height: '54px' }}
                  >
                    {(record.name || 'EM').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="position-absolute bottom-0 end-0 p-1 bg-success border border-white rounded-circle"></span>
              </div>
              <div>
                <div className="fw-bold text-dark fs-6">{record.name}</div>
                <div className="d-flex align-items-center gap-2 mt-1">
                  <span className="badge bg-secondary-subtle text-secondary border font-monospace px-2 py-1">
                    {record.employee_code}
                  </span>
                  <span className="text-muted small">{record.department_name || 'General'}</span>
                </div>
              </div>
            </div>

            <h6 className="fw-bold text-dark mb-3">Forensic Geotagged Proof</h6>

            {record.photo_url ? (
              <div className="text-center mb-3">
                <img
                  src={record.photo_url}
                  alt="Proof Photo"
                  className="img-fluid rounded-4 shadow-sm border"
                  style={{ maxHeight: '380px', width: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    e.target.onerror = null;
                    if (record.profile_photo_url) {
                      e.target.src = record.profile_photo_url;
                    } else {
                      e.target.style.display = 'none';
                    }
                  }}
                />
                <div className="small text-muted mt-2">
                  <i className="bi bi-shield-check text-success"></i> Tamper-evident biometric and location watermark
                </div>
              </div>
            ) : record.profile_photo_url ? (
              <div className="text-center mb-3">
                <img
                  src={record.profile_photo_url}
                  alt="Profile Photo"
                  className="img-fluid rounded-4 shadow-sm border"
                  style={{ maxHeight: '380px', width: '100%', objectFit: 'cover' }}
                />
                <div className="small text-muted mt-2">
                  <i className="bi bi-person-bounding-box text-primary"></i> Enrolled Reference Portrait
                </div>
              </div>
            ) : record.attendance_method === 'manual' ? (
              <div className="p-4 text-center bg-light rounded-4 text-muted mb-3 border">
                <i className="bi bi-person-check-fill fs-1 text-primary"></i>
                <p className="small fw-semibold mt-2 mb-0 text-dark">Manual Attendance</p>
                <p className="small text-muted mb-0">Authenticated via Server Session (No facial biometric image recorded)</p>
              </div>
            ) : (
              <div className="p-5 text-center bg-light rounded-4 text-muted mb-3">
                <i className="bi bi-image fs-1 opacity-50"></i>
                <p className="small mt-2 mb-0">No proof image stored for this entry.</p>
              </div>
            )}

            <div className="border-top pt-3">
              <div className="d-flex justify-content-between py-1 small">
                <span className="text-muted">Employee Name</span>
                <strong className="text-dark">{record.name}</strong>
              </div>
              <div className="d-flex justify-content-between py-1 small">
                <span className="text-muted">Employee Code</span>
                <strong className="text-dark font-monospace">{record.employee_code}</strong>
              </div>
              <div className="d-flex justify-content-between py-1 small">
                <span className="text-muted">Department</span>
                <span className="text-dark">{record.department_name || 'General'}</span>
              </div>
              <div className="d-flex justify-content-between py-1 small">
                <span className="text-muted">Work Site</span>
                <span className="text-dark">{record.site_name || 'Remote & Field'}</span>
              </div>
              <div className="d-flex justify-content-between py-1 small">
                <span className="text-muted">Work Policy</span>
                <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                  {record.duration_display || record.policy_display || 'Flexible · 8h/day'}
                </span>
              </div>
              <div className="d-flex justify-content-between py-1 small">
                <span className="text-muted">Attendance Method</span>
                <span
                  className={`badge ${record.attendance_method === 'manual' ? 'bg-secondary-subtle text-secondary border' : 'bg-primary-subtle text-primary border border-primary-subtle'}`}
                >
                  <i
                    className={`bi ${record.attendance_method === 'manual' ? 'bi-pencil-square' : 'bi-camera-video'} me-1`}
                  ></i>
                  {record.attendance_method === 'manual' ? 'Manual Attendance' : 'Facial Recognition'}
                </span>
              </div>
              {record.attendance_method !== 'manual' && (
                <div className="d-flex justify-content-between py-1 small">
                  <span className="text-muted">Match Confidence</span>
                  <span className="badge bg-success-subtle text-success border border-success-subtle">
                    {record.confidence_pct}%
                  </span>
                </div>
              )}
              <div className="d-flex justify-content-between py-1 small">
                <span className="text-muted">Status / Outcome</span>
                {record.flagged ? (
                  <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-1">
                    <i className="bi bi-flag-fill me-1"></i>Flagged for Review
                  </span>
                ) : ['success', 'on_time', 'Complete'].includes(record.status) ? (
                  <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1">
                    <i className="bi bi-check-circle-fill me-1"></i>
                    {record.is_flexible ? 'Complete' : 'Verified (On-Time)'}
                  </span>
                ) : ['late', 'Short Hours'].includes(record.status) ? (
                  <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2 py-1">
                    <i className="bi bi-clock me-1"></i>
                    {record.is_flexible ? 'Short Hours' : 'Late'}
                  </span>
                ) : record.status === 'Core Hours Missed' ? (
                  <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-1">
                    <i className="bi bi-exclamation-octagon me-1"></i>Core Hours Missed
                  </span>
                ) : ['overtime', 'Overtime'].includes(record.status) ? (
                  <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2 py-1">
                    <i className="bi bi-lightning-charge me-1"></i>Overtime
                  </span>
                ) : record.status === 'In Progress' ? (
                  <span className="badge bg-info-subtle text-info border border-info-subtle rounded-pill px-2 py-1">
                    <i className="bi bi-broadcast me-1"></i>In Progress
                  </span>
                ) : record.status === 'Missing Check-out' ? (
                  <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-1">
                    Missing Check-out
                  </span>
                ) : record.status === 'early_leave' ? (
                  <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2 py-1">
                    <i className="bi bi-box-arrow-left me-1"></i>Early Leave
                  </span>
                ) : (
                  <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1">
                    <i className="bi bi-check-circle-fill me-1"></i>{record.status}
                  </span>
                )}
              </div>
              <div className="d-flex justify-content-between py-1 small">
                <span className="text-muted">Resolved Address</span>
                <span className="text-end text-dark small" style={{ maxWidth: '220px' }}>
                  {record.address || 'Location Unavailable'}
                </span>
              </div>
              {record.flagged && record.flag_reason && (
                <div className="d-flex justify-content-between py-1 small">
                  <span className="text-danger fw-semibold">Audit Notice</span>
                  <span className="text-end text-danger small" style={{ maxWidth: '220px' }}>
                    {record.flag_reason}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 9-Stage Pipeline Audit Breakdown */}
        <div className="col-lg-7">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
            <h6 className="fw-bold text-dark mb-3">9-Stage Verification Pipeline Logs</h6>

            {record.stages && record.stages.length > 0 ? (
              <ul className="list-group list-group-flush">
                {record.stages.map((st, idx) => (
                  <li
                    key={idx}
                    className="list-group-item px-0 py-3 border-0 border-bottom d-flex align-items-start gap-3"
                  >
                    <div className="mt-1">
                      {['Completed', 'Passed'].includes(st.status) ? (
                        <i className="bi bi-check-circle-fill text-success fs-5"></i>
                      ) : st.status === 'Failed' ? (
                        <i className="bi bi-x-circle-fill text-danger fs-5"></i>
                      ) : (
                        <i className="bi bi-exclamation-circle-fill text-warning fs-5"></i>
                      )}
                    </div>
                    <div className="flex-grow-1">
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="fw-bold text-dark small">{st.stage}</span>
                        <span
                          className={`badge ${['Completed', 'Passed'].includes(st.status) ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'}`}
                        >
                          {st.status}
                        </span>
                      </div>
                      <p className="text-muted small mb-0 mt-1">{st.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4 text-center text-muted">
                {record.attendance_method === 'manual' ? (
                  <>
                    <i className="bi bi-shield-check fs-2 text-primary mb-2 d-block"></i>
                    <h6 className="fw-bold text-dark">Method: Manual Attendance</h6>
                    <span className="small">
                      Biometric facial pipeline was bypassed as requested. Identity verified via secure session authentication with GPS/geofence validation.
                    </span>
                  </>
                ) : (
                  <>
                    <i className="bi bi-journal-text fs-2 opacity-50 mb-2 d-block"></i>
                    <span className="small">No stage telemetry logged for this record.</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
