const CACHE = "booth-shell-v1";

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
  "/assets/background.png",
  "/assets/background2.png",
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
  const url = new URL(e.request.url);

  // Always network-first for API calls (never cache stale responses)
  if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
    e.respondWith(fetch(e.request).catch(() => new Response("", { status: 503 })));
    return;
  }

  // Cache-first for shell assets; also populate cache on first fetch for templates
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache template/asset files as they're fetched so they survive offline reload
        if (response.ok && (url.pathname.startsWith("/templates/") || url.pathname.startsWith("/assets/"))) {
          caches.open(CACHE).then(c => c.put(e.request, response.clone()));
        }
        return response;
      });
    })
  );
});
