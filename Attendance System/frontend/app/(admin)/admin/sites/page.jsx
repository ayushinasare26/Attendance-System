'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from 'react-bootstrap/Modal';
import api from '@/lib/api';
import { useAuth } from '@/lib/authContext';

export default function AdminSitesPage() {
  const queryClient = useQueryClient();
  const { addFlash } = useAuth();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSite, setEditingSite] = useState(null);

  // Form states for Add
  const [addName, setAddName] = useState('');
  const [addAddress, setAddAddress] = useState('');
  const [addLat, setAddLat] = useState('');
  const [addLon, setAddLon] = useState('');
  const [addRadius, setAddRadius] = useState('200');
  const [addGeoEnabled, setAddGeoEnabled] = useState(true);
  const [addLocating, setAddLocating] = useState(false);
  const [addResolved, setAddResolved] = useState(null);
  const [addGeocodeError, setAddGeocodeError] = useState('');

  // Form states for Edit
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLon, setEditLon] = useState('');
  const [editRadius, setEditRadius] = useState('200');
  const [editGeoEnabled, setEditGeoEnabled] = useState(true);
  const [editLocating, setEditLocating] = useState(false);
  const [editResolved, setEditResolved] = useState(null);
  const [editGeocodeError, setEditGeocodeError] = useState('');

  const { data: sitesData, isLoading, error } = useQuery({
    queryKey: ['admin-sites'],
    queryFn: async () => {
      return await api.get('/admin/sites');
    },
  });

  const sites = sitesData?.sites || [];

  const addSiteMutation = useMutation({
    mutationFn: async (payload) => {
      return await api.post('/admin/sites', payload);
    },
    onSuccess: (res) => {
      setShowAddModal(false);
      resetAddForm();
      addFlash(res.message || 'Work site created successfully.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-sites'] });
    },
    onError: (err) => {
      addFlash(err.message || 'Failed to create work site.', 'danger');
    },
  });

  const editSiteMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      return await api.post(`/admin/sites/${id}/edit`, payload);
    },
    onSuccess: (res) => {
      setShowEditModal(false);
      setEditingSite(null);
      addFlash(res.message || 'Work site updated successfully.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-sites'] });
    },
    onError: (err) => {
      addFlash(err.message || 'Failed to update work site.', 'danger');
    },
  });

  const deleteSiteMutation = useMutation({
    mutationFn: async (siteId) => {
      return await api.post(`/admin/sites/${siteId}/delete`);
    },
    onSuccess: (res) => {
      addFlash(res.message || 'Work site removed.', 'info');
      queryClient.invalidateQueries({ queryKey: ['admin-sites'] });
    },
    onError: (err) => {
      addFlash(err.message || 'Failed to delete work site.', 'danger');
    },
  });

  const resetAddForm = () => {
    setAddName('');
    setAddAddress('');
    setAddLat('');
    setAddLon('');
    setAddRadius('200');
    setAddGeoEnabled(true);
    setAddResolved(null);
    setAddGeocodeError('');
  };

  const openEditModal = (site) => {
    setEditingSite(site);
    setEditName(site.name || '');
    setEditAddress(site.address || '');
    setEditLat(site.latitude ? String(site.latitude) : '');
    setEditLon(site.longitude ? String(site.longitude) : '');
    setEditRadius(site.geofence_radius_meters ? String(site.geofence_radius_meters) : '200');
    setEditGeoEnabled(Boolean(site.geofencing_enabled));
    setEditGeocodeError('');
    if (site.latitude && site.longitude) {
      setEditResolved({
        address: site.address || `${site.latitude}, ${site.longitude}`,
        latitude: site.latitude,
        longitude: site.longitude,
      });
    } else {
      setEditResolved(null);
    }
    setShowEditModal(true);
  };

  const handleUseCurrentLocation = (mode) => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const latStr = pos.coords.latitude.toFixed(6);
          const lonStr = pos.coords.longitude.toFixed(6);
          if (mode === 'add') {
            setAddLat(latStr);
            setAddLon(lonStr);
          } else {
            setEditLat(latStr);
            setEditLon(lonStr);
          }
        },
        (err) => alert('Could not fetch GPS: ' + err.message)
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  };

  const handleFindCoords = async (mode) => {
    const isEdit = mode === 'edit';
    const address = (isEdit ? editAddress : addAddress).trim();
    if (!address) {
      alert('Please enter an address or landmark first.');
      return;
    }

    if (isEdit) {
      setEditLocating(true);
      setEditGeocodeError('');
      setEditResolved(null);
    } else {
      setAddLocating(true);
      setAddGeocodeError('');
      setAddResolved(null);
    }

    try {
      const data = await api.post('/admin/api/geocode/forward', { address });
      if (data.success && data.latitude && data.longitude) {
        if (isEdit) {
          setEditLat(String(data.latitude));
          setEditLon(String(data.longitude));
          setEditResolved(data);
        } else {
          setAddLat(String(data.latitude));
          setAddLon(String(data.longitude));
          setAddResolved(data);
        }
      } else {
        const msg = data.message || 'Address not found. Please enter coordinates manually.';
        if (isEdit) setEditGeocodeError(msg);
        else setAddGeocodeError(msg);
      }
    } catch (e) {
      const msg = 'Network or geocoding service error. You can enter coordinates manually.';
      if (isEdit) setEditGeocodeError(msg);
      else setAddGeocodeError(msg);
    } finally {
      if (isEdit) setEditLocating(false);
      else setAddLocating(false);
    }
  };

  const handleAddSubmit = (e) => {
    e.preventDefault();
    addSiteMutation.mutate({
      name: addName,
      address: addAddress,
      latitude: addLat,
      longitude: addLon,
      geofence_radius_meters: addRadius,
      geofencing_enabled: addGeoEnabled ? '1' : '0',
    });
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!editingSite) return;
    editSiteMutation.mutate({
      id: editingSite.id,
      payload: {
        name: editName,
        address: editAddress,
        latitude: editLat,
        longitude: editLon,
        geofence_radius_meters: editRadius,
        geofencing_enabled: editGeoEnabled ? '1' : '0',
      },
    });
  };

  const handleDeleteSite = (site) => {
    if (confirm('Remove this work site?')) {
      deleteSiteMutation.mutate(site.id);
    }
  };

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h4 className="fw-bold text-dark mb-1">Office Locations & Geofence Boundaries</h4>
          <p className="text-muted small mb-0">
            Define branches, offices, and remote staff policies with geopy WGS-84 geodesic radius enforcement
          </p>
        </div>
        <button
          className="btn btn-primary rounded-pill px-4 fw-semibold shadow-sm"
          onClick={() => {
            resetAddForm();
            setShowAddModal(true);
          }}
        >
          <i className="bi bi-plus-lg me-1"></i> Add Work Site
        </button>
      </div>

      {error && (
        <div className="alert alert-danger rounded-3 shadow-sm py-2 px-3 small mb-4" role="alert">
          <i className="bi bi-exclamation-triangle me-1"></i>
          {error.message || 'Failed to load sites.'}
        </div>
      )}

      {/* Sites Table */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white mb-4">
        <div className="card-header bg-white border-0 py-3 px-4 d-flex justify-content-between align-items-center">
          <h6 className="fw-bold mb-0 text-dark">
            <i className="bi bi-geo-alt-fill text-primary me-2"></i>Configured Office Locations
          </h6>
          <span className="badge bg-light text-secondary border">
            {isLoading ? 'Loading...' : `${sites.length} sites`}
          </span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.88rem' }}>
            <thead className="table-light text-secondary">
              <tr>
                <th className="ps-4">Site Name</th>
                <th>Resolved Address</th>
                <th>GPS Coordinates</th>
                <th>Geofence Radius</th>
                <th>Geofence Policy</th>
                <th>Assigned Staff</th>
                <th className="text-end pe-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted">
                    <div className="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    Loading sites...
                  </td>
                </tr>
              ) : sites.length > 0 ? (
                sites.map((s) => (
                  <tr key={s.id}>
                    <td className="ps-4 fw-bold text-dark">{s.name}</td>
                    <td className="text-secondary small" style={{ maxWidth: '250px' }}>
                      {s.address || 'Address pending'}
                    </td>
                    <td>
                      <code className="text-dark bg-light px-2 py-1 rounded small">
                        {s.latitude ? Number(s.latitude).toFixed(4) : '0.0000'}°,{' '}
                        {s.longitude ? Number(s.longitude).toFixed(4) : '0.0000'}°
                      </code>
                    </td>
                    <td>
                      {s.geofencing_enabled ? (
                        <span className="fw-semibold text-dark">
                          {Math.round(s.geofence_radius_meters)} meters
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {s.geofencing_enabled ? (
                        <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1">
                          <i className="bi bi-shield-check me-1"></i>Geofence Enforced
                        </span>
                      ) : (
                        <span className="badge bg-info-subtle text-info border border-info-subtle rounded-pill px-2 py-1">
                          <i className="bi bi-globe me-1"></i>Remote / Field Staff (No Radius)
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="badge bg-light text-dark border px-2 py-1">
                        {s.employee_count || 0} staff
                      </span>
                    </td>
                    <td className="text-end pe-4">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary rounded-pill px-3 me-1 edit-site-btn"
                        onClick={() => openEditModal(s)}
                      >
                        <i className="bi bi-pencil me-1"></i> Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger rounded-pill px-3"
                        disabled={s.id === 1}
                        title={s.id === 1 ? 'Primary site cannot be deleted' : 'Delete work site'}
                        onClick={() => handleDeleteSite(s)}
                      >
                        <i className="bi bi-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted">
                    No sites registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add New Work Site */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)} centered>
        <form onSubmit={handleAddSubmit}>
          <div className="modal-header border-0 pb-0">
            <h5 className="modal-title fw-bold text-dark">Register Work Site / Office Location</h5>
            <button
              type="button"
              className="btn-close"
              onClick={() => setShowAddModal(false)}
              aria-label="Close"
            ></button>
          </div>
          <div className="modal-body p-4">
            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">Site Name</label>
              <input
                type="text"
                name="name"
                className="form-control rounded-3"
                placeholder="e.g. Pune Development Centre"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">Address / Landmark</label>
              <div className="input-group">
                <input
                  type="text"
                  name="address"
                  id="addSiteAddress"
                  className="form-control rounded-start-3"
                  placeholder="e.g. Hinjewadi Phase 2, Pune, Maharashtra"
                  value={addAddress}
                  onChange={(e) => setAddAddress(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  id="addFindCoordsBtn"
                  disabled={addLocating}
                  onClick={() => handleFindCoords('add')}
                  title="Find coordinates from address"
                >
                  {addLocating ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1"></span> Locating...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-search me-1"></i> Find Coordinates
                    </>
                  )}
                </button>
              </div>
              <div className="form-text small text-muted">
                Type an address and click 'Find Coordinates' to auto-resolve GPS using geopy.
              </div>

              {/* Resolved preview banner */}
              {addResolved && (
                <div id="addGeocodePreview" className="alert alert-info py-2 px-3 small rounded-3 mt-2 mb-0">
                  <div>
                    <i className="bi bi-check-circle-fill text-success me-1"></i>
                    <strong>Resolved:</strong> <span>{addResolved.address}</span>
                  </div>
                  <div className="mt-1 text-muted" style={{ fontSize: '0.75rem' }}>
                    Coordinates auto-filled below. You can review or manually adjust them.
                  </div>
                  <div className="mt-2 rounded-2 overflow-hidden border" style={{ height: '120px' }}>
                    <iframe
                      width="100%"
                      height="120"
                      frameBorder="0"
                      scrolling="no"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(addResolved.longitude) - 0.005}%2C${Number(addResolved.latitude) - 0.005}%2C${Number(addResolved.longitude) + 0.005}%2C${Number(addResolved.latitude) + 0.005}&layer=mapnik&marker=${addResolved.latitude}%2C${addResolved.longitude}`}
                    ></iframe>
                  </div>
                </div>
              )}

              {addGeocodeError && (
                <div id="addGeocodeError" className="alert alert-warning py-2 px-3 small rounded-3 mt-2 mb-0">
                  <i className="bi bi-exclamation-triangle-fill text-warning me-1"></i>
                  <span>{addGeocodeError}</span>
                </div>
              )}
            </div>

            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label small fw-semibold text-secondary">Latitude</label>
                <input
                  type="number"
                  step="any"
                  name="latitude"
                  id="siteLatInput"
                  className="form-control rounded-3"
                  placeholder="e.g. 18.5913"
                  value={addLat}
                  onChange={(e) => setAddLat(e.target.value)}
                  required
                />
              </div>
              <div className="col-6">
                <label className="form-label small fw-semibold text-secondary">Longitude</label>
                <input
                  type="number"
                  step="any"
                  name="longitude"
                  id="siteLonInput"
                  className="form-control rounded-3"
                  placeholder="e.g. 73.7389"
                  value={addLon}
                  onChange={(e) => setAddLon(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-outline-secondary rounded-pill mb-3"
              onClick={() => handleUseCurrentLocation('add')}
            >
              <i className="bi bi-crosshair me-1"></i> Use My Current Browser Location
            </button>

            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">Geofence Radius (Meters)</label>
              <input
                type="number"
                name="geofence_radius_meters"
                className="form-control rounded-3"
                value={addRadius}
                onChange={(e) => setAddRadius(e.target.value)}
                required
              />
              <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                Check-ins outside this radius will be marked as geofence violations and flagged for audit.
              </div>
            </div>

            <div className="form-check form-switch p-3 bg-light rounded-3 border">
              <input
                className="form-check-input ms-0 me-2"
                type="checkbox"
                name="geofencing_enabled"
                id="geoEnabledSwitch"
                checked={addGeoEnabled}
                onChange={(e) => setAddGeoEnabled(e.target.checked)}
              />
              <label className="form-check-label small fw-bold text-dark" htmlFor="geoEnabledSwitch">
                Enforce Geofence Validation
              </label>
              <div className="text-muted small">
                Disable this for remote staff, traveling sales representatives, or delivery site staff who report from variable coordinates.
              </div>
            </div>
          </div>
          <div className="modal-footer border-0 pt-0">
            <button
              type="button"
              className="btn btn-outline-secondary rounded-pill px-3"
              onClick={() => setShowAddModal(false)}
              disabled={addSiteMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary rounded-pill px-4 fw-semibold"
              disabled={addSiteMutation.isPending}
            >
              {addSiteMutation.isPending ? 'Saving...' : 'Save Work Site'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Work Site */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)} centered>
        <form onSubmit={handleEditSubmit}>
          <div className="modal-header border-0 pb-0">
            <h5 className="modal-title fw-bold text-dark">Edit Work Site / Office Location</h5>
            <button
              type="button"
              className="btn-close"
              onClick={() => setShowEditModal(false)}
              aria-label="Close"
            ></button>
          </div>
          <div className="modal-body p-4">
            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">Site Name</label>
              <input
                type="text"
                name="name"
                id="editSiteName"
                className="form-control rounded-3"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">Address / Landmark</label>
              <div className="input-group">
                <input
                  type="text"
                  name="address"
                  id="editSiteAddress"
                  className="form-control rounded-start-3"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  id="editFindCoordsBtn"
                  disabled={editLocating}
                  onClick={() => handleFindCoords('edit')}
                  title="Find coordinates from address"
                >
                  {editLocating ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1"></span> Locating...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-search me-1"></i> Find Coordinates
                    </>
                  )}
                </button>
              </div>
              <div className="form-text small text-muted">
                Update address and click 'Find Coordinates' to auto-lookup coordinates.
              </div>

              {/* Resolved preview banner */}
              {editResolved && (
                <div id="editGeocodePreview" className="alert alert-info py-2 px-3 small rounded-3 mt-2 mb-0">
                  <div>
                    <i className="bi bi-check-circle-fill text-success me-1"></i>
                    <strong>Resolved:</strong> <span>{editResolved.address}</span>
                  </div>
                  <div className="mt-1 text-muted" style={{ fontSize: '0.75rem' }}>
                    Coordinates auto-filled below. You can review or manually adjust them.
                  </div>
                  <div className="mt-2 rounded-2 overflow-hidden border" style={{ height: '120px' }}>
                    <iframe
                      width="100%"
                      height="120"
                      frameBorder="0"
                      scrolling="no"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(editResolved.longitude) - 0.005}%2C${Number(editResolved.latitude) - 0.005}%2C${Number(editResolved.longitude) + 0.005}%2C${Number(editResolved.latitude) + 0.005}&layer=mapnik&marker=${editResolved.latitude}%2C${editResolved.longitude}`}
                    ></iframe>
                  </div>
                </div>
              )}

              {editGeocodeError && (
                <div id="editGeocodeError" className="alert alert-warning py-2 px-3 small rounded-3 mt-2 mb-0">
                  <i className="bi bi-exclamation-triangle-fill text-warning me-1"></i>
                  <span>{editGeocodeError}</span>
                </div>
              )}
            </div>

            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label small fw-semibold text-secondary">Latitude</label>
                <input
                  type="number"
                  step="any"
                  name="latitude"
                  id="editSiteLat"
                  className="form-control rounded-3"
                  value={editLat}
                  onChange={(e) => setEditLat(e.target.value)}
                  required
                />
              </div>
              <div className="col-6">
                <label className="form-label small fw-semibold text-secondary">Longitude</label>
                <input
                  type="number"
                  step="any"
                  name="longitude"
                  id="editSiteLon"
                  className="form-control rounded-3"
                  value={editLon}
                  onChange={(e) => setEditLon(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-outline-secondary rounded-pill mb-3"
              onClick={() => handleUseCurrentLocation('edit')}
            >
              <i className="bi bi-crosshair me-1"></i> Use My Current Browser Location
            </button>

            <div className="mb-3">
              <label className="form-label small fw-semibold text-secondary">Geofence Radius (Meters)</label>
              <input
                type="number"
                name="geofence_radius_meters"
                id="editSiteRadius"
                className="form-control rounded-3"
                value={editRadius}
                onChange={(e) => setEditRadius(e.target.value)}
                required
              />
            </div>

            <div className="form-check form-switch p-3 bg-light rounded-3 border">
              <input
                className="form-check-input ms-0 me-2"
                type="checkbox"
                name="geofencing_enabled"
                id="editSiteGeoEnabled"
                checked={editGeoEnabled}
                onChange={(e) => setEditGeoEnabled(e.target.checked)}
              />
              <label className="form-check-label small fw-bold text-dark" htmlFor="editSiteGeoEnabled">
                Enforce Geofence Validation
              </label>
            </div>
          </div>
          <div className="modal-footer border-0 pt-0">
            <button
              type="button"
              className="btn btn-outline-secondary rounded-pill px-3"
              onClick={() => setShowEditModal(false)}
              disabled={editSiteMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary rounded-pill px-4 fw-semibold"
              disabled={editSiteMutation.isPending}
            >
              {editSiteMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
