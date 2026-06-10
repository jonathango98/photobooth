// ---------------------------
// Global config & state
// ---------------------------
let CONFIG = null;

// Elements
const idleScreen       = document.getElementById("idle-screen");
const templateScreen   = document.getElementById("template-screen");
const resultScreen     = document.getElementById("result-screen");
const cameraCanvas     = document.getElementById("camera-canvas");
const cameraCtx        = cameraCanvas.getContext("2d");
const idleText         = document.getElementById("idle-text");
const video            = document.getElementById("video");
const photoCanvas      = document.getElementById("photo-canvas");
const photoCtx         = photoCanvas.getContext("2d");
const backBtn          = document.getElementById("back-btn");
const qrImg            = document.getElementById("qr-img");
const templateGrid     = document.getElementById("template-grid");
const flashOverlay     = document.getElementById("flash-overlay");
const siteNameEl       = document.getElementById("site-name");
const shotCounter      = document.getElementById("shot-counter");
const countdownOverlay = document.getElementById("countdown-overlay");
const pressHint        = document.getElementById("press-hint");
const confirmBtn       = document.getElementById("confirm-btn");
const resetBar         = document.getElementById("reset-bar");
const resetBtn         = document.getElementById("reset-btn");
const templateResetBtn = document.getElementById("template-reset-btn");

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

// Template image cache
const templateImageCache = new Map();

// Current session
let currentSessionId = null;

// Gesture detection state
let handLandmarker = null;
let gestureDetectionInterval = null;
let peaceSignStartTime = null;
let peaceConsecutiveCount = 0;
const PEACE_CONSECUTIVE_REQUIRED = 3;
const peaceProgress = document.getElementById("peace-progress");
const peaceRing = document.getElementById("peace-ring");
const PEACE_RING_CIRCUMFERENCE = 339.292;

// ---------------------------
// Config loading
// ---------------------------
const _urlEventId = new URLSearchParams(window.location.search).get('event');

function showEventError(title, msgNodes) {
  const outer = document.createElement("div");
  outer.setAttribute("style", "display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1714;color:#f7f2d5;font-family:'IBM Plex Mono',monospace;text-align:center;padding:24px;");
  const inner = document.createElement("div");
  const h1 = document.createElement("div");
  h1.setAttribute("style", "font-size:48px;margin-bottom:16px;");
  h1.textContent = "404";
  const h2 = document.createElement("div");
  h2.setAttribute("style", "font-size:18px;margin-bottom:8px;");
  h2.textContent = title;
  const msg = document.createElement("div");
  msg.setAttribute("style", "font-size:13px;color:rgba(247,242,213,0.5);");
  for (const node of msgNodes) msg.appendChild(node);
  inner.appendChild(h1);
  inner.appendChild(h2);
  inner.appendChild(msg);
  outer.appendChild(inner);
  document.body.textContent = "";
  document.body.appendChild(outer);
}

function showEventNotFound(eventId) {
  const strong = document.createElement("strong");
  strong.textContent = eventId;
  showEventError("Event not found", [
    document.createTextNode("No event with ID "),
    strong,
    document.createTextNode(" exists. Check the URL and try again."),
  ]);
}

function showMissingEventId() {
  // Show landing page instead of an error — the bare root URL is public-facing
  document.title = "Photo Booth";

  const idleScreen = document.getElementById("idle-screen");
  if (idleScreen) {
    idleScreen.classList.remove("active");
    idleScreen.hidden = true;
  }

  const landingScreen = document.getElementById("landing-screen");
  if (landingScreen) {
    landingScreen.hidden = false;
  }

  // AJAX form submission so visitors get an inline thank-you
  const form = document.getElementById("inquiry-form");
  const statusEl = document.getElementById("landing-form-status");
  if (form && statusEl) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector("button[type=submit]");
      if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await fetch("/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(new FormData(form)).toString(),
        });
        if (res.ok) {
          form.hidden = true;
          statusEl.textContent = "Thanks — I'll get back to you soon.";
          statusEl.className = "landing-form-success";
          statusEl.hidden = false;
        } else {
          statusEl.textContent = "Something went wrong — please try again or email directly.";
          statusEl.className = "landing-form-error";
          statusEl.hidden = false;
          if (submitBtn) submitBtn.disabled = false;
        }
      } catch (_err) {
        statusEl.textContent = "Something went wrong — please try again or email directly.";
        statusEl.className = "landing-form-error";
        statusEl.hidden = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
}

// ---------------------------
// Error overlay (camera / config failures)
// ---------------------------
const _errorOverlay  = document.getElementById("error-overlay");
const _errorTitle    = document.getElementById("error-title");
const _errorMsg      = document.getElementById("error-msg");
const _errorRetryLbl = document.getElementById("error-retry-label");

function showErrorOverlay(title, msg, retrySeconds) {
  if (_errorTitle) _errorTitle.textContent = title;
  if (_errorMsg) _errorMsg.textContent = msg;
  if (_errorRetryLbl) {
    _errorRetryLbl.textContent = retrySeconds
      ? `Retrying in ${retrySeconds}s…`
      : "Retrying…";
  }
  if (_errorOverlay) _errorOverlay.classList.add("visible");
}

function hideErrorOverlay() {
  if (_errorOverlay) _errorOverlay.classList.remove("visible");
}

// ---------------------------
// Screen Wake Lock (H6)
// ---------------------------
let _wakeLock = null;

async function acquireWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    _wakeLock = await navigator.wakeLock.request("screen");
    _wakeLock.addEventListener("release", () => {
      _wakeLock = null;
      // Re-acquire if the document is still visible
      if (document.visibilityState === "visible") acquireWakeLock();
    });
    console.log("[WAKE] Screen wake lock acquired.");
  } catch (e) {
    console.warn("[WAKE] Wake lock request failed:", e);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !_wakeLock) acquireWakeLock();
});

async function loadConfig() {
  // The event in the URL is the source of truth — multiple events can run at
  // once on different kiosks, so there is no "active event" fallback.
  if (!_urlEventId) {
    showMissingEventId();
    return false;
  }

  const staticRes = await fetch("config.json");
  if (!staticRes.ok) {
    throw new Error(`Failed to load config.json: ${staticRes.status}`);
  }
  const staticConfig = await staticRes.json();

  // Merge config.dev.json overrides when present (local dev only — not deployed)
  const devRes = await fetch("config.dev.json").catch(() => null);
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
          background_url: eventConfig.background_url || null,
          qr: eventConfig.qr ?? staticConfig.qr,
        };
        usedServerConfig = true;
        console.log("[CONFIG] Loaded from server API:", CONFIG.eventId);
      }
    } catch (e) {
      console.warn("[CONFIG] Server config fetch failed, falling back to config.json:", e);
    }
  }

  if (!usedServerConfig) {
    CONFIG = staticConfig;
    console.log("[CONFIG] Using static config.json.");
  }

  // Ensure eventId is always populated — fall back to the URL ?event= param
  if (!CONFIG.eventId && _urlEventId) {
    CONFIG.eventId = _urlEventId;
  }

  if (CONFIG.siteName) {
    document.title = CONFIG.siteName;
    if (siteNameEl) siteNameEl.textContent = CONFIG.siteName;
  }

  document.body.style.backgroundImage = CONFIG.background_url
    ? `url('${CONFIG.background_url}')`
    : `url('assets/background.webp')`;

  if (CONFIG.templates) {
    await Promise.all(CONFIG.templates.map(t => loadTemplateImage(t.file)));
  }
}

function loadTemplateImage(src) {
  if (templateImageCache.has(src)) {
    return Promise.resolve(templateImageCache.get(src));
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { templateImageCache.set(src, img); resolve(img); };
    img.onerror = () => { console.warn(`[TEMPLATE] Image ${src} failed to load.`); resolve(null); };
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
    const { FilesetResolver, HandLandmarker } = await import(
      "./vendor/mediapipe/vision_bundle.mjs"
    );
    const fileset = await FilesetResolver.forVisionTasks(
      "./vendor/mediapipe/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "./vendor/mediapipe/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    });
    console.log("[GESTURE] HandLandmarker initialized.");
  } catch (e) {
    console.error("[GESTURE] Failed to init HandLandmarker:", e);
  }
}

function isPeaceSign(landmarks) {
  // In MediaPipe, y increases downward, so "extended" = tip.y < pip.y
  const indexExtended = landmarks[8].y < landmarks[6].y;
  const middleExtended = landmarks[12].y < landmarks[10].y;
  const ringCurled = landmarks[16].y > landmarks[14].y;
  const pinkyCurled = landmarks[20].y > landmarks[18].y;
  return indexExtended && middleExtended && ringCurled && pinkyCurled;
}

function isOpenPalm(landmarks) {
  // Check each finger at two joints for stricter detection
  const indexExtended = landmarks[8].y < landmarks[6].y && landmarks[6].y < landmarks[5].y;
  const middleExtended = landmarks[12].y < landmarks[10].y && landmarks[10].y < landmarks[9].y;
  const ringExtended = landmarks[16].y < landmarks[14].y && landmarks[14].y < landmarks[13].y;
  const pinkyExtended = landmarks[20].y < landmarks[18].y && landmarks[18].y < landmarks[17].y;
  const thumbExtended = landmarks[4].y < landmarks[3].y && landmarks[4].x > landmarks[3].x;
  return indexExtended && middleExtended && ringExtended && pinkyExtended && thumbExtended;
}

function isThumbsUp(landmarks) {
  // Thumb clearly raised above the MCP joint (not just the IP joint)
  const thumbExtended = landmarks[4].y < landmarks[2].y;
  // Only require 3 of 4 fingers to be curled for more leniency
  const indexCurled = landmarks[8].y > landmarks[6].y;
  const middleCurled = landmarks[12].y > landmarks[10].y;
  const ringCurled = landmarks[16].y > landmarks[14].y;
  const pinkyCurled = landmarks[20].y > landmarks[18].y;
  const curledCount = [indexCurled, middleCurled, ringCurled, pinkyCurled].filter(Boolean).length;
  return thumbExtended && curledCount >= 3;
}

function getGestureDetector() {
  const type = CONFIG?.gestureTrigger?.gestureType ?? "peace";
  if (type === "palm") return isOpenPalm;
  if (type === "thumbsup") return isThumbsUp;
  return isPeaceSign;
}

function getGestureEmoji() {
  const type = CONFIG?.gestureTrigger?.gestureType ?? "peace";
  if (type === "palm") return "🖐️";
  if (type === "thumbsup") return "👍";
  return "✌️";
}

function startGestureDetection() {
  if (!handLandmarker || !CONFIG?.gestureTrigger?.enabled) return;
  stopGestureDetection();

  const fps = CONFIG.gestureTrigger.detectionFps ?? 10;
  const holdDuration = CONFIG.gestureTrigger.holdDuration ?? 2000;
  const detectGesture = getGestureDetector();

  const gestureEmoji = document.getElementById("gesture-emoji");
  if (gestureEmoji) gestureEmoji.textContent = getGestureEmoji();

  gestureDetectionInterval = setInterval(() => {
    if (!video.srcObject || video.readyState < 2) return;
    if (!idleScreen.classList.contains("active")) return;
    if (isCountingDown) return;

    const results = handLandmarker.detectForVideo(video, performance.now());

    let peaceDetected = false;
    if (results.landmarks && results.landmarks.length > 0) {
      peaceDetected = detectGesture(results.landmarks[0]);
    }

    if (peaceDetected) {
      peaceConsecutiveCount++;

      if (peaceConsecutiveCount >= PEACE_CONSECUTIVE_REQUIRED) {
        if (!peaceSignStartTime) {
          peaceSignStartTime = Date.now();
          peaceProgress.classList.add("visible");
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
  if (peaceProgress) peaceProgress.classList.remove("visible");
  if (peaceRing) peaceRing.style.strokeDashoffset = PEACE_RING_CIRCUMFERENCE;
}

// ---------------------------
// UI helpers
// ---------------------------
function showScreen(screen) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  screen.classList.add("active");
  if (screen !== idleScreen) {
    if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
  } else if (stream && !animationFrameId) {
    startRenderLoop();
  }
}

function triggerFlash() {
  flashOverlay.style.transition = "opacity 0.05s ease-in";
  flashOverlay.style.opacity = "1";
  setTimeout(() => {
    flashOverlay.style.transition = "opacity 0.6s ease-out";
    flashOverlay.style.opacity = "0";
  }, 80);
}

function showCountdownOverlay(text, isSmile = false) {
  countdownOverlay.textContent = text;
  countdownOverlay.classList.remove("show", "smile");
  void countdownOverlay.offsetWidth; // force reflow to restart animation
  countdownOverlay.classList.add("show");
  if (isSmile) countdownOverlay.classList.add("smile");
}

function hideCountdownOverlay() {
  countdownOverlay.classList.remove("show", "smile");
  countdownOverlay.textContent = "";
}

function updateShotCounter() {
  if (!CONFIG || !stream) return;
  const totalShots = CONFIG.capture?.totalShots ?? 3;
  if (currentShotIndex < totalShots) {
    shotCounter.textContent = `${currentShotIndex + 1} / ${totalShots}`;
  } else {
    shotCounter.textContent = "";
  }
  updateResetBtn();
}

function updateResetBtn() {
  if (currentShotIndex > 0) {
    resetBtn.classList.remove("hidden");
  } else {
    resetBtn.classList.add("hidden");
  }
}

function startAutoReset() {
  const seconds = CONFIG?.autoResetSeconds ?? 60;
  clearAutoReset();
  resetBar.style.transition = "none";
  resetBar.style.transform = "scaleX(1)";
  void resetBar.offsetWidth;
  resetBar.style.transition = `transform ${seconds}s linear`;
  resetBar.style.transform = "scaleX(0)";

  const resetSecondsEl = document.getElementById("reset-seconds");
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
    resetBar.style.transition = "none";
    resetBar.style.transform = "scaleX(1)";
  }
}

// ---------------------------
// Instruction popup
// ---------------------------
function buildInstructionRules() {
  const rulesEl = document.getElementById("instruction-rules");
  const disclaimerEl = document.getElementById("instruction-disclaimer");
  if (!rulesEl || !CONFIG) return;

  rulesEl.innerHTML = "";
  const totalShots = CONFIG.capture?.totalShots ?? 3;
  const gestureEnabled = CONFIG.gestureTrigger?.enabled;
  const gestureType = CONFIG.gestureTrigger?.gestureType ?? "peace";
  const templateCount = CONFIG.templates?.length ?? 1;

  // Rule 1: How to start
  const rule1 = document.createElement("li");
  if (gestureEnabled) {
    const gestureNames = { peace: "peace sign ✌️", palm: "open palm 🖐️", thumbsup: "thumbs up 👍" };
    const gestureName = gestureNames[gestureType] || gestureType;
    rule1.textContent = `Tap the screen or show a ${gestureName} to start.`;
  } else {
    rule1.textContent = "Tap the screen to start.";
  }
  rulesEl.appendChild(rule1);

  // Rule 2: Shots & template
  const rule2 = document.createElement("li");
  if (templateCount > 1) {
    rule2.textContent = `After ${totalShots} shots, choose a template.`;
  } else {
    rule2.textContent = `Take ${totalShots} shots.`;
  }
  rulesEl.appendChild(rule2);

  // Rule 3: QR download
  const rule3 = document.createElement("li");
  rule3.textContent = "Scan the QR code to download your picture!";
  rulesEl.appendChild(rule3);

  // Disclaimer
  if (disclaimerEl) {
    disclaimerEl.textContent = "Please be gentle with the iPad 😢";
  }
}

function showInstructions() {
  const overlay = document.getElementById("instruction-overlay");
  if (overlay) overlay.classList.add("visible");
  clearIdleInactivityTimer();
}

function hideInstructions() {
  const overlay = document.getElementById("instruction-overlay");
  if (overlay) overlay.classList.remove("visible");
  startIdleInactivityTimer();
}

function startIdleInactivityTimer() {
  clearIdleInactivityTimer();
  idleInactivityTimer = setTimeout(() => {
    if (idleScreen.classList.contains("active") && !isCountingDown) {
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
  if (idleScreen.classList.contains("active") && !isCountingDown) {
    const overlay = document.getElementById("instruction-overlay");
    if (overlay && !overlay.classList.contains("visible")) {
      startIdleInactivityTimer();
    }
  }
}

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
      video: { facingMode: "user" },
      audio: false,
    });

    video.srcObject = stream;
    video.onloadedmetadata = () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      const aspect = vw / vh;
      const displayWidth  = 1000;
      const displayHeight = displayWidth / aspect;

      cameraCanvas.width  = displayWidth;
      cameraCanvas.height = displayHeight;

      if (idleText) idleText.style.display = "none";
      if (pressHint) pressHint.classList.remove("hidden");
      updateShotCounter();

      video.play();
      startRenderLoop();
      initHandLandmarker().then(startGestureDetection);
    };
  } catch (e) {
    console.error("[CAM] error:", e);
    const RETRY_SECONDS = 5;
    showErrorOverlay(
      "Camera unavailable",
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
        cameraCtx.save();
        cameraCtx.scale(-1, 1);
        cameraCtx.translate(-cw, 0);
        cameraCtx.drawImage(video, 0, 0, cw, ch);
        cameraCtx.restore();
      } else {
        cameraCtx.fillStyle = "#1a1714";
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
function captureOneShot() {
  if (!CONFIG) return;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) { alert("Camera not ready yet."); return; }

  const targetW = CONFIG.capture.photoWidth;
  const targetH = CONFIG.capture.photoHeight;
  const targetAspect = targetW / targetH;
  const videoAspect  = vw / vh;

  let sx, sy, sw, sh;
  if (videoAspect > targetAspect) {
    sh = vh; sw = sh * targetAspect; sx = (vw - sw) / 2; sy = 0;
  } else {
    sw = vw; sh = sw / targetAspect; sx = 0; sy = (vh - sh) / 2;
  }

  const off = document.createElement("canvas");
  off.width  = targetW;
  off.height = targetH;
  const offCtx = off.getContext("2d");
  offCtx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);
  capturedCanvases.push(off);

  triggerFlash();

  // Freeze-frame preview
  const cw = cameraCanvas.width;
  const ch = cameraCanvas.height;
  if (cw && ch) {
    const freezeCanvas = document.createElement("canvas");
    freezeCanvas.width  = cw;
    freezeCanvas.height = ch;
    const fCtx = freezeCanvas.getContext("2d");
    fCtx.save();
    fCtx.scale(-1, 1);
    fCtx.translate(-cw, 0);
    fCtx.drawImage(video, 0, 0, cw, ch);
    fCtx.restore();
    frozenFrame = freezeCanvas;
    freezeUntil = Date.now() + FREEZE_DURATION_MS;
  }
}

// ---------------------------
// Countdown
// ---------------------------
function startCountdown() {
  if (!CONFIG || isCountingDown) return;

  isCountingDown = true;
  pressHint.classList.add("hidden");
  stopGestureDetection();

  const seconds    = CONFIG.countdown?.seconds ?? 3;
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
      showCountdownOverlay("SMILE!", true);

      const t1 = setTimeout(() => {
        captureOneShot();
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
            pressHint.classList.remove("hidden");
            startGestureDetection();
          }
        }, FREEZE_DURATION_MS);
        countdownTimers.push(t2);
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

  templateGrid.innerHTML = "";
  selectedTemplateIndex = null;
  confirmBtn.classList.remove("visible");

  const PHOTO_W = CONFIG.capture.photoWidth;
  const PHOTO_H = CONFIG.capture.photoHeight;

  CONFIG.templates.forEach((template, index) => {
    const item = document.createElement("div");
    item.className = "template-item";
    item.dataset.templateIndex = index;

    const card = document.createElement("div");
    card.className = "template-item-card";
    card.style.aspectRatio = `${template.width} / ${template.height}`;

    const previewCanvas = document.createElement("canvas");
    const previewCtx = previewCanvas.getContext("2d");
    previewCanvas.width  = template.width;
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

    const numLabel = document.createElement("div");
    numLabel.className = "template-number";
    numLabel.textContent = `Style ${index + 1}`;

    card.appendChild(previewCanvas);
    item.appendChild(card);
    item.appendChild(numLabel);
    templateGrid.appendChild(item);

    item.addEventListener("click", () => {
      if (selectedTemplateIndex !== null) {
        const prev = templateGrid.querySelector(`[data-template-index="${selectedTemplateIndex}"]`);
        if (prev) prev.classList.remove("selected");
      }
      item.classList.add("selected");
      selectedTemplateIndex = index;
      confirmBtn.classList.add("visible");
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

  const template    = CONFIG.templates[templateIndex];
  const templateImg = templateImageCache.get(template.file);

  const TEMPLATE_WIDTH  = template.width;
  const TEMPLATE_HEIGHT = template.height;
  const PHOTO_W         = CONFIG.capture.photoWidth;
  const PHOTO_H         = CONFIG.capture.photoHeight;
  const PHOTO_SLOTS     = template.slots || [];

  photoCanvas.width  = TEMPLATE_WIDTH;
  photoCanvas.height = TEMPLATE_HEIGHT;
  photoCtx.clearRect(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);

  const resultLayout = document.querySelector(".result-layout");
  if (resultLayout) {
    resultLayout.classList.toggle("landscape", TEMPLATE_WIDTH > TEMPLATE_HEIGHT);
  }

  for (let i = 0; i < capturedCanvases.length; i++) {
    const slot = PHOTO_SLOTS[i];
    if (!slot) continue;
    photoCtx.drawImage(capturedCanvases[i], slot.x, slot.y, PHOTO_W, PHOTO_H);
  }

  if (templateImg) {
    photoCtx.drawImage(templateImg, 0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
  }

  currentSessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  if (!CONFIG.eventId) console.warn("[QR] CONFIG.eventId is not set — upload will be rejected by the server");
  setUploadStatus("Uploading…");
  await uploadSession(currentSessionId);

  // Show QR only after upload confirmed (success or offline-queued)
  const qrUrl = `${CONFIG.serverUrl}/p/${currentSessionId}${CONFIG.eventId ? `?eventId=${encodeURIComponent(CONFIG.eventId)}` : ""}`;
  const qrSize   = CONFIG.qr?.size   ?? 300;
  const qrMargin = CONFIG.qr?.margin ?? null;
  if (qrImg) {
    qrImg.src = generateQRDataURL(qrUrl, qrSize, qrMargin);
    qrImg.style.width  = `${qrSize}px`;
    qrImg.style.height = `${qrSize}px`;
  }
}

// ---------------------------
// QR code helpers
// ---------------------------
function generateQRDataURL(url, targetSize, margin) {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const cellSize   = Math.max(2, Math.floor(targetSize / (qr.getModuleCount() + 8)));
  const marginPx   = margin != null ? margin : Math.ceil(cellSize * 4);
  return qr.createDataURL(cellSize, marginPx);
}

function setUploadStatus(text) {
  const el = document.getElementById("upload-status");
  if (el) el.textContent = text;
}

// ---------------------------
// Upload raw shots + collage
// ---------------------------
async function uploadSession(sessionId) {
  if (!CONFIG) return;

  // Snapshot canvases synchronously before any async gaps to prevent a race
  // where session reset or a new capture overwrites them mid-upload.
  // Uses OffscreenCanvas when available (Chrome/modern Safari); falls back to a
  // regular <canvas> + toBlob() for iPadOS < 16.4 where OffscreenCanvas lacks convertToBlob.
  const supportsOffscreen =
    typeof OffscreenCanvas !== "undefined" &&
    typeof OffscreenCanvas.prototype.convertToBlob === "function";

  function canvasToBlob(sourceCanvas) {
    if (supportsOffscreen) {
      const s = new OffscreenCanvas(sourceCanvas.width, sourceCanvas.height);
      s.getContext("2d").drawImage(sourceCanvas, 0, 0);
      return s.convertToBlob({ type: "image/jpeg", quality: 0.9 });
    }
    // Fallback: copy into a regular <canvas> and use the callback-based toBlob API
    const el = document.createElement("canvas");
    el.width = sourceCanvas.width;
    el.height = sourceCanvas.height;
    el.getContext("2d").drawImage(sourceCanvas, 0, 0);
    return new Promise((resolve, reject) => {
      el.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("toBlob returned null — canvas may be empty or tainted"));
      }, "image/jpeg", 0.9);
    });
  }

  let rawBlobs, collageBlob;
  try {
    rawBlobs = await Promise.all(capturedCanvases.map(c => canvasToBlob(c)));
    collageBlob = await canvasToBlob(photoCanvas);
  } catch (err) {
    console.error("[UPLOAD] canvas snapshot failed — not queuing retry:", err);
    setUploadStatus("Error: could not capture image. Please retake.");
    return;
  }

  const formData = new FormData();
  formData.append("sessionId", sessionId);
  if (CONFIG.eventId) formData.append("eventId", CONFIG.eventId);
  rawBlobs.forEach((blob, i) => {
    if (blob) formData.append(`raw${i + 1}`, blob, `raw${i + 1}.jpg`);
  });
  if (collageBlob) formData.append("collage", collageBlob, "collage.jpg");

  try {
    const uploadCtrl = new AbortController();
    const uploadTimeout = setTimeout(() => uploadCtrl.abort(), 15000);
    const res = await fetch(`${CONFIG.serverUrl}/api/save`, {
      method: "POST",
      body: formData,
      signal: uploadCtrl.signal,
    });
    clearTimeout(uploadTimeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setUploadStatus("Ready! Scan to view.");
    console.log("[UPLOAD] success", sessionId);
  } catch (err) {
    console.warn("[UPLOAD] failed, queuing offline:", err);
    await window.OfflineQueue.enqueueSession({
      sessionId,
      eventId: CONFIG.eventId,
      rawBlobs,
      collageBlob,
    });
    setUploadStatus("Saved — will sync when internet returns.");
  }
}

// ---------------------------
// Event listeners & init
// ---------------------------
function triggerCapture() {
  if (!CONFIG || !video.srcObject || isCountingDown) return;
  if (!idleScreen.classList.contains("active")) return;

  hideInstructions();
  clearIdleInactivityTimer();

  const totalShots = CONFIG.capture?.totalShots ?? 3;
  if (currentShotIndex >= totalShots) {
    currentShotIndex = 0;
    capturedCanvases.length = 0;
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
  const infoBtn = document.getElementById("info-btn");
  const instructionOverlay = document.getElementById("instruction-overlay");
  const instructionCloseBtn = document.getElementById("instruction-close-btn");

  if (infoBtn) infoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showInstructions();
  });

  if (instructionCloseBtn) instructionCloseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    hideInstructions();
  });

  if (instructionOverlay) instructionOverlay.addEventListener("click", (e) => {
    e.stopPropagation();
    if (e.target === instructionOverlay) hideInstructions();
  });

  // Reset idle inactivity timer on any interaction
  ["click", "touchstart"].forEach(evt => {
    document.addEventListener(evt, resetIdleInactivityTimer, { passive: true });
  });

  idleScreen.addEventListener("click", triggerCapture);

  document.addEventListener("keydown", (e) => {
    if (e.key === "AudioVolumeUp") {
      e.preventDefault();
      triggerCapture();
    }
  });

  // WebHID — AB Shutter3 trigger (reportId=2, data[0]=1 on press)
  if (navigator.hid) {
    navigator.hid.getDevices().then(devices => {
      devices.forEach(async device => {
        const filter = CONFIG?.hidFilter;
        if (filter?.vendorId != null && device.vendorId !== filter.vendorId) return;
        if (filter?.productId != null && device.productId !== filter.productId) return;
        try {
          if (!device.opened) await device.open();
          console.log(`[HID] Auto-connected: "${device.productName}" (${device.vendorId}:${device.productId})`);
          device.addEventListener("inputreport", e => {
            const bytes = new Uint8Array(e.data.buffer);
            if (e.reportId === 2 && bytes[0] === 1) {
              triggerCapture();
            }
          });
        } catch (err) {
          console.warn("[HID] Auto-connect failed:", err);
        }
      });
    });
  }

  confirmBtn.addEventListener("click", () => {
    if (selectedTemplateIndex === null) return;
    buildTemplateCollage(selectedTemplateIndex);
    showScreen(resultScreen);
    startAutoReset();
    selectedTemplateIndex = null;
    confirmBtn.classList.remove("visible");
  });

  function resetSession() {
    if (!CONFIG) return;
    countdownTimers.forEach(id => clearTimeout(id));
    countdownTimers = [];
    clearAutoReset();
    currentShotIndex = 0;
    isCountingDown = false;
    capturedCanvases.length = 0;
    frozenFrame = null;
    freezeUntil = 0;
    selectedTemplateIndex = null;
    hideCountdownOverlay();
    updateShotCounter();
    updateResetBtn();

    if (qrImg) qrImg.src = "";
    currentSessionId = null;
    setUploadStatus("");

    showScreen(idleScreen);
    startGestureDetection();

    if (autoResetTriggered) {
      autoResetTriggered = false;
      showInstructions();
    } else {
      startIdleInactivityTimer();
    }
  }

  backBtn.addEventListener("click", resetSession);
  resetBtn.addEventListener("click", () => location.reload());
  templateResetBtn.addEventListener("click", () => location.reload());

  // Hide cursor after 5s inactivity (kiosk mode)
  let cursorTimer = null;
  document.addEventListener("mousemove", () => {
    document.body.style.cursor = "";
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => {
      document.body.style.cursor = "none";
    }, 5000);
  });

  // Prevent pull-to-refresh and overscroll on touch devices
  document.addEventListener("touchmove", (e) => {
    e.preventDefault();
  }, { passive: false });
}

async function init() {
  try {
    // loadConfig returns false when the page was replaced with an event error screen
    if (await loadConfig() === false) return;
    buildInstructionRules();
    attachEventListeners();
    acquireWakeLock();
    startCamera();
    showInstructions();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(err =>
        console.warn("[SW] Registration failed:", err)
      );
    }

    if (CONFIG?.serverUrl) {
      window.OfflineQueue.drainQueue(CONFIG.serverUrl);
      setInterval(() => {
        if (idleScreen.classList.contains("active")) {
          window.OfflineQueue.drainQueue(CONFIG.serverUrl);
        }
      }, 60_000);
    }
  } catch (err) {
    console.error("[INIT] Failed to initialize:", err);
    const RETRY_SECONDS = 10;
    showErrorOverlay(
      "Configuration error",
      `Failed to load the photobooth configuration. Please check the network connection.`,
      RETRY_SECONDS
    );
    setTimeout(() => location.reload(), RETRY_SECONDS * 1000);
  }
}

document.addEventListener("DOMContentLoaded", init);
