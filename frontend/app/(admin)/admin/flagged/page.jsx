'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from 'react-bootstrap/Modal';
import api from '@/lib/api';
import { useAuth } from '@/lib/authContext';

export default function AdminFlaggedQueuePage() {
  const queryClient = useQueryClient();
  const { addFlash } = useAuth();

  const [reviewingRecord, setReviewingRecord] = useState(null);
  const [reviewAction, setReviewAction] = useState('reject');
  const [reviewNote, setReviewNote] = useState('');

  const [reviewingCorrection, setReviewingCorrection] = useState(null);
  const [corrAction, setCorrAction] = useState('approve');
  const [corrNote, setCorrNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-flagged-queue'],
    queryFn: async () => {
      return await api.get('/admin/flagged');
    },
  });

  const records = data?.records || [];
  const pendingCorrections = data?.pending_corrections || [];

  const reviewEventMutation = useMutation({
    mutationFn: async ({ recordId, payload }) => {
      return await api.post(`/admin/flagged/${recordId}/review`, payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-flagged-queue'] });
      setReviewingRecord(null);
      setReviewNote('');
      if (res?.message) {
        addFlash(res.message, res.category || 'success');
      }
    },
    onError: (err) => {
      alert(err.data?.error || err.message || 'Failed to submit review decision');
    },
  });

  const reviewCorrectionMutation = useMutation({
    mutationFn: async ({ requestId, payload }) => {
      return await api.post(`/admin/corrections/${requestId}/review`, payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-flagged-queue'] });
      setReviewingCorrection(null);
      setCorrNote('');
      if (res?.message) {
        addFlash(res.message, res.category || 'success');
      }
    },
    onError: (err) => {
      alert(err.data?.error || err.message || 'Failed to review correction request');
    },
  });

  const handleOpenReview = (r) => {
    setReviewingRecord(r);
    setReviewAction('reject');
    setReviewNote('');
  };

  const handleSubmitReview = (e) => {
    e.preventDefault();
    if (!reviewingRecord) return;
    reviewEventMutation.mutate({
      recordId: reviewingRecord.id,
      payload: {
        action: reviewAction,
        note: reviewNote,
      },
    });
  };

  const handleOpenCorrReview = (cr) => {
    setReviewingCorrection(cr);
    setCorrAction('approve');
    setCorrNote('');
  };

  const handleSubmitCorrReview = (e) => {
    e.preventDefault();
    if (!reviewingCorrection) return;
    reviewCorrectionMutation.mutate({
      requestId: reviewingCorrection.id,
      payload: {
        action: corrAction,
        review_note: corrNote,
      },
    });
  };

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
        <div>
          <h4 className="fw-bold mb-1 text-dark">Audit & Review Queue</h4>
          <p className="text-muted small mb-0">
            Events flagged due to geofence radius violations, missing coordinates, proxy warnings, or liveness failures
          </p>
        </div>
        <span className="badge bg-danger-subtle text-danger border border-danger-subtle px-3 py-2 fs-6 rounded-pill">
          <i className="bi bi-shield-exclamation me-1"></i> {isLoading ? '...' : `${records.length} Flagged Events`}
        </span>
      </div>

      {/* Flagged Records Card */}
      <div className="card border-0 shadow-sm rounded-4 bg-white overflow-hidden mb-4">
        <div className="card-header bg-white border-0 py-3 px-4">
          <h6 className="fw-bold mb-0 text-dark">
            <i className="bi bi-geo-fill text-danger me-2"></i>Flagged Attendance Events
          </h6>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.88rem' }}>
            <thead className="table-light text-secondary">
              <tr>
                <th className="ps-4">ID</th>
                <th>Employee</th>
                <th>Event</th>
                <th>Timestamp</th>
                <th>Site & Distance</th>
                <th>Anomaly Flag Reason</th>
                <th className="text-end pe-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="7" className="text-center py-4 text-muted">
                    <div className="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    Loading audit queue...
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
                      <span className="badge bg-light text-dark border">
                        {(r.event_type || 'check_in').replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className="text-dark small">{r.time_display}</span>
                    </td>
                    <td>
                      <div>{r.site_name || 'Headquarters'}</div>
                      {r.distance_from_site_meters != null ? (
                        <span className="text-danger small fw-semibold">
                          <i className="bi bi-compass me-1"></i>
                          {Math.round(r.distance_from_site_meters)}m away
                        </span>
                      ) : (
                        <span className="text-muted small">No GPS</span>
                      )}
                    </td>
                    <td>
                      <span className="text-danger small fw-semibold">
                        <i className="bi bi-exclamation-triangle-fill me-1"></i>
                        {r.flag_reason || r.review_note || 'Geofence violation or missing coordinates'}
                      </span>
                    </td>
                    <td className="text-end pe-4">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary rounded-pill px-3 py-1"
                        onClick={() => handleOpenReview(r)}
                      >
                        <i className="bi bi-pencil-square me-1"></i> Review
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="text-center py-4 text-muted">
                    <i className="bi bi-shield-check text-success fs-3 d-block mb-1"></i>
                    No flagged anomalies currently pending in the audit queue.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Correction Requests Section */}
      {pendingCorrections.length > 0 && (
        <div className="card border-0 shadow-sm rounded-4 bg-white overflow-hidden mb-4">
          <div className="card-header bg-white border-0 py-3 px-4">
            <h6 className="fw-bold mb-0 text-dark">
              <i className="bi bi-inbox-fill text-warning me-2"></i>
              Unresolved Correction Requests Across Company
            </h6>
          </div>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.88rem' }}>
              <thead className="table-light text-secondary">
                <tr>
                  <th className="ps-4">Employee</th>
                  <th>Target Date</th>
                  <th>Reason</th>
                  <th>Requested Adjustment</th>
                  <th>Submitted</th>
                  <th className="text-end pe-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingCorrections.map((cr) => (
                  <tr key={cr.id}>
                    <td className="ps-4">
                      <div className="fw-bold">{cr.name}</div>
                      <div className="text-muted small">
                        ID: {cr.employee_code} • {cr.department_name}
                      </div>
                    </td>
                    <td>{cr.attendance_date}</td>
                    <td>{cr.reason}</td>
                    <td>{cr.requested_change}</td>
                    <td className="text-muted small">{cr.created_display}</td>
                    <td className="text-end pe-4">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-warning rounded-pill px-3 py-1"
                        onClick={() => handleOpenCorrReview(cr)}
                      >
                        <i className="bi bi-check2-circle me-1"></i> Resolve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review Modal for Flagged Event */}
      <Modal
        show={!!reviewingRecord}
        onHide={() => setReviewingRecord(null)}
        centered
        contentClassName="rounded-4 border-0 shadow"
      >
        <form onSubmit={handleSubmitReview}>
          <div className="modal-header border-bottom">
            <h6 className="modal-title fw-bold">
              Audit Flagged Record #{reviewingRecord?.id}
            </h6>
            <button
              type="button"
              className="btn-close"
              onClick={() => setReviewingRecord(null)}
            ></button>
          </div>
          <div className="modal-body p-4">
            {reviewingRecord?.geotagged_photo_path && (
              <div className="text-center mb-3">
                <img
                  src={`/${reviewingRecord.geotagged_photo_path}`}
                  alt="Proof"
                  className="img-fluid rounded-3 border shadow-sm"
                  style={{ maxHeight: '240px', width: '100%', objectFit: 'cover' }}
                />
              </div>
            )}

            <div className="alert alert-warning py-2 px-3 small rounded-3 mb-3">
              <strong>Anomaly Reason:</strong>{' '}
              {reviewingRecord?.flag_reason ||
                reviewingRecord?.review_note ||
                'Flagged during automated geofence / biometric verification.'}
            </div>

            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">Review Decision</label>
              <select
                name="action"
                className="form-select form-select-sm rounded-3"
                value={reviewAction}
                onChange={(e) => setReviewAction(e.target.value)}
              >
                <option value="approve">Approve (Override flag & mark attendance as Verified)</option>
                <option value="reject">Reject (Confirm violation & leave Flagged)</option>
              </select>
            </div>

            <div className="mb-2">
              <label className="form-label small fw-semibold text-secondary">Audit Note</label>
              <textarea
                name="note"
                className="form-control form-control-sm rounded-3"
                rows="2"
                placeholder="e.g. Approved due to offsite emergency client dispatch..."
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
              ></textarea>
            </div>
          </div>
          <div className="modal-footer border-top py-2">
            <button
              type="button"
              className="btn btn-sm btn-light border rounded-pill"
              onClick={() => setReviewingRecord(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-sm btn-primary rounded-pill px-3"
              style={{ background: 'var(--admin-primary)', borderColor: 'var(--admin-primary)' }}
              disabled={reviewEventMutation.isPending}
            >
              {reviewEventMutation.isPending ? 'Submitting...' : 'Submit Decision'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Review Modal for Correction Request */}
      <Modal
        show={!!reviewingCorrection}
        onHide={() => setReviewingCorrection(null)}
        centered
        contentClassName="rounded-4 border-0 shadow"
      >
        <form onSubmit={handleSubmitCorrReview}>
          <div className="modal-header border-bottom">
            <h6 className="modal-title fw-bold">
              Resolve Correction Request #{reviewingCorrection?.id}
            </h6>
            <button
              type="button"
              className="btn-close"
              onClick={() => setReviewingCorrection(null)}
            ></button>
          </div>
          <div className="modal-body p-4">
            <div className="mb-3">
              <div className="fw-bold text-dark">{reviewingCorrection?.name}</div>
              <div className="text-muted small">
                Target Date: <strong>{reviewingCorrection?.attendance_date}</strong>
              </div>
              <div className="text-muted small mt-1">
                Reason: {reviewingCorrection?.reason}
              </div>
              <div className="text-muted small">
                Requested: <strong>{reviewingCorrection?.requested_change}</strong>
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">Decision</label>
              <select
                name="action"
                className="form-select form-select-sm rounded-3"
                value={corrAction}
                onChange={(e) => setCorrAction(e.target.value)}
              >
                <option value="approve">Approve (Apply requested change)</option>
                <option value="reject">Reject (Decline request)</option>
              </select>
            </div>

            <div className="mb-2">
              <label className="form-label small fw-semibold text-secondary">Review Note</label>
              <textarea
                name="review_note"
                className="form-control form-control-sm rounded-3"
                rows="2"
                placeholder="Optional audit explanation..."
                value={corrNote}
                onChange={(e) => setCorrNote(e.target.value)}
              ></textarea>
            </div>
          </div>
          <div className="modal-footer border-top py-2">
            <button
              type="button"
              className="btn btn-sm btn-light border rounded-pill"
              onClick={() => setReviewingCorrection(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-sm btn-primary rounded-pill px-3"
              style={{ background: 'var(--admin-primary)', borderColor: 'var(--admin-primary)' }}
              disabled={reviewCorrectionMutation.isPending}
            >
              {reviewCorrectionMutation.isPending ? 'Submitting...' : 'Confirm Decision'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
