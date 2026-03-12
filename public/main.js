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
const qrCanvas         = document.getElementById("qr-canvas");
const templateGrid     = document.getElementById("template-grid");
const flashOverlay     = document.getElementById("flash-overlay");
const siteNameEl       = document.getElementById("site-name");
const shotCounter      = document.getElementById("shot-counter");
const countdownOverlay = document.getElementById("countdown-overlay");
const pressHint        = document.getElementById("press-hint");
const confirmBtn       = document.getElementById("confirm-btn");
const resetBar         = document.getElementById("reset-bar");

// State
let stream = null;
let animationFrameId = null;
let isCountingDown = false;
let currentShotIndex = 0;
const capturedCanvases = [];
let selectedTemplateIndex = null;
let autoResetTimer = null;

// Freeze-frame preview
let frozenFrame = null;
let freezeUntil = 0;
const FREEZE_DURATION_MS = 1000;

// Template image cache
const templateImageCache = new Map();

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
async function loadConfig() {
  const staticRes = await fetch("config.json");
  if (!staticRes.ok) {
    throw new Error(`Failed to load config.json: ${staticRes.status}`);
  }
  const staticConfig = await staticRes.json();
  const serverUrl = staticConfig.serverUrl;

  let usedServerConfig = false;
  if (serverUrl) {
    try {
      const eventRes = await fetch(`${serverUrl}/api/event/config`);
      if (eventRes.ok) {
        const eventConfig = await eventRes.json();
        CONFIG = {
          siteName: eventConfig.event_name,
          serverUrl: serverUrl,
          templates: eventConfig.templates,
          capture: eventConfig.capture,
          countdown: eventConfig.countdown,
          autoResetSeconds: staticConfig.autoResetSeconds ?? 30,
          gestureTrigger: eventConfig.gestureTrigger ?? staticConfig.gestureTrigger,
        };
        usedServerConfig = true;
        console.log("[CONFIG] Loaded from server API.");
      }
    } catch (e) {
      console.warn("[CONFIG] Server config fetch failed, falling back to config.json:", e);
    }
  }

  if (!usedServerConfig) {
    CONFIG = staticConfig;
    console.log("[CONFIG] Using static config.json.");
  }

  if (CONFIG.siteName) {
    document.title = CONFIG.siteName;
    if (siteNameEl) siteNameEl.textContent = CONFIG.siteName;
  }

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
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs"
    );
    const fileset = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
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
  const indexExtended = landmarks[8].y < landmarks[6].y;
  const middleExtended = landmarks[12].y < landmarks[10].y;
  const ringExtended = landmarks[16].y < landmarks[14].y;
  const pinkyExtended = landmarks[20].y < landmarks[18].y;
  return indexExtended && middleExtended && ringExtended && pinkyExtended;
}

function isThumbsUp(landmarks) {
  const thumbExtended = landmarks[4].y < landmarks[3].y;
  const indexCurled = landmarks[8].y > landmarks[6].y;
  const middleCurled = landmarks[12].y > landmarks[10].y;
  const ringCurled = landmarks[16].y > landmarks[14].y;
  const pinkyCurled = landmarks[20].y > landmarks[18].y;
  return thumbExtended && indexCurled && middleCurled && ringCurled && pinkyCurled;
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
}

function startAutoReset() {
  const seconds = CONFIG?.autoResetSeconds ?? 30;
  clearAutoReset();
  resetBar.style.transition = "none";
  resetBar.style.transform = "scaleX(1)";
  void resetBar.offsetWidth;
  resetBar.style.transition = `transform ${seconds}s linear`;
  resetBar.style.transform = "scaleX(0)";
  autoResetTimer = setTimeout(() => {
    backBtn.click();
  }, seconds * 1000);
}

function clearAutoReset() {
  if (autoResetTimer) {
    clearTimeout(autoResetTimer);
    autoResetTimer = null;
  }
  if (resetBar) {
    resetBar.style.transition = "none";
    resetBar.style.transform = "scaleX(1)";
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
      startGestureDetection();
    };
  } catch (e) {
    console.error("[CAM] error:", e);
    alert("Camera failed: " + e.message);
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

      setTimeout(() => {
        captureOneShot();
        hideCountdownOverlay();

        setTimeout(() => {
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
      }, 250);
    }
  }, intervalMs);
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

  for (let i = 0; i < capturedCanvases.length; i++) {
    const slot = PHOTO_SLOTS[i];
    if (!slot) continue;
    photoCtx.drawImage(capturedCanvases[i], slot.x, slot.y, PHOTO_W, PHOTO_H);
  }

  if (templateImg) {
    photoCtx.drawImage(templateImg, 0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
  }

  try {
    await uploadSession();
  } catch (e) {
    console.error("[COLLAGE] uploadSession failed:", e);
  }
}

// ---------------------------
// Upload raw shots + collage
// ---------------------------
async function uploadSession() {
  if (!CONFIG) return;

  const formData = new FormData();

  const rawBlobs = await Promise.all(
    capturedCanvases.map(canvas =>
      new Promise(resolve => canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.9))
    )
  );

  rawBlobs.forEach((blob, i) => {
    if (!blob) return;
    formData.append(`raw${i + 1}`, blob, `raw${i + 1}.jpg`);
  });

  const collageBlob = await new Promise(resolve =>
    photoCanvas.toBlob(blob => resolve(blob), "image/jpeg", 0.9)
  );
  if (collageBlob) formData.append("collage", collageBlob, "collage.jpg");

  const res = await fetch(`${CONFIG.serverUrl}/api/save`, { method: "POST", body: formData });
  if (!res.ok) {
    const text = await res.text();
    console.error("[UPLOAD] failed:", text);
    alert("Failed to save photos on server.");
    return;
  }

  const data = await res.json();
  if (data.collageUrl) {
    const base = CONFIG.serverUrl?.trim()
      ? CONFIG.serverUrl.replace(/\/+$/, "")
      : window.location.origin;
    const absoluteUrl = data.collageUrl.startsWith("http")
      ? data.collageUrl
      : `${base}${data.collageUrl}`;
    console.log("[UPLOAD] QR absolute URL:", absoluteUrl);
    renderQr(absoluteUrl);
  } else {
    console.warn("[UPLOAD] No collageUrl in response.");
  }
}

// ---------------------------
// Render QR code
// ---------------------------
function renderQr(url) {
  if (!qrCanvas || typeof QRCode === "undefined") return;
  QRCode.toCanvas(qrCanvas, url, {
    width: 300,
    margin: 4,
    color: { dark: "#FFFFFF", light: "#2c2c2c" },
  }, (error) => {
    if (error) console.error("[QR] Error rendering:", error);
  });
}

// ---------------------------
// Event listeners & init
// ---------------------------
function triggerCapture() {
  if (!CONFIG || !video.srcObject || isCountingDown) return;
  if (!idleScreen.classList.contains("active")) return;

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
        try {
          if (!device.opened) await device.open();
          console.log(`[HID] Auto-connected: "${device.productName}"`);
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

  backBtn.addEventListener("click", () => {
    if (!CONFIG) return;
    clearAutoReset();
    currentShotIndex = 0;
    isCountingDown = false;
    capturedCanvases.length = 0;
    frozenFrame = null;
    freezeUntil = 0;
    selectedTemplateIndex = null;
    hideCountdownOverlay();
    updateShotCounter();

    if (qrCanvas) {
      const ctx = qrCanvas.getContext("2d");
      ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
    }

    showScreen(idleScreen);
    startGestureDetection();
  });

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
    await loadConfig();
    attachEventListeners();
    await initHandLandmarker();
    startCamera();
  } catch (err) {
    console.error("[INIT] Failed to initialize:", err);
    alert("Failed to load photobooth configuration.");
  }
}

document.addEventListener("DOMContentLoaded", init);
