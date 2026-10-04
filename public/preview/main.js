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

const VIDEO_LOAD_TIMEOUT_MS = 10000;

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.alt = '';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = url;
  });
}

// Stop a slide's video and drop its buffered data
function releaseMedia(layer) {
  const video = layer.querySelector('video');
  if (!video) return;
  video.pause();
  video.removeAttribute('src');
  video.load();
}

// GIF-mode sessions carry an MP4 of the loop — full colour and smoother than
// the GIF — so play that, and fall back to the collage image if it won't load.
function loadMedia(photo) {
  if (!photo.videoUrl) return loadImage(photo.url);
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    let settled = false;
    const settle = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ok) {
        resolve(video);
      } else {
        video.removeAttribute('src');
        video.load();
        resolve(loadImage(photo.url));
      }
    };
    const timer = setTimeout(() => settle(false), VIDEO_LOAD_TIMEOUT_MS);
    video.addEventListener('loadeddata', () => settle(true), { once: true });
    video.addEventListener('error', () => settle(false), { once: true });
    video.src = photo.videoUrl;
  });
}

async function crossfade(slot, layerState, photo, fadeMs) {
  const nextActive = layerState.active === 'a' ? 'b' : 'a';
  const incoming = slot.querySelector(`.layer.${nextActive}`);
  const outgoing = slot.querySelector(`.layer.${layerState.active}`);
  const media = await loadMedia(photo);
  releaseMedia(incoming);
  incoming.replaceChildren(media);
  if (media instanceof HTMLVideoElement) media.play().catch(() => {});
  incoming.classList.add('visible');
  outgoing.classList.remove('visible');
  layerState.active = nextActive;
  // Once faded out, the old slide's video no longer needs to decode
  setTimeout(() => {
    if (!outgoing.classList.contains('visible')) releaseMedia(outgoing);
  }, fadeMs);
}

// Match the booth's wallpaper: the event config's background_url wins, and the
// CSS default (assets/background.webp) stands in when the event has none.
async function applyEventWallpaper(serverUrl, eventId) {
  try {
    const res = await fetch(`${serverUrl}/api/event/${encodeURIComponent(eventId)}/config`);
    if (!res.ok) return;
    const { background_url: backgroundUrl } = await res.json();
    if (!backgroundUrl) return;
    const bg = document.querySelector('.bg');
    if (bg) bg.style.backgroundImage = `url('${backgroundUrl}')`;
  } catch (err) {
    console.warn('Failed to load event wallpaper, using default:', err);
  }
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
  await applyEventWallpaper(serverUrl, eventId);
  const FADE_MS = 800;
  document.documentElement.style.setProperty('--fade', `${FADE_MS}ms`);

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
      photosById = new Map(photos.map((p) => [p.id, p]));
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
    const photo = photosById.get(id);
    if (!photo) return;
    const slot = slots[nextSlot];
    await crossfade(slot, layerState[nextSlot], photo, FADE_MS);
    slot.dataset.currentId = id;
    nextSlot = (nextSlot + 1) % 3;
  }

  await refreshList();
  for (let i = 0; i < 3; i++) await tick();
  setInterval(tick, SLOT_INTERVAL_MS);
  setInterval(refreshList, POLL_INTERVAL_MS);
}

main().catch(console.error);
