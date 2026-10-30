'use client';

import React, { useState } from 'react';
import api from '@/lib/api';

export default function CorrectionModal({ show, onHide, defaultDate = '', onSuccess }) {
  const [attendanceDate, setAttendanceDate] = useState(defaultDate);
  const [reason, setReason] = useState('Forgot to check out');
  const [requestedChange, setRequestedChange] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!show) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/employee/correction-request', {
        attendance_date: attendanceDate,
        reason,
        requested_change: requestedChange,
      });
      if (res && (res.ok || res.success)) {
        if (onSuccess) onSuccess();
        onHide();
      } else {
        setError(res?.message || 'Failed to submit correction request.');
      }
    } catch (err) {
      setError(err?.message || 'Network error submitting request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop fade show" style={{ zIndex: 1050 }}></div>
      <div
        className="modal fade show d-block"
        id="correctionModal"
        tabIndex="-1"
        role="dialog"
        aria-modal="true"
        style={{ zIndex: 1055 }}
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content border-0 shadow-lg rounded-4">
            <form onSubmit={handleSubmit}>
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title fw-bold text-dark">Submit Attendance Correction</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={onHide}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body p-4">
                {error && (
                  <div className="alert alert-danger py-2 px-3 small rounded-3 mb-3">
                    <i className="bi bi-exclamation-triangle-fill me-1"></i> {error}
                  </div>
                )}
                <div className="mb-3">
                  <label className="form-label small fw-semibold text-secondary">Attendance Date</label>
                  <input
                    type="date"
                    name="attendance_date"
                    className="form-control rounded-3"
                    required
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-semibold text-secondary">
                    Reason for Correction
                  </label>
                  <select
                    name="reason"
                    className="form-select rounded-3"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  >
                    <option value="Forgot to check out">Forgot to check out</option>
                    <option value="Forgot to check in">Forgot to check in</option>
                    <option value="GPS / Device connectivity failure">
                      GPS / Device connectivity failure
                    </option>
                    <option value="Camera malfunction">Camera malfunction</option>
                    <option value="Offsite client meeting / On field duty">
                      Offsite client meeting / On field duty
                    </option>
                    <option value="Other">Other discrepancy</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-semibold text-secondary">
                    Requested Adjustment Details
                  </label>
                  <textarea
                    name="requested_change"
                    className="form-control rounded-3"
                    rows="3"
                    placeholder="e.g. Please record check-out at 18:15. Completed shift on client site."
                    required
                    value={requestedChange}
                    onChange={(e) => setRequestedChange(e.target.value)}
                  ></textarea>
                </div>
                <div className="text-muted small">
                  <i className="bi bi-info-circle me-1"></i>Your correction request will be sent
                  directly to your assigned manager's queue for review and sign-off.
                </div>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button
                  type="button"
                  className="btn btn-outline-secondary rounded-pill px-3"
                  onClick={onHide}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-success rounded-pill px-4 fw-semibold"
                  style={{ background: '#059669', borderColor: '#059669' }}
                >
                  {loading ? 'Submitting...' : 'Submit to Manager'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
