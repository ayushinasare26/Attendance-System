'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from 'react-bootstrap/Modal';
import api from '@/lib/api';
import { useAuth } from '@/lib/authContext';

function ShiftsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addFlash } = useAuth();

  const currentFilter = searchParams.get('filter') || 'active';

  // Modals visibility
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showRecalcModal, setShowRecalcModal] = useState(false);
  const [editingShift, setEditingShift] = useState(null);

  // Add form state
  const [addShiftType, setAddShiftType] = useState('flexible');
  const [addName, setAddName] = useState('');
  const [addStartTime, setAddStartTime] = useState('09:00');
  const [addEndTime, setAddEndTime] = useState('18:00');
  const [addGracePeriod, setAddGracePeriod] = useState(15);
  const [addBreakDuration, setAddBreakDuration] = useState(60);
  const [addCoreStart, setAddCoreStart] = useState('11:00');
  const [addCoreEnd, setAddCoreEnd] = useState('16:00');
  const [addReqDaily, setAddReqDaily] = useState(8.0);
  const [addReqWeekly, setAddReqWeekly] = useState(40.0);
  const [addAllowStart, setAddAllowStart] = useState('07:00');
  const [addAllowEnd, setAddAllowEnd] = useState('22:00');
  const [addEnforcementMode, setAddEnforcementMode] = useState('both');
  const [addUnpaidBreak, setAddUnpaidBreak] = useState(60);
  const [addCoreGrace, setAddCoreGrace] = useState(15);
  const [addOvertimeThreshold, setAddOvertimeThreshold] = useState(0);
  const [addHalfDayThreshold, setAddHalfDayThreshold] = useState(4.0);
  const [addWeekStartDay, setAddWeekStartDay] = useState('Monday');
  const [addWeeklyOffDays, setAddWeeklyOffDays] = useState('Sat,Sun');
  const [addCountFlaggedPolicy, setAddCountFlaggedPolicy] = useState('count_pending');
  const [addCoreHoursEnforced, setAddCoreHoursEnforced] = useState(true);
  const [addValidationAlert, setAddValidationAlert] = useState('');

  // Edit form state
  const [editShiftType, setEditShiftType] = useState('flexible');
  const [editName, setEditName] = useState('');
  const [editStartTime, setEditStartTime] = useState('09:00');
  const [editEndTime, setEditEndTime] = useState('18:00');
  const [editGracePeriod, setEditGracePeriod] = useState(15);
  const [editBreakDuration, setEditBreakDuration] = useState(60);
  const [editCoreStart, setEditCoreStart] = useState('11:00');
  const [editCoreEnd, setEditCoreEnd] = useState('16:00');
  const [editReqDaily, setEditReqDaily] = useState(8.0);
  const [editReqWeekly, setEditReqWeekly] = useState(40.0);
  const [editAllowStart, setEditAllowStart] = useState('07:00');
  const [editAllowEnd, setEditAllowEnd] = useState('22:00');
  const [editEnforcementMode, setEditEnforcementMode] = useState('both');
  const [editUnpaidBreak, setEditUnpaidBreak] = useState(60);
  const [editCoreGrace, setEditCoreGrace] = useState(15);
  const [editOvertimeThreshold, setEditOvertimeThreshold] = useState(0);
  const [editHalfDayThreshold, setEditHalfDayThreshold] = useState(4.0);
  const [editWeekStartDay, setEditWeekStartDay] = useState('Monday');
  const [editWeeklyOffDays, setEditWeeklyOffDays] = useState('Sat,Sun');
  const [editCountFlaggedPolicy, setEditCountFlaggedPolicy] = useState('count_pending');
  const [editCoreHoursEnforced, setEditCoreHoursEnforced] = useState(true);
  const [editValidationAlert, setEditValidationAlert] = useState('');

  // Assign policy form state
  const [assignTargetType, setAssignTargetType] = useState('employee');
  const [assignEmpId, setAssignEmpId] = useState('');
  const [assignDeptId, setAssignDeptId] = useState('');
  const [assignSiteId, setAssignSiteId] = useState('');
  const [assignShiftId, setAssignShiftId] = useState('');
  const [assignDailyOverride, setAssignDailyOverride] = useState('');
  const [assignWeeklyOverride, setAssignWeeklyOverride] = useState('');

  // Recalculate range state
  const [recalcStartDate, setRecalcStartDate] = useState('');
  const [recalcEndDate, setRecalcEndDate] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-shifts', currentFilter],
    queryFn: async () => {
      return await api.get(`/admin/shifts?filter=${currentFilter}`);
    },
  });

  const shifts = data?.shifts || [];
  const activeShifts = data?.active_shifts || shifts;
  const departments = data?.departments || [];
  const employees = data?.employees || [];
  const sites = data?.sites || [];

  const addShiftMutation = useMutation({
    mutationFn: async (payload) => {
      return await api.post('/admin/shifts', payload);
    },
    onSuccess: (res) => {
      setShowAddModal(false);
      addFlash(res.message || 'Shift created successfully.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-shifts'] });
    },
    onError: (err) => {
      addFlash(err.message || 'Failed to create shift.', 'danger');
    },
  });

  const editShiftMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      return await api.post(`/admin/shifts/${id}/edit`, payload);
    },
    onSuccess: (res) => {
      setShowEditModal(false);
      setEditingShift(null);
      addFlash(res.message || 'Shift updated successfully.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-shifts'] });
    },
    onError: (err) => {
      addFlash(err.message || 'Failed to update shift.', 'danger');
    },
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (id) => {
      return await api.post(`/admin/shifts/${id}/delete`);
    },
    onSuccess: (res) => {
      addFlash(res.message || 'Shift policy removed.', 'info');
      queryClient.invalidateQueries({ queryKey: ['admin-shifts'] });
    },
    onError: (err) => {
      addFlash(err.message || 'Failed to delete shift.', 'danger');
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (payload) => {
      return await api.post('/admin/shifts/assign', payload);
    },
    onSuccess: (res) => {
      setShowAssignModal(false);
      addFlash(res.message || 'Work policy assigned successfully.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-shifts'] });
    },
    onError: (err) => {
      addFlash(err.message || 'Failed to assign policy.', 'danger');
    },
  });

  const recalcMutation = useMutation({
    mutationFn: async (payload) => {
      return await api.post('/admin/shifts/recalculate', payload);
    },
    onSuccess: (res) => {
      setShowRecalcModal(false);
      addFlash(res.message || 'Recalculated summaries successfully.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-shifts'] });
    },
    onError: (err) => {
      addFlash(err.message || 'Recalculation error.', 'danger');
    },
  });

  const openEditModal = (shift) => {
    setEditingShift(shift);
    setEditShiftType(shift.shift_type || 'flexible');
    setEditName(shift.name || '');
    setEditStartTime(shift.start_time || '09:00');
    setEditEndTime(shift.end_time || '18:00');
    setEditGracePeriod(shift.grace_period_minutes ?? 15);
    setEditBreakDuration(shift.break_duration_minutes ?? 60);
    setEditCoreStart(shift.core_start || '11:00');
    setEditCoreEnd(shift.core_end || '16:00');
    setEditReqDaily(shift.required_daily_hours ?? 8.0);
    setEditReqWeekly(shift.required_weekly_hours ?? 40.0);
    setEditAllowStart(shift.allowed_window_start || '07:00');
    setEditAllowEnd(shift.allowed_window_end || '22:00');
    setEditEnforcementMode(shift.enforcement_mode || 'both');
    setEditUnpaidBreak(shift.unpaid_break_minutes ?? 60);
    setEditCoreGrace(shift.core_grace_minutes ?? 15);
    setEditOvertimeThreshold(shift.overtime_threshold_minutes ?? 0);
    setEditHalfDayThreshold(shift.half_day_threshold_hours ?? 4.0);
    setEditWeekStartDay(shift.week_start_day || 'Monday');
    setEditWeeklyOffDays(shift.weekly_off_days || 'Sat,Sun');
    setEditCountFlaggedPolicy(shift.count_flagged_events_policy || 'count_pending');
    setEditCoreHoursEnforced(Boolean(shift.core_hours_enforced ?? true));
    setEditValidationAlert('');
    setShowEditModal(true);
  };

  const validateForm = (type, name, coreStart, coreEnd, allowStart, allowEnd, reqDaily, setAlert) => {
    if (!name.trim()) {
      setAlert('Shift title is required.');
      return false;
    }
    if (type === 'flexible') {
      if (coreStart && coreEnd && coreEnd <= coreStart) {
        setAlert('Core hours end must be strictly later than core hours start.');
        return false;
      }
      if (allowStart && coreStart < allowStart) {
        setAlert('Core start cannot be earlier than the allowed window start.');
        return false;
      }
      if (allowEnd && coreEnd > allowEnd) {
        setAlert('Core end cannot be later than the allowed window end.');
        return false;
      }
      if (isNaN(reqDaily) || reqDaily <= 0 || reqDaily > 24) {
        setAlert('Required daily hours must be between 0.5 and 24 hours.');
        return false;
      }
    }
    return true;
  };

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!validateForm(addShiftType, addName, addCoreStart, addCoreEnd, addAllowStart, addAllowEnd, Number(addReqDaily), setAddValidationAlert)) {
      return;
    }
    addShiftMutation.mutate({
      shift_type: addShiftType,
      name: addName,
      start_time: addStartTime,
      end_time: addEndTime,
      grace_period_minutes: addGracePeriod,
      break_duration_minutes: addBreakDuration,
      core_start: addCoreStart,
      core_end: addCoreEnd,
      required_daily_hours: addReqDaily,
      required_weekly_hours: addReqWeekly,
      allowed_window_start: addAllowStart,
      allowed_window_end: addAllowEnd,
      enforcement_mode: addEnforcementMode,
      unpaid_break_minutes: addUnpaidBreak,
      core_grace_minutes: addCoreGrace,
      overtime_threshold_minutes: addOvertimeThreshold,
      half_day_threshold_hours: addHalfDayThreshold,
      week_start_day: addWeekStartDay,
      weekly_off_days: addWeeklyOffDays,
      count_flagged_events_policy: addCountFlaggedPolicy,
      core_hours_enforced: addCoreHoursEnforced ? '1' : '0',
    });
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!editingShift) return;
    if (!validateForm(editShiftType, editName, editCoreStart, editCoreEnd, editAllowStart, editAllowEnd, Number(editReqDaily), setEditValidationAlert)) {
      return;
    }
    editShiftMutation.mutate({
      id: editingShift.id,
      payload: {
        shift_type: editShiftType,
        name: editName,
        start_time: editStartTime,
        end_time: editEndTime,
        grace_period_minutes: editGracePeriod,
        break_duration_minutes: editBreakDuration,
        core_start: editCoreStart,
        core_end: editCoreEnd,
        required_daily_hours: editReqDaily,
        required_weekly_hours: editReqWeekly,
        allowed_window_start: editAllowStart,
        allowed_window_end: editAllowEnd,
        enforcement_mode: editEnforcementMode,
        unpaid_break_minutes: editUnpaidBreak,
        core_grace_minutes: editCoreGrace,
        overtime_threshold_minutes: editOvertimeThreshold,
        half_day_threshold_hours: editHalfDayThreshold,
        week_start_day: editWeekStartDay,
        weekly_off_days: editWeeklyOffDays,
        count_flagged_events_policy: editCountFlaggedPolicy,
        core_hours_enforced: editCoreHoursEnforced ? '1' : '0',
      },
    });
  };

  const handleAssignSubmit = (e) => {
    e.preventDefault();
    const selShift = (activeShifts || []).find((s) => String(s.id) === String(assignShiftId || (activeShifts[0]?.id)));
    const shiftName = selShift ? selShift.name : 'Selected Policy';

    let targetDesc = 'Individual Employee';
    if (assignTargetType === 'all') targetDesc = 'All Active Personnel (Organization-wide)';
    else if (assignTargetType === 'department') {
      const d = departments.find((dept) => String(dept.id) === String(assignDeptId || departments[0]?.id));
      targetDesc = 'Department: ' + (d ? d.name : 'Department');
    } else if (assignTargetType === 'site') {
      const st = sites.find((s) => String(s.id) === String(assignSiteId || sites[0]?.id));
      targetDesc = 'Site: ' + (st ? st.name : 'Site');
    } else {
      const emp = employees.find((em) => String(em.id) === String(assignEmpId || employees[0]?.id));
      targetDesc = 'Employee: ' + (emp ? `${emp.name} (${emp.employee_code})` : 'Employee');
    }

    let msg = `Confirm Policy Assignment:\n\n• Target: ${targetDesc}\n• Policy: ${shiftName}`;
    if (assignDailyOverride) msg += `\n• Daily Override: ${assignDailyOverride} hrs/day`;
    if (assignWeeklyOverride) msg += `\n• Weekly Override: ${assignWeeklyOverride} hrs/week`;

    if (confirm(msg)) {
      assignMutation.mutate({
        target_type: assignTargetType,
        employee_id: assignEmpId || (employees[0]?.id ?? ''),
        department_id: assignDeptId || (departments[0]?.id ?? ''),
        site_id: assignSiteId || (sites[0]?.id ?? ''),
        shift_id: assignShiftId || (activeShifts[0]?.id ?? ''),
        override_daily_hours: assignDailyOverride,
        override_weekly_hours: assignWeeklyOverride,
      });
    }
  };

  const handleRecalcSubmit = (e) => {
    e.preventDefault();
    if (confirm('Recalculate attendance summaries for the selected date range?')) {
      recalcMutation.mutate({
        start_date: recalcStartDate,
        end_date: recalcEndDate,
      });
    }
  };

  const handleDeleteShift = (s) => {
    if (confirm('Delete this shift schedule? Note: shifts referenced by employees or history will be archived instead of removed.')) {
      deleteShiftMutation.mutate(s.id);
    }
  };

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h4 className="fw-bold text-dark mb-1">Industrial & Flexible Shift Policies</h4>
          <p className="text-muted small mb-0">
            Define fixed start/end schedules or modern flexible core-hours policies with required hours, grace windows, and audit recalculations.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <button
            className="btn btn-outline-secondary rounded-pill px-3 fw-semibold shadow-sm"
            onClick={() => setShowAssignModal(true)}
          >
            <i className="bi bi-diagram-3 me-1"></i> Assign Shifts
          </button>
          <button
            className="btn btn-outline-danger rounded-pill px-3 fw-semibold shadow-sm"
            onClick={() => setShowRecalcModal(true)}
          >
            <i className="bi bi-arrow-repeat me-1"></i> Recalculate Range
          </button>
          <button
            className="btn btn-primary rounded-pill px-4 fw-semibold shadow-sm"
            onClick={() => setShowAddModal(true)}
          >
            <i className="bi bi-plus-lg me-1"></i> Add Shift Schedule
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger rounded-3 shadow-sm py-2 px-3 small mb-4" role="alert">
          <i className="bi bi-exclamation-triangle me-1"></i>
          {error.message || 'Failed to load shifts.'}
        </div>
      )}

      {/* Shift Filter Tabs */}
      <ul className="nav nav-pills mb-3 gap-2">
        <li className="nav-item">
          <Link
            className={`nav-link rounded-pill px-3 py-1 fw-semibold ${
              currentFilter !== 'legacy' ? 'active' : 'bg-white border text-secondary'
            }`}
            href="/admin/shifts?filter=active"
          >
            <i className="bi bi-check2-circle me-1"></i>Active Shifts & Work Policies
          </Link>
        </li>
        <li className="nav-item">
          <Link
            className={`nav-link rounded-pill px-3 py-1 fw-semibold ${
              currentFilter === 'legacy' ? 'active' : 'bg-white border text-secondary'
            }`}
            href="/admin/shifts?filter=legacy"
          >
            <i className="bi bi-archive me-1"></i>Archived / Legacy Fixed Shifts
          </Link>
        </li>
      </ul>

      {/* Shifts Table */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white mb-4">
        <div className="card-header bg-white border-0 py-3 px-4 d-flex justify-content-between align-items-center">
          <h6 className="fw-bold mb-0 text-dark">
            <i className="bi bi-clock-history text-primary me-2"></i>
            {currentFilter === 'legacy' ? 'Archived & Legacy Shifts' : 'Active Work Policies'}
          </h6>
          <span className="badge bg-light text-secondary border">
            {isLoading ? 'Loading...' : `${shifts.length} shifts`}
          </span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.88rem' }}>
            <thead className="table-light text-secondary">
              <tr>
                <th className="ps-4">Shift Name</th>
                <th>Type</th>
                <th>Schedule & Rules</th>
                <th>Enforcement & Grace</th>
                <th>Assigned Staff</th>
                <th className="text-end pe-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-4 text-muted">
                    <div className="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    Loading shifts...
                  </td>
                </tr>
              ) : shifts.length > 0 ? (
                shifts.map((s, index) => {
                  const isFirst = index === 0;
                  return (
                    <tr key={s.id} className={s.is_archived ? 'bg-light text-muted' : ''}>
                      <td className="ps-4">
                        <span className="fw-bold text-dark">{s.name}</span>
                        {s.id === 9 || (!s.is_archived && s.shift_type === 'flexible' && isFirst) ? (
                          <span className="badge bg-primary-subtle text-primary ms-1">Company Default</span>
                        ) : s.id === 1 ? (
                          <span className="badge bg-secondary-subtle text-secondary ms-1">Legacy</span>
                        ) : null}
                        {s.is_archived && (
                          <span className="badge bg-warning-subtle text-secondary ms-1">Archived</span>
                        )}
                      </td>
                      <td>
                        {s.shift_type === 'flexible' ? (
                          <span className="badge bg-success-subtle text-success border border-success-subtle px-2 py-1">
                            <i className="bi bi-sliders me-1"></i>Flexible Hours
                          </span>
                        ) : (
                          <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1">
                            <i className="bi bi-clock me-1"></i>Legacy Fixed Schedule
                          </span>
                        )}
                      </td>
                      <td>
                        {s.shift_type === 'flexible' ? (
                          <>
                            <div className="fw-bold text-dark">
                              Required{' '}
                              {s.required_daily_hours === Math.floor(s.required_daily_hours)
                                ? Math.floor(s.required_daily_hours)
                                : s.required_daily_hours}
                              h/day ·{' '}
                              {s.required_weekly_hours === Math.floor(s.required_weekly_hours)
                                ? Math.floor(s.required_weekly_hours)
                                : s.required_weekly_hours}
                              h/week
                            </div>
                            <div className="small text-muted mt-1">
                              <span className="fw-semibold text-primary">Core:</span>{' '}
                              {s.core_start || '11:00'} - {s.core_end || '16:00'} • Unpaid Break:{' '}
                              {s.unpaid_break_minutes || 60}m
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <span className="badge bg-light text-secondary border px-2 py-1">{s.start_time}</span>
                              <span className="mx-1 text-muted">to</span>
                              <span className="badge bg-light text-secondary border px-2 py-1">{s.end_time}</span>
                            </div>
                            <div className="small text-muted mt-1">
                              Unpaid Break: {s.break_duration_minutes || 60} mins
                            </div>
                          </>
                        )}
                      </td>
                      <td>
                        {s.shift_type === 'flexible' ? (
                          <>
                            <div>
                              <span className="badge bg-light text-dark border">
                                {(s.enforcement_mode || 'both').replace(/\b\w/g, (c) => c.toUpperCase())} Enforcement
                              </span>
                            </div>
                            <div className="small text-secondary mt-1">
                              Core Grace: {s.core_grace_minutes || 15}m • OT: +{s.overtime_threshold_minutes || 30}m • Half Day: {s.half_day_threshold_hours || 4.0}h
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <span className="fw-semibold text-dark">{s.grace_period_minutes} mins grace</span>
                            </div>
                            <div className="small text-muted">Late after +{s.grace_period_minutes}m</div>
                          </>
                        )}
                      </td>
                      <td>
                        <span className="badge bg-light text-dark border px-2 py-1">{s.employee_count || 0} staff</span>
                      </td>
                      <td className="text-end pe-4">
                        <div className="d-inline-flex gap-1">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary rounded-pill px-3"
                            onClick={() => openEditModal(s)}
                          >
                            <i className="bi bi-pencil"></i>
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger rounded-pill px-3"
                            disabled={s.id === 9}
                            title={s.id === 9 ? 'Company default shift cannot be deleted' : 'Delete shift'}
                            onClick={() => handleDeleteShift(s)}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-4 text-muted">
                    No shifts defined in this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add Shift Schedule */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)} size="lg" centered>
        <form onSubmit={handleAddSubmit}>
          <div className="modal-header border-0 pb-0">
            <h5 className="modal-title fw-bold text-dark">Define Shift Policy</h5>
            <button type="button" className="btn-close" onClick={() => setShowAddModal(false)} aria-label="Close"></button>
          </div>
          <div className="modal-body p-4">
            <div className="mb-4 p-3 bg-light rounded-4 border">
              <label className="form-label small fw-bold text-secondary text-uppercase mb-2">Select Shift Policy Model</label>
              <div className="d-flex gap-4">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="shift_type"
                    id="typeFlexibleAdd"
                    value="flexible"
                    checked={addShiftType === 'flexible'}
                    onChange={() => setAddShiftType('flexible')}
                  />
                  <label className="form-check-label fw-semibold text-dark" htmlFor="typeFlexibleAdd">
                    Flexible Hours <span className="text-muted small fw-normal d-block">Core window, required daily/weekly hours, Short Hours status</span>
                  </label>
                </div>
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="shift_type"
                    id="typeFixedAdd"
                    value="fixed"
                    checked={addShiftType === 'fixed'}
                    onChange={() => setAddShiftType('fixed')}
                  />
                  <label className="form-check-label fw-semibold text-dark" htmlFor="typeFixedAdd">
                    Fixed Schedule <span className="text-muted small fw-normal d-block">Fixed start/end time, grace period, late/on-time status</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">Shift Title</label>
              <input
                type="text"
                name="name"
                className="form-control rounded-3"
                placeholder="e.g. Core Engineering Flexible / Support 8h"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                required
              />
            </div>

            {addShiftType === 'fixed' ? (
              <div>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Start Time (24h)</label>
                    <input type="time" name="start_time" className="form-control rounded-3" value={addStartTime} onChange={(e) => setAddStartTime(e.target.value)} />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">End Time (24h)</label>
                    <input type="time" name="end_time" className="form-control rounded-3" value={addEndTime} onChange={(e) => setAddEndTime(e.target.value)} />
                  </div>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Grace Period (Minutes)</label>
                    <input type="number" name="grace_period_minutes" className="form-control rounded-3" value={addGracePeriod} onChange={(e) => setAddGracePeriod(Number(e.target.value))} />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Break Duration (Minutes)</label>
                    <input type="number" name="break_duration_minutes" className="form-control rounded-3" value={addBreakDuration} onChange={(e) => setAddBreakDuration(Number(e.target.value))} />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="alert alert-info border-0 rounded-3 p-2 small mb-3">
                  <i className="bi bi-info-circle me-1"></i> Flexible shifts replace "Late" with "Short Hours". Employees must complete daily required hours and cover the core window.
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Core Hours Start (24h)</label>
                    <input type="time" name="core_start" className="form-control rounded-3" value={addCoreStart} onChange={(e) => setAddCoreStart(e.target.value)} />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Core Hours End (24h)</label>
                    <input type="time" name="core_end" className="form-control rounded-3" value={addCoreEnd} onChange={(e) => setAddCoreEnd(e.target.value)} />
                  </div>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Required Daily Hours</label>
                    <input type="number" step="0.5" min="1" max="24" name="required_daily_hours" className="form-control rounded-3" value={addReqDaily} onChange={(e) => setAddReqDaily(Number(e.target.value))} />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Required Weekly Hours (Optional)</label>
                    <input type="number" step="0.5" min="1" max="168" name="required_weekly_hours" className="form-control rounded-3" value={addReqWeekly} onChange={(e) => setAddReqWeekly(Number(e.target.value))} />
                  </div>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Allowed Window Earliest Check-In</label>
                    <input type="time" name="allowed_window_start" className="form-control rounded-3" value={addAllowStart} onChange={(e) => setAddAllowStart(e.target.value)} />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Allowed Window Latest Check-Out</label>
                    <input type="time" name="allowed_window_end" className="form-control rounded-3" value={addAllowEnd} onChange={(e) => setAddAllowEnd(e.target.value)} />
                  </div>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-4">
                    <label className="form-label small fw-semibold text-secondary">Enforcement Mode</label>
                    <select name="enforcement_mode" className="form-select rounded-3" value={addEnforcementMode} onChange={(e) => setAddEnforcementMode(e.target.value)}>
                      <option value="both">Both Daily & Weekly</option>
                      <option value="daily">Daily Only</option>
                      <option value="weekly">Weekly Only</option>
                    </select>
                  </div>
                  <div className="col-4">
                    <label className="form-label small fw-semibold text-secondary">Unpaid Break (Mins)</label>
                    <input type="number" min="0" name="unpaid_break_minutes" className="form-control rounded-3" value={addUnpaidBreak} onChange={(e) => setAddUnpaidBreak(Number(e.target.value))} />
                  </div>
                  <div className="col-4">
                    <label className="form-label small fw-semibold text-secondary">Core Grace (Mins)</label>
                    <input type="number" min="0" name="core_grace_minutes" className="form-control rounded-3" value={addCoreGrace} onChange={(e) => setAddCoreGrace(Number(e.target.value))} />
                  </div>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Overtime Threshold (Mins)</label>
                    <input type="number" min="0" name="overtime_threshold_minutes" className="form-control rounded-3" value={addOvertimeThreshold} onChange={(e) => setAddOvertimeThreshold(Number(e.target.value))} />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Half Day Threshold (Hours)</label>
                    <input type="number" step="0.5" min="0.5" max="12" name="half_day_threshold_hours" className="form-control rounded-3" value={addHalfDayThreshold} onChange={(e) => setAddHalfDayThreshold(Number(e.target.value))} />
                  </div>
                </div>
                <div className="form-check form-switch mt-2">
                  <input className="form-check-input" type="checkbox" id="add_core_hours_enforced" checked={addCoreHoursEnforced} onChange={(e) => setAddCoreHoursEnforced(e.target.checked)} />
                  <label className="form-check-label small fw-semibold text-dark" htmlFor="add_core_hours_enforced">
                    Enforce Core Window Compliance (flags day if missed)
                  </label>
                </div>
              </div>
            )}

            {addValidationAlert && (
              <div className="alert alert-danger border-0 rounded-3 mt-3 py-2 small">{addValidationAlert}</div>
            )}
          </div>
          <div className="modal-footer border-0 pt-0">
            <button type="button" className="btn btn-outline-secondary rounded-pill px-3" onClick={() => setShowAddModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary rounded-pill px-4 fw-semibold" disabled={addShiftMutation.isPending}>
              {addShiftMutation.isPending ? 'Saving...' : 'Save Shift'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Shift */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)} size="lg" centered>
        <form onSubmit={handleEditSubmit}>
          <div className="modal-header border-0 pb-0">
            <h5 className="modal-title fw-bold text-dark">Edit Shift Policy</h5>
            <button type="button" className="btn-close" onClick={() => setShowEditModal(false)} aria-label="Close"></button>
          </div>
          <div className="modal-body p-4">
            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">Shift Title</label>
              <input type="text" name="name" className="form-control rounded-3" value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </div>

            {editShiftType === 'fixed' ? (
              <div>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Start Time (24h)</label>
                    <input type="time" name="start_time" className="form-control rounded-3" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)} />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">End Time (24h)</label>
                    <input type="time" name="end_time" className="form-control rounded-3" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} />
                  </div>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Grace Period (Minutes)</label>
                    <input type="number" name="grace_period_minutes" className="form-control rounded-3" value={editGracePeriod} onChange={(e) => setEditGracePeriod(Number(e.target.value))} />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Break Duration (Minutes)</label>
                    <input type="number" name="break_duration_minutes" className="form-control rounded-3" value={editBreakDuration} onChange={(e) => setEditBreakDuration(Number(e.target.value))} />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Core Hours Start (24h)</label>
                    <input type="time" name="core_start" className="form-control rounded-3" value={editCoreStart} onChange={(e) => setEditCoreStart(e.target.value)} />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Core Hours End (24h)</label>
                    <input type="time" name="core_end" className="form-control rounded-3" value={editCoreEnd} onChange={(e) => setEditCoreEnd(e.target.value)} />
                  </div>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Required Daily Hours</label>
                    <input type="number" step="0.5" min="1" max="24" name="required_daily_hours" className="form-control rounded-3" value={editReqDaily} onChange={(e) => setEditReqDaily(Number(e.target.value))} />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">Required Weekly Hours</label>
                    <input type="number" step="0.5" min="1" max="168" name="required_weekly_hours" className="form-control rounded-3" value={editReqWeekly} onChange={(e) => setEditReqWeekly(Number(e.target.value))} />
                  </div>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-4">
                    <label className="form-label small fw-semibold text-secondary">Enforcement Mode</label>
                    <select name="enforcement_mode" className="form-select rounded-3" value={editEnforcementMode} onChange={(e) => setEditEnforcementMode(e.target.value)}>
                      <option value="both">Both Daily & Weekly</option>
                      <option value="daily">Daily Only</option>
                      <option value="weekly">Weekly Only</option>
                    </select>
                  </div>
                  <div className="col-4">
                    <label className="form-label small fw-semibold text-secondary">Unpaid Break (Mins)</label>
                    <input type="number" min="0" name="unpaid_break_minutes" className="form-control rounded-3" value={editUnpaidBreak} onChange={(e) => setEditUnpaidBreak(Number(e.target.value))} />
                  </div>
                  <div className="col-4">
                    <label className="form-label small fw-semibold text-secondary">Core Grace (Mins)</label>
                    <input type="number" min="0" name="core_grace_minutes" className="form-control rounded-3" value={editCoreGrace} onChange={(e) => setEditCoreGrace(Number(e.target.value))} />
                  </div>
                </div>
                <div className="form-check form-switch mt-2">
                  <input className="form-check-input" type="checkbox" id="edit_core_hours_enforced" checked={editCoreHoursEnforced} onChange={(e) => setEditCoreHoursEnforced(e.target.checked)} />
                  <label className="form-check-label small fw-semibold text-dark" htmlFor="edit_core_hours_enforced">
                    Enforce Core Window Compliance
                  </label>
                </div>
              </div>
            )}

            {editValidationAlert && (
              <div className="alert alert-danger border-0 rounded-3 mt-3 py-2 small">{editValidationAlert}</div>
            )}
          </div>
          <div className="modal-footer border-0 pt-0">
            <button type="button" className="btn btn-outline-secondary rounded-pill px-3" onClick={() => setShowEditModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary rounded-pill px-4 fw-semibold" disabled={editShiftMutation.isPending}>
              {editShiftMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Assign Shift */}
      <Modal show={showAssignModal} onHide={() => setShowAssignModal(false)} centered>
        <form onSubmit={handleAssignSubmit}>
          <div className="modal-header border-0 pb-0">
            <h5 className="modal-title fw-bold text-dark">Assign Work Policy</h5>
            <button type="button" className="btn-close" onClick={() => setShowAssignModal(false)} aria-label="Close"></button>
          </div>
          <div className="modal-body p-4">
            <div className="alert alert-light border small text-muted mb-3">
              <strong>Resolution Order:</strong> Employee Override &gt; Assigned Shift Policy &gt; Department Default &gt; Site Default &gt; Company Default.
            </div>
            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">Assignment Target Level</label>
              <select className="form-select rounded-3" value={assignTargetType} onChange={(e) => setAssignTargetType(e.target.value)}>
                <option value="employee">Individual Employee</option>
                <option value="department">Department Staff (Bulk)</option>
                <option value="site">Site Staff (Bulk)</option>
                <option value="all">All Active Workforce (Company-Wide Bulk)</option>
              </select>
            </div>

            {assignTargetType === 'employee' && (
              <div className="mb-3">
                <label className="form-label small fw-semibold text-secondary">Select Employee</label>
                <select className="form-select rounded-3" value={assignEmpId} onChange={(e) => setAssignEmpId(e.target.value)}>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.employee_code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {assignTargetType === 'department' && (
              <div className="mb-3">
                <label className="form-label small fw-semibold text-secondary">Select Department</label>
                <select className="form-select rounded-3" value={assignDeptId} onChange={(e) => setAssignDeptId(e.target.value)}>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}

            {assignTargetType === 'site' && (
              <div className="mb-3">
                <label className="form-label small fw-semibold text-secondary">Select Site</label>
                <select className="form-select rounded-3" value={assignSiteId} onChange={(e) => setAssignSiteId(e.target.value)}>
                  {sites.map((st) => (
                    <option key={st.id} value={st.id}>{st.name} ({st.timezone || 'UTC'})</option>
                  ))}
                </select>
              </div>
            )}

            {assignTargetType === 'all' && (
              <div className="alert alert-primary bg-primary bg-opacity-10 border-0 rounded-3 small p-2 mb-3">
                <i className="bi bi-people-fill me-1"></i> <strong>Bulk Reassignment:</strong> Will assign the selected policy to all active personnel in the organization.
              </div>
            )}

            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">Assigned Shift / Policy</label>
              <select className="form-select rounded-3" value={assignShiftId} onChange={(e) => setAssignShiftId(e.target.value)}>
                {activeShifts.map((sh) => (
                  <option key={sh.id} value={sh.id}>{sh.name} ({(sh.shift_type || 'flexible').replace(/\b\w/g, (c) => c.toUpperCase())})</option>
                ))}
              </select>
            </div>

            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label small fw-semibold text-secondary">Daily Hours Override</label>
                <input type="number" step="0.5" min="1" max="24" className="form-control rounded-3" placeholder="Blank to inherit" value={assignDailyOverride} onChange={(e) => setAssignDailyOverride(e.target.value)} />
              </div>
              <div className="col-6">
                <label className="form-label small fw-semibold text-secondary">Weekly Hours Override</label>
                <input type="number" step="0.5" min="1" max="168" className="form-control rounded-3" placeholder="Blank to inherit" value={assignWeeklyOverride} onChange={(e) => setAssignWeeklyOverride(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="modal-footer border-0 pt-0">
            <button type="button" className="btn btn-outline-secondary rounded-pill px-3" onClick={() => setShowAssignModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary rounded-pill px-4 fw-semibold" disabled={assignMutation.isPending}>
              {assignMutation.isPending ? 'Assigning...' : 'Confirm & Assign Policy'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Recalculate Range */}
      <Modal show={showRecalcModal} onHide={() => setShowRecalcModal(false)} centered>
        <form onSubmit={handleRecalcSubmit}>
          <div className="modal-header border-0 pb-0">
            <h5 className="modal-title fw-bold text-dark">Recalculate Daily Summaries</h5>
            <button type="button" className="btn-close" onClick={() => setShowRecalcModal(false)} aria-label="Close"></button>
          </div>
          <div className="modal-body p-4">
            <div className="alert alert-warning border-0 rounded-3 small p-3 mb-3">
              <i className="bi bi-shield-exclamation me-1"></i>
              Past summaries preserve their historical policy snapshot. This explicit action applies the current assigned shift policy to historical events across the chosen date range and logs to the Audit Trail.
            </div>
            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label small fw-semibold text-secondary">From Date</label>
                <input type="date" className="form-control rounded-3" value={recalcStartDate} onChange={(e) => setRecalcStartDate(e.target.value)} required />
              </div>
              <div className="col-6">
                <label className="form-label small fw-semibold text-secondary">To Date</label>
                <input type="date" className="form-control rounded-3" value={recalcEndDate} onChange={(e) => setRecalcEndDate(e.target.value)} required />
              </div>
            </div>
          </div>
          <div className="modal-footer border-0 pt-0">
            <button type="button" className="btn btn-outline-secondary rounded-pill px-3" onClick={() => setShowRecalcModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-danger rounded-pill px-4 fw-semibold" disabled={recalcMutation.isPending}>
              {recalcMutation.isPending ? 'Recalculating...' : 'Recalculate Summaries'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export default function AdminShiftsPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading shifts...</span>
          </div>
        </div>
      }
    >
      <ShiftsContent />
    </Suspense>
  );
}
