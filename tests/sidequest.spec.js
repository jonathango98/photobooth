// @ts-check
const { test, expect } = require('@playwright/test');

const FAKE_SERVER = 'http://fake-server.test';

// Same workaround as smoke.spec.js: the site's display rules beat [hidden]
async function fixHiddenAttribute(page) {
  await page.addStyleTag({ content: '[hidden] { display: none !important; }' });
}

async function commonMocks(page) {
  await page.route('**/sw.js', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('**/config.json', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ serverUrl: FAKE_SERVER }) })
  );
}

const SQ_EVENT = {
  event_id: 'sq-event',
  event_name: 'Side Quest Event',
  is_active: true,
  templates: [{ file: 'templates/template-1.png', width: 400, height: 711, slots: [{ x: 10, y: 10 }] }],
  capture: { totalShots: 3, photoWidth: 880, photoHeight: 495 },
  sidequest: {
    enabled: true,
    server_url: 'https://sq.example.com',
    require_screen_approval: true,
    has_key: true,
  },
};
const PLAIN_EVENT = { ...SQ_EVENT, event_id: 'plain', event_name: 'Plain', sidequest: undefined };

async function superadminLogin(page) {
  await commonMocks(page);
  await page.route(`${FAKE_SERVER}/api/superadmin/events`, (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ events: [SQ_EVENT, PLAIN_EVENT] }),
    })
  );
  await page.addInitScript(() => sessionStorage.setItem('superadminPassword', 'pw'));
  await page.goto('/superadmin.html');
}

test('superadmin: Side Quest tag, write-only key, https check, blank key omitted', async ({
  page,
}) => {
  await superadminLogin(page);
  await fixHiddenAttribute(page);
  await expect(page.locator('.event-card-meta', { hasText: '· Side Quest' })).toHaveCount(1);

  let putBody = null;
  await page.route(`${FAKE_SERVER}/api/superadmin/events/sq-event`, async (r) => {
    putBody = r.request().postDataJSON();
    await r.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
  });

  await page.locator('.event-card', { hasText: 'Side Quest Event' }).click();
  await expect(page.locator('#ef-sq-enabled')).toBeChecked();
  await expect(page.locator('#ef-sq-url')).toHaveValue('https://sq.example.com');
  await expect(page.locator('#ef-sq-key')).toHaveValue('');
  await expect(page.locator('#ef-sq-key')).toHaveAttribute('placeholder', 'Key set, leave blank to keep');
  await expect(page.locator('#ef-sq-approval')).toBeChecked();

  // http:// is rejected client-side, nothing is sent
  await page.fill('#ef-sq-url', 'http://sq.example.com');
  let message = '';
  page.once('dialog', (d) => {
    message = d.message();
    d.dismiss();
  });
  await page.locator('#event-form button[type=submit]').click();
  expect(message).toContain('https://');
  expect(putBody).toBeNull();
});

test('superadmin: blank key is omitted, typed key is sent', async ({ page }) => {
  await superadminLogin(page);
  const bodies = [];
  await page.route(`${FAKE_SERVER}/api/superadmin/events/sq-event`, async (r) => {
    bodies.push(r.request().postDataJSON());
    await r.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.locator('.event-card', { hasText: 'Side Quest Event' }).click();
  await page.locator('#event-form button[type=submit]').click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0].sidequest).toEqual({
    enabled: true,
    server_url: 'https://sq.example.com',
    require_screen_approval: true,
  });

  await page.locator('.event-card', { hasText: 'Side Quest Event' }).click();
  await page.fill('#ef-sq-key', 'secret');
  await page.locator('#event-form button[type=submit]').click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1].sidequest.key).toBe('secret');
});

test('superadmin: duplicate does not carry the key', async ({ page }) => {
  await superadminLogin(page);
  await page.locator('.event-card', { hasText: 'Side Quest Event' }).locator('.event-menu-btn').click();
  await page.locator('.event-card', { hasText: 'Side Quest Event' }).locator('.event-duplicate-btn').click();
  await expect(page.locator('#ef-sq-key')).toHaveValue('');
  await expect(page.locator('#ef-sq-key')).toHaveAttribute('placeholder', '');
  await expect(page.locator('#ef-sq-url')).toHaveValue('https://sq.example.com');
});

function photos(sidequest) {
  return {
    ok: true,
    total: 2,
    nextCursor: null,
    ...(sidequest ? { sidequest } : {}),
    photos: [
      { id: 'sq-event/collage/aaa.jpg', url: 'x', thumbUrl: 'x', folder: 'collage', uploadedAt: '2026-01-01T00:00:00Z', session_id: 'aaa', screen_approved: false },
      { id: 'sq-event/collage/bbb.jpg', url: 'x', thumbUrl: 'x', folder: 'collage', uploadedAt: '2026-01-01T00:01:00Z', session_id: 'bbb', screen_approved: true },
    ],
  };
}

async function adminOpen(page, sidequest) {
  await commonMocks(page);
  await page.route(`${FAKE_SERVER}/api/admin/photos**`, (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(photos(sidequest)) })
  );
  await page.addInitScript(() => sessionStorage.setItem('adminPassword', 'pw'));
  await page.goto('/admin?event=sq-event');
}

test('admin: toggle posts screen-approval; filter shows waiting only', async ({ page }) => {
  await adminOpen(page, { enabled: true, require_screen_approval: true });
  await expect(page.locator('.sq-approve')).toHaveCount(2);
  await expect(page.locator('#sq-controls')).toContainText('every person under 18 has consent');

  let body = null;
  await page.route(`${FAKE_SERVER}/api/admin/screen-approval`, async (r) => {
    body = r.request().postDataJSON();
    await r.fulfill({ contentType: 'application/json', body: '{"ok":true,"approved":true}' });
  });
  // newest session (bbb) is first and already approved; aaa is second
  await page.locator('.sq-approve').nth(1).check();
  await expect.poll(() => body).toEqual({ eventId: 'sq-event', sessionId: 'aaa', approved: true });

  await page.check('#sq-waiting-filter');
  await expect(page.locator('.sq-approve')).toHaveCount(0);
});

test('admin: failed toggle reverts and shows an error toast', async ({ page }) => {
  await adminOpen(page, { enabled: true, require_screen_approval: true });
  await page.route(`${FAKE_SERVER}/api/admin/screen-approval`, (r) =>
    r.fulfill({ status: 500, body: 'no' })
  );
  const box = page.locator('.sq-approve').nth(1);
  await box.check();
  await expect(page.locator('#toast')).toBeVisible();
  await expect(box).not.toBeChecked();
});

test('admin: flag off shows no approval controls', async ({ page }) => {
  await adminOpen(page, undefined);
  await expect(page.locator('.session')).toHaveCount(2);
  await expect(page.locator('.sq-approve')).toHaveCount(0);
  await expect(page.locator('#sq-controls')).toBeHidden();
});
