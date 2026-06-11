async function loadServerUrl() {
  try {
    const cfg = await fetch('../config.json').then((r) => r.json());
    return cfg.serverUrl || window.PANEL_FALLBACK_API;
  } catch {
    return window.PANEL_FALLBACK_API;
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function crossfade(slot, layerState, url) {
  const nextActive = layerState.active === 'a' ? 'b' : 'a';
  const incoming = slot.querySelector(`.layer.${nextActive}`);
  const outgoing = slot.querySelector(`.layer.${layerState.active}`);
  await new Promise((resolve) => {
    incoming.onload = resolve;
    incoming.onerror = resolve;
    incoming.src = url;
  });
  incoming.classList.add('visible');
  outgoing.classList.remove('visible');
  layerState.active = nextActive;
}

async function main() {
  // The event and slideshow token in the URL are the source of truth
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get('event');
  const slideshowToken = params.get('token');

  if (!eventId) {
    document.body.textContent =
      'Missing event — open this page with ?event=your-event-id&token=... in the link.';
    return;
  }
  if (!slideshowToken) {
    document.body.textContent =
      'Missing slideshow token — use the link from the superadmin panel which includes ?event=...&token=...';
    return;
  }

  const serverUrl = await loadServerUrl();
  if (window._updateErrorReporterUrl) window._updateErrorReporterUrl(serverUrl);
  document.documentElement.style.setProperty('--fade', '800ms');

  const SLOT_INTERVAL_MS = 3000;
  const POLL_INTERVAL_MS = 60000;

  const slots = [...document.querySelectorAll('.slot')];
  const layerState = slots.map(() => ({ active: 'a' }));

  let photosById = new Map();
  let queue = [];
  let nextSlot = 0;

  async function refreshList() {
    try {
      const url =
        `${serverUrl}/api/public/photos` +
        `?eventId=${encodeURIComponent(eventId)}&token=${encodeURIComponent(slideshowToken)}`;
      const res = await fetch(url);
      if (res.status === 401 || res.status === 403) {
        document.body.textContent =
          'Invalid slideshow token — this link may have expired. Ask the event organiser for a new slideshow link.';
        return;
      }
      const { photos } = await res.json();
      photosById = new Map(photos.map((p) => [p.id, p.url]));
      const knownInQueue = new Set(queue);
      const visible = new Set(slots.map((s) => s.dataset.currentId).filter(Boolean));
      const fresh = photos
        .map((p) => p.id)
        .filter((id) => !knownInQueue.has(id) && !visible.has(id));
      if (fresh.length > 0) queue.push(...shuffle(fresh));
    } catch (err) {
      console.error('Failed to refresh photo list:', err);
    }
  }

  function nextId() {
    if (queue.length === 0) {
      const visible = new Set(slots.map((s) => s.dataset.currentId).filter(Boolean));
      const all = shuffle([...photosById.keys()]);
      queue = [...all.filter((id) => !visible.has(id)), ...all.filter((id) => visible.has(id))];
    }
    return queue.shift() ?? null;
  }

  async function tick() {
    const id = nextId();
    if (!id) return;
    const url = photosById.get(id);
    if (!url) return;
    const slot = slots[nextSlot];
    await crossfade(slot, layerState[nextSlot], url);
    slot.dataset.currentId = id;
    nextSlot = (nextSlot + 1) % 3;
  }

  await refreshList();
  for (let i = 0; i < 3; i++) await tick();
  setInterval(tick, SLOT_INTERVAL_MS);
  setInterval(refreshList, POLL_INTERVAL_MS);
}

main().catch(console.error);
