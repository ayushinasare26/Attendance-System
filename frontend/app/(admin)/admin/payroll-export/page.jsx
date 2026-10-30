'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export default function AdminPayrollExportPage() {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split('T')[0];

  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(today);
  const [selectedSite, setSelectedSite] = useState('');
  const [selectedDept, setSelectedDept] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-payroll-init'],
    queryFn: async () => {
      return await api.get('/admin/payroll-export');
    },
  });

  const sites = data?.sites || [];
  const departments = data?.departments || [];

  const handleExportSubmit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    if (selectedSite) params.set('site_id', selectedSite);
    if (selectedDept) params.set('department_id', selectedDept);

    // Direct download trigger
    window.location.href = `/admin/payroll-export/csv?${params.toString()}`;
  };

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
        <div>
          <h4 className="fw-bold mb-1 text-dark">Payroll-Ready Attendance Exports</h4>
          <p className="text-muted small mb-0">
            Generate audited workforce reports with shift regular hours, overtime, late counts, and geofence integrity
          </p>
        </div>
      </div>

      <div className="row g-4">
        {/* Filter Card */}
        <div className="col-lg-5">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
            <h6 className="fw-bold text-dark mb-3">
              <i className="bi bi-funnel text-primary me-2"></i>Payroll Export Parameters
            </h6>

            <form onSubmit={handleExportSubmit}>
              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary">Pay Period From</label>
                  <input
                    type="date"
                    name="from"
                    className="form-control rounded-3"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    required
                  />
                </div>
                <div className="col-6">
                  <label className="form-label small fw-semibold text-secondary">Pay Period To</label>
                  <input
                    type="date"
                    name="to"
                    className="form-control rounded-3"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label small fw-semibold text-secondary">Filter by Work Site</label>
                <select
                  name="site_id"
                  className="form-select rounded-3"
                  value={selectedSite}
                  onChange={(e) => setSelectedSite(e.target.value)}
                >
                  <option value="">All Company Work Sites</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="form-label small fw-semibold text-secondary">Filter by Department</label>
                <select
                  name="department_id"
                  className="form-select rounded-3"
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                >
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="d-grid gap-2">
                <button
                  type="submit"
                  className="btn btn-success rounded-pill py-2 fw-semibold shadow-sm"
                  style={{ background: '#059669', borderColor: '#059669' }}
                >
                  <i className="bi bi-file-earmark-spreadsheet me-1"></i> Generate Payroll-Ready CSV
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn btn-outline-secondary rounded-pill py-2 fw-semibold"
                >
                  <i className="bi bi-printer me-1"></i> Print Summary
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* CSV Format Documentation */}
        <div className="col-lg-7">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
            <h6 className="fw-bold text-dark mb-3">
              <i className="bi bi-code-square text-primary me-2"></i>Payroll Export CSV Schema
            </h6>
            <p className="small text-muted mb-3">
              This schema aligns with industrial ERP and payroll integration standards (ADP, Workday, SAP, Zoho Payroll). Each row aggregates one employee's shift performance across the selected date range.
            </p>

            <div className="table-responsive">
              <table className="table table-bordered table-sm small mb-0">
                <thead className="table-light text-secondary">
                  <tr>
                    <th>CSV Column Name</th>
                    <th>Data Type</th>
                    <th>Description</th>
                    <th>Payroll Mapping</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>Employee ID</code></td>
                    <td>Integer</td>
                    <td>Database primary key</td>
                    <td>Internal Foreign Key</td>
                  </tr>
                  <tr>
                    <td><code>Employee Code</code></td>
                    <td>String</td>
                    <td>Workforce badge code (e.g. EMP-1042)</td>
                    <td>Payroll Employee Number</td>
                  </tr>
                  <tr>
                    <td><code>Full Name</code></td>
                    <td>String</td>
                    <td>Enrolled employee name</td>
                    <td>Payee Name</td>
                  </tr>
                  <tr>
                    <td><code>Department</code></td>
                    <td>String</td>
                    <td>Assigned organizational unit</td>
                    <td>Cost Center / Department</td>
                  </tr>
                  <tr>
                    <td><code>Site</code></td>
                    <td>String</td>
                    <td>Branch / Office work site</td>
                    <td>Tax Jurisdiction / Location</td>
                  </tr>
                  <tr>
                    <td><code>Regular Hours</code></td>
                    <td>Float (2 dec)</td>
                    <td>Net shift hours worked minus lunch break</td>
                    <td>Standard Base Pay Hours</td>
                  </tr>
                  <tr>
                    <td><code>Overtime Hours</code></td>
                    <td>Float (2 dec)</td>
                    <td>Hours logged past scheduled shift end</td>
                    <td>1.5x / 2.0x OT Multiplier</td>
                  </tr>
                  <tr>
                    <td><code>Total Hours</code></td>
                    <td>Float (2 dec)</td>
                    <td>Regular + Overtime gross work time</td>
                    <td>Total Time Worked</td>
                  </tr>
                  <tr>
                    <td><code>Late Days</code></td>
                    <td>Integer</td>
                    <td>Count of check-ins past grace period</td>
                    <td>Punctuality Deduction Policy</td>
                  </tr>
                  <tr>
                    <td><code>Flagged Events</code></td>
                    <td>Integer</td>
                    <td>Geofence violations or liveness flags</td>
                    <td>HR Disciplinary / Audit Hold</td>
                  </tr>
                  <tr>
                    <td><code>Total Work Days</code></td>
                    <td>Integer</td>
                    <td>Distinct active work days in period</td>
                    <td>Attendance Bonus / Per Diem</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
