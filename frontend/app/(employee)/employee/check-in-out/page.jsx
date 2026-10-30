'use client';

import React, { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useLiveClock } from '@/hooks/useLiveClock';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useCamera } from '@/hooks/useCamera';
import { useLiveStatus } from '@/hooks/useLiveStatus';
import FlexiblePanel from '@/components/employee/FlexiblePanel';
import FixedPanel from '@/components/employee/FixedPanel';
import ConfirmationModal from '@/components/employee/ConfirmationModal';

export default function CheckInOutPage() {
  const [loading, setLoading] = useState(true);
  const [pageData, setPageData] = useState(null);
  const [currentAction, setCurrentAction] = useState('check_in');
  const [selectedMethod, setSelectedMethod] = useState('face');
  const [demoMode, setDemoMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [challengeActive, setChallengeActive] = useState(false);
  const [challengeProgress, setChallengeProgress] = useState(0);

  const [modalData, setModalData] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const { timeStr } = useLiveClock();

  const siteCoords = pageData?.site
    ? {
        lat: pageData.site.latitude,
        lon: pageData.site.longitude,
        radius: pageData.site.geofence_radius_meters,
        enabled: Boolean(pageData.site.geofencing_enabled),
      }
    : null;

  const { userCoords, status: gpsStatus, distance, warningMessage, acquireLocation } = useGeolocation(
    siteCoords,
    currentAction
  );

  const {
    videoRef,
    isCameraActive,
    scannerStatusText,
    setScannerStatusText,
    startCamera,
    stopCamera,
    captureBurstAndPrimary,
  } = useCamera();

  const isFlexible = Boolean(pageData?.is_flexible);
  const { data: flexibleData, setData: setFlexibleData, refreshStatus } = useLiveStatus(
    isFlexible,
    pageData?.flexible_data
  );

  const loadData = useCallback(async () => {
    try {
      const res = await api.get('/employee/check-in-out');
      if (res) {
        setPageData(res);
        if (res.next_action) {
          setCurrentAction(res.next_action);
        }
        if (res.effective_policy === 'manual_only') {
          setSelectedMethod('manual');
        } else {
          setSelectedMethod('face');
        }
        if (res.flexible_data) {
          setFlexibleData(res.flexible_data);
        }
      }
    } catch (e) {
      console.error('Error fetching check-in-out data:', e);
    } finally {
      setLoading(false);
    }
  }, [setFlexibleData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Window focus listener to re-verify policy
  useEffect(() => {
    const handleFocus = async () => {
      try {
        const p = await api.get('/employee/api/attendance-policy');
        if (p && p.effective_policy && pageData?.effective_policy && p.effective_policy !== pageData.effective_policy) {
          window.location.reload();
        }
      } catch (err) {
        // silent
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [pageData?.effective_policy]);

  const handleSelectMethod = (method) => {
    setSelectedMethod(method);
    if (method === 'manual') {
      stopCamera();
    }
  };

  // Face attendance submit
  const handleFaceSubmit = async () => {
    if (!isCameraActive) {
      alert("Camera is not active. Please click 'Start Camera' first to enable your video feed.");
      return;
    }

    setSubmitting(true);
    setChallengeActive(true);
    setChallengeProgress(0);

    try {
      const captureResult = await captureBurstAndPrimary((progress) => {
        setChallengeProgress(progress);
      });

      if (!captureResult || !captureResult.primaryPhoto) {
        setSubmitting(false);
        setChallengeActive(false);
        return;
      }

      setChallengeActive(false);

      const endpoint = currentAction === 'check_out' ? '/employee/check-out' : '/employee/check-in';
      const payload = {
        image: captureResult.primaryPhoto,
        liveness_frames: captureResult.livenessFrames,
        latitude: userCoords.lat,
        longitude: userCoords.lon,
        accuracy: userCoords.accuracy,
        gps_error: userCoords.gps_error,
        event_type: currentAction,
        is_demo: demoMode,
        bypass_cooldown: demoMode,
      };

      const res = await api.post(endpoint, payload);

      if (res && res.success) {
        setModalData({
          ...res,
          is_manual: false,
          event_type: currentAction,
          employee_name: pageData?.employee_name || 'Employee',
          site_name: pageData?.site?.name || 'Work Site',
        });
        setShowModal(true);

        const nextMode = currentAction === 'check_out' ? 'check_in' : 'check_out';
        setCurrentAction(nextMode);

        if (pageData) {
          const timestampStr = res.timestamp_display || new Date().toLocaleTimeString();
          const updatedStatus = currentAction === 'check_out'
            ? `Checked out at ${timestampStr}`
            : `Checked in at ${timestampStr}`;
          setPageData((prev) => ({ ...prev, current_status: updatedStatus }));
        }

        refreshStatus();
      } else {
        if (res?.policy_mismatch) {
          alert(res.message || 'Your site now requires Manual Attendance for attendance — please refresh.');
          window.location.reload();
          return;
        }
        if (res?.enrollment_required) {
          alert(res.message || 'Face enrollment required before marking attendance.');
          return;
        }
        alert('Verification Failed: ' + (res?.message || 'Face or location check failed.'));
      }
    } catch (err) {
      alert('Network or verification error: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
      setChallengeActive(false);
    }
  };

  // Manual attendance submit
  const handleManualSubmit = async () => {
    setSubmitting(true);
    const endpoint = currentAction === 'check_out' ? '/employee/manual-check-out' : '/employee/manual-check-in';

    try {
      const payload = {
        latitude: userCoords.lat,
        longitude: userCoords.lon,
        accuracy: userCoords.accuracy,
        gps_error: userCoords.gps_error,
        bypass_cooldown: demoMode,
        is_demo: demoMode,
      };

      const res = await api.post(endpoint, payload);

      if (res && res.success) {
        setModalData({
          ...res,
          is_manual: true,
          event_type: res.event_type || currentAction,
          employee_name: pageData?.employee_name || 'Employee',
          site_name: pageData?.site?.name || 'Work Site',
        });
        setShowModal(true);

        const nextMode = currentAction === 'check_out' ? 'check_in' : 'check_out';
        setCurrentAction(nextMode);

        if (pageData) {
          const timestampStr = res.timestamp_display || new Date().toLocaleTimeString();
          const updatedStatus = currentAction === 'check_out'
            ? `Checked out at ${timestampStr} (Manual)`
            : `Checked in at ${timestampStr} (Manual)`;
          setPageData((prev) => ({ ...prev, current_status: updatedStatus }));
        }

        refreshStatus();
      } else {
        if (res?.policy_mismatch) {
          alert(res.message || 'Your site now requires Face Recognition for attendance — please refresh.');
          window.location.reload();
          return;
        }
        alert('Attendance Notice: ' + (res?.message || 'Failed to process manual attendance.'));
      }
    } catch (err) {
      alert('Network or server error: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center py-5">
        <div className="spinner-border text-success" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  const shiftAssigned = Boolean(pageData?.shift_assigned);
  const effectivePolicy = pageData?.effective_policy || 'both';
  const hasFaceEnrollment = Boolean(pageData?.has_face_enrollment);

  const isCheckOut = currentAction === 'check_out';
  const actionBtnColor = isCheckOut ? '#dc2626' : '#059669';
  const actionBtnText = isCheckOut ? 'Check Out Now' : 'Check In Now';
  const manualBtnText = isCheckOut ? 'Check Out Manually' : 'Check In Manually';

  // GPS Badge styling
  let gpsBadgeClass = 'badge bg-light text-muted border px-2 py-1 small';
  let gpsBadgeContent = (
    <>
      <i className="bi bi-geo-alt"></i> Acquiring GPS...
    </>
  );

  if (gpsStatus === 'ready') {
    gpsBadgeClass = 'badge bg-success-subtle text-success border border-success-subtle px-2 py-1 small';
    gpsBadgeContent = (
      <>
        <i className="bi bi-geo-alt-fill me-1"></i> GPS Ready, accuracy ±{Math.round(userCoords.accuracy || 0)}m
      </>
    );
  } else if (gpsStatus === 'poor_accuracy') {
    gpsBadgeClass = 'badge bg-warning-subtle text-warning border border-warning-subtle px-2 py-1 small';
    gpsBadgeContent = (
      <>
        <i className="bi bi-exclamation-triangle-fill me-1"></i> GPS Ready (Poor accuracy ±{Math.round(userCoords.accuracy || 0)}m)
      </>
    );
  } else if (gpsStatus === 'permission_denied') {
    gpsBadgeClass = 'badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1 small';
    gpsBadgeContent = (
      <>
        <i className="bi bi-slash-circle me-1"></i> GPS Permission Denied
      </>
    );
  } else if (gpsStatus === 'position_unavailable') {
    gpsBadgeClass = 'badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1 small';
    gpsBadgeContent = (
      <>
        <i className="bi bi-geo-slash me-1"></i> GPS Position Unavailable
      </>
    );
  } else if (gpsStatus === 'timeout') {
    gpsBadgeClass = 'badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1 small';
    gpsBadgeContent = (
      <>
        <i className="bi bi-clock-history me-1"></i> GPS Request Timed Out
      </>
    );
  } else if (gpsStatus === 'offline') {
    gpsBadgeClass = 'badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1 small';
    gpsBadgeContent = (
      <>
        <i className="bi bi-exclamation-triangle me-1"></i> GPS Offline
      </>
    );
  }

  return (
    <div className="container-fluid px-sm-4 py-3">
      {!shiftAssigned ? (
        <div className="row justify-content-center mb-4">
          <div className="col-lg-11">
            <div className="alert alert-warning border-0 rounded-4 shadow-sm p-4 d-flex align-items-center gap-3">
              <i className="bi bi-exclamation-triangle-fill fs-2 text-warning"></i>
              <div>
                <h5 className="fw-bold mb-1 text-dark">No Shift Assigned</h5>
                <p className="mb-0 text-secondary">
                  You currently have no assigned shift schedule. Please contact your system administrator. Your attendance events can still be recorded and will be audited.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : isFlexible && flexibleData ? (
        <FlexiblePanel
          flexibleData={flexibleData}
          currentStatus={pageData?.current_status}
          site={pageData?.site}
          shift={pageData?.shift}
          timeStr={timeStr}
          demoMode={demoMode}
          setDemoMode={setDemoMode}
        />
      ) : (
        <FixedPanel
          currentStatus={pageData?.current_status}
          site={pageData?.site}
          shift={pageData?.shift}
          timeStr={timeStr}
          demoMode={demoMode}
          setDemoMode={setDemoMode}
        />
      )}

      {/* Main Scanner & Geofence Section */}
      <div className="row justify-content-center g-4">
        <div className="col-lg-7">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
            {/* Attendance Method Selection (Face vs Manual) */}
            {effectivePolicy === 'both' && (
              <div id="methodSelectorWrap" className="mb-4">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <label
                    className="form-label text-muted small fw-bold text-uppercase mb-0"
                    style={{ letterSpacing: '0.05em' }}
                  >
                    Select Attendance Method
                  </label>
                  <span className="badge bg-light text-secondary border small">
                    Both Methods Allowed
                  </span>
                </div>
                <div className="row g-2">
                  <div className="col-6">
                    <button
                      type="button"
                      id="methodFaceBtn"
                      onClick={() => handleSelectMethod('face')}
                      className={`btn w-100 p-3 rounded-4 text-start position-relative transition-all ${
                        selectedMethod === 'face'
                          ? 'border-2 border-primary bg-primary bg-opacity-10 shadow-sm'
                          : 'border border-light-subtle bg-light'
                      }`}
                    >
                      <div className="d-flex align-items-center justify-content-between mb-1">
                        <span className="fw-bold text-dark">
                          <i className="bi bi-camera-video text-primary me-2"></i>Face Recognition
                        </span>
                        {selectedMethod === 'face' && (
                          <span className="badge bg-primary rounded-pill" id="methodFaceBadge">
                            <i className="bi bi-check-lg"></i>
                          </span>
                        )}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.76rem' }}>
                        Use camera & live biometric scan
                      </div>
                    </button>
                  </div>
                  <div className="col-6">
                    <button
                      type="button"
                      id="methodManualBtn"
                      onClick={() => handleSelectMethod('manual')}
                      className={`btn w-100 p-3 rounded-4 text-start position-relative transition-all ${
                        selectedMethod === 'manual'
                          ? 'border-2 border-success bg-success bg-opacity-10 shadow-sm'
                          : 'border border-light-subtle bg-light'
                      }`}
                    >
                      <div className="d-flex align-items-center justify-content-between mb-1">
                        <span className="fw-bold text-dark">
                          <i className="bi bi-shield-check text-secondary me-2"></i>Manual Attendance
                        </span>
                        {selectedMethod === 'manual' && (
                          <span className="badge bg-success rounded-pill" id="methodManualBadge">
                            <i className="bi bi-check-lg"></i>
                          </span>
                        )}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.76rem' }}>
                        Check in/out without facial scanning
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Active Policy Enforcement Banner */}
            {effectivePolicy !== 'both' && (
              <div
                id="policyEnforcedBanner"
                className="alert alert-light border rounded-4 py-2 px-3 small d-flex align-items-center justify-content-between mb-3 shadow-sm"
              >
                <div className="d-flex align-items-center gap-2">
                  <i className="bi bi-shield-lock-fill text-primary fs-6"></i>
                  <span id="policyEnforcedText">
                    {effectivePolicy === 'face_only' ? (
                      <>
                        Work site policy: <strong>Face Recognition Only</strong> is enforced for your location.
                      </>
                    ) : (
                      <>
                        Work site policy: <strong>Manual Attendance Only</strong> is enforced for your location.
                      </>
                    )}
                  </span>
                </div>
                <span
                  className={`badge ${
                    effectivePolicy === 'face_only'
                      ? 'bg-primary-subtle text-primary border border-primary-subtle'
                      : 'bg-success-subtle text-success border border-success-subtle'
                  }`}
                >
                  {effectivePolicy === 'face_only' ? 'Mandatory Biometrics' : 'Session Verified'}
                </span>
              </div>
            )}

            {/* Missing Face Enrollment Alert */}
            {effectivePolicy === 'face_only' && !hasFaceEnrollment && (
              <div id="enrollmentMissingAlert" className="alert alert-danger border-0 rounded-4 shadow-sm p-3 mb-3">
                <div className="d-flex align-items-start gap-2">
                  <i className="bi bi-exclamation-octagon-fill text-danger fs-5 mt-1"></i>
                  <div>
                    <strong className="d-block text-danger">Biometric Face Enrollment Required</strong>
                    <span className="small text-danger text-opacity-75">
                      Your work site requires Face Recognition for attendance, but your facial biometric template is not yet enrolled. Please contact your system administrator or HR manager to complete facial enrollment before checking in.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* METHOD 1: FACE RECOGNITION SECTION */}
            <div
              id="faceMethodSection"
              style={{ display: selectedMethod === 'face' ? 'block' : 'none' }}
            >
              <div className="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <h6 className="fw-bold mb-0 text-dark">Live Facial Verification & GPS</h6>
                  <span className="text-muted small" id="scannerStatusText">
                    {scannerStatusText}
                  </span>
                </div>
                <div id="liveGpsBadge" className={gpsBadgeClass}>
                  {gpsBadgeContent}
                </div>
              </div>

              {/* Geofence Warning Banner */}
              {warningMessage && (
                <div
                  id="geofenceWarningBanner"
                  className="alert alert-warning border-0 rounded-3 shadow-sm py-2 px-3 small d-flex align-items-center gap-2 mb-3"
                >
                  <i className="bi bi-exclamation-triangle-fill text-warning fs-5"></i>
                  <div id="geofenceWarningText">{warningMessage}</div>
                </div>
              )}

              {/* Camera Container */}
              <div className="d-flex justify-content-center w-100 my-3">
                <div
                  className="camera-container mx-auto position-relative rounded-4 overflow-hidden shadow-sm"
                  style={{
                    maxWidth: '520px',
                    width: '100%',
                    display: 'block',
                    margin: '0 auto',
                    background: '#0f172a',
                  }}
                >
                  <video
                    ref={videoRef}
                    id="markVideo"
                    width="100%"
                    height="auto"
                    autoPlay
                    playsInline
                    muted
                    style={{ aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
                  ></video>
                  <div className="face-guide-overlay" id="faceGuide"></div>

                  {/* Liveness Challenge Overlay */}
                  {challengeActive && (
                    <div
                      id="challengeBanner"
                      className="position-absolute bottom-0 start-0 end-0 p-3 text-white text-center"
                      style={{ background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(8px)' }}
                    >
                      <div className="d-flex align-items-center justify-content-center gap-2 mb-1">
                        <span className="spinner-grow spinner-grow-sm text-warning" role="status"></span>
                        <span className="fw-bold" id="challengeTitle">Biometric Liveness Check</span>
                      </div>
                      <div className="small text-light" id="challengeInstruction">
                        Look into camera • Blink or move naturally...
                      </div>
                      <div className="progress mt-2 mx-auto" style={{ height: '4px', maxWidth: '200px' }}>
                        <div
                          className="progress-bar bg-warning"
                          id="challengeProgress"
                          style={{ width: `${challengeProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Segmented Action Mode Switcher */}
              <div className="d-flex justify-content-center mt-4 mb-2">
                <div className="btn-group p-1 bg-light rounded-pill border shadow-sm" role="group" aria-label="Attendance Mode">
                  <button
                    type="button"
                    id="modeCheckInBtn"
                    onClick={() => setCurrentAction('check_in')}
                    className={`btn btn-sm rounded-pill px-3 fw-semibold transition-all ${
                      currentAction === 'check_in' ? 'btn-success text-white shadow-sm' : 'text-secondary'
                    }`}
                  >
                    <i className="bi bi-box-arrow-in-right me-1"></i> Check In
                  </button>
                  <button
                    type="button"
                    id="modeCheckOutBtn"
                    onClick={() => setCurrentAction('check_out')}
                    className={`btn btn-sm rounded-pill px-3 fw-semibold transition-all ${
                      currentAction === 'check_out' ? 'btn-danger text-white shadow-sm' : 'text-secondary'
                    }`}
                  >
                    <i className="bi bi-box-arrow-right me-1"></i> Check Out
                  </button>
                </div>
              </div>

              {/* Interactive Action Toggle Controls */}
              <div className="d-flex flex-wrap justify-content-center gap-3 mt-2">
                <button
                  id="startCamBtn"
                  onClick={startCamera}
                  disabled={isCameraActive || (effectivePolicy === 'face_only' && !hasFaceEnrollment)}
                  className="btn btn-outline-secondary px-4 rounded-pill fw-semibold shadow-sm"
                >
                  <i className="bi bi-camera-video me-1"></i> Start Camera
                </button>

                <button
                  id="actionBtn"
                  onClick={handleFaceSubmit}
                  disabled={!isCameraActive || submitting}
                  className="btn btn-lg px-4 rounded-pill fw-bold shadow transition-all"
                  style={{
                    background: actionBtnColor,
                    borderColor: actionBtnColor,
                    color: 'white',
                  }}
                >
                  <i
                    className={`bi ${isCheckOut ? 'bi-box-arrow-right' : 'bi-box-arrow-in-right'} me-2`}
                    id="actionBtnIcon"
                  ></i>
                  <span id="actionBtnText">
                    {submitting ? 'Verifying...' : actionBtnText}
                  </span>
                </button>

                <button
                  id="stopCamBtn"
                  onClick={stopCamera}
                  disabled={!isCameraActive}
                  className="btn btn-outline-danger px-3 rounded-pill fw-semibold"
                >
                  <i className="bi bi-stop-circle me-1"></i> Stop
                </button>
              </div>

              <div className="mt-3 text-center">
                <span className="text-muted small">
                  Event Mode:{' '}
                  <span
                    className={`badge ${isCheckOut ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success'}`}
                    id="eventModeBadge"
                  >
                    {isCheckOut ? 'Check Out' : 'Check In'}
                  </span>
                  {' '}• Site Radius: <strong>{pageData?.site?.geofence_radius_meters ? Math.round(pageData.site.geofence_radius_meters) : 100}m</strong>
                  {!pageData?.site?.geofencing_enabled && (
                    <span className="badge bg-info-subtle text-info ms-1">No Geofence Required</span>
                  )}
                </span>
              </div>
            </div>

            {/* METHOD 2: MANUAL ATTENDANCE SECTION */}
            <div
              id="manualMethodSection"
              style={{ display: selectedMethod === 'manual' ? 'block' : 'none' }}
            >
              <div className="p-4 rounded-4 border bg-light text-center mb-3">
                <div className="mb-3">
                  <span className="d-inline-flex p-3 rounded-circle bg-white shadow-sm text-primary">
                    <i className="bi bi-person-check-fill fs-2"></i>
                  </span>
                </div>
                <h5 className="fw-bold text-dark mb-1">Session-Authenticated Attendance</h5>
                <p className="text-muted small mb-3" style={{ maxWidth: '440px', margin: '0 auto' }}>
                  Identity authenticated via active employee session. No camera access or facial scan required. Geofence and site rules are validated.
                </p>

                {/* Segmented Action Mode Switcher for Manual */}
                <div className="d-flex justify-content-center mb-3">
                  <div className="btn-group p-1 bg-white rounded-pill border shadow-sm" role="group" aria-label="Manual Attendance Mode">
                    <button
                      type="button"
                      id="manualModeCheckInBtn"
                      onClick={() => setCurrentAction('check_in')}
                      className={`btn btn-sm rounded-pill px-3 fw-semibold transition-all ${
                        currentAction === 'check_in' ? 'btn-success text-white shadow-sm' : 'text-secondary'
                      }`}
                    >
                      <i className="bi bi-box-arrow-in-right me-1"></i> Check In
                    </button>
                    <button
                      type="button"
                      id="manualModeCheckOutBtn"
                      onClick={() => setCurrentAction('check_out')}
                      className={`btn btn-sm rounded-pill px-3 fw-semibold transition-all ${
                        currentAction === 'check_out' ? 'btn-danger text-white shadow-sm' : 'text-secondary'
                      }`}
                    >
                      <i className="bi bi-box-arrow-right me-1"></i> Check Out
                    </button>
                  </div>
                </div>

                {/* Manual Check In / Check Out Action Button */}
                <div className="d-flex justify-content-center">
                  <button
                    id="manualActionBtn"
                    onClick={handleManualSubmit}
                    disabled={submitting}
                    className="btn btn-lg px-5 py-3 rounded-pill fw-bold shadow transition-all"
                    style={{
                      background: actionBtnColor,
                      borderColor: actionBtnColor,
                      color: 'white',
                    }}
                  >
                    <i
                      className={`bi ${isCheckOut ? 'bi-box-arrow-right' : 'bi-box-arrow-in-right'} me-2`}
                      id="manualActionBtnIcon"
                    ></i>
                    <span id="manualActionBtnText">
                      {submitting ? 'Submitting...' : manualBtnText}
                    </span>
                  </button>
                </div>

                <div className="mt-3 text-muted small">
                  <i className="bi bi-shield-check text-success me-1"></i>Server-side timestamp recorded • Site: <strong>{pageData?.site?.name}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Site & Today's Events Timeline */}
        <div className="col-lg-4">
          {/* Work Site & Shift Card */}
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white mb-4">
            <h6 className="fw-bold text-dark mb-3">
              <i className="bi bi-geo-alt-fill text-success me-2"></i>Registered Work Site
            </h6>
            <div className="p-3 bg-light rounded-3 mb-3 border">
              <div className="fw-bold text-dark small">{pageData?.site?.name}</div>
              <div className="text-muted small">{pageData?.site?.address}</div>
              <hr className="my-2" />
              <div className="d-flex justify-content-between small">
                <span className="text-secondary">Geofence Policy:</span>
                <span className={`fw-semibold ${pageData?.site?.geofencing_enabled ? 'text-success' : 'text-info'}`}>
                  {pageData?.site?.geofencing_enabled
                    ? `${Math.round(pageData.site.geofence_radius_meters)}m Fixed Radius`
                    : 'Field / Multi-Site (No Radius)'}
                </span>
              </div>
            </div>

            <h6 className="fw-bold text-dark mb-2">
              <i className="bi bi-calendar-event-fill text-primary me-2"></i>Assigned Shift Schedule
            </h6>
            <div className="p-3 bg-light rounded-3 border small">
              <div className="d-flex justify-content-between mb-1">
                <span className="text-secondary">Policy Name:</span>
                <span className="fw-semibold">
                  {pageData?.shift?.name}
                  {isFlexible ? (
                    <span className="badge bg-success-subtle text-success border border-success-subtle ms-1">
                      Flexible Hours
                    </span>
                  ) : (
                    <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle ms-1">
                      Fixed
                    </span>
                  )}
                  {pageData?.shift?.is_override ? (
                    <span className="badge bg-warning-subtle text-dark border border-warning-subtle ms-1">
                      (override)
                    </span>
                  ) : null}
                </span>
              </div>

              {isFlexible ? (
                <>
                  <div className="d-flex justify-content-between mb-1">
                    <span className="text-secondary">Required Daily:</span>
                    <span className="fw-semibold text-dark">{pageData?.shift?.required_daily_hours} Hours/day</span>
                  </div>
                  <div className="d-flex justify-content-between mb-1">
                    <span className="text-secondary">Required Weekly:</span>
                    <span className="fw-semibold text-dark">{pageData?.shift?.required_weekly_hours || 40.0} Hours/week</span>
                  </div>
                  <div className="d-flex justify-content-between mb-1">
                    <span className="text-secondary">Core Hours Window:</span>
                    <span className="fw-semibold text-primary">{pageData?.shift?.core_start || '11:00'} to {pageData?.shift?.core_end || '16:00'}</span>
                  </div>
                  <div className="d-flex justify-content-between mb-1">
                    <span className="text-secondary">Unpaid Break:</span>
                    <span className="fw-semibold text-secondary">{pageData?.shift?.unpaid_break_minutes || 60} Minutes</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span className="text-secondary">Core Grace:</span>
                    <span className="fw-semibold text-success">{pageData?.shift?.core_grace_minutes || 15} Minutes</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="d-flex justify-content-between mb-1">
                    <span className="text-secondary">Work Hours:</span>
                    <span className="fw-semibold text-primary">{pageData?.shift?.start_time} to {pageData?.shift?.end_time}</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span className="text-secondary">Punctuality Grace:</span>
                    <span className="fw-semibold text-success">{pageData?.shift?.grace_period_minutes} Minutes</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Today's Activity Log */}
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
            <h6 className="fw-bold text-dark mb-3">
              <i className="bi bi-clock-history text-secondary me-2"></i>Today's Activity
            </h6>
            {pageData?.events_today && pageData.events_today.length > 0 ? (
              <div className="timeline">
                {pageData.events_today.map((ev, idx) => (
                  <div key={idx} className="d-flex align-items-start gap-3 mb-3 pb-3 border-bottom">
                    <div
                      className={`badge rounded-circle p-2 ${
                        ev.event_type === 'check_in' ? 'bg-success' : 'bg-primary'
                      } text-white`}
                    >
                      <i className={`bi ${ev.event_type === 'check_in' ? 'bi-box-arrow-in-right' : 'bi-box-arrow-right'}`}></i>
                    </div>
                    <div className="flex-grow-1">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <span className="fw-bold small text-dark">
                            {ev.event_type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                          <span className="badge bg-light text-muted border ms-1" style={{ fontSize: '0.65rem' }}>
                            <i
                              className={`bi ${
                                ev.attendance_method === 'manual' ? 'bi-pencil-square text-primary' : 'bi-camera text-info'
                              } me-1`}
                            ></i>
                            {ev.attendance_method === 'manual' ? 'Manual' : 'Face'}
                          </span>
                        </div>
                        <span
                          className={`badge ${
                            ev.status === 'on_time'
                              ? 'bg-success-subtle text-success'
                              : ev.status === 'late'
                              ? 'bg-warning-subtle text-warning'
                              : ev.status === 'flagged'
                              ? 'bg-danger-subtle text-danger'
                              : 'bg-primary-subtle text-primary'
                          }`}
                        >
                          {ev.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-muted small">{ev.time_display}</div>
                      {ev.distance_from_site_meters !== null && ev.distance_from_site_meters !== undefined && (
                        <div className="text-secondary small mt-1" style={{ fontSize: '0.72rem' }}>
                          <i className="bi bi-compass me-1"></i>
                          {Math.round(ev.distance_from_site_meters)}m from site
                          {!ev.within_geofence && (
                            <span className="text-danger fw-bold ms-1">(Outside Geofence)</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted small">
                <i className="bi bi-calendar-x fs-3 d-block mb-2 text-secondary"></i>
                No attendance events logged yet today. Click Check In when you arrive.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Screen Modal */}
      <ConfirmationModal
        show={showModal}
        modalData={modalData}
        onHide={() => setShowModal(false)}
        onRefresh={() => window.location.reload()}
      />
    </div>
  );
}
