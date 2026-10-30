'use client';

import React from 'react';

export default function ConfirmationModal({ show, modalData, onHide, onRefresh }) {
  if (!show || !modalData) return null;

  const isOut = modalData.event_type === 'check_out';
  const title = modalData.is_manual
    ? isOut
      ? 'Manual Check-Out Confirmed'
      : 'Manual Check-In Confirmed'
    : isOut
    ? 'Check-Out Confirmed'
    : 'Check-In Confirmed';

  const headerBg = isOut
    ? 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'
    : 'linear-gradient(135deg, #059669 0%, #10b981 100%)';

  const status = modalData.status || 'on_time';
  let badgeClass = 'badge bg-success-subtle text-success px-3 py-1 rounded-pill';
  if (status === 'flagged') {
    badgeClass = 'badge bg-danger-subtle text-danger px-3 py-1 rounded-pill';
  } else if (status === 'late') {
    badgeClass = 'badge bg-warning-subtle text-warning px-3 py-1 rounded-pill';
  }

  const accSuffix =
    modalData.accuracy_meters != null
      ? ` (±${Math.round(modalData.accuracy_meters)}m)`
      : '';
  const distanceText =
    modalData.distance_from_site_meters != null
      ? `${Math.round(modalData.distance_from_site_meters)}m${accSuffix}`
      : 'On Site';

  return (
    <>
      <div className="modal-backdrop fade show" style={{ zIndex: 1050 }}></div>
      <div
        className="modal fade show d-block"
        id="confirmationModal"
        tabIndex="-1"
        role="dialog"
        aria-modal="true"
        style={{ zIndex: 1055 }}
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
            <div
              className="modal-header border-0 pb-0 text-white"
              id="modalHeader"
              style={{ background: headerBg }}
            >
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-check-circle-fill fs-4"></i>
                <h5 className="modal-title fw-bold" id="confirmModalTitle">
                  {title}
                </h5>
              </div>
              <button
                type="button"
                className="btn-close btn-close-white"
                onClick={onHide}
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body p-4">
              <div className="text-center mb-3">
                {modalData.photo_url && !modalData.is_manual ? (
                  <img
                    id="confirmPhoto"
                    src={modalData.photo_url}
                    alt="Proof"
                    className="rounded-3 shadow-sm mb-2"
                    style={{
                      maxHeight: '180px',
                      width: 'auto',
                      maxWidth: '100%',
                      objectFit: 'cover',
                      display: 'inline-block',
                    }}
                  />
                ) : null}

                {modalData.is_manual ? (
                  <div id="confirmManualBadge" className="p-3 bg-light rounded-3 border mb-2">
                    <i className="bi bi-shield-check text-primary fs-1 d-block mb-1"></i>
                    <span className="badge bg-primary-subtle text-primary">
                      Session-Verified Manual Attendance
                    </span>
                  </div>
                ) : null}

                <h5 className="fw-bold text-dark mb-1" id="confirmEmpName">
                  {modalData.employee_name || 'Employee'}
                </h5>
                <span className={badgeClass} id="confirmStatusBadge">
                  {status.toUpperCase() === 'ON_TIME' ? 'VERIFIED ON-TIME' : status.toUpperCase()}
                </span>
              </div>

              <div className="p-3 bg-light rounded-3 border small">
                <div className="d-flex justify-content-between mb-2">
                  <span className="text-secondary">
                    <i className="bi bi-person-badge me-1"></i>Method:
                  </span>
                  <strong id="confirmMethod">
                    {modalData.is_manual ? 'Manual (Session Authenticated)' : 'Face Recognition'}
                  </strong>
                </div>
                <div className="d-flex justify-content-between mb-2">
                  <span className="text-secondary">
                    <i className="bi bi-clock me-1"></i>Timestamp:
                  </span>
                  <strong id="confirmTime">{modalData.timestamp_display || '—'}</strong>
                </div>
                <div className="d-flex justify-content-between mb-2">
                  <span className="text-secondary">
                    <i className="bi bi-geo-alt me-1"></i>Location:
                  </span>
                  <span
                    className="text-end fw-semibold text-truncate ms-2"
                    style={{ maxWidth: '220px' }}
                    id="confirmAddress"
                  >
                    {modalData.address || 'Location Verified'}
                  </span>
                </div>
                <div className="d-flex justify-content-between mb-2">
                  <span className="text-secondary">
                    <i className="bi bi-building me-1"></i>Work Site:
                  </span>
                  <strong id="confirmSite">{modalData.site_name || 'Work Site'}</strong>
                </div>
                <div className="d-flex justify-content-between">
                  <span className="text-secondary">
                    <i className="bi bi-arrows-collapse me-1"></i>Distance from Site:
                  </span>
                  <strong id="confirmDistance">{distanceText}</strong>
                </div>
              </div>

              {modalData.flagged ? (
                <div
                  id="confirmFlagNotice"
                  className="alert alert-warning border-0 rounded-3 mt-3 py-2 px-3 small d-flex align-items-center gap-2"
                >
                  <i className="bi bi-info-circle-fill text-warning"></i>
                  <span id="confirmFlagReason">
                    {modalData.flag_reason || 'Event flagged for manager review.'}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="modal-footer border-0 pt-0">
              <button
                type="button"
                className="btn btn-success w-100 rounded-pill py-2 fw-semibold"
                onClick={onRefresh || onHide}
              >
                Done & Refresh Status
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
