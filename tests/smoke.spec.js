// @ts-check
const { test, expect } = require('@playwright/test');

// ---------------------------------------------------------------------------
// Shared mock helpers
// ---------------------------------------------------------------------------

// Fake origin — all event-config and upload API calls are redirected here
const FAKE_SERVER = 'http://fake-server.test';

/**
 * Minimal event config: 1 shot, fast countdown, no gesture detection.
 * Single template so the app skips template selection and goes straight to
 * the result screen after the shot.
 */
const MOCK_EVENT_CONFIG = {
  event_id: 'test-event',
  event_name: 'Test Event',
  templates: [
    {
      file: 'templates/template-1.png',
      width: 400,
      height: 711,
      slots: [
        { x: 10, y: 10 },
        { x: 10, y: 150 },
        { x: 10, y: 300 },
      ],
    },
  ],
  capture: { totalShots: 1, photoWidth: 400, photoHeight: 130 },
  // 1-second countdown with 100 ms ticks → fires after ~100 ms
  countdown: { seconds: 1, stepMs: 100 },
  gestureTrigger: { enabled: false },
};

/**
 * Playwright's bundled Chromium UA stylesheet does not carry `!important` on
 * `[hidden] { display: none }`, so the site's `.screen { display: flex }` and
 * `.landing-screen { display: flex }` rules win and the HTML hidden attribute
 * has no visual effect.  Injecting this style tag after navigation restores the
 * expected behaviour without touching the app source.
 */
async function fixHiddenAttribute(page) {
  await page.addStyleTag({ content: '[hidden] { display: none !important; }' });
}

/**
 * Set up all page-level route intercepts needed for kiosk smoke tests.
 *
 * - sw.js          → 404  (prevents the SW from intercepting requests before
 *                          our mocks are in place, which would make routes flaky)
 * - config.json    → points serverUrl at FAKE_SERVER
 * - config.dev.json→ 404  (no dev overrides in test)
 * - event-config   → MOCK_EVENT_CONFIG
 * - /api/save      → 200  (upload succeeds silently)
 */
async function setupKioskMocks(page) {
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
      body: JSON.stringify(MOCK_EVENT_CONFIG),
    })
  );

  await page.route(`${FAKE_SERVER}/api/save`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('landing page is shown when no ?event= param is present', async ({ page }) => {
  // No kiosk mocks needed — the app short-circuits before fetching config.json
  await page.route('**/sw.js', (route) => route.fulfill({ status: 404, body: '' }));

  await page.goto('/');
  await fixHiddenAttribute(page);

  // Landing section should be visible
  await expect(page.locator('#landing-screen')).toBeVisible({ timeout: 5000 });

  // Kiosk idle screen must not be active (showMissingEventId removes .active)
  await expect(page.locator('#idle-screen')).not.toHaveClass(/\bactive\b/, { timeout: 5000 });
});

test('kiosk boots with ?event= param — idle screen active, no error overlay', async ({ page }) => {
  await setupKioskMocks(page);
  await page.goto('/?event=test-event');
  await fixHiddenAttribute(page);

  // Idle screen should be active (CONFIG loaded, no fatal error)
  await expect(page.locator('#idle-screen')).toHaveClass(/\bactive\b/, { timeout: 8000 });

  // Error overlay must NOT be visible
  await expect(page.locator('#error-overlay')).not.toHaveClass(/\bvisible\b/);
});

test('capture flow: tap idle screen → countdown → result screen appears', async ({ page }) => {
  await setupKioskMocks(page);
  await page.goto('/?event=test-event');
  // Fix hidden attribute so the landing-screen overlay doesn't intercept pointer events
  await fixHiddenAttribute(page);

  // The app shows an instruction overlay immediately after init() — dismiss it
  // before interacting with the idle screen, which sits behind the overlay.
  await page.waitForFunction(
    () => document.querySelector('#instruction-overlay')?.classList.contains('visible'),
    { timeout: 8000 }
  );
  await page.click('#instruction-close-btn');
  await page.waitForFunction(
    () => !document.querySelector('#instruction-overlay')?.classList.contains('visible'),
    { timeout: 3000 }
  );

  // Wait for the camera feed to be live: press-hint loses the 'hidden' class
  // once video.onloadedmetadata fires, confirming the fake device is streaming.
  await page.waitForFunction(
    () => !document.querySelector('#press-hint')?.classList.contains('hidden'),
    { timeout: 12000 }
  );

  // Tap the idle screen to kick off capture
  await page.click('#idle-screen');

  // Countdown overlay should appear (triggerCapture → startCountdown)
  await page.waitForFunction(
    () => document.querySelector('#countdown-overlay')?.classList.contains('show'),
    { timeout: 3000 }
  );

  // After countdown (≈100 ms) + capture flash (250 ms) + freeze-frame (1000 ms)
  // the result screen becomes active.  Allow generous headroom for slow CI.
  await page.waitForFunction(
    () => document.querySelector('#result-screen')?.classList.contains('active'),
    { timeout: 10000 }
  );
});
