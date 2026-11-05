// @ts-check
const { test, expect } = require('@playwright/test');

// Side Quest passive scanning (K1). The event config's `sidequest` block turns
// it on; without it the kiosk flow must stay exactly as before. Scanning is
// optional: tap, gesture and shutter start the countdown just like any event.

const FAKE_SERVER = 'http://fake-server.test';

const BASE_EVENT_CONFIG = {
  event_id: 'test-event',
  event_name: 'Test Event',
  templates: [
    {
      file: 'templates/template-1.png',
      width: 400,
      height: 711,
      slots: [{ x: 10, y: 10 }],
    },
  ],
  capture: { totalShots: 1, photoWidth: 400, photoHeight: 130 },
  countdown: { seconds: 1, stepMs: 100 },
  gestureTrigger: { enabled: false },
};

const SIDEQUEST_ON = { sidequest: { enabled: true, require_screen_approval: true } };

/**
 * Mocks config, event config, save, and (optionally) the Side Quest start call.
 * Returns the captured /api/save and /api/sidequest/start requests.
 */
async function setupMocks(page, { eventConfig, start, saveBody = { ok: true } }) {
  const calls = { save: [], start: [] };

  await page.route('**/sw.js', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('**/config.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ serverUrl: FAKE_SERVER }),
    })
  );
  await page.route('**/config.dev.json', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route(`${FAKE_SERVER}/api/event/test-event/config`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(eventConfig),
    })
  );
  await page.route(`${FAKE_SERVER}/api/save`, (route) => {
    calls.save.push(route.request().postDataBuffer()?.toString('latin1') ?? '');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(saveBody),
    });
  });
  await page.route(`${FAKE_SERVER}/api/sidequest/start`, (route) => {
    // CORS preflight for the JSON POST
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
      });
    }
    calls.start.push(route.request().postDataJSON());
    return start ? start(route) : route.abort();
  });

  return calls;
}

// Load the booth and wait for the live camera with the instructions dismissed
async function openBooth(page) {
  await page.goto('/?event=test-event&key=kiosk-key');
  await page.waitForFunction(
    () => document.querySelector('#instruction-overlay')?.classList.contains('visible'),
    { timeout: 8000 }
  );
  await page.click('#instruction-close-btn');
  await page.waitForFunction(
    () => !document.querySelector('#press-hint')?.classList.contains('hidden'),
    { timeout: 12000 }
  );
}

async function waitForCountdown(page) {
  await page.waitForFunction(
    () => document.querySelector('#countdown-overlay')?.classList.contains('show'),
    { timeout: 3000 }
  );
}

// Stands in for jsQR: reports whatever window.__qr holds (null: no code in view)
async function fakeQr(page, payload = null) {
  await page.addInitScript((data) => {
    window.__qr = data;
    window.__qrCalls = 0;
    window.jsQR = () => {
      window.__qrCalls++;
      return window.__qr ? { data: window.__qr } : null;
    };
  }, payload);
}

function jsonReply(body) {
  return (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(body),
    });
}

const SQ_EVENT = { ...BASE_EVENT_CONFIG, ...SIDEQUEST_ON };
const HINT = 'Got a Side Quest code? Show it to the camera for points.';
const SUCCESS = "You're in! Points after your photos.";

test('flag off: no scanning, no Side Quest UI, decoder never loaded', async ({ page }) => {
  const jsqrRequests = [];
  page.on('request', (r) => r.url().includes('jsQR') && jsqrRequests.push(r.url()));
  const calls = await setupMocks(page, { eventConfig: BASE_EVENT_CONFIG });
  await openBooth(page);

  await expect(page.locator('#sq-hint')).toBeHidden();
  await page.click('#idle-screen');
  await waitForCountdown(page);
  await expect(page.locator('#result-screen')).toHaveClass(/\bactive\b/, { timeout: 10000 });
  await expect(page.locator('#upload-status')).toHaveText('Ready! Scan to view.');
  await expect(page.locator('#sq-points')).toBeHidden();
  await expect(page.locator('#sq-toast')).toBeHidden();
  await expect(page.locator('#sq-badge')).toBeHidden();
  expect(calls.start).toHaveLength(0);
  expect(jsqrRequests).toHaveLength(0);
  expect(await page.evaluate(() => typeof window.jsQR)).toBe('undefined');
  await expect.poll(() => calls.save.length).toBeGreaterThan(0);
  expect(calls.save[0]).not.toContain('name="sidequestTicket"');
});

test('flag on: hint while scanning, tap goes straight to the countdown without a ticket', async ({
  page,
}) => {
  await fakeQr(page);
  const calls = await setupMocks(page, { eventConfig: SQ_EVENT });
  await openBooth(page);

  await expect(page.locator('#sq-hint')).toBeVisible();
  await expect(page.locator('#sq-hint')).toHaveText(HINT);
  await expect.poll(() => page.evaluate(() => window.__qrCalls)).toBeGreaterThan(1);
  await expect(page.locator('#sq-scan')).toHaveCount(0);

  await page.click('#idle-screen');
  await waitForCountdown(page);
  await expect(page.locator('#sq-hint')).toBeHidden();
  // Decoding stops with the first countdown
  const decodes = await page.evaluate(() => window.__qrCalls);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__qrCalls)).toBe(decodes);

  await expect(page.locator('#result-screen')).toHaveClass(/\bactive\b/, { timeout: 10000 });
  await expect(page.locator('#sq-points')).toBeHidden();
  expect(calls.start).toHaveLength(0);
  await expect.poll(() => calls.save.length).toBeGreaterThan(0);
  expect(calls.save[0]).not.toContain('name="sidequestTicket"');
});

test('flag on: a scanned code gets a ticket once, shows toast and badge, the save carries it', async ({
  page,
}) => {
  await fakeQr(page);
  const calls = await setupMocks(page, {
    eventConfig: SQ_EVENT,
    start: jsonReply({ ok: true, ticket: 'opaque-ticket', expires_in: 600 }),
    saveBody: { ok: true, sidequest: 'done' },
  });
  await openBooth(page);

  await page.evaluate(() => (window.__qr = 'SQ1.test-code'));
  await expect.poll(() => calls.start.length).toBe(1);
  expect(calls.start[0]).toEqual({
    eventId: 'test-event',
    kioskKey: 'kiosk-key',
    code: 'SQ1.test-code',
  });
  await expect(page.locator('#sq-toast')).toHaveText(SUCCESS);
  await expect(page.locator('#sq-badge')).toBeVisible();
  await expect(page.locator('#sq-badge')).toHaveText('Side Quest points on');
  await expect(page.locator('#sq-hint')).toBeHidden();
  // The code stays in view, but a held ticket stops scanning: no second call
  await page.waitForTimeout(800);
  expect(calls.start).toHaveLength(1);

  await page.click('#idle-screen');
  await waitForCountdown(page);
  await expect(page.locator('#sq-badge')).toBeVisible();
  await expect(page.locator('#result-screen')).toHaveClass(/\bactive\b/, { timeout: 10000 });
  await expect(page.locator('#sq-points')).toHaveText('Points added');
  await expect.poll(() => calls.save.length).toBeGreaterThan(0);
  expect(calls.save[0]).toContain('name="sidequestTicket"');
  expect(calls.save[0]).toContain('opaque-ticket');

  // Start over clears the ticket, badge and points line, and scanning resumes
  await page.evaluate(() => (window.__qr = null));
  await page.click('#back-btn');
  await expect(page.locator('#sq-points')).toBeHidden();
  await expect(page.locator('#sq-badge')).toBeHidden();
  await expect(page.locator('#sq-hint')).toBeVisible();
  expect(await page.evaluate(() => sqTicket)).toBeNull();
});

test('flag on: a refusal shows a toast, is not retried, and photos still work', async ({
  page,
}) => {
  await fakeQr(page, 'SQ1.old-code');
  const calls = await setupMocks(page, {
    eventConfig: SQ_EVENT,
    start: jsonReply({ ok: false, code: 'CODE_EXPIRED' }),
  });
  await openBooth(page);

  await expect.poll(() => calls.start.length).toBe(1);
  await expect(page.locator('#sq-toast')).toHaveText('That code expired. Show it again.');
  await expect(page.locator('#sq-badge')).toBeHidden();
  await expect(page.locator('#sq-hint')).toBeVisible();
  await expect(page.locator('#sq-toast')).toBeHidden({ timeout: 6000 });
  expect(calls.start).toHaveLength(1);

  await page.click('#idle-screen');
  await waitForCountdown(page);
  await expect(page.locator('#result-screen')).toHaveClass(/\bactive\b/, { timeout: 10000 });
  await expect.poll(() => calls.save.length).toBeGreaterThan(0);
  expect(calls.save[0]).not.toContain('name="sidequestTicket"');
});

test('flag on: other QR codes are ignored silently', async ({ page }) => {
  await fakeQr(page, 'https://example.com/menu');
  const calls = await setupMocks(page, { eventConfig: SQ_EVENT });
  await openBooth(page);

  await expect.poll(() => page.evaluate(() => window.__qrCalls)).toBeGreaterThan(3);
  expect(calls.start).toHaveLength(0);
  await expect(page.locator('#sq-toast')).toBeHidden();
  await expect(page.locator('#sq-hint')).toBeVisible();
});

test('flag on: offline retries the same code after a cooldown; BAD_KIOSK_KEY logs only the code', async ({
  page,
}) => {
  await fakeQr(page, 'SQ1.secret-payload');
  const warnings = [];
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  let reply = (route) => route.abort();
  const calls = await setupMocks(page, { eventConfig: SQ_EVENT, start: (route) => reply(route) });
  await openBooth(page);

  await expect.poll(() => calls.start.length).toBe(1);
  await expect(page.locator('#sq-toast')).toHaveText(
    'Points are offline. You can still take photos!'
  );
  // Not hammered while the code stays in view
  await page.waitForTimeout(1500);
  expect(calls.start).toHaveLength(1);

  reply = (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: false, code: 'BAD_KIOSK_KEY' }),
    });
  await expect.poll(() => calls.start.length, { timeout: 8000 }).toBe(2);
  await expect.poll(() => warnings).toContain('sidequest start refused: BAD_KIOSK_KEY');
  await expect(page.locator('#sq-toast')).toHaveText(
    'Points are offline. You can still take photos!'
  );
  expect(warnings.join(' ')).not.toContain('secret-payload');
});

test('flag on: a ticket that lands mid-countdown still rides with the upload', async ({ page }) => {
  await fakeQr(page);
  let release;
  const held = new Promise((r) => (release = r));
  const calls = await setupMocks(page, {
    eventConfig: SQ_EVENT,
    start: async (route) => {
      await held;
      return jsonReply({ ok: true, ticket: 'late-ticket', expires_in: 600 })(route);
    },
  });
  await openBooth(page);

  await page.evaluate(() => (window.__qr = 'SQ1.slow'));
  await expect.poll(() => calls.start.length).toBe(1);
  await page.click('#idle-screen');
  await waitForCountdown(page);
  release();

  await expect(page.locator('#sq-badge')).toBeVisible();
  await expect(page.locator('#result-screen')).toHaveClass(/\bactive\b/, { timeout: 10000 });
  await expect.poll(() => calls.save.length).toBeGreaterThan(0);
  expect(calls.save[0]).toContain('late-ticket');
});

test('flag on: reset abandons a start call in flight', async ({ page }) => {
  await fakeQr(page);
  let release;
  const held = new Promise((r) => (release = r));
  const calls = await setupMocks(page, {
    eventConfig: SQ_EVENT,
    start: async (route) => {
      await held;
      return jsonReply({ ok: true, ticket: 'stale-ticket', expires_in: 600 })(route).catch(
        () => {}
      );
    },
  });
  await openBooth(page);

  await page.evaluate(() => (window.__qr = 'SQ1.slow'));
  await expect.poll(() => calls.start.length).toBe(1);
  // Start over's handler, the same one the result screen's auto-reset uses
  await page.evaluate(() => {
    window.__qr = null;
    document.querySelector('#back-btn').click();
  });
  release();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => sqTicket)).toBeNull();
  await expect(page.locator('#sq-badge')).toBeHidden();
  await expect(page.locator('#sq-hint')).toBeVisible();
});
