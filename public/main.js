// ---------------------------
// Global config & state
// ---------------------------
let CONFIG = null;

// Elements
const idleScreen = document.getElementById('idle-screen');
const templateScreen = document.getElementById('template-screen');
const resultScreen = document.getElementById('result-screen');
const cameraCanvas = document.getElementById('camera-canvas');
const cameraCtx = cameraCanvas.getContext('2d');
const idleText = document.getElementById('idle-text');
const video = document.getElementById('video');
const photoCanvas = document.getElementById('photo-canvas');
const photoCtx = photoCanvas.getContext('2d');
const backBtn = document.getElementById('back-btn');
const qrImg = document.getElementById('qr-img');
const templateGrid = document.getElementById('template-grid');
const flashOverlay = document.getElementById('flash-overlay');
const siteNameEl = document.getElementById('site-name');
const shotCounter = document.getElementById('shot-counter');
const countdownOverlay = document.getElementById('countdown-overlay');
const pressHint = document.getElementById('press-hint');
const portraitCta = document.getElementById('portrait-cta');

// The camera-overlay hint and the portrait prompt below the camera are two
// renderings of the same state — only one is visible at a time (see the
// orientation media queries in style.css), so toggle them together.
function setPressHintVisible(visible) {
  if (pressHint) pressHint.classList.toggle('hidden', !visible);
  if (portraitCta) portraitCta.classList.toggle('hidden', !visible);
}
const confirmBtn = document.getElementById('confirm-btn');
const resetBar = document.getElementById('reset-bar');
const resetBtn = document.getElementById('reset-btn');
const templateResetBtn = document.getElementById('template-reset-btn');
const queueBadge = document.getElementById('queue-badge');

// State
let stream = null;
let animationFrameId = null;
let isCountingDown = false;
let currentShotIndex = 0;
const capturedCanvases = [];
let selectedTemplateIndex = null;
let autoResetTimer = null;
let autoResetCountInterval = null;
let countdownTimers = [];

// Error overlay state
let cameraRetryTimer = null;

// Instruction popup state
let autoResetTriggered = false;
let idleInactivityTimer = null;
const IDLE_INACTIVITY_MS = 60000; // 1 minute

// Freeze-frame preview
let frozenFrame = null;
let freezeUntil = 0;
const FREEZE_DURATION_MS = 1000;

// GIF mode — per shot, the burst of frames (at video resolution) behind the still
// in capturedCanvases. Indexes line up with capturedCanvases.
const capturedBursts = [];
let gifPreviewTimer = null;
// The animated collage is saved as an MP4, not a GIF — Instagram Stories won't
// take a GIF. The loop repeats to fill VIDEO_SECONDS so a story plays its full length.
const VIDEO_MAX_DIM = 1920;
const VIDEO_SECONDS = 10;
const VIDEO_FPS = 30;
const VIDEO_BITRATE = 3_000_000; // ~4 MB for 10 s

// Template image cache
const templateImageCache = new Map();

// Current session
let currentSessionId = null;

// Gesture detection state
let handLandmarker = null;
let gestureDetectionInterval = null;
let peaceSignStartTime = null;
let peaceConsecutiveCount = 0;
const PEACE_CONSECUTIVE_REQUIRED = 5;
const peaceProgress = document.getElementById('peace-progress');
const peaceRing = document.getElementById('peace-ring');
const PEACE_RING_CIRCUMFERENCE = 339.292;

// ---------------------------
// Config loading
// ---------------------------
const _urlEventId = new URLSearchParams(window.location.search).get('event');
// Upload key from the booth link superadmin hands out — /api/save requires it
// for events that have one
const _urlKioskKey = new URLSearchParams(window.location.search).get('key');

function showEventError(title, msgNodes) {
  const outer = document.createElement('div');
  outer.setAttribute(
    'style',
    "display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1714;color:#f7f2d5;font-family:'IBM Plex Mono',monospace;text-align:center;padding:24px;"
  );
  const inner = document.createElement('div');
  const h1 = document.createElement('div');
  h1.setAttribute('style', 'font-size:48px;margin-bottom:16px;');
  h1.textContent = '404';
  const h2 = document.createElement('div');
  h2.setAttribute('style', 'font-size:18px;margin-bottom:8px;');
  h2.textContent = title;
  const msg = document.createElement('div');
  msg.setAttribute('style', 'font-size:13px;color:rgba(247,242,213,0.5);');
  for (const node of msgNodes) msg.appendChild(node);
  inner.appendChild(h1);
  inner.appendChild(h2);
  inner.appendChild(msg);
  outer.appendChild(inner);
  document.body.textContent = '';
  document.body.appendChild(outer);
}

function showEventNotFound(eventId) {
  const strong = document.createElement('strong');
  strong.textContent = eventId;
  showEventError('Event not found', [
    document.createTextNode('No event with ID '),
    strong,
    document.createTextNode(' exists. Check the URL and try again.'),
  ]);
}

function showMissingEventId() {
  // Show landing page instead of an error — the bare root URL is public-facing
  document.title = 'Photo Booth';

  const idleScreen = document.getElementById('idle-screen');
  if (idleScreen) {
    idleScreen.classList.remove('active');
    idleScreen.hidden = true;
  }

  const landingScreen = document.getElementById('landing-screen');
  if (landingScreen) {
    landingScreen.hidden = false;
  }

  // AJAX form submission so visitors get an inline thank-you
  const form = document.getElementById('inquiry-form');
  const statusEl = document.getElementById('landing-form-status');
  if (form && statusEl) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type=submit]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(form)).toString(),
        });
        if (res.ok) {
          form.hidden = true;
          statusEl.textContent = "Thanks — I'll get back to you soon.";
          statusEl.className = 'landing-form-success';
          statusEl.hidden = false;
        } else {
          statusEl.textContent = 'Something went wrong — please try again or email directly.';
          statusEl.className = 'landing-form-error';
          statusEl.hidden = false;
          if (submitBtn) submitBtn.disabled = false;
        }
      } catch (_err) {
        statusEl.textContent = 'Something went wrong — please try again or email directly.';
        statusEl.className = 'landing-form-error';
        statusEl.hidden = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
}

// ---------------------------
// Error overlay (camera / config failures)
// ---------------------------
const _errorOverlay = document.getElementById('error-overlay');
const _errorTitle = document.getElementById('error-title');
const _errorMsg = document.getElementById('error-msg');
const _errorRetryLbl = document.getElementById('error-retry-label');

function showErrorOverlay(title, msg, retrySeconds) {
  if (_errorTitle) _errorTitle.textContent = title;
  if (_errorMsg) _errorMsg.textContent = msg;
  if (_errorRetryLbl) {
    _errorRetryLbl.textContent = retrySeconds ? `Retrying in ${retrySeconds}s…` : 'Retrying…';
  }
  if (_errorOverlay) _errorOverlay.classList.add('visible');
}

function hideErrorOverlay() {
  if (_errorOverlay) _errorOverlay.classList.remove('visible');
}

// ---------------------------
// Screen Wake Lock (H6)
// ---------------------------
let _wakeLock = null;

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    _wakeLock = await navigator.wakeLock.request('screen');
    _wakeLock.addEventListener('release', () => {
      _wakeLock = null;
      // Re-acquire if the document is still visible
      if (document.visibilityState === 'visible') acquireWakeLock();
    });
    console.log('[WAKE] Screen wake lock acquired.');
  } catch (e) {
    console.warn('[WAKE] Wake lock request failed:', e);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !_wakeLock) acquireWakeLock();
});

async function loadConfig() {
  // The event in the URL is the source of truth — multiple events can run at
  // once on different kiosks, so there is no "active event" fallback.
  if (!_urlEventId) {
    showMissingEventId();
    return false;
  }

  const staticRes = await fetch('config.json');
  if (!staticRes.ok) {
    throw new Error(`Failed to load config.json: ${staticRes.status}`);
  }
  const staticConfig = await staticRes.json();

  // Merge config.dev.json overrides when present (local dev only — not deployed)
  const devRes = await fetch('config.dev.json').catch(() => null);
  if (devRes?.ok) {
    const devConfig = await devRes.json().catch(() => null);
    if (devConfig) Object.assign(staticConfig, devConfig);
  }
  const serverUrl = staticConfig.serverUrl;

  let usedServerConfig = false;
  if (serverUrl) {
    try {
      const configEndpoint = `${serverUrl}/api/event/${encodeURIComponent(_urlEventId)}/config`;
      const eventRes = await fetch(configEndpoint);
      if (eventRes.status === 404) {
        showEventNotFound(_urlEventId);
        return false;
      }
      if (eventRes.ok) {
        const eventConfig = await eventRes.json();
        CONFIG = {
          siteName: eventConfig.event_name,
          serverUrl: serverUrl,
          eventId: eventConfig.event_id,
          templates: eventConfig.templates,
          capture: eventConfig.capture,
          countdown: eventConfig.countdown,
          autoResetSeconds: staticConfig.autoResetSeconds ?? 30,
          gestureTrigger: eventConfig.gestureTrigger ?? staticConfig.gestureTrigger,
          gif: eventConfig.gif ?? staticConfig.gif,
          background_url: eventConfig.background_url || null,
          qr: eventConfig.qr ?? staticConfig.qr,
        };
        usedServerConfig = true;
        console.log('[CONFIG] Loaded from server API:', CONFIG.eventId);
      }
    } catch (e) {
      console.warn('[CONFIG] Server config fetch failed, falling back to config.json:', e);
    }
  }

  if (!usedServerConfig) {
    CONFIG = staticConfig;
    console.log('[CONFIG] Using static config.json.');
  }

  // Ensure eventId is always populated — fall back to the URL ?event= param
  if (!CONFIG.eventId && _urlEventId) {
    CONFIG.eventId = _urlEventId;
  }
  CONFIG.kioskKey = _urlKioskKey || null;

  // Update the error reporter with the resolved server URL so any subsequent
  // errors are sent to the correct endpoint (fallback URL is used until this runs).
  if (CONFIG.serverUrl && window._updateErrorReporterUrl) {
    window._updateErrorReporterUrl(CONFIG.serverUrl);
  }

  if (CONFIG.siteName) {
    document.title = CONFIG.siteName;
    if (siteNameEl) siteNameEl.textContent = CONFIG.siteName;
  }

  document.body.style.backgroundImage = CONFIG.background_url
    ? `url('${CONFIG.background_url}')`
    : `url('assets/background.webp')`;

  if (CONFIG.templates) {
    await Promise.all(CONFIG.templates.map((t) => loadTemplateImage(t.file)));
  }
}

function loadTemplateImage(src) {
  if (templateImageCache.has(src)) {
    return Promise.resolve(templateImageCache.get(src));
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      templateImageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => {
      console.warn(`[TEMPLATE] Image ${src} failed to load.`);
      resolve(null);
    };
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

// ---------------------------
// Gesture detection (MediaPipe Hand Landmarker)
// ---------------------------
async function initHandLandmarker() {
  if (!CONFIG?.gestureTrigger?.enabled) return;

  try {
    const { FilesetResolver, HandLandmarker } =
      await import('./vendor/mediapipe/vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
    handLandmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: './vendor/mediapipe/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
      // Defaults are 0.5; raised so background clutter and half-seen hands don't register
      minHandDetectionConfidence: 0.7,
      minHandPresenceConfidence: 0.7,
    });
    console.log('[GESTURE] HandLandmarker initialized.');
  } catch (e) {
    console.error('[GESTURE] Failed to init HandLandmarker:', e);
  }
}

// Finger shape is judged by comparing joint distances rather than raw screen
// x/y, so it holds for either hand and for a tilted hand. `hand` is the image
// landmarks with x scaled by the frame's aspect ratio (see toSquarePixels) so
// distances aren't skewed by a 16:9 / 4:3 camera.
const FINGERS = {
  index: { tip: 8, pip: 6 },
  middle: { tip: 12, pip: 10 },
  ring: { tip: 16, pip: 14 },
  pinky: { tip: 20, pip: 18 },
};
const WRIST = 0;
const THUMB_TIP = 4;
const THUMB_IP = 3;
const THUMB_MCP = 2;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;
// tip-to-wrist ÷ PIP-to-wrist: straight fingers measure ~1.3–1.5, curled ones ≤ ~0.95.
// A finger between the two thresholds is half-bent and counts as neither, so a
// relaxed or ambiguous hand can't satisfy any gesture.
const FINGER_EXTENDED_RATIO = 1.25;
const FINGER_CURLED_RATIO = 1.0;

function toSquarePixels(landmarks, aspect) {
  return landmarks.map((p) => ({ x: p.x * aspect, y: p.y }));
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function fingerRatio(hand, { tip, pip }) {
  return dist(hand[tip], hand[WRIST]) / dist(hand[pip], hand[WRIST]);
}

function isFingerExtended(hand, finger) {
  return fingerRatio(hand, finger) > FINGER_EXTENDED_RATIO;
}

function isFingerCurled(hand, finger) {
  return fingerRatio(hand, finger) < FINGER_CURLED_RATIO;
}

// Thumb sticks out when its tip is farther from the pinky knuckle than its IP
// joint is; a thumb tucked across the palm points back toward the pinky.
function isThumbExtended(hand) {
  return dist(hand[THUMB_TIP], hand[PINKY_MCP]) > dist(hand[THUMB_IP], hand[PINKY_MCP]);
}

// Raised hand: wrist → middle knuckle points up the screen within 45° of
// vertical. Rejects the same finger shape on a hand hanging at someone's side,
// held sideways, or shading their face.
function isHandUpright(hand) {
  const up = hand[WRIST].y - hand[MIDDLE_MCP].y; // y grows downward
  const across = Math.abs(hand[MIDDLE_MCP].x - hand[WRIST].x);
  return up > 0 && across <= up;
}

function isPeaceSign(hand) {
  return (
    isHandUpright(hand) &&
    isFingerExtended(hand, FINGERS.index) &&
    isFingerExtended(hand, FINGERS.middle) &&
    isFingerCurled(hand, FINGERS.ring) &&
    isFingerCurled(hand, FINGERS.pinky)
  );
}

function isOpenPalm(hand) {
  return (
    isHandUpright(hand) &&
    Object.values(FINGERS).every((f) => isFingerExtended(hand, f)) &&
    isThumbExtended(hand)
  );
}

function isThumbsUp(hand) {
  // Thumb points up the screen: tip above IP above MCP (y grows downward)
  const thumbUp =
    hand[THUMB_TIP].y < hand[THUMB_IP].y && hand[THUMB_IP].y < hand[THUMB_MCP].y;
  // Index must be curled (rules out pointing up); allow one of the other three to be loose
  const indexCurled = isFingerCurled(hand, FINGERS.index);
  const curledCount = Object.values(FINGERS).filter((f) => isFingerCurled(hand, f)).length;
  return isThumbExtended(hand) && thumbUp && indexCurled && curledCount >= 3;
}

function getGestureDetector() {
  const type = CONFIG?.gestureTrigger?.gestureType ?? 'peace';
  if (type === 'palm') return isOpenPalm;
  if (type === 'thumbsup') return isThumbsUp;
  return isPeaceSign;
}

function getGestureEmoji() {
  const type = CONFIG?.gestureTrigger?.gestureType ?? 'peace';
  if (type === 'palm') return '🖐️';
  if (type === 'thumbsup') return '👍';
  return '✌️';
}

function startGestureDetection() {
  if (!handLandmarker || !CONFIG?.gestureTrigger?.enabled) return;
  stopGestureDetection();

  const fps = CONFIG.gestureTrigger.detectionFps ?? 10;
  const holdDuration = CONFIG.gestureTrigger.holdDuration ?? 2000;
  const detectGesture = getGestureDetector();

  const gestureEmoji = document.getElementById('gesture-emoji');
  if (gestureEmoji) gestureEmoji.textContent = getGestureEmoji();

  gestureDetectionInterval = setInterval(() => {
    if (!video.srcObject || video.readyState < 2) return;
    if (!idleScreen.classList.contains('active')) return;
    if (isCountingDown) return;

    const results = handLandmarker.detectForVideo(video, performance.now());

    let peaceDetected = false;
    if (results.landmarks && results.landmarks.length > 0) {
      const aspect = video.videoWidth / video.videoHeight;
      peaceDetected = detectGesture(toSquarePixels(results.landmarks[0], aspect));
    }

    if (peaceDetected) {
      peaceConsecutiveCount++;

      if (peaceConsecutiveCount >= PEACE_CONSECUTIVE_REQUIRED) {
        if (!peaceSignStartTime) {
          peaceSignStartTime = Date.now();
          peaceProgress.classList.add('visible');
        }

        const elapsed = Date.now() - peaceSignStartTime;
        const progress = Math.min(elapsed / holdDuration, 1);
        peaceRing.style.strokeDashoffset = PEACE_RING_CIRCUMFERENCE * (1 - progress);

        if (elapsed >= holdDuration) {
          resetPeaceState();
          triggerCaptureFromGesture();
        }
      }
    } else {
      resetPeaceState();
    }
  }, 1000 / fps);
}

function stopGestureDetection() {
  if (gestureDetectionInterval) {
    clearInterval(gestureDetectionInterval);
    gestureDetectionInterval = null;
  }
  resetPeaceState();
}

function resetPeaceState() {
  peaceSignStartTime = null;
  peaceConsecutiveCount = 0;
  if (peaceProgress) peaceProgress.classList.remove('visible');
  if (peaceRing) peaceRing.style.strokeDashoffset = PEACE_RING_CIRCUMFERENCE;
}

// ---------------------------
// UI helpers
// ---------------------------
function showScreen(screen) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  screen.classList.add('active');
  if (screen !== idleScreen) {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  } else if (stream && !animationFrameId) {
    startRenderLoop();
  }
}

function triggerFlash() {
  flashOverlay.style.transition = 'opacity 0.05s ease-in';
  flashOverlay.style.opacity = '1';
  setTimeout(() => {
    flashOverlay.style.transition = 'opacity 0.6s ease-out';
    flashOverlay.style.opacity = '0';
  }, 80);
}

function showCountdownOverlay(text, isSmile = false) {
  countdownOverlay.textContent = text;
  countdownOverlay.classList.remove('show', 'smile');
  void countdownOverlay.offsetWidth; // force reflow to restart animation
  countdownOverlay.classList.add('show');
  if (isSmile) countdownOverlay.classList.add('smile');
}

function hideCountdownOverlay() {
  countdownOverlay.classList.remove('show', 'smile');
  countdownOverlay.textContent = '';
}

function updateShotCounter() {
  if (!CONFIG || !stream) return;
  const totalShots = CONFIG.capture?.totalShots ?? 3;
  if (currentShotIndex < totalShots) {
    shotCounter.textContent = `${currentShotIndex + 1} / ${totalShots}`;
  } else {
    shotCounter.textContent = '';
  }
  updateResetBtn();
}

function updateResetBtn() {
  if (currentShotIndex > 0) {
    resetBtn.classList.remove('hidden');
  } else {
    resetBtn.classList.add('hidden');
  }
}

function startAutoReset() {
  const seconds = CONFIG?.autoResetSeconds ?? 60;
  clearAutoReset();
  resetBar.style.transition = 'none';
  resetBar.style.transform = 'scaleX(1)';
  void resetBar.offsetWidth;
  resetBar.style.transition = `transform ${seconds}s linear`;
  resetBar.style.transform = 'scaleX(0)';

  const resetSecondsEl = document.getElementById('reset-seconds');
  if (resetSecondsEl) {
    let remaining = seconds;
    resetSecondsEl.textContent = remaining;
    autoResetCountInterval = setInterval(() => {
      remaining -= 1;
      resetSecondsEl.textContent = remaining;
      if (remaining <= 0) clearInterval(autoResetCountInterval);
    }, 1000);
  }

  autoResetTimer = setTimeout(() => {
    autoResetTriggered = true;
    backBtn.click();
  }, seconds * 1000);
}

function clearAutoReset() {
  if (autoResetTimer) {
    clearTimeout(autoResetTimer);
    autoResetTimer = null;
  }
  if (autoResetCountInterval) {
    clearInterval(autoResetCountInterval);
    autoResetCountInterval = null;
  }
  if (resetBar) {
    resetBar.style.transition = 'none';
    resetBar.style.transform = 'scaleX(1)';
  }
}

// ---------------------------
// Instruction popup
// ---------------------------
function buildInstructionRules() {
  const rulesEl = document.getElementById('instruction-rules');
  const stepsEl = document.getElementById('portrait-steps');
  const disclaimerEl = document.getElementById('instruction-disclaimer');
  if (!rulesEl || !CONFIG) return;

  const totalShots = CONFIG.capture?.totalShots ?? 3;
  const gestureEnabled = CONFIG.gestureTrigger?.enabled;
  const gestureType = CONFIG.gestureTrigger?.gestureType ?? 'peace';
  const templateCount = CONFIG.templates?.length ?? 1;
  const gestureNames = { peace: 'peace sign ✌️', palm: 'open palm 🖐️', thumbsup: 'thumbs up 👍' };
  const gestureName = gestureNames[gestureType] || gestureType;

  const rules = [
    gestureEnabled
      ? `Tap the screen or show a ${gestureName} to start.`
      : 'Tap the screen to start.',
    templateCount > 1 ? `After ${totalShots} shots, choose a template.` : `Take ${totalShots} shots.`,
    ...(CONFIG.gif?.enabled ? ['Every shot is a mini video — keep moving until the flash!'] : []),
    'Scan the QR code to download your picture!',
  ];

  // Same rules render twice: the instruction popup, and the always-on steps
  // strip below the camera in the portrait kiosk layout.
  for (const el of [rulesEl, stepsEl]) {
    if (!el) continue;
    el.innerHTML = '';
    for (const text of rules) {
      const li = document.createElement('li');
      li.textContent = text;
      el.appendChild(li);
    }
  }

  // Portrait CTA mirrors how the session can actually be started
  if (portraitCta) {
    const gestureEmoji = { peace: '✌️', palm: '🖐️', thumbsup: '👍' }[gestureType];
    portraitCta.textContent =
      gestureEnabled && gestureEmoji ? `PRESS OR ${gestureEmoji} TO START` : 'PRESS TO START';
  }

  // Disclaimer
  if (disclaimerEl) {
    disclaimerEl.textContent = 'Please be gentle with the iPad 😢';
  }
}

function showInstructions() {
  const overlay = document.getElementById('instruction-overlay');
  if (overlay) overlay.classList.add('visible');
  clearIdleInactivityTimer();
}

function hideInstructions() {
  const overlay = document.getElementById('instruction-overlay');
  if (overlay) overlay.classList.remove('visible');
  startIdleInactivityTimer();
}

function startIdleInactivityTimer() {
  clearIdleInactivityTimer();
  idleInactivityTimer = setTimeout(() => {
    if (idleScreen.classList.contains('active') && !isCountingDown) {
      showInstructions();
    }
  }, IDLE_INACTIVITY_MS);
}

function clearIdleInactivityTimer() {
  if (idleInactivityTimer) {
    clearTimeout(idleInactivityTimer);
    idleInactivityTimer = null;
  }
}

function resetIdleInactivityTimer() {
  if (idleScreen.classList.contains('active') && !isCountingDown) {
    const overlay = document.getElementById('instruction-overlay');
    if (overlay && !overlay.classList.contains('visible')) {
      startIdleInactivityTimer();
    }
  }
}

// ---------------------------
// Capture crop helper
// ---------------------------
// Returns the center-crop rectangle {sx, sy, sw, sh} from the raw video frame
// that matches the target capture aspect ratio (CONFIG.capture.photoWidth/Height).
// Used by both captureOneShot() and the render loop so what guests see is
// exactly what gets captured.
function computeCaptureCrop(vw, vh) {
  let targetAspect;
  if (CONFIG && CONFIG.capture) {
    targetAspect = CONFIG.capture.photoWidth / CONFIG.capture.photoHeight;
  } else {
    targetAspect = vw / vh; // fall back to full frame before CONFIG loads
  }
  const videoAspect = vw / vh;
  let sx, sy, sw, sh;
  if (videoAspect > targetAspect) {
    // Video is wider than target — crop left/right
    sh = vh;
    sw = sh * targetAspect;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    // Video is taller than target — crop top/bottom
    sw = vw;
    sh = sw / targetAspect;
    sx = 0;
    sy = (vh - sh) / 2;
  }
  return { sx, sy, sw, sh };
}

// ---------------------------
// Camera canvas sizing (responsive)
// ---------------------------
function sizeCameraCanvas() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  // Use the capture aspect ratio so the canvas box is always 16:9 (matching
  // what captureOneShot() will actually save). Fall back to raw video aspect
  // if CONFIG hasn't loaded yet (will be re-called once it has).
  let aspect;
  if (CONFIG && CONFIG.capture) {
    aspect = CONFIG.capture.photoWidth / CONFIG.capture.photoHeight;
  } else {
    aspect = vw / vh;
  }
  // Portrait kiosks (iPad on a stand) get a wider but shorter camera band so
  // the prompt panel below it has room; landscape keeps the full-height box.
  const portrait = window.innerHeight > window.innerWidth;
  const maxW = portrait
    ? Math.min(1200, window.innerWidth * 0.96)
    : Math.min(1000, window.innerWidth * 0.94);
  const maxH = portrait ? window.innerHeight * 0.46 : window.innerHeight * 0.88;
  let dispW = maxW;
  let dispH = dispW / aspect;
  if (dispH > maxH) { dispH = maxH; dispW = dispH * aspect; }
  cameraCanvas.style.width = `${Math.round(dispW)}px`;
  cameraCanvas.style.height = `${Math.round(dispH)}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // Cap backing store at the crop source dimensions (not full video dimensions)
  const { sw: cropW, sh: cropH } = computeCaptureCrop(vw, vh);
  cameraCanvas.width = Math.min(Math.round(dispW * dpr), cropW);
  cameraCanvas.height = Math.min(Math.round(dispH * dpr), cropH);
}

let _resizeTimer = null;
function _onViewportChange() {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(sizeCameraCanvas, 150);
}
window.addEventListener('resize', _onViewportChange);
window.addEventListener('orientationchange', _onViewportChange);

// ---------------------------
// Camera start
// ---------------------------
async function startCamera() {
  try {
    if (stream) {
      startRenderLoop();
      return;
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    });

    video.srcObject = stream;
    video.onloadedmetadata = () => {
      sizeCameraCanvas();
      if (!video.videoWidth || !video.videoHeight) return;

      if (idleText) idleText.style.display = 'none';
      setPressHintVisible(true);
      updateShotCounter();

      video.play();
      startRenderLoop();
      initHandLandmarker().then(startGestureDetection);
    };
  } catch (e) {
    console.error('[CAM] error:', e);
    const RETRY_SECONDS = 5;
    showErrorOverlay(
      'Camera unavailable',
      `Could not access the camera. Please check that camera permission is granted.\n\n${e.message}`,
      RETRY_SECONDS
    );
    clearTimeout(cameraRetryTimer);
    cameraRetryTimer = setTimeout(async () => {
      hideErrorOverlay();
      stream = null; // allow a fresh getUserMedia request
      await startCamera();
    }, RETRY_SECONDS * 1000);
  }
}

// ---------------------------
// Render loop (camera feed only — overlays are HTML)
// ---------------------------
function startRenderLoop() {
  function render() {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = cameraCanvas.width;
    const ch = cameraCanvas.height;

    cameraCtx.clearRect(0, 0, cw, ch);

    const now = Date.now();
    const isFrozen = frozenFrame && now < freezeUntil;

    if (cw && ch) {
      if (isFrozen && frozenFrame) {
        cameraCtx.drawImage(frozenFrame, 0, 0, cw, ch);
      } else if (vw && vh) {
        // Draw only the region that will be captured (center-cropped to
        // capture aspect ratio), so the live preview exactly matches the shot.
        const { sx, sy, sw, sh } = computeCaptureCrop(vw, vh);
        cameraCtx.save();
        cameraCtx.scale(-1, 1);
        cameraCtx.translate(-cw, 0);
        cameraCtx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
        cameraCtx.restore();
      } else {
        cameraCtx.fillStyle = '#1a1714';
        cameraCtx.fillRect(0, 0, cw, ch);
      }
    }

    animationFrameId = requestAnimationFrame(render);
  }

  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  render();
}

// ---------------------------
// Capture (center crop, not mirrored)
// ---------------------------
function isCameraReady() {
  if (video.videoWidth && video.videoHeight) return true;
  alert('Camera not ready yet.');
  return false;
}

// The current video frame, center-cropped to the capture aspect, at width×height
function grabVideoFrame(width, height) {
  const { sx, sy, sw, sh } = computeCaptureCrop(video.videoWidth, video.videoHeight);
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  off.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
  return off;
}

function flashAndFreeze() {
  triggerFlash();

  // Freeze-frame preview — draw the same cropped region as the live preview
  const cw = cameraCanvas.width;
  const ch = cameraCanvas.height;
  if (cw && ch) {
    const { sx, sy, sw, sh } = computeCaptureCrop(video.videoWidth, video.videoHeight);
    const freezeCanvas = document.createElement('canvas');
    freezeCanvas.width = cw;
    freezeCanvas.height = ch;
    const fCtx = freezeCanvas.getContext('2d');
    fCtx.save();
    fCtx.scale(-1, 1);
    fCtx.translate(-cw, 0);
    fCtx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
    fCtx.restore();
    frozenFrame = freezeCanvas;
    freezeUntil = Date.now() + FREEZE_DURATION_MS;
  }
}

function captureOneShot() {
  if (!CONFIG || !isCameraReady()) return;
  capturedCanvases.push(grabVideoFrame(CONFIG.capture.photoWidth, CONFIG.capture.photoHeight));
  flashAndFreeze();
}

// ---------------------------
// GIF mode
// ---------------------------
// Event GIF settings, clamped to sane bounds, or null when GIF mode is off
function getGifSettings() {
  const g = CONFIG?.gif;
  if (!g?.enabled) return null;
  const clamp = (v, min, max, dflt) =>
    Math.min(max, Math.max(min, Number.isFinite(v) ? Math.round(v) : dflt));
  return {
    frames: clamp(g.frames, 2, 10, 5),
    intervalMs: clamp(g.intervalMs, 50, 500, 150),
    boomerang: g.boomerang !== false,
  };
}

// Downscale applied to a template when rendering its MP4
function videoScaleFor(template) {
  return Math.min(1, VIDEO_MAX_DIM / Math.max(template.width, template.height));
}

// Burst frames are stored at the largest scale any template will need, since
// the guest only picks a template after the shots are taken.
function gifBurstScale() {
  return Math.max(...CONFIG.templates.map(videoScaleFor));
}

// Grab `frames` frames `intervalMs` apart, then flash on the last one. The last
// frame is also kept full-size as the still (raw upload + template previews).
function captureBurst(gif, onDone) {
  if (!CONFIG || !isCameraReady()) {
    onDone();
    return;
  }
  const photoW = CONFIG.capture.photoWidth;
  const photoH = CONFIG.capture.photoHeight;
  const scale = gifBurstScale();
  const frameW = Math.round(photoW * scale);
  const frameH = Math.round(photoH * scale);
  const frames = [];

  const grab = () => {
    if (frames.length < gif.frames - 1) {
      frames.push(grabVideoFrame(frameW, frameH));
      countdownTimers.push(setTimeout(grab, gif.intervalMs));
      return;
    }
    const still = grabVideoFrame(photoW, photoH);
    const last = document.createElement('canvas');
    last.width = frameW;
    last.height = frameH;
    last.getContext('2d').drawImage(still, 0, 0, frameW, frameH);
    frames.push(last);
    capturedCanvases.push(still);
    capturedBursts.push(frames);
    flashAndFreeze();
    onDone();
  };
  grab();
}

// Playback sequence of burst-frame indexes: 0..n-1, then back down for a boomerang
function gifFrameOrder(gif) {
  const order = Array.from({ length: gif.frames }, (_, i) => i);
  if (gif.boomerang) {
    for (let i = gif.frames - 2; i > 0; i--) order.push(i);
  }
  return order;
}

// One composited collage canvas per burst frame, at video resolution.
// H.264 needs even dimensions, so the frames round to them.
function composeGifFrames(template, gif) {
  const scale = videoScaleFor(template);
  const round = (v) => Math.round(v / 2) * 2;
  const templateImg = templateImageCache.get(template.file);
  const slots = template.slots || [];
  const frames = [];
  for (let f = 0; f < gif.frames; f++) {
    const c = document.createElement('canvas');
    c.width = round(template.width * scale);
    c.height = round(template.height * scale);
    const ctx = c.getContext('2d');
    ctx.scale(c.width / template.width, c.height / template.height);
    capturedBursts.forEach((burst, i) => {
      const slot = slots[i];
      if (!slot) return;
      ctx.drawImage(burst[f], slot.x, slot.y, CONFIG.capture.photoWidth, CONFIG.capture.photoHeight);
    });
    if (templateImg) ctx.drawImage(templateImg, 0, 0, template.width, template.height);
    frames.push(c);
  }
  return frames;
}

// Loop the animation on the result screen while the MP4 encodes and uploads.
// Frames are scaled up onto photoCanvas so it keeps the still collage's size.
function startGifPreview(frames, order, intervalMs) {
  stopGifPreview();
  let i = 0;
  const draw = () => {
    photoCtx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
    photoCtx.drawImage(frames[order[i]], 0, 0, photoCanvas.width, photoCanvas.height);
    i = (i + 1) % order.length;
  };
  draw();
  gifPreviewTimer = setInterval(draw, intervalMs);
}

function stopGifPreview() {
  if (gifPreviewTimer) {
    clearInterval(gifPreviewTimer);
    gifPreviewTimer = null;
  }
}

// First H.264 profile this browser can encode at this size: High, Main, then Baseline
async function pickVideoConfig(width, height) {
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028']) {
    const config = {
      codec,
      width,
      height,
      bitrate: VIDEO_BITRATE,
      framerate: VIDEO_FPS,
      avc: { format: 'avc' },
    };
    try {
      const { supported } = await VideoEncoder.isConfigSupported(config);
      if (supported) return config;
    } catch {
      // Malformed for this browser — try the next profile
    }
  }
  throw new Error(`No supported H.264 encoder for ${width}x${height}`);
}

// Encode the loop as a constant-frame-rate VIDEO_SECONDS MP4 with WebCodecs
// (hardware H.264 in Chrome). Identical repeated frames compress to almost
// nothing, so the file stays small and the encode takes a second or two.
async function encodeMp4Loop(frames, order, intervalMs) {
  if (typeof VideoEncoder === 'undefined') throw new Error('WebCodecs is not available');
  const { Muxer, ArrayBufferTarget } = await import('./vendor/mp4-muxer.esm.js');
  const { width, height } = frames[0];
  const config = await pickVideoConfig(width, height);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: VIDEO_FPS },
    // moov atom up front so the video starts playing before it fully downloads
    fastStart: 'in-memory',
  });
  let encodeError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e;
    },
  });
  encoder.configure(config);

  const sources = frames.map((c) => new VideoFrame(c, { timestamp: 0 }));
  const frameUs = 1e6 / VIDEO_FPS;
  const totalFrames = VIDEO_SECONDS * VIDEO_FPS;
  try {
    for (let i = 0; i < totalFrames; i++) {
      if (encodeError) throw encodeError;
      const loopIndex = Math.floor((i * 1000) / VIDEO_FPS / intervalMs) % order.length;
      const frame = new VideoFrame(sources[order[loopIndex]], {
        timestamp: Math.round(i * frameUs),
        duration: Math.round(frameUs),
      });
      // A keyframe every 2 s keeps scrubbing cheap
      encoder.encode(frame, { keyFrame: i % (VIDEO_FPS * 2) === 0 });
      frame.close();
      // Backpressure — don't queue hundreds of frames on a slow encoder. Queued
      // frames share the few source frames' memory, so a deep queue is cheap and
      // keeps the encoder busy (a shallow one doubled the encode time).
      while (encoder.encodeQueueSize > 30) await new Promise((r) => setTimeout(r, 1));
    }
    await encoder.flush();
  } finally {
    sources.forEach((f) => f.close());
    if (encoder.state !== 'closed') encoder.close();
  }
  if (encodeError) throw encodeError;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

function encodeMp4(frames, order, intervalMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('MP4 encode timed out')), 30000);
  });
  return Promise.race([encodeMp4Loop(frames, order, intervalMs), timeout]).finally(() =>
    clearTimeout(timer)
  );
}

// ---------------------------
// Countdown
// ---------------------------
function startCountdown() {
  if (!CONFIG || isCountingDown) return;

  isCountingDown = true;
  setPressHintVisible(false);
  stopGestureDetection();

  const seconds = CONFIG.countdown?.seconds ?? 3;
  const intervalMs = CONFIG.countdown?.stepMs ?? 500;
  const totalShots = CONFIG.capture?.totalShots ?? 3;

  let remaining = seconds;
  showCountdownOverlay(remaining.toString());

  const timer = setInterval(() => {
    remaining--;

    if (remaining > 0) {
      showCountdownOverlay(remaining.toString());
    } else {
      clearInterval(timer);
      showCountdownOverlay('SMILE!', true);

      const afterCapture = () => {
        hideCountdownOverlay();

        const t2 = setTimeout(() => {
          currentShotIndex++;
          isCountingDown = false;
          updateShotCounter();

          if (currentShotIndex >= totalShots) {
            if (CONFIG.templates.length === 1) {
              buildTemplateCollage(0);
              showScreen(resultScreen);
              startAutoReset();
            } else {
              populateTemplateScreen();
              showScreen(templateScreen);
            }
          } else {
            setPressHintVisible(true);
            startGestureDetection();
          }
        }, FREEZE_DURATION_MS);
        countdownTimers.push(t2);
      };

      const t1 = setTimeout(() => {
        // GIF mode keeps "SMILE!" up through the burst and flashes on its last frame
        const gif = getGifSettings();
        if (gif) {
          captureBurst(gif, afterCapture);
        } else {
          captureOneShot();
          afterCapture();
        }
      }, 250);
      countdownTimers.push(t1);
    }
  }, intervalMs);
  countdownTimers.push(timer);
}

// ---------------------------
// Populate Template Screen
// ---------------------------
function populateTemplateScreen() {
  if (!CONFIG || !CONFIG.templates) return;

  templateGrid.innerHTML = '';
  selectedTemplateIndex = null;
  confirmBtn.classList.remove('visible');

  const PHOTO_W = CONFIG.capture.photoWidth;
  const PHOTO_H = CONFIG.capture.photoHeight;

  CONFIG.templates.forEach((template, index) => {
    const item = document.createElement('div');
    item.className = 'template-item';
    item.dataset.templateIndex = index;

    const card = document.createElement('div');
    card.className = 'template-item-card';
    card.style.aspectRatio = `${template.width} / ${template.height}`;

    const previewCanvas = document.createElement('canvas');
    const previewCtx = previewCanvas.getContext('2d');
    previewCanvas.width = template.width;
    previewCanvas.height = template.height;

    for (let i = 0; i < capturedCanvases.length; i++) {
      const slot = template.slots[i];
      if (!slot) continue;
      previewCtx.drawImage(capturedCanvases[i], slot.x, slot.y, PHOTO_W, PHOTO_H);
    }

    const templateImg = templateImageCache.get(template.file);
    if (templateImg) {
      previewCtx.drawImage(templateImg, 0, 0, template.width, template.height);
    }

    const numLabel = document.createElement('div');
    numLabel.className = 'template-number';
    numLabel.textContent = `Style ${index + 1}`;

    card.appendChild(previewCanvas);
    item.appendChild(card);
    item.appendChild(numLabel);
    templateGrid.appendChild(item);

    item.addEventListener('click', () => {
      if (selectedTemplateIndex !== null) {
        const prev = templateGrid.querySelector(`[data-template-index="${selectedTemplateIndex}"]`);
        if (prev) prev.classList.remove('selected');
      }
      item.classList.add('selected');
      selectedTemplateIndex = index;
      confirmBtn.classList.add('visible');
    });
  });
}

// ---------------------------
// Build final collage & upload
// ---------------------------
async function buildTemplateCollage(templateIndex = 0) {
  if (!CONFIG || !CONFIG.templates || !CONFIG.templates[templateIndex]) {
    console.error(`Invalid template index: ${templateIndex}`);
    return;
  }

  const template = CONFIG.templates[templateIndex];
  const templateImg = templateImageCache.get(template.file);

  const TEMPLATE_WIDTH = template.width;
  const TEMPLATE_HEIGHT = template.height;
  const PHOTO_W = CONFIG.capture.photoWidth;
  const PHOTO_H = CONFIG.capture.photoHeight;
  const PHOTO_SLOTS = template.slots || [];

  stopGifPreview();
  photoCanvas.width = TEMPLATE_WIDTH;
  photoCanvas.height = TEMPLATE_HEIGHT;

  const resultLayout = document.querySelector('.result-layout');
  if (resultLayout) {
    resultLayout.classList.toggle('landscape', TEMPLATE_WIDTH > TEMPLATE_HEIGHT);
  }

  // Snapshot the shots — a reset during the async MP4 encode clears capturedCanvases
  const shots = capturedCanvases.slice();
  const drawStillCollage = (ctx) => {
    ctx.clearRect(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
    for (let i = 0; i < shots.length; i++) {
      const slot = PHOTO_SLOTS[i];
      if (!slot) continue;
      ctx.drawImage(shots[i], slot.x, slot.y, PHOTO_W, PHOTO_H);
    }

    if (templateImg) {
      ctx.drawImage(templateImg, 0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
    }
  };
  drawStillCollage(photoCtx);

  // The sessionId is the only thing guarding a guest's photo link, so the suffix is
  // 122 bits from the CSPRNG. The timestamp prefix lets the admin grid sort and date it.
  currentSessionId = `${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
  const sessionId = currentSessionId;
  if (!CONFIG.eventId)
    console.warn('[QR] CONFIG.eventId is not set — upload will be rejected by the server');

  // The QR goes up before the encode/upload finishes — the URL only needs the
  // sessionId, and the guest page shows "on its way…" and polls until it lands.
  const qrUrl = `${CONFIG.serverUrl}/p/${sessionId}${CONFIG.eventId ? `?eventId=${encodeURIComponent(CONFIG.eventId)}` : ''}`;
  const qrSize = CONFIG.qr?.size ?? 300;
  const qrMargin = CONFIG.qr?.margin ?? null;
  if (qrImg) {
    qrImg.src = generateQRDataURL(qrUrl, qrSize, qrMargin);
    qrImg.style.setProperty('--qr-size', `${qrSize}px`);
  }

  // GIF mode: the animated collage is encoded as an MP4 for the guest to save.
  // The still collage still uploads alongside it — thumbnails, the admin grid and
  // the slideshow fall back to it, and it's all the guest gets if encoding fails.
  const gif = getGifSettings();
  const upload = { rawCanvases: shots };
  if (gif && capturedBursts.length > 0) {
    // The preview below draws over photoCanvas, so the still gets its own canvas
    const still = document.createElement('canvas');
    still.width = TEMPLATE_WIDTH;
    still.height = TEMPLATE_HEIGHT;
    drawStillCollage(still.getContext('2d'));
    upload.collageCanvas = still;

    const frames = composeGifFrames(template, gif);
    const order = gifFrameOrder(gif);
    startGifPreview(frames, order, gif.intervalMs);
    setUploadStatus('Making your video…', { pending: true });
    try {
      upload.videoBlob = await encodeMp4(frames, order, gif.intervalMs);
    } catch (err) {
      console.error('[MP4] encode failed — uploading the still collage only:', err);
      if (sessionId === currentSessionId) {
        stopGifPreview();
        drawStillCollage(photoCtx);
      }
    }
  }

  if (sessionId === currentSessionId) setUploadStatus('Uploading…', { pending: true });
  const saved = await uploadSession(sessionId, upload);

  // Nothing will ever arrive at this QR's URL — take it down
  if (saved === false && sessionId === currentSessionId && qrImg) qrImg.src = '';
}

// ---------------------------
// QR code helpers
// ---------------------------
function generateQRDataURL(url, targetSize, margin) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const cellSize = Math.max(2, Math.floor(targetSize / (qr.getModuleCount() + 8)));
  const marginPx = margin != null ? margin : Math.ceil(cellSize * 4);
  return qr.createDataURL(cellSize, marginPx);
}

// `pending` adds a spinner so a slow encode/upload reads as working, not stuck
function setUploadStatus(text, { pending = false } = {}) {
  const el = document.getElementById('upload-status');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('pending', pending);
}

// ---------------------------
// Upload raw shots + collage
// ---------------------------
// The collage is a canvas to encode as JPEG (or a ready-made blob). GIF mode also
// sends the MP4 loop as `video`.
async function uploadSession(
  sessionId,
  {
    rawCanvases = capturedCanvases,
    collageCanvas = photoCanvas,
    collageBlob = null,
    videoBlob = null,
  } = {}
) {
  if (!CONFIG) return;

  // Snapshot canvases synchronously before any async gaps to prevent a race
  // where session reset or a new capture overwrites them mid-upload.
  // Uses OffscreenCanvas when available (Chrome/modern Safari); falls back to a
  // regular <canvas> + toBlob() for iPadOS < 16.4 where OffscreenCanvas lacks convertToBlob.
  const supportsOffscreen =
    typeof OffscreenCanvas !== 'undefined' &&
    typeof OffscreenCanvas.prototype.convertToBlob === 'function';

  function canvasToBlob(sourceCanvas) {
    if (supportsOffscreen) {
      const s = new OffscreenCanvas(sourceCanvas.width, sourceCanvas.height);
      s.getContext('2d').drawImage(sourceCanvas, 0, 0);
      return s.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    }
    // Fallback: copy into a regular <canvas> and use the callback-based toBlob API
    const el = document.createElement('canvas');
    el.width = sourceCanvas.width;
    el.height = sourceCanvas.height;
    el.getContext('2d').drawImage(sourceCanvas, 0, 0);
    return new Promise((resolve, reject) => {
      el.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('toBlob returned null — canvas may be empty or tainted'));
        },
        'image/jpeg',
        0.9
      );
    });
  }

  let rawBlobs;
  try {
    rawBlobs = await Promise.all(rawCanvases.map((c) => canvasToBlob(c)));
    if (!collageBlob) collageBlob = await canvasToBlob(collageCanvas);
  } catch (err) {
    console.error('[UPLOAD] canvas snapshot failed — not queuing retry:', err);
    if (sessionId === currentSessionId) setUploadStatus('Error: could not capture image. Please retake.');
    return false;
  }

  const formData = new FormData();
  formData.append('sessionId', sessionId);
  if (CONFIG.eventId) formData.append('eventId', CONFIG.eventId);
  if (CONFIG.kioskKey) formData.append('kioskKey', CONFIG.kioskKey);
  rawBlobs.forEach((blob, i) => {
    if (blob) formData.append(`raw${i + 1}`, blob, `raw${i + 1}.jpg`);
  });
  if (collageBlob) {
    const ext = collageBlob.type === 'image/gif' ? 'gif' : 'jpg';
    formData.append('collage', collageBlob, `collage.${ext}`);
  }
  if (videoBlob) formData.append('video', videoBlob, 'video.mp4');

  // Set when the server refuses this booth link's kiosk key — retrying won't help
  // until staff open the current link, so say so instead of "will sync"
  let rejectedKey = false;
  try {
    const uploadCtrl = new AbortController();
    // A few extra MB of video needs more headroom on venue wifi
    const uploadTimeout = setTimeout(() => uploadCtrl.abort(), videoBlob ? 30000 : 15000);
    const res = await fetch(`${CONFIG.serverUrl}/api/save`, {
      method: 'POST',
      body: formData,
      signal: uploadCtrl.signal,
    });
    clearTimeout(uploadTimeout);
    if (res.status === 401) rejectedKey = true;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (sessionId === currentSessionId) setUploadStatus('Ready! Scan to view.');
    console.log('[UPLOAD] success', sessionId);
  } catch (err) {
    console.warn('[UPLOAD] failed, queuing offline:', err);
    await window.OfflineQueue.enqueueSession({
      sessionId,
      eventId: CONFIG.eventId,
      kioskKey: CONFIG.kioskKey,
      rawBlobs,
      collageBlob,
      videoBlob,
    });
    refreshQueueBadge();
    if (sessionId === currentSessionId) {
      setUploadStatus(
        rejectedKey
          ? 'Saved on this booth — upload refused: this booth link is out of date. Staff: open the current booth link.'
          : 'Saved — will sync when internet returns.'
      );
    }
  }
}

// ---------------------------
// Offline queue UI / draining
// ---------------------------
// Latest known queue depth, kept in sync so the synchronous beforeunload
// handler can read it without awaiting IndexedDB.
let lastQueueDepth = 0;

async function refreshQueueBadge() {
  if (!queueBadge || !window.OfflineQueue) return;
  try {
    const depth = await window.OfflineQueue.getQueueDepth();
    lastQueueDepth = depth;
    if (depth > 0) {
      queueBadge.textContent = `${depth} photo${depth === 1 ? '' : 's'} pending upload`;
      queueBadge.classList.remove('hidden');
    } else {
      queueBadge.classList.add('hidden');
    }
  } catch (err) {
    console.warn('[OfflineQueue] badge refresh failed:', err);
  }
}

// Drain the queue then refresh the on-screen badge.
async function drainAndRefresh() {
  if (!CONFIG?.serverUrl || !window.OfflineQueue) return;
  try {
    await window.OfflineQueue.drainQueue(CONFIG.serverUrl, {
      eventId: CONFIG.eventId,
      kioskKey: CONFIG.kioskKey,
    });
  } catch (err) {
    console.warn('[OfflineQueue] drain failed:', err);
  }
  refreshQueueBadge();
}

// ---------------------------
// Event listeners & init
// ---------------------------
function triggerCapture() {
  if (!CONFIG || !video.srcObject || isCountingDown) return;
  if (!idleScreen.classList.contains('active')) return;

  hideInstructions();
  clearIdleInactivityTimer();

  const totalShots = CONFIG.capture?.totalShots ?? 3;
  if (currentShotIndex >= totalShots) {
    currentShotIndex = 0;
    capturedCanvases.length = 0;
    capturedBursts.length = 0;
    frozenFrame = null;
    freezeUntil = 0;
    updateShotCounter();
  }

  startCountdown();
}

function triggerCaptureFromGesture() {
  stopGestureDetection();
  triggerCapture();
}

function attachEventListeners() {
  // Instruction popup controls
  const infoBtn = document.getElementById('info-btn');
  const instructionOverlay = document.getElementById('instruction-overlay');
  const instructionCloseBtn = document.getElementById('instruction-close-btn');

  if (infoBtn)
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showInstructions();
    });

  if (instructionCloseBtn)
    instructionCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideInstructions();
    });

  if (instructionOverlay)
    instructionOverlay.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === instructionOverlay) hideInstructions();
    });

  // Reset idle inactivity timer on any interaction
  ['click', 'touchstart'].forEach((evt) => {
    document.addEventListener(evt, resetIdleInactivityTimer, { passive: true });
  });

  idleScreen.addEventListener('click', triggerCapture);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'AudioVolumeUp') {
      e.preventDefault();
      triggerCapture();
    }
  });

  // WebHID — AB Shutter3 trigger (reportId=2, data[0]=1 on press).
  // Auto-connects to every granted device; granting access via the browser
  // permission prompt is the filter.
  if (navigator.hid) {
    navigator.hid.getDevices().then((devices) => {
      devices.forEach(async (device) => {
        try {
          if (!device.opened) await device.open();
          console.log(
            `[HID] Auto-connected: "${device.productName}" (${device.vendorId}:${device.productId})`
          );
          device.addEventListener('inputreport', (e) => {
            const bytes = new Uint8Array(e.data.buffer);
            if (e.reportId === 2 && bytes[0] === 1) {
              triggerCapture();
            }
          });
        } catch (err) {
          console.warn('[HID] Auto-connect failed:', err);
        }
      });
    });
  }

  confirmBtn.addEventListener('click', () => {
    if (selectedTemplateIndex === null) return;
    buildTemplateCollage(selectedTemplateIndex);
    showScreen(resultScreen);
    startAutoReset();
    selectedTemplateIndex = null;
    confirmBtn.classList.remove('visible');
  });

  function resetSession() {
    if (!CONFIG) return;
    countdownTimers.forEach((id) => clearTimeout(id));
    countdownTimers = [];
    clearAutoReset();
    currentShotIndex = 0;
    isCountingDown = false;
    capturedCanvases.length = 0;
    capturedBursts.length = 0;
    stopGifPreview();
    frozenFrame = null;
    freezeUntil = 0;
    selectedTemplateIndex = null;
    hideCountdownOverlay();
    updateShotCounter();
    updateResetBtn();

    if (qrImg) qrImg.src = '';
    currentSessionId = null;
    setUploadStatus('');

    showScreen(idleScreen);
    startGestureDetection();

    if (autoResetTriggered) {
      autoResetTriggered = false;
      showInstructions();
    } else {
      startIdleInactivityTimer();
    }
  }

  backBtn.addEventListener('click', resetSession);
  resetBtn.addEventListener('click', () => location.reload());
  templateResetBtn.addEventListener('click', () => location.reload());

  // Hide cursor after 5s inactivity (kiosk mode)
  let cursorTimer = null;
  document.addEventListener('mousemove', () => {
    document.body.style.cursor = '';
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => {
      document.body.style.cursor = 'none';
    }, 5000);
  });

  // Prevent pull-to-refresh and overscroll on touch devices
  document.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
    },
    { passive: false }
  );
}

async function init() {
  try {
    // loadConfig returns false when the page was replaced with an event error screen
    if ((await loadConfig()) === false) return;
    buildInstructionRules();
    attachEventListeners();
    acquireWakeLock();
    startCamera();
    showInstructions();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.warn('[SW] Registration failed:', err));
    }

    // Ask the browser to keep IndexedDB storage durable (reduces eviction
    // risk for queued full-res blobs). Feature-detected; best-effort.
    if (navigator.storage?.persist) {
      navigator.storage
        .persist()
        .then((granted) => console.log('[OfflineQueue] persistent storage:', granted))
        .catch(() => {});
    }

    // Warn staff if they try to close the booth with un-uploaded sessions.
    window.addEventListener('beforeunload', (e) => {
      if (lastQueueDepth > 0) {
        e.preventDefault();
        e.returnValue = `${lastQueueDepth} session${lastQueueDepth === 1 ? '' : 's'} pending upload.`;
        return e.returnValue;
      }
    });

    if (CONFIG?.serverUrl) {
      refreshQueueBadge();
      drainAndRefresh();
      // Drain as soon as connectivity returns.
      window.addEventListener('online', drainAndRefresh);
      setInterval(() => {
        if (idleScreen.classList.contains('active')) {
          drainAndRefresh();
        }
      }, 60_000);
    }
  } catch (err) {
    console.error('[INIT] Failed to initialize:', err);
    const RETRY_SECONDS = 10;
    showErrorOverlay(
      'Configuration error',
      `Failed to load the photobooth configuration. Please check the network connection.`,
      RETRY_SECONDS
    );
    setTimeout(() => location.reload(), RETRY_SECONDS * 1000);
  }
}

document.addEventListener('DOMContentLoaded', init);
