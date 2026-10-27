'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from 'react-bootstrap/Modal';
import api from '@/lib/api';
import { useAuth } from '@/lib/authContext';

function AdminEmployeesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { addFlash } = useAuth();

  const selectedPolicy = searchParams.get('policy_id') || '';
  const sortBy = searchParams.get('sort') || '';

  const [policyFilter, setPolicyFilter] = useState(selectedPolicy);
  const [sortOrder, setSortOrder] = useState(sortBy);

  // Edit Policy Modal State
  const [editingEmp, setEditingEmp] = useState(null);
  const [editShiftId, setEditShiftId] = useState('');
  const [editDailyHours, setEditDailyHours] = useState('');
  const [editWeeklyHours, setEditWeeklyHours] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-employees', selectedPolicy, sortBy],
    queryFn: async () => {
      const queryParts = [];
      if (selectedPolicy) queryParts.push(`policy_id=${encodeURIComponent(selectedPolicy)}`);
      if (sortBy) queryParts.push(`sort=${encodeURIComponent(sortBy)}`);
      const url = `/admin/employees${queryParts.length > 0 ? '?' + queryParts.join('&') : ''}`;
      return await api.get(url);
    },
  });

  const employees = data?.employees || [];
  const departments = data?.departments || [];
  const sites = data?.sites || [];
  const shifts = data?.shifts || [];
  const managers = data?.managers || [];

  const updatePolicyMutation = useMutation({
    mutationFn: async ({ empId, payload }) => {
      return await api.post(`/admin/employees/${empId}/policy`, payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
      setEditingEmp(null);
      if (res?.message) {
        addFlash(res.message, res.category || 'success');
      }
    },
    onError: (err) => {
      alert(err.data?.error || err.message || 'Failed to update policy');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (empId) => {
      return await api.post(`/admin/employees/${empId}/toggle-active`);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
      if (res?.message) {
        addFlash(res.message, res.category || 'info');
      }
    },
    onError: (err) => {
      alert(err.data?.error || err.message || 'Failed to change active status');
    },
  });

  const purgeBiometricsMutation = useMutation({
    mutationFn: async (empId) => {
      return await api.post(`/admin/employees/${empId}/purge-biometrics`);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
      if (res?.message) {
        addFlash(res.message, res.category || 'info');
      }
    },
    onError: (err) => {
      alert(err.data?.error || err.message || 'Failed to purge biometrics');
    },
  });

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (policyFilter) params.set('policy_id', policyFilter);
    if (sortOrder) params.set('sort', sortOrder);
    const query = params.toString();
    router.push(`/admin/employees${query ? '?' + query : ''}`);
  };

  const handleResetFilter = () => {
    setPolicyFilter('');
    setSortOrder('');
    router.push('/admin/employees');
  };

  const openEditModal = (emp) => {
    setEditingEmp(emp);
    setEditShiftId(emp.shift_id || emp.work_policy?.policy_id || (shifts[0]?.id || ''));
    setEditDailyHours(emp.required_daily_hours != null ? emp.required_daily_hours : '');
    setEditWeeklyHours(emp.required_weekly_hours != null ? emp.required_weekly_hours : '');
  };

  const handleSavePolicy = (e) => {
    e.preventDefault();
    if (!editingEmp) return;
    updatePolicyMutation.mutate({
      empId: editingEmp.id,
      payload: {
        shift_id: editShiftId,
        required_daily_hours: editDailyHours === '' ? '' : editDailyHours,
        required_weekly_hours: editWeeklyHours === '' ? '' : editWeeklyHours,
      },
    });
  };

  const handleToggleActive = (emp) => {
    if (window.confirm('Change active status for this employee?')) {
      toggleActiveMutation.mutate(emp.id);
    }
  };

  const handlePurgeBiometrics = (emp) => {
    if (window.confirm('Permanently purge reference photos and deep embeddings for this employee (Compliance Right-to-be-Forgotten)?')) {
      purgeBiometricsMutation.mutate(emp.id);
    }
  };

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h4 className="fw-bold text-dark mb-1">Workforce Roster & Biometric Governance</h4>
          <p className="text-muted small mb-0">
            Manage roles, flexible work policies, individual duration overrides, explicit biometric consent, and compliance purges
          </p>
        </div>
        <div className="d-flex gap-2">
          <Link
            href="/admin/shifts"
            className="btn btn-outline-secondary rounded-pill px-3 fw-semibold shadow-sm"
          >
            <i className="bi bi-diagram-3 me-1"></i> Shift & Policy Manager
          </Link>
          <Link
            href="/admin/enroll"
            className="btn btn-primary rounded-pill px-4 fw-semibold shadow-sm"
          >
            <i className="bi bi-person-plus-fill me-1"></i> Enroll New Employee
          </Link>
        </div>
      </div>

      {/* Filter and Sort Bar */}
      <div className="card border-0 shadow-sm rounded-4 p-3 bg-white mb-4">
        <form onSubmit={handleFilterSubmit} className="row g-2 align-items-center">
          <div className="col-md-4">
            <label className="form-label small text-muted mb-1 fw-semibold">Filter by Work Policy</label>
            <select
              value={policyFilter}
              onChange={(e) => setPolicyFilter(e.target.value)}
              className="form-select form-select-sm rounded-3"
            >
              <option value="">All Work Policies</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.required_daily_hours}h/day)
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label small text-muted mb-1 fw-semibold">Sort by Required Hours</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="form-select form-select-sm rounded-3"
            >
              <option value="">Default Order</option>
              <option value="hours_desc">Highest Daily Hours (Descending)</option>
              <option value="hours_asc">Lowest Daily Hours (Ascending)</option>
            </select>
          </div>
          <div className="col-md-4 d-flex align-items-end gap-2 pt-md-4">
            <button type="submit" className="btn btn-sm btn-dark rounded-pill px-3">
              <i className="bi bi-funnel"></i> Apply Filter
            </button>
            <button
              type="button"
              onClick={handleResetFilter}
              className="btn btn-sm btn-outline-secondary rounded-pill px-3"
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Employees Table */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white mb-4">
        <div className="card-header bg-white border-0 py-3 px-4 d-flex justify-content-between align-items-center">
          <h6 className="fw-bold mb-0 text-dark">
            <i className="bi bi-people-fill text-primary me-2"></i>Active & Offboarded Personnel
          </h6>
          <span className="badge bg-light text-secondary border">
            {isLoading ? '...' : `${employees.length} staff`}
          </span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.88rem' }}>
            <thead className="table-light text-secondary">
              <tr>
                <th className="ps-4">Work Policy & Duration</th>
                <th>Employee</th>
                <th>Role</th>
                <th>Department</th>
                <th>Assigned Site</th>
                <th>Reporting Manager</th>
                <th>Biometric Consent</th>
                <th>Status</th>
                <th className="text-end pe-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="9" className="text-center py-4 text-muted">
                    <div className="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    Loading employee roster...
                  </td>
                </tr>
              ) : employees.length > 0 ? (
                employees.map((emp) => (
                  <tr key={emp.id} className={!emp.active ? 'bg-light text-muted' : ''}>
                    {/* Work Policy Column */}
                    <td className="ps-4">
                      <div>
                        <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1 fw-semibold">
                          {emp.duration_display}
                        </span>
                        {emp.is_override && (
                          <span
                            className="badge bg-warning-subtle text-dark border border-warning-subtle px-1 ms-1"
                            title="Individual per-employee duration override applied"
                          >
                            (override)
                          </span>
                        )}
                      </div>
                      <div className="small text-muted mt-1" title={emp.weekly_display}>
                        {emp.weekly_display} • Core {emp.work_policy?.core_start || '11:00'}-{emp.work_policy?.core_end || '16:00'}
                      </div>
                    </td>

                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <img
                          src={`https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name)}&background=6366f1&color=fff&rounded=true`}
                          style={{ width: '32px', height: '32px' }}
                          alt=""
                        />
                        <div>
                          <div className="fw-bold text-dark">{emp.name}</div>
                          <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                            ID: {emp.employee_code} • {emp.email || 'No email'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      {emp.role === 'admin' ? (
                        <span className="badge bg-danger rounded-pill px-2 py-1">Admin</span>
                      ) : emp.role === 'manager' ? (
                        <span className="badge bg-warning text-dark rounded-pill px-2 py-1">Manager</span>
                      ) : (
                        <span className="badge bg-secondary rounded-pill px-2 py-1">Employee</span>
                      )}
                    </td>

                    <td>{emp.department_name || 'General'}</td>
                    <td>{emp.site_name || 'Headquarters'}</td>
                    <td>{emp.manager_name || 'Direct to HR'}</td>

                    <td>
                      {emp.biometric_consent ? (
                        <span
                          className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1"
                          title={`Consented: ${emp.consent_display}`}
                        >
                          <i className="bi bi-shield-check me-1"></i>Consented
                        </span>
                      ) : (
                        <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-1">
                          <i className="bi bi-shield-x me-1"></i>Missing Consent
                        </span>
                      )}
                    </td>

                    <td>
                      {emp.active ? (
                        <span className="badge bg-success rounded-pill px-2 py-1">Active</span>
                      ) : (
                        <span className="badge bg-secondary rounded-pill px-2 py-1">Offboarded</span>
                      )}
                    </td>

                    <td className="text-end pe-4">
                      <div className="d-inline-flex gap-1">
                        {/* Edit Policy & Duration Button */}
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary rounded-pill px-2"
                          onClick={() => openEditModal(emp)}
                          title="Edit Work Policy & Duration Override"
                        >
                          <i className="bi bi-sliders me-1"></i> Policy
                        </button>

                        {/* Deactivate / Reactivate */}
                        <button
                          type="button"
                          onClick={() => handleToggleActive(emp)}
                          className={`btn btn-sm ${emp.active ? 'btn-outline-warning' : 'btn-outline-success'} rounded-circle p-1`}
                          style={{ width: '28px', height: '28px' }}
                          title={emp.active ? 'Offboard/Deactivate' : 'Reactivate'}
                          disabled={toggleActiveMutation.isPending}
                        >
                          <i className={`bi ${emp.active ? 'bi-person-dash' : 'bi-person-check'}`}></i>
                        </button>

                        {/* Purge Biometrics */}
                        <button
                          type="button"
                          onClick={() => handlePurgeBiometrics(emp)}
                          className="btn btn-sm btn-outline-danger rounded-circle p-1"
                          style={{ width: '28px', height: '28px' }}
                          title="Purge Biometrics (GDPR/DPDP)"
                          disabled={purgeBiometricsMutation.isPending}
                        >
                          <i className="bi bi-fingerprint"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="text-center py-4 text-muted">
                    No employees registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Policy Modal */}
      <Modal
        show={!!editingEmp}
        onHide={() => setEditingEmp(null)}
        centered
        contentClassName="border-0 shadow-lg rounded-4"
      >
        <form onSubmit={handleSavePolicy}>
          <div className="modal-header border-0 pb-0">
            <h5 className="modal-title fw-bold text-dark">
              Edit Policy: {editingEmp?.name}
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={() => setEditingEmp(null)}
            ></button>
          </div>
          <div className="modal-body p-4">
            <div className="alert alert-light border small text-muted mb-3">
              Assign a flexible work policy or set individual daily/weekly duration overrides for part-time or customized staff.
            </div>

            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">Assigned Work Policy</label>
              <select
                name="shift_id"
                className="form-select rounded-3"
                value={editShiftId}
                onChange={(e) => setEditShiftId(e.target.value)}
              >
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.required_daily_hours}h/day, {s.shift_type ? s.shift_type.charAt(0).toUpperCase() + s.shift_type.slice(1) : ''})
                  </option>
                ))}
              </select>
            </div>

            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label small fw-semibold text-secondary">Daily Hours Override</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="24"
                  name="required_daily_hours"
                  className="form-control rounded-3"
                  value={editDailyHours}
                  onChange={(e) => setEditDailyHours(e.target.value)}
                  placeholder="Inherit from policy"
                />
                <small className="text-muted" style={{ fontSize: '0.72rem' }}>
                  Leave blank to inherit policy default
                </small>
              </div>
              <div className="col-6">
                <label className="form-label small fw-semibold text-secondary">Weekly Hours Override</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="168"
                  name="required_weekly_hours"
                  className="form-control rounded-3"
                  value={editWeeklyHours}
                  onChange={(e) => setEditWeeklyHours(e.target.value)}
                  placeholder="Inherit from policy"
                />
                <small className="text-muted" style={{ fontSize: '0.72rem' }}>
                  Leave blank to inherit policy default
                </small>
              </div>
            </div>
          </div>
          <div className="modal-footer border-0 pt-0">
            <button
              type="button"
              className="btn btn-outline-secondary rounded-pill px-3"
              onClick={() => setEditingEmp(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary rounded-pill px-4 fw-semibold"
              disabled={updatePolicyMutation.isPending}
            >
              {updatePolicyMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export default function AdminEmployeesPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center text-muted">Loading roster...</div>}>
      <AdminEmployeesContent />
    </Suspense>
  );
}
