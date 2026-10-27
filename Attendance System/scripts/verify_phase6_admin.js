const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const http = require('http');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = path.join(__dirname, '..', '.gsd', 'screenshots', 'nextjs');
fs.mkdirSync(outDir, { recursive: true });

const NEXT_PORT = 3000;
const BASE_URL = `http://127.0.0.1:${NEXT_PORT}`;

const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 375, height: 667, isMobile: true, hasTouch: true }
];

async function capture(page, name) {
  for (const vp of viewports) {
    await page.setViewport(vp);
    await new Promise(r => setTimeout(r, 800)); // wait for layout/render
    const filePath = path.join(outDir, `${name}_${vp.name}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`Saved screenshot: ${name}_${vp.name}.png`);
  }
}

async function main() {
  console.log('=== Starting Phase 6 Admin Verification & Screenshot Capture ===');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err));

    // 1. Admin Login
    console.log('[*] Navigating to /admin/login...');
    await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 600));

    console.log('[*] Logging into Admin Portal (admin / admin123)...');
    await page.click('input[name="username"]');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.type('admin');

    await page.click('input[name="password"]');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.type('admin123');

    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1200));
    console.log(`[*] Logged in. Current URL: ${page.url()}`);

    // Determine an existing attendance record ID for detail view
    let detailId = '37';
    try {
      const res = await page.evaluate(async () => {
        const resp = await fetch('/api/v1/admin/attendance');
        const json = await resp.json();
        return json.records && json.records[0] ? json.records[0].id : 37;
      });
      detailId = String(res);
      console.log(`[*] Using attendance detail ID: ${detailId}`);
    } catch (e) {
      console.log(`[*] Defaulting to detail ID: 37`);
    }

    const adminPages = [
      { name: 'admin_dashboard', url: '/admin/dashboard' },
      { name: 'admin_sites', url: '/admin/sites' },
      { name: 'admin_shifts', url: '/admin/shifts' },
      { name: 'admin_employees', url: '/admin/employees' },
      { name: 'admin_enroll', url: '/admin/enroll' },
      { name: 'admin_attendance', url: '/admin/attendance' },
      { name: 'admin_attendance_detail', url: `/admin/attendance/${detailId}` },
      { name: 'admin_flagged', url: '/admin/flagged' },
      { name: 'admin_reports', url: '/admin/payroll-export' },
      { name: 'admin_settings', url: '/admin/settings' },
      { name: 'admin_audit_logs', url: '/admin/audit-logs' }
    ];

    for (const p of adminPages) {
      console.log(`[*] Navigating to ${p.url}...`);
      await page.goto(`${BASE_URL}${p.url}`, { waitUntil: 'domcontentloaded' });
      // Allow time for React Query and Chart.js to render
      await new Promise(r => setTimeout(r, 1500));
      await capture(page, p.name);
    }

    console.log('\n[SUCCESS] Phase 6 Admin screenshots (11 pages x 2 viewports = 22 screenshots) captured successfully!');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error during admin verification:', err);
  process.exit(1);
});
