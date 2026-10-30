'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

const ANGLES = [
  'Center View',
  'Slight Left',
  'Slight Right',
  'Slight Up',
  'Slight Down',
  'Smile / Natural Expression',
];

export default function AdminEnrollPage() {
  const router = useRouter();
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Load dropdown choices
  const { data: initData, isLoading } = useQuery({
    queryKey: ['admin-enroll-init'],
    queryFn: async () => {
      return await api.get('/admin/enroll');
    },
  });

  const departments = initData?.departments || [];
  const sites = initData?.sites || [];
  const shifts = initData?.shifts || [];
  const managers = initData?.managers || [];
  const defaultShiftId = initData?.default_shift_id || 9;

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    employee_code: '',
    role: 'employee',
    email: '',
    department_id: '',
    site_id: '',
    shift_id: '',
    manager_id: '',
    biometric_consent: false,
  });

  // Set default selects once data is loaded
  useEffect(() => {
    if (initData) {
      setFormData((prev) => ({
        ...prev,
        department_id: prev.department_id || (departments[0]?.id ? String(departments[0].id) : ''),
        site_id: prev.site_id || (sites[0]?.id ? String(sites[0].id) : ''),
        shift_id: prev.shift_id || String(defaultShiftId),
      }));
    }
  }, [initData, defaultShiftId]);

  // Stepper State
  const [step, setStep] = useState(1); // 1: Info, 2: Capture, 3: Indexing, 4: Complete
  const [enrolledStudentId, setEnrolledStudentId] = useState(null);
  const [enrolledName, setEnrolledName] = useState('');
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'danger', message }
  const [isSubmittingInfo, setIsSubmittingInfo] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0); // 0 to 6
  const [anglePrompt, setAnglePrompt] = useState(
    'Ready. Fill form, check biometric consent, then click "Save Info".'
  );
  const [isIndexingDone, setIsIndexingDone] = useState(false);

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSaveInfo = async (e) => {
    e.preventDefault();
    if (!formData.biometric_consent) {
      alert('Explicit biometric consent is required before enrolling face data.');
      return;
    }

    setIsSubmittingInfo(true);
    setFeedback(null);

    try {
      const payload = {
        name: formData.name.trim(),
        employee_code: formData.employee_code.trim(),
        role: formData.role,
        email: formData.email.trim(),
        department_id: formData.department_id,
        site_id: formData.site_id,
        shift_id: formData.shift_id,
        manager_id: formData.manager_id || null,
        biometric_consent: '1',
      };

      const res = await api.post('/admin/enroll', payload);
      if (res && res.success) {
        const studentId = res.employee_id || res.student_id;
        setEnrolledStudentId(studentId);
        setEnrolledName(res.name || formData.name);
        setStep(2);
        setFeedback({
          type: 'success',
          message: `Employee ${res.name || formData.name} registered (ID #${studentId}). Starting camera...`,
        });

        // Initialize camera
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 },
            audio: false,
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          setAnglePrompt(
            "Camera ready. Position face inside guide and click 'Capture Reference Angles'."
          );
        } catch (camErr) {
          setFeedback({
            type: 'danger',
            message: `Camera error: ${camErr.message || 'Cannot access camera. Ensure permissions are granted.'}`,
          });
        }
      } else {
        alert(res?.error || 'Enrollment failed.');
      }
    } catch (err) {
      alert(`Server error: ${err.data?.error || err.message}`);
    } finally {
      setIsSubmittingInfo(false);
    }
  };

  const handleStartCapture = async () => {
    if (!videoRef.current || !streamRef.current) {
      alert('Camera stream is not active.');
      return;
    }

    setIsCapturing(true);
    setCaptureProgress(0);

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    const capturedBlobs = [];

    for (let i = 0; i < ANGLES.length; i++) {
      setAnglePrompt(`Angle ${i + 1}/${ANGLES.length}: Please look ${ANGLES[i]}`);
      await new Promise((r) => setTimeout(r, 1200));

      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const blob = await (await fetch(dataUrl)).blob();
      capturedBlobs.push(blob);

      setCaptureProgress(i + 1);
    }

    setStep(3);
    setAnglePrompt('Indexing 128-d deep face embeddings into memory cache...');

    // Upload to server
    const uploadData = new FormData();
    uploadData.append('student_id', enrolledStudentId);
    uploadData.append('employee_id', enrolledStudentId);
    capturedBlobs.forEach((img) => uploadData.append('images[]', img, 'angle.jpg'));

    try {
      const upRes = await api.post('/admin/upload-face', uploadData);
      if (upRes && upRes.success) {
        setIsIndexingDone(true);
        setStep(4);
        setAnglePrompt('Enrollment Complete! Deep biometric vector generated.');
      } else {
        alert(`Embedding extraction error: ${upRes?.error || 'Unknown error'}`);
        setIsCapturing(false);
      }
    } catch (err) {
      alert(`Upload failed: ${err.data?.error || err.message}`);
      setIsCapturing(false);
    }
  };

  const pct = Math.round((captureProgress / ANGLES.length) * 100);

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold text-dark mb-1">Enroll Employee & Biometric Template Capture</h4>
          <p className="text-muted small mb-0">
            Record personal metadata, site/shift assignment, biometric consent, and multi-angle face embeddings
          </p>
        </div>
        <Link
          href="/admin/employees"
          className="btn btn-outline-secondary btn-sm rounded-pill px-3 shadow-sm bg-white"
        >
          <i className="bi bi-arrow-left me-1"></i> Back to Roster
        </Link>
      </div>

      <div className="row g-4 justify-content-center">
        <div className="col-lg-10">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
            {/* Step Navigation Indicators */}
            <div className="d-flex justify-content-between align-items-center border-bottom pb-3 mb-4">
              <div className="d-flex align-items-center gap-2">
                <span
                  className="badge bg-primary rounded-circle"
                  style={{ width: '26px', height: '26px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  1
                </span>
                <span className="fw-bold small text-dark">Workforce Info & Consent</span>
              </div>
              <div className="d-none d-sm-block text-muted">&bull; &bull; &bull;</div>
              <div className="d-flex align-items-center gap-2">
                <span
                  className={`badge ${step >= 2 ? 'bg-primary' : 'bg-secondary'} rounded-circle`}
                  id="step2Badge"
                  style={{ width: '26px', height: '26px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  2
                </span>
                <span
                  className={`${step >= 2 ? 'fw-bold small text-dark' : 'fw-semibold small text-muted'}`}
                  id="step2Label"
                >
                  Multi-Angle Capture
                </span>
              </div>
              <div className="d-none d-sm-block text-muted">&bull; &bull; &bull;</div>
              <div className="d-flex align-items-center gap-2">
                <span
                  className={`badge ${step >= 3 ? 'bg-primary' : 'bg-secondary'} rounded-circle`}
                  id="step3Badge"
                  style={{ width: '26px', height: '26px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  3
                </span>
                <span
                  className={`${step >= 3 ? 'fw-bold small text-dark' : 'fw-semibold small text-muted'}`}
                  id="step3Label"
                >
                  Embedding Indexing
                </span>
              </div>
            </div>

            {/* Form Step */}
            <form id="studentForm" onSubmit={handleSaveInfo}>
              <div className="row g-3 mb-3">
                <div className="col-md-6">
                  <label className="form-label small fw-semibold text-secondary">Full Name *</label>
                  <input
                    className="form-control rounded-3"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g. Ananya Sharma"
                    required
                    disabled={step >= 2}
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label small fw-semibold text-secondary">Employee Code / ID *</label>
                  <input
                    className="form-control rounded-3"
                    name="employee_code"
                    value={formData.employee_code}
                    onChange={handleInputChange}
                    placeholder="e.g. EMP-1042"
                    required
                    disabled={step >= 2}
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label small fw-semibold text-secondary">System Role</label>
                  <select
                    name="role"
                    className="form-select rounded-3"
                    value={formData.role}
                    onChange={handleInputChange}
                    disabled={step >= 2}
                  >
                    <option value="employee">Employee (Standard)</option>
                    <option value="manager">Manager / Team Lead</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-semibold text-secondary">Work Email Address</label>
                  <input
                    type="email"
                    className="form-control rounded-3"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="e.g. ananya@enterprise.corp"
                    disabled={step >= 2}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-semibold text-secondary">Department</label>
                  <select
                    name="department_id"
                    className="form-select rounded-3"
                    value={formData.department_id}
                    onChange={handleInputChange}
                    disabled={step >= 2}
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-secondary">Assigned Work Site (Geofence)</label>
                  <select
                    name="site_id"
                    className="form-select rounded-3"
                    value={formData.site_id}
                    onChange={handleInputChange}
                    disabled={step >= 2}
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-secondary">Assigned Shift Schedule</label>
                  <select
                    name="shift_id"
                    className="form-select rounded-3"
                    value={formData.shift_id}
                    onChange={handleInputChange}
                    disabled={step >= 2}
                  >
                    {shifts.map((sh) => (
                      <option key={sh.id} value={sh.id}>
                        {sh.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-secondary">Reporting Manager</label>
                  <select
                    name="manager_id"
                    className="form-select rounded-3"
                    value={formData.manager_id}
                    onChange={handleInputChange}
                    disabled={step >= 2}
                  >
                    <option value="">Direct to HR / None</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mandatory Biometric Consent Checkbox */}
              <div className="p-3 bg-light rounded-3 border mb-4">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    name="biometric_consent"
                    id="biometricConsentCheckbox"
                    checked={formData.biometric_consent}
                    onChange={handleInputChange}
                    required
                    disabled={step >= 2}
                  />
                  <label className="form-check-label small fw-bold text-dark" htmlFor="biometricConsentCheckbox">
                    Explicit Biometric Consent Acknowledged & Granted *
                  </label>
                  <div className="text-muted small mt-1" style={{ fontSize: '0.76rem' }}>
                    I certify that the employee has provided explicit, informed consent for the capture of facial reference imagery and generation of 128-dimensional biometric mathematical template vectors solely for workforce attendance verification, in compliance with GDPR Art. 9, India DPDP Act, and organizational data privacy standards.
                  </div>
                </div>
              </div>

              <div className="d-flex flex-wrap gap-2 mb-4">
                <button
                  id="saveInfoBtn"
                  type="submit"
                  className="btn btn-primary rounded-pill px-4 fw-semibold shadow-sm"
                  style={{ background: 'var(--admin-primary)', borderColor: 'var(--admin-primary)' }}
                  disabled={step >= 2 || isSubmittingInfo}
                >
                  <i className="bi bi-save me-1"></i> 1. Save Info & Unlock Camera
                </button>
                <button
                  id="startCaptureBtn"
                  type="button"
                  className="btn btn-warning rounded-pill px-4 fw-semibold shadow-sm"
                  disabled={step !== 2 || isCapturing}
                  onClick={handleStartCapture}
                >
                  <i className="bi bi-camera me-1"></i> 2. Capture Reference Angles
                </button>
                {isIndexingDone && (
                  <Link
                    id="finishBtn"
                    href="/admin/employees"
                    className="btn btn-success rounded-pill px-4 fw-semibold shadow-sm"
                  >
                    <i className="bi bi-check-lg me-1"></i> 3. Finish & View Employee Roster
                  </Link>
                )}
              </div>
            </form>

            {/* Feedback banner */}
            {feedback && (
              <div className={`alert alert-${feedback.type} rounded-3 py-2 px-3 small mb-3`} id="enrollFeedback">
                <i className={`bi ${feedback.type === 'success' ? 'bi-check-circle' : 'bi-exclamation-triangle'} me-1`}></i>
                <span dangerouslySetInnerHTML={{ __html: feedback.message }}></span>
              </div>
            )}

            {/* Video Viewport */}
            <div className="text-center p-3 bg-light rounded-4 border">
              <div className="camera-container mx-auto position-relative" style={{ maxWidth: '520px', width: '100%' }}>
                <video
                  ref={videoRef}
                  id="video"
                  width="100%"
                  height="auto"
                  autoPlay
                  playsInline
                  muted
                  style={{ aspectRatio: '4/3', objectFit: 'cover', display: 'block', borderRadius: '12px' }}
                ></video>
                <div className="face-guide-overlay" id="enrollFaceGuide"></div>
              </div>

              {/* Angle instruction pill */}
              <div className="mt-3">
                <span
                  id="anglePromptBadge"
                  className={`badge ${isIndexingDone ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-primary-subtle text-primary border border-primary-subtle'} px-3 py-2 fs-6`}
                >
                  {isIndexingDone ? (
                    <>
                      <i className="bi bi-check-circle-fill me-1"></i> {anglePrompt}
                    </>
                  ) : (
                    anglePrompt
                  )}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-3 w-75 mx-auto">
                <div className="d-flex justify-content-between small fw-bold text-muted mb-1">
                  <span>Capture Progress</span>
                  <span id="captureStatus">{captureProgress} / {ANGLES.length} photos</span>
                </div>
                <div className="progress" style={{ height: '8px' }}>
                  <div
                    id="progressBar"
                    className="progress-bar bg-success progress-bar-striped progress-bar-animated"
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
