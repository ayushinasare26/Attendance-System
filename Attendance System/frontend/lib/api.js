/**
 * frontend/lib/api.js
 *
 * Same-origin API client with automatic Flask session cookie handling.
 * - Always includes `credentials: 'include'`
 * - Handles JSON serialization and FormData
 * - Intercepts 401/403 responses and triggers client-side redirect to login
 */

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request(endpoint, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    ...customConfig
  } = options;

  // Prefix with /api/v1 if not already prefixed and not a media path
  let url = endpoint;
  if (!url.startsWith('/api/v1') && !url.startsWith('/attendance_photos') && !url.startsWith('/student_image') && !url.startsWith('/employee_image')) {
    url = `/api/v1${url.startsWith('/') ? '' : '/'}${url}`;
  }

  const config = {
    method,
    credentials: 'include', // Guarantees Flask session cookies are sent
    headers: { ...headers },
    ...customConfig,
  };

  if (body) {
    if (body instanceof FormData) {
      // Browser automatically sets Content-Type to multipart/form-data with boundary
      config.body = body;
    } else if (typeof body === 'object') {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(body);
    } else {
      config.body = body;
    }
  }

  const response = await fetch(url, config);

  // Check if content-type is JSON
  const contentType = response.headers.get('content-type') || '';
  let data = null;

  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }
  } else if (contentType.includes('text/csv')) {
    // Return blob for CSV downloads
    return await response.blob();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg = (data && (data.error || data.message)) || `Request failed with status ${response.status}`;
    const redirectUrl = data && data.redirect;

    // Dispatch global auth event if 401 / 403 occurs
    if (typeof window !== 'undefined' && (response.status === 401 || response.status === 403)) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized', {
        detail: { status: response.status, redirect: redirectUrl, message: errorMsg }
      }));
    }

    throw new ApiError(errorMsg, response.status, data);
  }

  return data;
}

export const api = {
  get: (url, options) => request(url, { ...options, method: 'GET' }),
  post: (url, body, options) => request(url, { ...options, method: 'POST', body }),
  patch: (url, body, options) => request(url, { ...options, method: 'PATCH', body }),
  put: (url, body, options) => request(url, { ...options, method: 'PUT', body }),
  delete: (url, options) => request(url, { ...options, method: 'DELETE' }),
};

export default api;
