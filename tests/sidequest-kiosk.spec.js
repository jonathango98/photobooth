// @ts-check
const { test, expect } = require('@playwright/test');

// Side Quest scan step (K1). The event config's `sidequest` block turns it on;
// without it the kiosk flow must stay exactly as before.

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

// Dismiss the instructions and wait for the live camera, then tap to start
async function tapStart(page) {
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
  await page.click('#idle-screen');
}

// Stands in for jsQR: reports `payload` as soon as the decoder runs
async function fakeQrPayload(page, payload) {
  await page.addInitScript((data) => {
    window.jsQR = () => ({ data });
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

test('flag off: tap goes straight to the countdown, no scan step', async ({ page }) => {
  const calls = await setupMocks(page, { eventConfig: BASE_EVENT_CONFIG });
  await tapStart(page);

  await page.waitForFunction(
    () => document.querySelector('#countdown-overlay')?.classList.contains('show'),
    { timeout: 3000 }
  );
  await expect(page.locator('#sq-scan')).toBeHidden();
  await expect(page.locator('#result-screen')).toHaveClass(/\bactive\b/, { timeout: 10000 });
  await expect(page.locator('#upload-status')).toHaveText('Ready! Scan to view.');
  await expect(page.locator('#sq-points')).toBeHidden();
  expect(calls.start).toHaveLength(0);
  await expect.poll(() => calls.save.length).toBeGreaterThan(0);
  expect(calls.save[0]).not.toContain('name="sidequestTicket"');
});

test('flag on: tap shows the scan step, Skip goes to the countdown', async ({ page }) => {
  const calls = await setupMocks(page, { eventConfig: { ...BASE_EVENT_CONFIG, ...SIDEQUEST_ON } });
  await tapStart(page);

  await expect(page.locator('#sq-scan')).toBeVisible();
  await expect(page.locator('#sq-skip-btn')).toHaveText('Skip (no points)');
  // No countdown until the guest scans or skips
  await page.waitForTimeout(500);
  await expect(page.locator('#countdown-overlay')).not.toHaveClass(/\bshow\b/);

  await page.click('#sq-skip-btn');
  await expect(page.locator('#sq-scan')).toBeHidden();
  await page.waitForFunction(
    () => document.querySelector('#countdown-overlay')?.classList.contains('show'),
    { timeout: 3000 }
  );
  await expect(page.locator('#result-screen')).toHaveClass(/\bactive\b/, { timeout: 10000 });
  expect(calls.start).toHaveLength(0);
  await expect.poll(() => calls.save.length).toBeGreaterThan(0);
  expect(calls.save[0]).not.toContain('name="sidequestTicket"');
});

test('flag on: a scanned code gets a ticket, the save carries it, points show', async ({
  page,
}) => {
  await fakeQrPayload(page, 'SQ1.test-code');
  const calls = await setupMocks(page, {
    eventConfig: { ...BASE_EVENT_CONFIG, ...SIDEQUEST_ON },
    start: jsonReply({ ok: true, ticket: 'opaque-ticket', expires_in: 600 }),
    saveBody: { ok: true, sidequest: 'done' },
  });
  await tapStart(page);

  await expect(page.locator('#sq-scan-msg')).toHaveText("You're in! Points after your photos.");
  await expect(page.locator('#result-screen')).toHaveClass(/\bactive\b/, { timeout: 10000 });
  await expect(page.locator('#sq-points')).toHaveText('Points added');

  expect(calls.start[0]).toEqual({
    eventId: 'test-event',
    kioskKey: 'kiosk-key',
    code: 'SQ1.test-code',
  });
  await expect.poll(() => calls.save.length).toBeGreaterThan(0);
  expect(calls.save[0]).toContain('name="sidequestTicket"');
  expect(calls.save[0]).toContain('opaque-ticket');

  // Start over clears the ticket and the points line
  await page.click('#back-btn');
  await expect(page.locator('#sq-points')).toBeHidden();
  expect(await page.evaluate(() => sqTicket)).toBeNull();
});

test('flag on: a refusal offers Try again and Take photos anyway', async ({ page }) => {
  await fakeQrPayload(page, 'SQ1.old-code');
  const calls = await setupMocks(page, {
    eventConfig: { ...BASE_EVENT_CONFIG, ...SIDEQUEST_ON },
    start: jsonReply({ ok: false, code: 'CODE_EXPIRED' }),
  });
  await tapStart(page);

  await expect(page.locator('#sq-scan-msg')).toHaveText('That code expired. Show it again.');
  await expect(page.locator('#sq-retry-btn')).toBeVisible();
  await expect(page.locator('#sq-skip-btn')).toHaveText('Take photos anyway');

  await page.click('#sq-skip-btn');
  await expect(page.locator('#result-screen')).toHaveClass(/\bactive\b/, { timeout: 10000 });
  expect(calls.start).toHaveLength(1);
  await expect.poll(() => calls.save.length).toBeGreaterThan(0);
  expect(calls.save[0]).not.toContain('name="sidequestTicket"');
});

test('flag on: BAD_KIOSK_KEY reads as offline and logs only the code', async ({ page }) => {
  await fakeQrPayload(page, 'SQ1.secret-payload');
  const warnings = [];
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  await setupMocks(page, {
    eventConfig: { ...BASE_EVENT_CONFIG, ...SIDEQUEST_ON },
    start: (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ok: false, code: 'BAD_KIOSK_KEY' }),
      }),
  });
  await tapStart(page);

  await expect(page.locator('#sq-scan-msg')).toHaveText(
    'Points are offline. You can still take photos!'
  );
  expect(warnings).toContain('sidequest start refused: BAD_KIOSK_KEY');
  expect(warnings.join(' ')).not.toContain('secret-payload');
});

test('flag on: an unreachable Side Quest reads as offline; LIMIT_REACHED has no retry', async ({
  page,
}) => {
  await fakeQrPayload(page, 'SQ1.any');
  let reply = (route) => route.abort();
  await setupMocks(page, {
    eventConfig: { ...BASE_EVENT_CONFIG, ...SIDEQUEST_ON },
    start: (route) => reply(route),
  });
  await tapStart(page);

  await expect(page.locator('#sq-scan-msg')).toHaveText(
    'Points are offline. You can still take photos!'
  );
  await expect(page.locator('#sq-retry-btn')).toBeVisible();

  reply = jsonReply({ ok: false, code: 'LIMIT_REACHED' });
  await page.click('#sq-retry-btn');
  await expect(page.locator('#sq-scan-msg')).toHaveText(
    "That's all the photobooth points for today. You can still take photos!"
  );
  await expect(page.locator('#sq-retry-btn')).toBeHidden();
  await expect(page.locator('#sq-skip-btn')).toHaveText('Take photos anyway');
});

test('flag on: an idle scan step returns to the start screen', async ({ page }) => {
  await setupMocks(page, { eventConfig: { ...BASE_EVENT_CONFIG, ...SIDEQUEST_ON } });
  // Later routes win: a 1 s auto-reset for this test
  await page.route('**/config.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ serverUrl: FAKE_SERVER, autoResetSeconds: 1 }),
    })
  );
  await tapStart(page);

  await expect(page.locator('#sq-scan')).toBeVisible();
  await expect(page.locator('#sq-scan')).toBeHidden({ timeout: 4000 });
  await expect(page.locator('#instruction-overlay')).toHaveClass(/\bvisible\b/);
  await expect(page.locator('#countdown-overlay')).not.toHaveClass(/\bshow\b/);
});
