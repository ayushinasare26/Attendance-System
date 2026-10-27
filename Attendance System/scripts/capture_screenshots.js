const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = path.join(__dirname, '..', '.gsd', 'screenshots', 'baseline');
fs.mkdirSync(outDir, { recursive: true });

const BASE_URL = 'http://127.0.0.1:5001';

const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 375, height: 667, isMobile: true, hasTouch: true }
];

async function capture(page, name) {
  for (const vp of viewports) {
    await page.setViewport(vp);
    await new Promise(r => setTimeout(r, 600)); // wait for layout/charts
    const filePath = path.join(outDir, `${name}_${vp.name}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`Saved screenshot: ${name}_${vp.name}.png`);
  }
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    // 1. Public / Login pages
    const page = await browser.newPage();
    
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await capture(page, 'login_root');

    await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle0' });
    await capture(page, 'admin_login');

    await page.goto(`${BASE_URL}/employee/login`, { waitUntil: 'networkidle0' });
    await capture(page, 'employee_login');

    // 2. Admin Portal
    console.log('[*] Logging into Admin Portal...');
    await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle0' });
    await page.type('input[name="username"]', 'admin');
    await page.type('input[name="password"]', 'admin123');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('button[type="submit"]')
    ]);

    const adminPages = [
      { name: 'admin_dashboard', url: '/admin/dashboard' },
      { name: 'admin_sites', url: '/admin/sites' },
      { name: 'admin_shifts', url: '/admin/shifts' },
      { name: 'admin_employees', url: '/admin/employees' },
      { name: 'admin_enroll', url: '/admin/enroll' },
      { name: 'admin_attendance', url: '/admin/attendance' },
      { name: 'admin_attendance_detail', url: '/admin/attendance/37' },
      { name: 'admin_flagged', url: '/admin/flagged' },
      { name: 'admin_reports', url: '/admin/payroll-export' },
      { name: 'admin_settings', url: '/admin/settings' },
      { name: 'admin_audit_logs', url: '/admin/audit-logs' }
    ];

    for (const p of adminPages) {
      await page.goto(`${BASE_URL}${p.url}`, { waitUntil: 'networkidle0' });
      await capture(page, p.name);
    }

    // 3. Manager Portal (New context)
    console.log('[*] Logging into Manager Portal...');
    const mgrContext = await browser.createBrowserContext();
    const mgrPage = await mgrContext.newPage();
    await mgrPage.goto(`${BASE_URL}/employee/login`, { waitUntil: 'networkidle0' });
    await mgrPage.$eval('input[name="identifier"]', el => el.value = '');
    await mgrPage.$eval('input[name="password"]', el => el.value = '');
    await mgrPage.type('input[name="identifier"]', 'vikram.sharma@enterprise.internal');
    await mgrPage.type('input[name="password"]', 'password123');
    await Promise.all([
      mgrPage.waitForNavigation({ waitUntil: 'networkidle0' }),
      mgrPage.click('button[type="submit"]')
    ]);

    const mgrPages = [
      { name: 'manager_dashboard', url: '/manager/dashboard' },
      { name: 'manager_attendance', url: '/manager/attendance' },
      { name: 'manager_correction_requests', url: '/manager/correction-requests' }
    ];

    for (const p of mgrPages) {
      await mgrPage.goto(`${BASE_URL}${p.url}`, { waitUntil: 'networkidle0' });
      await capture(mgrPage, p.name);
    }
    await mgrContext.close();

    // 4. Employee Portal (New context)
    console.log('[*] Logging into Employee Portal...');
    const empContext = await browser.createBrowserContext();
    const empPage = await empContext.newPage();
    await empPage.goto(`${BASE_URL}/employee/login`, { waitUntil: 'networkidle0' });
    await empPage.$eval('input[name="identifier"]', el => el.value = '');
    await empPage.$eval('input[name="password"]', el => el.value = '');
    await empPage.type('input[name="identifier"]', 'EMP-002');
    await empPage.type('input[name="password"]', 'password123');
    await Promise.all([
      empPage.waitForNavigation({ waitUntil: 'networkidle0' }),
      empPage.click('button[type="submit"]')
    ]);

    const empPages = [
      { name: 'employee_check_in_out', url: '/employee/check-in-out' },
      { name: 'employee_my_attendance', url: '/employee/my-attendance' }
    ];

    for (const p of empPages) {
      await empPage.goto(`${BASE_URL}${p.url}`, { waitUntil: 'networkidle0' });
      await capture(empPage, p.name);
    }
    await empContext.close();

    console.log('[SUCCESS] All baseline screenshots captured successfully!');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Error during screenshot capture:', err);
  process.exit(1);
});
