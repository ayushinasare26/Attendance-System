'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import ReviewCorrectionModal from '@/components/manager/ReviewCorrectionModal';

export default function ManagerCorrectionRequestsPage() {
  const queryClient = useQueryClient();
  const { addFlash } = useAuth();

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['manager-correction-requests'],
    queryFn: async () => {
      return await api.get('/manager/correction-requests');
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action, reviewNote }) => {
      return await api.post(`/manager/correction-requests/${id}/review`, {
        action,
        review_note: reviewNote,
      });
    },
    onSuccess: (res) => {
      setShowModal(false);
      setSelectedRequest(null);
      addFlash(res.message || 'Correction decision submitted successfully.', 'success');
      queryClient.invalidateQueries({ queryKey: ['manager-correction-requests'] });
      queryClient.invalidateQueries({ queryKey: ['manager-dashboard'] });
    },
    onError: (err) => {
      addFlash(err.message || 'Failed to submit correction decision.', 'danger');
    },
  });

  const handleOpenReview = (requestItem) => {
    setSelectedRequest(requestItem);
    setShowModal(true);
  };

  const requests = data?.requests || [];

  return (
    <div className="container-fluid px-sm-4 py-3">
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h4 className="fw-bold text-dark mb-1">Attendance Correction Queue</h4>
          <p className="text-muted small mb-0">
            Review and approve attendance adjustments submitted by your team members
          </p>
        </div>
        <Link href="/manager/dashboard" className="btn btn-outline-secondary rounded-pill px-3">
          <i className="bi bi-arrow-left me-1"></i> Back to Dashboard
        </Link>
      </div>

      {error && (
        <div className="alert alert-danger rounded-3 shadow-sm py-2 px-3 small mb-4" role="alert">
          <i className="bi bi-exclamation-triangle me-1"></i>
          {error.message || 'Failed to load correction requests.'}
        </div>
      )}

      {/* Requests Table */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">
        <div className="card-header bg-white border-0 py-3 px-4 d-flex justify-content-between align-items-center">
          <h6 className="fw-bold mb-0 text-dark">
            <i className="bi bi-inbox-fill text-warning me-2"></i>Pending & Historical Team Requests
          </h6>
          <span className="badge bg-light text-secondary border">
            {isLoading ? 'Loading...' : `${requests.length} total`}
          </span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.88rem' }}>
            <thead className="table-light text-secondary">
              <tr>
                <th className="ps-4">Employee</th>
                <th>Target Date</th>
                <th>Reason Given</th>
                <th>Requested Change</th>
                <th>Submitted At</th>
                <th>Status</th>
                <th>Manager Review Note</th>
                <th className="text-end pe-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-4 text-muted">
                    <div className="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
                    Loading requests...
                  </td>
                </tr>
              ) : requests.length > 0 ? (
                requests.map((r) => (
                  <tr key={r.id}>
                    <td className="ps-4">
                      <div className="fw-bold text-dark">{r.name}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                        ID: {r.employee_code} • {r.department_name}
                      </div>
                    </td>
                    <td className="fw-bold text-dark">{r.attendance_date}</td>
                    <td>{r.reason}</td>
                    <td className="text-secondary">{r.requested_change}</td>
                    <td className="text-muted small">{r.created_display}</td>
                    <td>
                      {r.status === 'approved' ? (
                        <span className="badge bg-success rounded-pill px-2 py-1">
                          <i className="bi bi-check me-1"></i>Approved
                        </span>
                      ) : r.status === 'rejected' ? (
                        <span className="badge bg-danger rounded-pill px-2 py-1">
                          <i className="bi bi-x me-1"></i>Rejected
                        </span>
                      ) : (
                        <span className="badge bg-warning text-dark rounded-pill px-2 py-1">
                          <i className="bi bi-hourglass-split me-1"></i>Pending
                        </span>
                      )}
                    </td>
                    <td className="text-muted small">
                      {r.review_note || '—'}
                      {r.reviewed_display && r.reviewed_display !== '—' && (
                        <div style={{ fontSize: '0.7rem' }}>({r.reviewed_display})</div>
                      )}
                    </td>
                    <td className="text-end pe-4">
                      {r.status === 'pending' ? (
                        <button
                          className="btn btn-sm btn-dark rounded-pill px-3 fw-semibold review-btn"
                          onClick={() => handleOpenReview(r)}
                        >
                          Review & Decide
                        </button>
                      ) : (
                        <span className="badge bg-light text-muted border">Completed</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="text-center py-4 text-muted">
                    No correction requests pending for your team.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      <ReviewCorrectionModal
        show={showModal}
        onHide={() => setShowModal(false)}
        requestItem={selectedRequest}
        onSubmit={(payload) => reviewMutation.mutate(payload)}
        isSubmitting={reviewMutation.isPending}
      />
    </div>
  );
}
