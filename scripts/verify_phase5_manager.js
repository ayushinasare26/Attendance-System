const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = path.join(__dirname, '..', '.gsd', 'screenshots', 'nextjs');
fs.mkdirSync(outDir, { recursive: true });

const FLASK_PORT = 5000;
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

function checkPort(port, path = '/') {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path, timeout: 1000 }, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function waitForServer(port, path, maxSeconds = 30) {
  for (let i = 0; i < maxSeconds; i++) {
    if (await checkPort(port, path)) return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  console.log('=== Starting Phase 5 Manager Verification & Screenshot Capture ===');

  let flaskProc = null;
  let nextProc = null;

  const isFlaskUp = await checkPort(FLASK_PORT, '/api/health');
  if (!isFlaskUp) {
    console.log(`Starting Flask backend on port ${FLASK_PORT}...`);
    flaskProc = spawn('python', ['-c', `
from app import app
app.run(host='127.0.0.1', port=${FLASK_PORT}, debug=False)
    `], { stdio: 'ignore' });
    const ok = await waitForServer(FLASK_PORT, '/api/health', 20);
    if (!ok) throw new Error('Flask failed to start');
  } else {
    console.log(`Flask backend already running on port ${FLASK_PORT}.`);
  }

  const isNextUp = await checkPort(NEXT_PORT, '/login');
  if (!isNextUp) {
    console.log(`Starting Next.js on port ${NEXT_PORT}...`);
    nextProc = spawn('npx.cmd', ['next', 'start', '-p', String(NEXT_PORT)], {
      cwd: path.join(__dirname, '..', 'frontend'),
      stdio: 'ignore',
      shell: true,
      env: { ...process.env, PORT: String(NEXT_PORT), FLASK_API_URL: `http://127.0.0.1:${FLASK_PORT}` }
    });
    const ok = await waitForServer(NEXT_PORT, '/login', 25);
    if (!ok) throw new Error('Next.js failed to start');
  } else {
    console.log(`Next.js already running on port ${NEXT_PORT}.`);
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err));

    // 1. Manager Login
    console.log('[*] Navigating to /employee/login...');
    await page.goto(`${BASE_URL}/employee/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 600));

    console.log('[*] Logging into Manager Portal (Vikram Sharma)...');
    await page.click('input[name="identifier"]');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.type('vikram.sharma@enterprise.internal');

    await page.click('input[name="password"]');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.type('password123');

    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000));
    console.log(`[*] Logged in. Current URL: ${page.url()}`);

    // 2. Manager Dashboard Screen
    console.log('[*] Navigating to /manager/dashboard...');
    await page.goto(`${BASE_URL}/manager/dashboard`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1200));
    await capture(page, 'manager_dashboard');

    // 3. Manager Team Attendance Screen
    console.log('[*] Navigating to /manager/attendance...');
    await page.goto(`${BASE_URL}/manager/attendance`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1200));
    await capture(page, 'manager_attendance');

    // 4. Manager Correction Queue Screen
    console.log('[*] Navigating to /manager/correction-requests...');
    await page.goto(`${BASE_URL}/manager/correction-requests`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1200));
    await capture(page, 'manager_correction_requests');

    console.log('\n[SUCCESS] Phase 5 Manager screenshots captured successfully!');
  } finally {
    await browser.close();
    if (nextProc) {
      console.log('Shutting down Next.js process...');
      nextProc.kill();
    }
    if (flaskProc) {
      console.log('Shutting down Flask process...');
      flaskProc.kill();
    }
  }
}

main().catch(err => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
