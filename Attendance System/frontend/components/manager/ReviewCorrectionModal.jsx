'use client';

import React, { useState } from 'react';
import Modal from 'react-bootstrap/Modal';

export default function ReviewCorrectionModal({
  show,
  onHide,
  requestItem,
  onSubmit,
  isSubmitting,
}) {
  const [action, setAction] = useState('approve');
  const [reviewNote, setReviewNote] = useState('');

  if (!requestItem) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      id: requestItem.id,
      action,
      reviewNote,
    });
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <form onSubmit={handleSubmit}>
        <div className="modal-header border-0 pb-0">
          <h5 className="modal-title fw-bold text-dark">Review Attendance Correction</h5>
          <button
            type="button"
            className="btn-close"
            onClick={onHide}
            aria-label="Close"
          ></button>
        </div>
        <div className="modal-body p-4">
          <div className="p-3 bg-light rounded-3 border mb-3 small">
            <div className="d-flex justify-content-between mb-1">
              <span className="text-secondary">Employee:</span>
              <strong id="modalEmpName">{requestItem.name}</strong>
            </div>
            <div className="d-flex justify-content-between mb-1">
              <span className="text-secondary">Target Date:</span>
              <strong id="modalDate">{requestItem.attendance_date}</strong>
            </div>
            <div className="d-flex justify-content-between mb-1">
              <span className="text-secondary">Reason:</span>
              <span id="modalReason" className="fw-semibold">
                {requestItem.reason}
              </span>
            </div>
            <div className="mt-2 pt-2 border-top">
              <div className="text-secondary mb-1">Requested Change:</div>
              <div id="modalChange" className="p-2 bg-white rounded border fw-medium">
                {requestItem.requested_change}
              </div>
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label small fw-semibold text-secondary">Decision Action</label>
            <div className="d-flex gap-3">
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="radio"
                  name="action"
                  id="actionApprove"
                  value="approve"
                  checked={action === 'approve'}
                  onChange={() => setAction('approve')}
                />
                <label className="form-check-label fw-semibold text-success" htmlFor="actionApprove">
                  <i className="bi bi-check-circle me-1"></i>Approve Correction
                </label>
              </div>
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="radio"
                  name="action"
                  id="actionReject"
                  value="reject"
                  checked={action === 'reject'}
                  onChange={() => setAction('reject')}
                />
                <label className="form-check-label fw-semibold text-danger" htmlFor="actionReject">
                  <i className="bi bi-x-circle me-1"></i>Reject Request
                </label>
              </div>
            </div>
          </div>

          <div className="mb-2">
            <label className="form-label small fw-semibold text-secondary">
              Manager Review Note (Optional)
            </label>
            <textarea
              name="review_note"
              className="form-control rounded-3"
              rows={2}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="e.g. Approved based on team calendar and verified client task."
            ></textarea>
          </div>
        </div>
        <div className="modal-footer border-0 pt-0">
          <button
            type="button"
            className="btn btn-outline-secondary rounded-pill px-3"
            onClick={onHide}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-dark rounded-pill px-4 fw-semibold"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Confirm Decision'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
