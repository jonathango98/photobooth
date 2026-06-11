// Shared boilerplate for the admin/superadmin panels.
// Classic script — load it before the panel script so its top-level bindings
// (FALLBACK_API, API_BASE, loadConfig, setupPreviewLightbox) are in scope there.
const FALLBACK_API = 'https://photobooth-server-production.up.railway.app';
let API_BASE = FALLBACK_API;

// The preview slideshow is an ES module and can't see global lexical bindings,
// so expose the fallback on window too.
window.PANEL_FALLBACK_API = FALLBACK_API;

// Loads config.json and sets API_BASE; `onConfig` lets a panel pull any extra
// fields it needs from the parsed config.
async function loadConfig(onConfig) {
  try {
    const cfg = await fetch('config.json').then((r) => r.json());
    if (cfg.serverUrl) API_BASE = cfg.serverUrl;
    if (onConfig) onConfig(cfg);
  } catch {
    /* use fallback */
  }
  if (window._updateErrorReporterUrl) window._updateErrorReporterUrl(API_BASE);
}

function setupPreviewLightbox() {
  const overlay = document.getElementById('preview-overlay');
  const img = document.getElementById('preview-img');
  const closeBtn = document.getElementById('preview-close');
  function close() {
    overlay.classList.remove('active');
    img.src = '';
  }
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  window._showPreview = (url) => {
    img.src = url;
    overlay.classList.add('active');
  };
}
