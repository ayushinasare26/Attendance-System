'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-bootstrap/Toast';
import ToastContainer from 'react-bootstrap/ToastContainer';
import api from '@/lib/api';
import { useAuth } from '@/lib/authContext';

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const { addFlash } = useAuth();

  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Form states for Section 1 (Policy)
  const [globalPolicy, setGlobalPolicy] = useState('both');
  const [siteOverrides, setSiteOverrides] = useState({});

  // Form states for Section 2 (Thresholds)
  const [matchThreshold, setMatchThreshold] = useState('0.48');
  const [reviewThreshold, setReviewThreshold] = useState('0.44');
  const [cooldown, setCooldown] = useState('300');
  const [geocodingProvider, setGeocodingProvider] = useState('nominatim');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      return await api.get('/admin/settings');
    },
  });

  const sitesPolicies = data?.sites_policies || [];

  // Initialize form fields when data loads
  useEffect(() => {
    if (data) {
      if (data.global_attendance_policy) setGlobalPolicy(data.global_attendance_policy);
      if (data.match_threshold !== undefined) setMatchThreshold(String(data.match_threshold));
      if (data.review_threshold !== undefined) setReviewThreshold(String(data.review_threshold));
      if (data.cooldown !== undefined) setCooldown(String(data.cooldown));
      if (data.geocoding_provider) setGeocodingProvider(data.geocoding_provider);

      if (data.sites_policies) {
        const overrides = {};
        data.sites_policies.forEach((s) => {
          overrides[s.id] = s.override_policy || 'inherit';
        });
        setSiteOverrides(overrides);
      }
    }
  }, [data]);

  // Mutations
  const savePolicyMutation = useMutation({
    mutationFn: async (payload) => {
      return await api.post('/api/admin/settings/attendance-policy', payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      setToastMessage(
        res?.message || 'Attendance policies saved successfully. Changes take effect immediately.'
      );
      setShowToast(true);
    },
    onError: (err) => {
      alert(`Failed to save policy: ${err.data?.error || err.message}`);
    },
  });

  const saveThresholdsMutation = useMutation({
    mutationFn: async (payload) => {
      return await api.post('/admin/settings', payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      addFlash(
        res?.message || 'Recognition engine settings updated successfully.',
        res?.category || 'success'
      );
    },
    onError: (err) => {
      alert(`Failed to save thresholds: ${err.data?.error || err.message}`);
    },
  });

  const handleSiteOverrideChange = (siteId, val) => {
    setSiteOverrides((prev) => ({
      ...prev,
      [siteId]: val,
    }));
  };

  const handleSavePolicy = (e) => {
    e.preventDefault();
    savePolicyMutation.mutate({
      global_attendance_policy: globalPolicy,
      site_overrides: siteOverrides,
    });
  };

  const handleSaveThresholds = (e) => {
    e.preventDefault();
    saveThresholdsMutation.mutate({
      match_threshold: matchThreshold,
      review_threshold: reviewThreshold,
      duplicate_cooldown_seconds: cooldown,
      geocoding_provider: geocodingProvider,
    });
  };

  // Dynamic calculations for real-time badges & summary
  let inheritCount = 0;
  let overrideCount = 0;

  sitesPolicies.forEach((s) => {
    const sel = siteOverrides[s.id] || 'inherit';
    if (sel === 'inherit') {
      inheritCount++;
    } else {
      overrideCount++;
    }
  });

  const globalLabel =
    globalPolicy === 'face_only'
      ? 'Face Only'
      : globalPolicy === 'manual_only'
      ? 'Manual Only'
      : 'Both';

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
        <div>
          <h4 className="fw-bold mb-1 text-dark">Biometric Engine & Security Settings</h4>
          <p className="text-muted small mb-0">
            Tune facial embedding distance thresholds, spoof sensitivity, and attendance method policies
          </p>
        </div>
      </div>

      {/* Toast Notification Container */}
      <ToastContainer position="top-end" className="p-3" style={{ zIndex: 1080 }}>
        <Toast
          show={showToast}
          onClose={() => setShowToast(false)}
          delay={4000}
          autohide
          className="align-items-center text-white bg-success border-0 shadow-lg rounded-4"
        >
          <div className="d-flex">
            <Toast.Body className="d-flex align-items-center gap-2 py-3 px-3">
              <i className="bi bi-check-circle-fill fs-5"></i>
              <div>
                <strong className="d-block">Policy Updated Successfully</strong>
                <span className="small">{toastMessage}</span>
              </div>
            </Toast.Body>
            <button
              type="button"
              className="btn-close btn-close-white me-2 m-auto"
              onClick={() => setShowToast(false)}
            ></button>
          </div>
        </Toast>
      </ToastContainer>

      <div className="row g-4 mb-4">
        {/* SECTION 1: ATTENDANCE METHOD POLICY */}
        <div className="col-12">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2 border-bottom pb-3">
              <div>
                <div className="d-flex align-items-center gap-2">
                  <span className="p-2 rounded-3 bg-primary bg-opacity-10 text-primary">
                    <i className="bi bi-shield-lock-fill fs-5"></i>
                  </span>
                  <div>
                    <h5 className="fw-bold mb-0 text-dark">Attendance Method Policy</h5>
                    <span className="text-muted small">
                      Control which attendance modes are available to staff globally and configure per-site overrides
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <button
                  type="button"
                  id="savePolicyBtn"
                  className="btn btn-primary rounded-pill px-4 fw-semibold shadow-sm"
                  style={{ background: 'var(--admin-primary)', borderColor: 'var(--admin-primary)' }}
                  onClick={handleSavePolicy}
                  disabled={savePolicyMutation.isPending}
                >
                  {savePolicyMutation.isPending ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1" role="status"></span> Saving...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-save me-1"></i> Save Policy Changes
                    </>
                  )}
                </button>
              </div>
            </div>

            <form id="attendancePolicyForm" onSubmit={handleSavePolicy}>
              {/* Part A: Global Default Policy */}
              <div className="mb-4">
                <label
                  className="form-label small fw-bold text-uppercase text-secondary mb-2"
                  style={{ letterSpacing: '0.05em' }}
                >
                  1. Company-Wide Global Policy (Default for all sites)
                </label>
                <p className="text-muted small mb-3">
                  Sets the baseline policy across the entire workforce. Sites set to <em>"Inherit Global Default"</em> automatically follow this rule.
                </p>

                <div className="row g-3">
                  <div className="col-md-4">
                    <label
                      className={`card h-100 p-3 rounded-4 border-2 transition-all cursor-pointer policy-card ${
                        globalPolicy === 'face_only'
                          ? 'border-primary bg-primary bg-opacity-10'
                          : 'border-light-subtle bg-light'
                      }`}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="d-flex align-items-start gap-2">
                        <input
                          className="form-check-input mt-1 global-policy-radio"
                          type="radio"
                          name="global_attendance_policy"
                          id="global_face_only"
                          value="face_only"
                          checked={globalPolicy === 'face_only'}
                          onChange={(e) => setGlobalPolicy(e.target.value)}
                        />
                        <div>
                          <div className="fw-bold text-dark mb-1">
                            <i className="bi bi-camera-video-fill text-primary me-1"></i> Face Recognition Only
                          </div>
                          <span className="text-muted small d-block">
                            Mandates live camera scan & biometric liveness for all check-ins. Manual attendance is completely blocked.
                          </span>
                        </div>
                      </div>
                    </label>
                  </div>

                  <div className="col-md-4">
                    <label
                      className={`card h-100 p-3 rounded-4 border-2 transition-all cursor-pointer policy-card ${
                        globalPolicy === 'manual_only'
                          ? 'border-success bg-success bg-opacity-10'
                          : 'border-light-subtle bg-light'
                      }`}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="d-flex align-items-start gap-2">
                        <input
                          className="form-check-input mt-1 global-policy-radio"
                          type="radio"
                          name="global_attendance_policy"
                          id="global_manual_only"
                          value="manual_only"
                          checked={globalPolicy === 'manual_only'}
                          onChange={(e) => setGlobalPolicy(e.target.value)}
                        />
                        <div>
                          <div className="fw-bold text-dark mb-1">
                            <i className="bi bi-pencil-square text-success me-1"></i> Manual Attendance Only
                          </div>
                          <span className="text-muted small d-block">
                            Authenticated via active login session without camera/face scanning. Facial biometric flow is bypassed.
                          </span>
                        </div>
                      </div>
                    </label>
                  </div>

                  <div className="col-md-4">
                    <label
                      className={`card h-100 p-3 rounded-4 border-2 transition-all cursor-pointer policy-card ${
                        globalPolicy === 'both'
                          ? 'border-info bg-info bg-opacity-10'
                          : 'border-light-subtle bg-light'
                      }`}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="d-flex align-items-start gap-2">
                        <input
                          className="form-check-input mt-1 global-policy-radio"
                          type="radio"
                          name="global_attendance_policy"
                          id="global_both"
                          value="both"
                          checked={globalPolicy === 'both'}
                          onChange={(e) => setGlobalPolicy(e.target.value)}
                        />
                        <div>
                          <div className="fw-bold text-dark mb-1">
                            <i className="bi bi-toggles text-info me-1"></i> Both (Employee Choice)
                          </div>
                          <span className="text-muted small d-block">
                            Allows staff to freely choose between Face Recognition and Manual Attendance on the Employee Portal.
                          </span>
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Part B: Per-Site Override Table */}
              <div className="mb-4">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <label
                    className="form-label small fw-bold text-uppercase text-secondary mb-0"
                    style={{ letterSpacing: '0.05em' }}
                  >
                    2. Per-Site Override Configuration
                  </label>
                  <span className="badge bg-light text-secondary border">
                    {sitesPolicies.length} registered sites
                  </span>
                </div>
                <p className="text-muted small mb-3">
                  Optionally override the global policy for specific physical work sites (e.g. Headquarters requiring face recognition while remote hubs allow manual check-ins).
                </p>

                <div className="table-responsive rounded-4 border overflow-hidden">
                  <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.88rem' }}>
                    <thead className="table-light text-secondary">
                      <tr>
                        <th className="ps-3 py-3" style={{ width: '32%' }}>Work Site Name & Address</th>
                        <th className="py-3" style={{ width: '14%' }}>Active Workforce</th>
                        <th className="py-3" style={{ width: '30%' }}>Site Policy Override</th>
                        <th className="py-3 text-end pe-3" style={{ width: '24%' }}>Effective Applied Policy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sitesPolicies.length > 0 ? (
                        sitesPolicies.map((s) => {
                          const overrideVal = siteOverrides[s.id] || 'inherit';
                          const effective = overrideVal === 'inherit' ? globalPolicy : overrideVal;
                          const isInherited = overrideVal === 'inherit';

                          return (
                            <tr key={s.id} data-site-id={s.id}>
                              <td className="ps-3">
                                <div className="fw-bold text-dark">{s.name}</div>
                                <div
                                  className="text-muted small text-truncate"
                                  style={{ maxWidth: '320px' }}
                                >
                                  {s.address || 'Address not specified'}
                                </div>
                              </td>
                              <td>
                                <span className="badge bg-light text-dark border">
                                  <i className="bi bi-people-fill text-secondary me-1"></i>
                                  {s.employee_count} staff
                                </span>
                              </td>
                              <td>
                                <select
                                  name={`site_policy_${s.id}`}
                                  className="form-select form-select-sm rounded-3 site-policy-select"
                                  value={overrideVal}
                                  onChange={(e) => handleSiteOverrideChange(s.id, e.target.value)}
                                >
                                  <option value="inherit">
                                    Inherit Global Default ({globalLabel})
                                  </option>
                                  <option value="face_only">Face Recognition Only</option>
                                  <option value="manual_only">Manual Attendance Only</option>
                                  <option value="both">Both (Employee Choice)</option>
                                </select>
                              </td>
                              <td className="text-end pe-3">
                                <span
                                  id={`effective_badge_${s.id}`}
                                  className={`badge px-2 py-1 ${
                                    effective === 'face_only'
                                      ? 'bg-primary-subtle text-primary border border-primary-subtle'
                                      : effective === 'manual_only'
                                      ? 'bg-success-subtle text-success border border-success-subtle'
                                      : 'bg-info-subtle text-info border border-info-subtle'
                                  }`}
                                >
                                  {effective === 'face_only' && (
                                    <>
                                      <i className="bi bi-camera-video me-1"></i>Face Only
                                    </>
                                  )}
                                  {effective === 'manual_only' && (
                                    <>
                                      <i className="bi bi-pencil-square me-1"></i>Manual Only
                                    </>
                                  )}
                                  {effective === 'both' && (
                                    <>
                                      <i className="bi bi-toggles me-1"></i>Both Allowed
                                    </>
                                  )}
                                  {isInherited ? (
                                    <span className="text-muted ms-1 fw-normal">(Inherited)</span>
                                  ) : (
                                    <span className="text-secondary ms-1 fw-semibold">(Override)</span>
                                  )}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="4" className="text-center py-4 text-muted">
                            No sites registered yet. Add sites in Sites & Geofencing.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Part C: Effective Policy At-A-Glance Summary */}
              <div className="p-3 bg-light rounded-4 border">
                <div className="d-flex flex-wrap justify-content-between align-items-center mb-2 gap-2">
                  <span className="fw-bold small text-dark">
                    <i className="bi bi-info-circle-fill text-primary me-1"></i>Effective Policy Summary: At A Glance
                  </span>
                  <span className="text-muted small">Updated in real-time as policies change</span>
                </div>
                <div className="row g-2 text-center" id="policySummaryCards">
                  <div className="col-md-3">
                    <div className="p-2 bg-white rounded-3 border">
                      <span className="text-muted small d-block">Global Default</span>
                      <strong id="summaryGlobalBadge" className="text-primary small text-uppercase">
                        {globalPolicy.replace('_', ' ')}
                      </strong>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="p-2 bg-white rounded-3 border">
                      <span className="text-muted small d-block">Sites on Inherit</span>
                      <strong id="summaryInheritCount" className="text-secondary small">
                        {inheritCount} sites
                      </strong>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="p-2 bg-white rounded-3 border">
                      <span className="text-muted small d-block">Sites with Overrides</span>
                      <strong id="summaryOverrideCount" className="text-dark small">
                        {overrideCount} sites
                      </strong>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="p-2 bg-white rounded-3 border">
                      <span className="text-muted small d-block">Enforcement Status</span>
                      <strong className="text-success small">
                        <i className="bi bi-shield-check me-1"></i>Active & Enforced
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="row g-4">
        {/* SECTION 2: RECOGNITION ENGINE SETTINGS */}
        <div className="col-lg-8">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
            <h5 className="fw-bold mb-3 text-dark">
              <i className="bi bi-cpu-fill text-primary me-2"></i>Recognition Thresholds & Cooldown
            </h5>
            <form onSubmit={handleSaveThresholds}>
              <div className="row g-3 mb-4">
                <div className="col-md-6">
                  <label className="form-label small fw-semibold text-secondary">
                    Strict Match Threshold (Euclidean Distance)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    max="0.8"
                    name="match_threshold"
                    className="form-control rounded-3"
                    value={matchThreshold}
                    onChange={(e) => setMatchThreshold(e.target.value)}
                    required
                  />
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                    Default: 0.48. Lower values increase security against false matches.
                  </span>
                </div>

                <div className="col-md-6">
                  <label className="form-label small fw-semibold text-secondary">
                    Review / Flag Threshold
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    max="0.8"
                    name="review_threshold"
                    className="form-control rounded-3"
                    value={reviewThreshold}
                    onChange={(e) => setReviewThreshold(e.target.value)}
                    required
                  />
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                    Default: 0.44. Distances above this trigger administrator review.
                  </span>
                </div>

                <div className="col-md-6">
                  <label className="form-label small fw-semibold text-secondary">
                    Duplicate Check-in Cooldown (Seconds)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="86400"
                    name="duplicate_cooldown_seconds"
                    className="form-control rounded-3"
                    value={cooldown}
                    onChange={(e) => setCooldown(e.target.value)}
                    required
                  />
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                    Default: 300s (5 mins) prevents rapid multiple check-ins.
                  </span>
                </div>

                <div className="col-md-6">
                  <label className="form-label small fw-semibold text-secondary">
                    Geocoding Provider
                  </label>
                  <select
                    name="geocoding_provider"
                    className="form-select rounded-3"
                    value={geocodingProvider}
                    onChange={(e) => setGeocodingProvider(e.target.value)}
                  >
                    <option value="nominatim">OpenStreetMap / Nominatim (Default)</option>
                    <option value="google">Google Maps Geocoding API</option>
                  </select>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                    Reverse geocoder for GPS watermark resolution.
                  </span>
                </div>
              </div>

              <div className="d-flex justify-content-end">
                <button
                  type="submit"
                  className="btn btn-outline-primary rounded-pill px-4 fw-semibold"
                  disabled={saveThresholdsMutation.isPending}
                >
                  {saveThresholdsMutation.isPending ? 'Saving...' : (
                    <>
                      <i className="bi bi-save me-1"></i> Save Engine Thresholds
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* SECTION 3: ARCHITECTURE & SECURITY CARD */}
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
            <h6 className="fw-bold text-dark mb-3">Model Architecture & Security</h6>
            <div className="d-flex align-items-center gap-2 mb-2">
              <i className="bi bi-cpu text-primary fs-5"></i>
              <span className="fw-bold small text-dark">dlib ResNet-34 128-D Vector</span>
            </div>
            <p className="text-muted small mb-3">
              Calculates Euclidean metric distance between reference multi-angle embeddings and live burst camera frames.
            </p>

            <div className="border-top pt-3">
              <h6 className="fw-bold text-dark small mb-2">Anti-Spoofing & Security</h6>
              <ul className="list-unstyled small text-muted mb-0">
                <li className="mb-2">
                  <i className="bi bi-check2 text-success me-1"></i> Multi-frame blink challenge
                </li>
                <li className="mb-2">
                  <i className="bi bi-check2 text-success me-1"></i> Minimum face resolution guard (&gt;=100x100)
                </li>
                <li className="mb-2">
                  <i className="bi bi-check2 text-success me-1"></i> Dynamic ambiguity margin check
                </li>
                <li className="mb-2">
                  <i className="bi bi-check2 text-success me-1"></i> GPS accuracy & timestamp hash
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
