'use client';

import React from 'react';

export default function FlexiblePanel({
  flexibleData,
  currentStatus,
  site,
  shift,
  timeStr,
  demoMode,
  setDemoMode,
}) {
  if (!flexibleData) return null;

  const status = flexibleData.status || '';
  let statusBg = '#64748b';
  let statusIcon = 'bi-exclamation-circle-fill';
  let badgeClass = 'bg-danger';

  if (status === 'Complete' || status === 'Overtime') {
    statusBg = '#10b981';
    statusIcon = 'bi-check-circle-fill';
    badgeClass = 'bg-success';
  } else if (status === 'In Progress') {
    statusBg = '#3b82f6';
    statusIcon = 'bi-hourglass-split';
    badgeClass = 'bg-primary';
  } else if (status === 'Short Hours' || status === 'Half Day') {
    statusBg = '#f59e0b';
    statusIcon = 'bi-clock-history';
    badgeClass = 'bg-warning text-dark';
  }

  const isRemainingZero = flexibleData.remaining_hours === 0;

  return (
    <div className="row justify-content-center mb-4">
      <div className="col-lg-11">
        <div
          className="card border-0 shadow-sm rounded-4 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #091224 0%, #172554 50%, #0f172a 100%)',
          }}
        >
          <div className="card-body p-4 text-white">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3 pb-3 border-bottom border-white border-opacity-10">
              <div className="d-flex align-items-center gap-3">
                <div
                  className="rounded-circle p-3 text-white d-flex align-items-center justify-content-center shadow"
                  style={{
                    background: statusBg,
                    width: '56px',
                    height: '56px',
                    fontSize: '1.6rem',
                  }}
                  id="flexStatusIconWrap"
                >
                  <i className={`bi ${statusIcon}`} id="flexStatusIcon"></i>
                </div>
                <div>
                  <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                    <span
                      className="badge text-uppercase px-2 py-1"
                      style={{
                        background: 'rgba(59, 130, 246, 0.25)',
                        border: '1px solid rgba(147, 197, 253, 0.3)',
                        fontSize: '0.72rem',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Flexible Hours Policy
                    </span>
                    <span className={`badge rounded-pill px-2 py-1 ${badgeClass}`} id="flexStatusBadge">
                      {flexibleData.status_display}
                    </span>
                  </div>
                  <h4 className="fw-bold mb-0 text-white" id="flexCurrentStatusText">
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

              {/* Core Window Status & Live Clock */}
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <div id="flexCoreWindowBadge">
                  {flexibleData.is_in_core_window ? (
                    <span className="badge bg-success bg-opacity-25 text-success-subtle border border-success border-opacity-50 px-3 py-2 rounded-pill small">
                      <i className="bi bi-check-circle-fill text-success me-1"></i>
                      Inside Core Window ({flexibleData.core_window_text})
                    </span>
                  ) : (
                    <span className="badge bg-secondary bg-opacity-50 text-light border border-secondary border-opacity-50 px-3 py-2 rounded-pill small">
                      <i className="bi bi-clock me-1 text-info"></i>
                      Core Window: {flexibleData.core_window_text}
                    </span>
                  )}
                </div>
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
                    <i className="bi bi-magic text-warning"></i> Demo
                  </label>
                </div>
              </div>
            </div>

            {/* Metrics Cards Grid */}
            <div className="row g-3 mb-3">
              <div className="col-6 col-md-3">
                <div className="p-3 rounded-4 bg-white bg-opacity-10 border border-white border-opacity-10 h-100">
                  <div className="text-white-50 small fw-semibold text-uppercase" style={{ fontSize: '0.72rem' }}>
                    Worked Today
                  </div>
                  <div className="h3 fw-bold text-white my-1" id="flexWorkedHours">
                    {flexibleData.worked_hours}{' '}
                    <span className="fs-6 fw-normal text-white-50">hrs</span>
                  </div>
                  <div className="text-info small" id="flexWorkedMinutes">
                    {flexibleData.worked_minutes} mins total
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="p-3 rounded-4 bg-white bg-opacity-10 border border-white border-opacity-10 h-100">
                  <div className="text-white-50 small fw-semibold text-uppercase" style={{ fontSize: '0.72rem' }}>
                    Required Daily
                  </div>
                  <div className="h3 fw-bold text-white my-1">
                    {flexibleData.required_hours}{' '}
                    <span className="fs-6 fw-normal text-white-50">hrs</span>
                  </div>
                  <div className="text-white-50 small">Minimum target</div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="p-3 rounded-4 bg-white bg-opacity-10 border border-white border-opacity-10 h-100">
                  <div className="text-white-50 small fw-semibold text-uppercase" style={{ fontSize: '0.72rem' }}>
                    Remaining
                  </div>
                  <div
                    className={`h3 fw-bold ${isRemainingZero ? 'text-success' : 'text-warning'} my-1`}
                    id="flexRemainingHours"
                  >
                    {flexibleData.remaining_hours}{' '}
                    <span className="fs-6 fw-normal text-white-50">hrs</span>
                  </div>
                  <div
                    className={`small ${isRemainingZero ? 'text-success' : 'text-warning'}`}
                    id="flexRemainingSub"
                  >
                    {isRemainingZero ? 'Daily requirement met!' : 'Deficit to complete'}
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="p-3 rounded-4 bg-white bg-opacity-10 border border-white border-opacity-10 h-100 d-flex flex-column justify-content-center">
                  <div className="text-white-50 small fw-semibold text-uppercase mb-1" style={{ fontSize: '0.72rem' }}>
                    Live Departure Guide
                  </div>
                  <div
                    id="flexLeaveGuide"
                    className={`p-2 rounded-3 ${
                      flexibleData.earliest_leave_time
                        ? 'bg-primary bg-opacity-25 border border-primary border-opacity-50 text-white'
                        : 'bg-secondary bg-opacity-25 border border-secondary border-opacity-50 text-white-50'
                    } small fw-semibold`}
                  >
                    <i className="bi bi-box-arrow-right me-1 text-info"></i>
                    <span id="flexLeaveText">
                      {flexibleData.earliest_leave_time || 'Check in to begin tracking'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Weekly Progress Bar & Deficit Balance */}
            <div className="p-3 rounded-4 bg-white bg-opacity-10 border border-white border-opacity-10">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                <div>
                  <span className="text-white fw-bold small">
                    <i className="bi bi-calendar-week me-1 text-info"></i>Weekly Hours Progress:
                  </span>
                  <span className="text-white-50 small ms-1" id="flexWeeklyHoursText">
                    {flexibleData.weekly_worked_hours}h of {flexibleData.weekly_required_hours}h completed
                  </span>
                </div>
                <div>
                  <span
                    className={`badge ${
                      flexibleData.weekly_balance_hours >= 0
                        ? 'bg-success-subtle text-success border border-success-subtle'
                        : 'bg-warning-subtle text-warning border border-warning-subtle'
                    } px-3 py-1 rounded-pill`}
                    id="flexWeeklyBalanceBadge"
                  >
                    <i
                      className={`bi ${
                        flexibleData.weekly_balance_hours >= 0
                          ? 'bi-graph-up-arrow'
                          : 'bi-graph-down-arrow'
                      } me-1`}
                    ></i>
                    <span id="flexWeeklyBalanceText">
                      {flexibleData.weekly_balance_hours >= 0 ? '+' : ''}
                      {flexibleData.weekly_balance_hours}h Balance ({flexibleData.weekly_status_text})
                    </span>
                  </span>
                </div>
              </div>
              <div className="progress rounded-pill bg-dark bg-opacity-50" style={{ height: '10px' }}>
                <div
                  className="progress-bar progress-bar-striped progress-bar-animated bg-info"
                  id="flexWeeklyProgressBar"
                  role="progressbar"
                  style={{ width: `${flexibleData.weekly_progress_pct}%` }}
                  aria-valuenow={flexibleData.weekly_progress_pct}
                  aria-valuemin="0"
                  aria-valuemax="100"
                ></div>
              </div>
            </div>

            {/* Post-Checkout Day Summary Card */}
            {flexibleData.has_checkout && (
              <div
                id="flexDaySummaryCard"
                className="card border-0 rounded-4 mt-3 p-3 bg-white bg-opacity-10 text-white"
              >
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-check2-all text-success fs-4"></i>
                    <div>
                      <div className="fw-bold small text-white">Day Attendance Summary</div>
                      <div className="text-white-50 small">
                        First In: <strong className="text-white" id="flexSumFirstIn">{flexibleData.first_check_in || '—'}</strong> • Last Out: <strong className="text-white" id="flexSumLastOut">{flexibleData.last_check_out || '—'}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-3 flex-wrap">
                    <div>
                      <span className="text-white-50 small">Total Worked:</span>
                      <span className="fw-bold text-white ms-1" id="flexSumWorked">
                        {flexibleData.worked_hours}h
                      </span>
                    </div>
                    <div>
                      <span className="text-white-50 small">Short / Overtime:</span>
                      <span
                        className={`fw-bold ${
                          flexibleData.overtime_hours > 0
                            ? 'text-success'
                            : flexibleData.short_hours > 0
                            ? 'text-warning'
                            : 'text-white-50'
                        } ms-1`}
                        id="flexSumOtShort"
                      >
                        {flexibleData.overtime_hours > 0
                          ? `+${flexibleData.overtime_hours}h OT`
                          : flexibleData.short_hours > 0
                          ? `-${flexibleData.short_hours}h Short`
                          : 'Exact'}
                      </span>
                    </div>
                    <span className="badge bg-light text-dark px-3 py-1 rounded-pill" id="flexSumStatus">
                      {flexibleData.status}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
