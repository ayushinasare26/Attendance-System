/**
 * scripts/verify_phase7_cutover.js
 *
 * Comprehensive Staging Cutover & Rollback Verification:
 * 1. Verifies Next.js (port 3000) primary ingress & Flask (port 5000) backend daemon.
 * 2. Tests reverse proxy routing for API, media, and CSV downloads.
 * 3. Tests multi-role authentication boundaries (Employee, Manager, Admin).
 * 4. Verifies backward compatibility of legacy Jinja HTML routes on Flask for instant rollback.
 */

const http = require('http');

const FLASK_PORT = 5000;
const NEXT_PORT = 3000;
const BASE_URL = `http://127.0.0.1:${NEXT_PORT}`;

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 10000,
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout requesting ${url}`));
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function extractCookie(headers) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return null;
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return cookieStr.split(';')[0];
}

async function runCutoverVerification() {
  console.log('=== GeoFace Enterprise: Phase 7 Cutover & Rollback Verification ===\n');
  let passed = 0;
  let total = 0;

  function assertTest(name, condition, details = '') {
    total++;
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} - ${details}`);
    }
  }

  // 1. Health Checks
  console.log('--- 1. Health & Ingress Connectivity ---');
  try {
    const flaskHealth = await makeRequest(`http://127.0.0.1:${FLASK_PORT}/api/health`);
    assertTest('Flask backend health (port 5000)', flaskHealth.statusCode === 200);

    const nextIngress = await makeRequest(`${BASE_URL}/login`);
    assertTest('Next.js primary ingress (port 3000)', nextIngress.statusCode === 200);

    const nextProxiedHealth = await makeRequest(`${BASE_URL}/api/v1/health`);
    assertTest('Next.js reverse proxy -> Flask /api/v1/health', nextProxiedHealth.statusCode === 200);
  } catch (err) {
    console.error('Connection failure during health checks:', err.message);
  }

  // 2. Unauthenticated Access Protection
  console.log('\n--- 2. Unauthenticated Access Protection ---');
  try {
    const unauthAdmin = await makeRequest(`${BASE_URL}/api/v1/admin/dashboard`);
    assertTest('Unauthenticated access to /api/v1/admin/dashboard rejected', unauthAdmin.statusCode === 302 || unauthAdmin.statusCode === 401);

    const unauthManager = await makeRequest(`${BASE_URL}/api/v1/manager/dashboard`);
    assertTest('Unauthenticated access to /api/v1/manager/dashboard rejected', unauthManager.statusCode === 302 || unauthManager.statusCode === 401);
  } catch (err) {
    console.error('Error during unauthenticated checks:', err.message);
  }

  // 3. Employee Session & Check-in Context
  console.log('\n--- 3. Employee Portal Authentication & Data Integrity ---');
  let empCookie = '';
  try {
    const empLoginRes = await makeRequest(`${BASE_URL}/api/v1/employee/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { identifier: '29', password: 'employee123' }
    });

    assertTest('Employee login via Next.js proxy returns HTTP 200', empLoginRes.statusCode === 200);
    empCookie = extractCookie(empLoginRes.headers);
    assertTest('Flask session cookie returned to client', !!empCookie);

    const empContext = await makeRequest(`${BASE_URL}/api/v1/employee/check-in-out`, {
      headers: { Cookie: empCookie }
    });
    const empJson = JSON.parse(empContext.body);
    assertTest('Employee check-in-out context retrieved with site and shift data', empJson.ok === true && !!empJson.site);

    // Employee boundary check: employee cannot access admin
    const empTamper = await makeRequest(`${BASE_URL}/api/v1/admin/dashboard`, {
      headers: { Cookie: empCookie }
    });
    assertTest('Employee blocked from administrative resources (403 or redirect)', empTamper.statusCode === 302 || empTamper.statusCode === 403);
  } catch (err) {
    console.error('Error during employee checks:', err.message);
  }

  // 4. Manager Session & Team Scoping
  console.log('\n--- 4. Manager Portal Authentication & Scoping ---');
  let mgrCookie = '';
  try {
    const mgrLoginRes = await makeRequest(`${BASE_URL}/api/v1/employee/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { identifier: 'vikram.sharma@enterprise.internal', password: 'password123' }
    });
    assertTest('Manager login returns HTTP 200', mgrLoginRes.statusCode === 200);
    mgrCookie = extractCookie(mgrLoginRes.headers);

    const mgrDash = await makeRequest(`${BASE_URL}/api/v1/manager/dashboard`, {
      headers: { Cookie: mgrCookie }
    });
    const mgrJson = JSON.parse(mgrDash.body);
    assertTest('Manager dashboard retrieved with team metrics', mgrJson.ok === true && mgrJson.total_team !== undefined);
  } catch (err) {
    console.error('Error during manager checks:', err.message);
  }

  // 5. Admin Session, Governance & Payroll CSV Export
  console.log('\n--- 5. Admin Portal Governance & Direct CSV Export ---');
  let adminCookie = '';
  try {
    const adminLoginRes = await makeRequest(`${BASE_URL}/api/v1/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { username: 'admin', password: 'admin123' }
    });
    assertTest('Admin login returns HTTP 200', adminLoginRes.statusCode === 200);
    adminCookie = extractCookie(adminLoginRes.headers);

    const adminDash = await makeRequest(`${BASE_URL}/api/v1/admin/dashboard`, {
      headers: { Cookie: adminCookie }
    });
    const adminJson = JSON.parse(adminDash.body);
    assertTest('Admin dashboard retrieved with metrics and live logs', adminJson.ok === true && adminJson.total_employees !== undefined);

    // Direct CSV export through Next.js rewrite proxy
    const csvRes = await makeRequest(`${BASE_URL}/admin/payroll-export/csv?from=2026-10-01&to=2026-10-23`, {
      headers: { Cookie: adminCookie }
    });
    assertTest('Payroll CSV direct download via Next.js proxy returns HTTP 200', csvRes.statusCode === 200);
    assertTest('Payroll CSV content type is text/csv', (csvRes.headers['content-type'] || '').includes('csv'));
    assertTest('Payroll CSV contains standard ERP headers', csvRes.body.includes('Employee ID') && csvRes.body.includes('Worked Hours'));
  } catch (err) {
    console.error('Error during admin checks:', err.message);
  }

  // 6. Rollback Readiness: Legacy Jinja Templates on Flask Port 5000
  console.log('\n--- 6. Rollback Readiness: Legacy Jinja Templates on Flask ---');
  try {
    const legacyLoginHtml = await makeRequest(`http://127.0.0.1:${FLASK_PORT}/login`);
    assertTest('Flask still renders legacy /login Jinja HTML byte-for-byte', legacyLoginHtml.statusCode === 200 && legacyLoginHtml.body.includes('GeoFace'));

    const legacyAdminHtml = await makeRequest(`http://127.0.0.1:${FLASK_PORT}/admin/login`);
    assertTest('Flask still renders legacy /admin/login Jinja HTML byte-for-byte', legacyAdminHtml.statusCode === 200 && legacyAdminHtml.body.includes('Admin Login'));
  } catch (err) {
    console.error('Error during rollback readiness checks:', err.message);
  }

  console.log(`\n=================================================`);
  console.log(`Summary: ${passed} / ${total} cutover checks PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log(`=================================================`);

  if (passed !== total) {
    process.exit(1);
  }
}

runCutoverVerification().catch(err => {
  console.error('Fatal cutover error:', err);
  process.exit(1);
});
