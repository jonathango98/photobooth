const CACHE = "booth-shell-v10";

const SHELL = [
  "/index.html",
  "/main.js",
  "/style.css",
  "/offline-queue.js",
  "/vendor/qrcode.min.js",
  "/vendor/mediapipe/vision_bundle.mjs",
  "/vendor/mediapipe/wasm/vision_wasm_internal.js",
  "/vendor/mediapipe/wasm/vision_wasm_internal.wasm",
  "/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js",
  "/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
  "/vendor/mediapipe/hand_landmarker.task",
  "/vendor/fonts/IBMPlexMono-Regular.woff2",
  "/config.json",
  "/assets/background.webp",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  // Never intercept non-GET requests (e.g. Netlify form POSTs) — pass them through.
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Never intercept cross-origin requests — let the browser handle them natively.
  // Intercepting cross-origin fetches (e.g. Railway API from a Netlify page) causes
  // the SW's .catch() to synthesize a 503 when the request mode or CORS setup prevents
  // the SW from completing the fetch successfully.
  if (url.origin !== self.location.origin) return;

  // Always network-first for API calls (never cache stale responses)
  if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
    e.respondWith(fetch(e.request).catch(() => new Response("", { status: 503 })));
    return;
  }

  // Network-first for config.json so server/URL changes reach kiosks immediately.
  // Falls back to the cached copy (pre-populated at install) so offline still works.
  if (url.pathname === "/config.json") {
    e.respondWith(
      fetch(e.request).then(response => {
        if (response.ok) {
          caches.open(CACHE).then(c => c.put(e.request, response.clone()));
        }
        return response;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Navigation requests (bare "/" or any HTML page): network-first, fall back to
  // the pre-cached shell so an offline reload of the origin never blanks the kiosk.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Cache-first for shell assets; also populate cache on first fetch for templates.
  // The fetch is wrapped in .catch so an uncached miss while offline returns a
  // synthetic 503 instead of a rejected respondWith (which blanks the page).
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache template/asset files as they're fetched so they survive offline reload
        if (response.ok && (url.pathname.startsWith("/templates/") || url.pathname.startsWith("/assets/"))) {
          caches.open(CACHE).then(c => c.put(e.request, response.clone()));
        }
        return response;
      }).catch(() => new Response("Offline", { status: 503 }));
    })
  );
});
