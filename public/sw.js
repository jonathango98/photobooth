const CACHE = "booth-shell-v14";

const SHELL = [
  "/index.html",
  "/main.js",
  "/style.css",
  "/offline-queue.js",
  "/vendor/qrcode.min.js",
  "/vendor/mp4-muxer.esm.js",
  "/vendor/mediapipe/vision_bundle.mjs",
  "/vendor/mediapipe/wasm/vision_wasm_internal.js",
  "/vendor/mediapipe/wasm/vision_wasm_internal.wasm",
  "/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js",
  "/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
  "/vendor/mediapipe/hand_landmarker.task",
  "/vendor/fonts/IBMPlexMono-Regular.woff2",
  "/vendor/fonts/FunnelSans-Variable.woff2",
  "/vendor/fonts/FunnelDisplay-Variable.woff2",
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

  // Stale-while-revalidate for shell assets: serve the cached copy immediately
  // (so the kiosk still boots instantly and works offline), but always refetch in
  // the background and overwrite the cache. Without the refetch, a shell asset was
  // pinned to whatever CACHE held until someone remembered to bump the version —
  // ship an index.html that needs a new style.css and every kiosk renders the new
  // markup against the old stylesheet until its next hard reset.
  //
  // The fetch is wrapped in .catch so an uncached miss while offline returns a
  // synthetic 503 instead of a rejected respondWith (which blanks the page).
  const shouldCache = (response) =>
    response.ok &&
    (SHELL.includes(url.pathname) ||
      url.pathname.startsWith("/templates/") ||
      url.pathname.startsWith("/assets/"));

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request)
        .then(response => {
          if (shouldCache(response)) {
            const copy = response.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return response;
        })
        .catch(() => cached || new Response("Offline", { status: 503 }));

      if (cached) {
        // Revalidate in the background; the cached copy answers this request.
        e.waitUntil(network.catch(() => {}));
        return cached;
      }
      return network;
    })
  );
});
