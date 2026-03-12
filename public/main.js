// ---------------------------
// Global config & state
// ---------------------------
let CONFIG = null;

// Elements
const idleScreen   = document.getElementById("idle-screen");
const templateScreen = document.getElementById("template-screen");
const resultScreen = document.getElementById("result-screen");
const cameraCanvas = document.getElementById("camera-canvas");
const cameraCtx    = cameraCanvas.getContext("2d");
const idleText     = document.getElementById("idle-text");
const video        = document.getElementById("video");
const photoCanvas  = document.getElementById("photo-canvas");
const photoCtx     = photoCanvas.getContext("2d");
const backBtn      = document.getElementById("back-btn");
const qrCanvas     = document.getElementById("qr-canvas");
const templateGrid = document.getElementById("template-grid");

// State
let stream = null;
let animationFrameId = null;
let currentCountdownText = "";   // "", "3", "2", "1", "SMILE!"
let currentShotIndex = 0;        // shots taken so far
const capturedCanvases = [];     // raw shot canvases
let selectedTemplateIndex = null;

// Preview of captured frame
let frozenFrame = null;
let freezeUntil = 0;
const FREEZE_DURATION_MS = 1000;

// Template image cache (avoids double-loading)
const templateImageCache = new Map();

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
  }

  // Pre-load template images
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
    img.onload = () => {
      templateImageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => {
      console.warn(`[TEMPLATE] Image ${src} failed to load.`);
      resolve(null);
    };
    img.src = src;
  });
}

// ---------------------------
// UI Helper
// ---------------------------
function showScreen(screen) {
  document.querySelectorAll(".screen").forEach((s) =>
    s.classList.remove("active")
  );
  screen.classList.add("active");
}

// ---------------------------
// CAMERA START
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

      if (idleText) {
        idleText.style.display = "none";
      }

      video.play();
      startRenderLoop();
    };
  } catch (e) {
    console.error("[CAM] error:", e);
    alert("Camera failed: " + e.message);
  }
}

// ---------------------------
// RENDER LOOP (camera preview + overlays)
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
        cameraCtx.fillStyle = "#000";
        cameraCtx.fillRect(0, 0, cw, ch);
      }
    }

    // Overlays (only when NOT frozen)
    if (!isFrozen && cw && ch && CONFIG) {
      const totalShots = CONFIG.capture?.totalShots ?? 3;

      if (currentShotIndex < totalShots) {
        const shotNumber = currentShotIndex + 1;
        cameraCtx.font = `${cw * 0.04}px system-ui`;
        cameraCtx.fillStyle = "rgba(255,255,255,0.85)";
        cameraCtx.textAlign = "left";
        cameraCtx.textBaseline = "top";
        cameraCtx.fillText(`${shotNumber}/${totalShots}`, 40, 30);
      }

      if (currentCountdownText) {
        cameraCtx.font = `${cw * 0.2}px system-ui`;
        cameraCtx.fillStyle = "rgba(255,255,255,0.4)";
        cameraCtx.textAlign = "center";
        cameraCtx.textBaseline = "middle";
        cameraCtx.fillText(currentCountdownText, cw / 2, ch / 2);
      }

      if (!currentCountdownText && currentShotIndex < totalShots) {
        cameraCtx.font = `${cw * 0.04}px system-ui`;
        cameraCtx.fillStyle = "rgba(255,255,255,0.7)";
        cameraCtx.textAlign = "center";
        cameraCtx.textBaseline = "bottom";
        cameraCtx.fillText("PRESS TO START", cw / 2, ch - 60);
      }
    }

    animationFrameId = requestAnimationFrame(render);
  }

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  render();
}

// ---------------------------
// CAPTURE (center crop, NOT mirrored)
// ---------------------------
function captureOneShot() {
  if (!CONFIG) return;

  const vw = video.videoWidth;
  const vh = video.videoHeight;

  if (!vw || !vh) {
    alert("Camera not ready yet.");
    return;
  }

  const targetW = CONFIG.capture.photoWidth;
  const targetH = CONFIG.capture.photoHeight;
  const targetAspect = targetW / targetH;
  const videoAspect = vw / vh;

  let sx, sy, sw, sh;

  if (videoAspect > targetAspect) {
    sh = vh;
    sw = sh * targetAspect;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    sw = vw;
    sh = sw / targetAspect;
    sx = 0;
    sy = (vh - sh) / 2;
  }

  const off = document.createElement("canvas");
  off.width = targetW;
  off.height = targetH;
  const offCtx = off.getContext("2d");
  offCtx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);

  capturedCanvases.push(off);

  // Freeze-frame preview
  const cw = cameraCanvas.width;
  const ch = cameraCanvas.height;

  if (cw && ch) {
    const freezeCanvas = document.createElement("canvas");
    freezeCanvas.width = cw;
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
  if (!CONFIG) return;

  const seconds    = CONFIG.countdown?.seconds ?? 3;
  const intervalMs = CONFIG.countdown?.stepMs ?? 500;
  const totalShots = CONFIG.capture?.totalShots ?? 3;

  let remaining = seconds;
  currentCountdownText = remaining.toString();

  const timer = setInterval(() => {
    remaining--;

    if (remaining > 0) {
      currentCountdownText = remaining.toString();
    } else {
      clearInterval(timer);
      currentCountdownText = "SMILE!";

      setTimeout(() => {
        captureOneShot();
        currentCountdownText = "";

        setTimeout(() => {
          currentShotIndex++;

          if (currentShotIndex >= totalShots) {
            if (CONFIG.templates.length === 1) {
              buildTemplateCollage(0);
              showScreen(resultScreen);
            } else {
              populateTemplateScreen();
              showScreen(templateScreen);
            }
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

  const PHOTO_W = CONFIG.capture.photoWidth;
  const PHOTO_H = CONFIG.capture.photoHeight;

  CONFIG.templates.forEach((template, index) => {
    const item = document.createElement("div");
    item.className = "template-item";
    item.dataset.templateIndex = index;

    const previewCanvas = document.createElement("canvas");
    const previewCtx = previewCanvas.getContext("2d");
    previewCanvas.width = template.width;
    previewCanvas.height = template.height;

    // Draw photos into slots
    for (let i = 0; i < capturedCanvases.length; i++) {
      const slot = template.slots[i];
      if (!slot) continue;
      previewCtx.drawImage(capturedCanvases[i], slot.x, slot.y, PHOTO_W, PHOTO_H);
    }

    // Draw cached template overlay
    const templateImg = templateImageCache.get(template.file);
    if (templateImg) {
      previewCtx.drawImage(templateImg, 0, 0, template.width, template.height);
    }

    item.appendChild(previewCanvas);
    templateGrid.appendChild(item);

    item.addEventListener("click", () => {
      if (selectedTemplateIndex === index) {
        buildTemplateCollage(index);
        showScreen(resultScreen);
        selectedTemplateIndex = null;
      } else {
        if (selectedTemplateIndex !== null) {
          const prevSelected = templateGrid.querySelector(`[data-template-index="${selectedTemplateIndex}"]`);
          if (prevSelected) {
            prevSelected.classList.remove("selected");
          }
        }
        item.classList.add("selected");
        selectedTemplateIndex = index;
      }
    });
  });
}

// ---------------------------
// Build Final Collage & upload
// ---------------------------
async function buildTemplateCollage(templateIndex = 0) {
  if (!CONFIG || !CONFIG.templates || !CONFIG.templates[templateIndex]) {
    console.error(`Invalid template index: ${templateIndex}`);
    return;
  }

  const template = CONFIG.templates[templateIndex];
  const templateImg = templateImageCache.get(template.file);

  const TEMPLATE_WIDTH  = template.width;
  const TEMPLATE_HEIGHT = template.height;
  const PHOTO_W         = CONFIG.capture.photoWidth;
  const PHOTO_H         = CONFIG.capture.photoHeight;
  const PHOTO_SLOTS     = template.slots || [];

  photoCanvas.width  = TEMPLATE_WIDTH;
  photoCanvas.height = TEMPLATE_HEIGHT;
  photoCtx.clearRect(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);

  // 1) Draw photos
  for (let i = 0; i < capturedCanvases.length; i++) {
    const slot = PHOTO_SLOTS[i];
    if (!slot) continue;
    photoCtx.drawImage(capturedCanvases[i], slot.x, slot.y, PHOTO_W, PHOTO_H);
  }

  // 2) Draw template overlay on top
  if (templateImg) {
    photoCtx.drawImage(templateImg, 0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
  }

  // 3) Upload
  try {
    await uploadSession();
  } catch (e) {
    console.error("[COLLAGE] uploadSession failed:", e);
  }
}

// ---------------------------
// Upload raw + collage to server
// ---------------------------
async function uploadSession() {
  if (!CONFIG) return;

  const formData = new FormData();

  // Raw photos
  const rawBlobs = await Promise.all(
    capturedCanvases.map(
      (canvas) =>
        new Promise((resolve) =>
          canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9)
        )
    )
  );

  rawBlobs.forEach((blob, i) => {
    if (!blob) return;
    formData.append(`raw${i + 1}`, blob, `raw${i + 1}.jpg`);
  });

  // Collage
  const collageBlob = await new Promise((resolve) =>
    photoCanvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9)
  );

  if (collageBlob) {
    formData.append("collage", collageBlob, "collage.jpg");
  }

  const saveApiUrl = `${CONFIG.serverUrl}/api/save`;

  const res = await fetch(saveApiUrl, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[UPLOAD] failed:", text);
    alert("Failed to save photos on server.");
    return;
  }

  const data = await res.json();

  if (data.collageUrl) {
    const base =
      CONFIG.serverUrl && CONFIG.serverUrl.trim().length > 0
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

  const size   = 300;
  const margin = 4;

  QRCode.toCanvas(
    qrCanvas,
    url,
    {
      width: size,
      margin: margin,
      color: {
        dark: '#FFFFFF',
        light: '#2c2c2c'
      }
    },
    (error) => {
      if (error) console.error("[QR] Error rendering:", error);
    }
  );
}

// ---------------------------
// Event Listeners & init
// ---------------------------
function attachEventListeners() {
  idleScreen.addEventListener("click", () => {
    if (!CONFIG || !video.srcObject || currentCountdownText) return;

    const totalShots = CONFIG.capture?.totalShots ?? 3;

    if (currentShotIndex >= totalShots) {
      currentShotIndex = 0;
      capturedCanvases.length = 0;
      frozenFrame = null;
      freezeUntil = 0;
    }

    startCountdown();
  });

  backBtn.addEventListener("click", () => {
    if (!CONFIG) return;

    currentShotIndex = 0;
    currentCountdownText = "";
    capturedCanvases.length = 0;
    frozenFrame = null;
    freezeUntil = 0;
    selectedTemplateIndex = null;

    if (qrCanvas) {
      const ctx = qrCanvas.getContext("2d");
      ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
    }

    showScreen(idleScreen);
  });
}

async function init() {
  try {
    await loadConfig();
    attachEventListeners();
    startCamera();
  } catch (err) {
    console.error("[INIT] Failed to initialize:", err);
    alert("Failed to load photobooth configuration.");
  }
}

document.addEventListener("DOMContentLoaded", init);
