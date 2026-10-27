'use client';

import React from 'react';

export default function FixedPanel({
  currentStatus,
  site,
  shift,
  timeStr,
  demoMode,
  setDemoMode,
}) {
  const isCheckedIn = (currentStatus || '').includes('Checked in');
  const isCheckedOut =
    (currentStatus || '').includes('Checked out') ||
    (currentStatus || '').includes('Completed');

  const statusBg = isCheckedIn ? '#10b981' : isCheckedOut ? '#3b82f6' : '#64748b';
  const statusIcon = isCheckedIn
    ? 'bi-check-circle-fill'
    : isCheckedOut
    ? 'bi-door-closed-fill'
    : 'bi-clock-history';

  return (
    <div className="row justify-content-center mb-4">
      <div className="col-lg-11">
        <div
          className="card border-0 shadow-sm rounded-4 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          }}
        >
          <div className="card-body p-4 text-white">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
              <div className="d-flex align-items-center gap-3">
                <div
                  id="currentStatusIconWrap"
                  className="rounded-circle p-3 text-white d-flex align-items-center justify-content-center shadow"
                  style={{
                    background: statusBg,
                    width: '56px',
                    height: '56px',
                    fontSize: '1.6rem',
                  }}
                >
                  <i id="currentStatusIcon" className={`bi ${statusIcon}`}></i>
                </div>
                <div>
                  <span
                    className="badge text-uppercase px-2 py-1 mb-1"
                    style={{
                      background: 'rgba(255,255,255,0.15)',
                      fontSize: '0.72rem',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Current Workforce Status
                  </span>
                  <h4 className="fw-bold mb-0 text-white" id="currentStatusText">
                    {currentStatus}
                  </h4>
                  <div className="text-white-50 small mt-1">
                    <span>
                      <i className="bi bi-building me-1"></i>
                      {site?.name}
                    </span>
                    <span className="mx-2">•</span>
                    <span>
                      <i className="bi bi-sliders me-1"></i>
                      {shift?.duration_display || 'Flexible Hours · 8h/day'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Recommendation, Live Clock & Mode */}
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <div
                  className="bg-dark bg-opacity-50 px-3 py-2 rounded-pill border border-secondary border-opacity-25 text-white d-flex align-items-center gap-2 shadow-sm"
                  title="Real-time Accurate Clock"
                >
                  <i className="bi bi-clock-history text-info"></i>
                  <span id="liveClock" className="fw-bold font-monospace small">
                    {timeStr}
                  </span>
                  <span className="badge bg-secondary-subtle text-light" style={{ fontSize: '0.65rem' }}>
                    IST
                  </span>
                </div>
                <div className="form-check form-switch bg-dark bg-opacity-50 px-3 py-2 rounded-pill border border-secondary border-opacity-25 d-flex align-items-center gap-2 text-white">
                  <input
                    className="form-check-input ms-0 me-2"
                    type="checkbox"
                    id="demoModeToggle"
                    checked={demoMode}
                    onChange={(e) => setDemoMode(e.target.checked)}
                  />
                  <label className="form-check-label small fw-semibold text-light mb-0" htmlFor="demoModeToggle">
                    <i className="bi bi-magic text-warning"></i> Demo Mode
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
