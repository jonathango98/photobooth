console.log("Photobooth Loaded");

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
let currentShotIndex = 0;        // shots taken so far: 0..CONFIG.capture.totalShots
const capturedCanvases = [];     // raw shot canvases
let selectedTemplateIndex = null; // new state for template selection

// Preview of captured frame
let frozenFrame = null;          // canvas of last captured image (same size as cameraCanvas)
let freezeUntil = 0;             // timestamp (ms) until preview should last
const FREEZE_DURATION_MS = 1000; // 1 second freeze preview

// ---------------------------
// Config loading
// ---------------------------
async function loadConfig() {
  const res = await fetch("config.json");
  if (!res.ok) {
    throw new Error(`Failed to load config.json: ${res.status}`);
  }
  CONFIG = await res.json();
  console.log("[CONFIG]", CONFIG);

  // Apply site name to document title if provided
  if (CONFIG.siteName) {
    document.title = CONFIG.siteName;
  }
}


// ---------------------------
// UI Helper
// ---------------------------
function showScreen(screen) {
  console.log("[UI] showScreen:", screen.id);
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
      console.log("[CAM] stream already exists, just start render loop");
      startRenderLoop();
      return;
    }

    console.log("[CAM] requesting camera…");
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });

    video.srcObject = stream;
    video.onloadedmetadata = () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      console.log("[CAM] metadata:", vw, "x", vh);

      if (!vw || !vh) {
        console.warn("[CAM] video metadata not ready");
        return;
      }

      // Maintain aspect ratio and avoid fullscreen
      const aspect = vw / vh;
      const displayWidth  = 1000;            // desired preview width
      const displayHeight = displayWidth / aspect;

      cameraCanvas.width  = displayWidth;
      cameraCanvas.height = displayHeight;

      // Once camera is ready, hide static idle text
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
  console.log("[RENDER] start loop");

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
        // Show frozen captured image (already mirrored + correct aspect)
        cameraCtx.drawImage(frozenFrame, 0, 0, cw, ch);
      } else if (vw && vh) {
        // Normal live preview, mirrored
        cameraCtx.save();
        cameraCtx.scale(-1, 1);
        cameraCtx.translate(-cw, 0);
        cameraCtx.drawImage(video, 0, 0, cw, ch);
        cameraCtx.restore();
      } else {
        // Before video is ready, show a black canvas
        cameraCtx.fillStyle = "#000";
        cameraCtx.fillRect(0, 0, cw, ch);
      }
    }

    // --- Overlays (only when NOT frozen) ---
    if (!isFrozen && cw && ch && CONFIG) {
      const totalShots = CONFIG.capture?.totalShots ?? 3;

      // Shot indicator (e.g., 1/3, 2/3) when we still have shots to take
      if (currentShotIndex < totalShots) {
        const shotNumber = currentShotIndex + 1; // upcoming shot
        cameraCtx.font = `${cw * 0.04}px system-ui`; // Responsive font size
        cameraCtx.fillStyle = "rgba(255,255,255,0.85)";
        cameraCtx.textAlign = "left";
        cameraCtx.textBaseline = "top";
        cameraCtx.fillText(`${shotNumber}/${totalShots}`, 40, 30);
      }

      // Countdown text (center)
      if (currentCountdownText) {
        cameraCtx.font = `${cw * 0.2}px system-ui`; // Responsive font size
        cameraCtx.fillStyle = "rgba(255,255,255,0.4)"; // bigger + more transparent
        cameraCtx.textAlign = "center";
        cameraCtx.textBaseline = "middle";
        cameraCtx.fillText(currentCountdownText, cw / 2, ch / 2);
      }

      // "PRESS TO START" text when not counting down and shots still available
      if (!currentCountdownText && currentShotIndex < totalShots) {
        cameraCtx.font = `${cw * 0.04}px system-ui`; // Responsive font size
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
// CAPTURE (center crop → photoWidth × photoHeight, NOT mirrored)
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
    // Video too wide → crop sides
    sh = vh;
    sw = sh * targetAspect;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    // Video too tall → crop top/bottom
    sw = vw;
    sh = sw / targetAspect;
    sx = 0;
    sy = (vh - sh) / 2;
  }

  // Offscreen canvas for RAW shot (for collage)
  const off = document.createElement("canvas");
  off.width = targetW;
  off.height = targetH;
  const offCtx = off.getContext("2d");

  // Capture is not mirrored (correct orientation for final print)
  offCtx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);

  capturedCanvases.push(off);
  console.log("[CAPTURE] shot captured, total:", capturedCanvases.length);

  // Freeze-frame preview:
  // Draw the mirrored video frame directly into a separate canvas (no overlays)
  const cw = cameraCanvas.width;
  const ch = cameraCanvas.height;

  if (cw && ch) {
    const freezeCanvas = document.createElement("canvas");
    freezeCanvas.width = cw;
    freezeCanvas.height = ch;
    const fCtx = freezeCanvas.getContext("2d");

    // Mirror same as preview
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
// Countdown (config-driven, SMILE in all caps before capture)
// ---------------------------
function startCountdown(seconds) {
  if (!CONFIG) return;

  const defaultSeconds = CONFIG.countdown?.seconds ?? 3;
  const intervalMs     = CONFIG.countdown?.stepMs ?? 500;

  const totalShots = CONFIG.capture?.totalShots ?? 3;

  console.log("[COUNTDOWN] start, shots taken:", currentShotIndex);
  let remaining = seconds ?? defaultSeconds;
  currentCountdownText = remaining.toString();

  const timer = setInterval(() => {
    remaining--;

    if (remaining > 0) {
      currentCountdownText = remaining.toString();
    } else {
      clearInterval(timer);
      // ALL CAPS for SMILE
      currentCountdownText = "SMILE!";

      setTimeout(() => {
        // Take the shot and start preview freeze
        captureOneShot();

        currentCountdownText = "";

        // After the preview delay, move on to next shot or result
        setTimeout(() => {
          currentShotIndex++;
          console.log(
            "[COUNTDOWN] shot complete, shots taken now:",
            currentShotIndex
          );

          if (currentShotIndex >= totalShots) {
            console.log(
              "[FLOW] reached TOTAL_SHOTS → go to template selection"
            );
            populateTemplateScreen();
            showScreen(templateScreen);
          }
        }, FREEZE_DURATION_MS);
      }, 250); // short delay after SMILE! before capture
    }
  }, intervalMs);
}

// ---------------------------
// Populate Template Screen & Carousel
// ---------------------------
async function populateTemplateScreen() {
  if (!CONFIG || !CONFIG.templates) return;

  console.log('[TEMPLATE] Populating template screen with', CONFIG.templates.length, 'templates');
  templateGrid.innerHTML = ""; // Clear existing templates
  selectedTemplateIndex = null; // Reset selection

  const templatePromises = CONFIG.templates.map(async (template, index) => {
    console.log('[TEMPLATE] Processing template:', template.name);
    const item = document.createElement("div");
    item.className = "template-item";
    item.dataset.templateIndex = index;

    const previewCanvas = document.createElement("canvas");
    const previewCtx = previewCanvas.getContext("2d");

    item.appendChild(previewCanvas);
    templateGrid.appendChild(item);

    // Set canvas dimensions
    previewCanvas.width = template.width;
    previewCanvas.height = template.height;

    // Draw photos
    const PHOTO_W = CONFIG.capture.photoWidth;
    const PHOTO_H = CONFIG.capture.photoHeight;
    for (let i = 0; i < capturedCanvases.length; i++) {
      const shot = capturedCanvases[i];
      const slot = template.slots[i];
      if (!slot) continue;
      previewCtx.drawImage(shot, slot.x, slot.y, PHOTO_W, PHOTO_H);
    }

    // Draw template overlay
    const templateImg = new Image();
    templateImg.src = template.file;
    console.log('[TEMPLATE] Loading image:', templateImg.src);

    await new Promise(resolve => {
      templateImg.onload = () => {
        console.log('[TEMPLATE] Image loaded successfully:', templateImg.src);
        previewCtx.drawImage(templateImg, 0, 0, template.width, template.height);
        resolve();
      };
      templateImg.onerror = () => {
        console.warn(`[TEMPLATE] Image ${template.file} failed to load.`);
        resolve(); // Continue even if image fails
      }
    });

    item.addEventListener("click", () => {
      if (selectedTemplateIndex === index) {
        // This item is already selected, so this is a confirmation click
        console.log(`[TEMPLATE] confirmed index: ${index}`);
        buildTemplateCollage(index);
        showScreen(resultScreen);
        selectedTemplateIndex = null; // Reset for next time
      } else {
        // This is a new selection
        console.log(`[TEMPLATE] selected index: ${index}`);
        // Remove 'selected' from previously selected item
        if (selectedTemplateIndex !== null) {
          const prevSelected = templateGrid.querySelector(`[data-template-index="${selectedTemplateIndex}"]`);
          if (prevSelected) {
            prevSelected.classList.remove("selected");
          }
        }
        // Add 'selected' to current item and update state
        item.classList.add("selected");
        selectedTemplateIndex = index;
      }
    });
  });

  console.log('[TEMPLATE] Waiting for all templates to render...');
  await Promise.all(templatePromises);
  console.log('[TEMPLATE] All templates rendered.');
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
  console.log("[COLLAGE] start buildTemplateCollage with template:", template);

  // Load the selected template image
  const templateImg = new Image();
  templateImg.src = template.file;
  await new Promise((resolve) => {
    if (templateImg.complete) {
      resolve();
    } else {
      templateImg.onload = () => resolve();
      templateImg.onerror = () => {
        console.warn("Template image failed to load, continuing without it");
        resolve();
      };
    }
  });

  const TEMPLATE_WIDTH  = template.width;
  const TEMPLATE_HEIGHT = template.height;
  const PHOTO_W         = CONFIG.capture.photoWidth;
  const PHOTO_H         = CONFIG.capture.photoHeight;
  const PHOTO_SLOTS     = template.slots || [];

  photoCanvas.width  = TEMPLATE_WIDTH;
  photoCanvas.height = TEMPLATE_HEIGHT;

  photoCtx.clearRect(0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);

  // 1) Draw photos first
  console.log("[COLLAGE] drawing photos, count:", capturedCanvases.length);
  for (let i = 0; i < capturedCanvases.length; i++) {
    const shot = capturedCanvases[i];
    const slot = PHOTO_SLOTS[i];
    if (!slot) continue;
    photoCtx.drawImage(shot, slot.x, slot.y, PHOTO_W, PHOTO_H);
  }

  // 2) Draw template on top (if it exists)
  try {
    photoCtx.drawImage(templateImg, 0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
    console.log("[COLLAGE] template drawn");
  } catch (e) {
    console.warn("[COLLAGE] could not draw template:", e);
  }

  // 3) Upload raw shots + collage to server
  try {
    await uploadSession();
  } catch (e) {
    console.error("[COLLAGE] uploadSession failed:", e);
  }

  console.log("[COLLAGE] done");
}

// ---------------------------
// Upload raw + collage to server
// ---------------------------
async function uploadSession() {
  if (!CONFIG) return;

  console.log("[UPLOAD] start");
  const formData = new FormData();

  // Raw photos
  const rawBlobs = await Promise.all(
    capturedCanvases.map(
      (canvas, idx) =>
        new Promise((resolve) =>
          canvas.toBlob((blob) => {
            console.log("[UPLOAD] raw toBlob index", idx);
            resolve(blob);
          }, "image/jpeg", 0.9)
        )
    )
  );

  rawBlobs.forEach((blob, i) => {
    if (!blob) return;
    formData.append(`raw${i + 1}`, blob, `raw${i + 1}.jpg`);
  });

  // Collage (photoCanvas)
  const collageBlob = await new Promise((resolve) =>
    photoCanvas.toBlob((blob) => {
      console.log("[UPLOAD] collage toBlob done");
      resolve(blob);
    }, "image/jpeg", 0.9)
  );

  if (collageBlob) {
    formData.append("collage", collageBlob, "collage.jpg");
  }

  const saveApiUrl = CONFIG.saveApiUrl || "/api/save";

  const res = await fetch(saveApiUrl, {
    method: "POST",
    body: formData,
  });

  console.log("[UPLOAD] response status:", res.status);

  if (!res.ok) {
    const text = await res.text();
    console.error("[UPLOAD] failed:", text);
    alert("Failed to save photos on server.");
    return;
  }

  const data = await res.json();
  console.log("[UPLOAD] Saved session:", data);

  if (data.collageUrl) {
    const base =
      CONFIG.publicBaseUrl && CONFIG.publicBaseUrl.trim().length > 0
        ? CONFIG.publicBaseUrl.replace(/\/+$/, "")
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
// Render QR code for collageUrl
// ---------------------------
function renderQr(url) {
  if (!qrCanvas) return;
  if (typeof QRCode === "undefined") {
    console.warn("[QR] library not loaded.");
    return;
  }

  const size   = CONFIG?.qr?.size   ?? 300;
  const margin = CONFIG?.qr?.margin ?? 4;

  console.log("[QR] rendering for:", url);

  QRCode.toCanvas(
    qrCanvas,
    url,
    {
      width: size,
      margin: margin,
      color: {
        dark: '#FFFFFF', // White foreground
        light: '#2c2c2c' // Grey background
      }
    },
    (error) => {
      if (error) {
        console.error("[QR] Error rendering:", error);
      } else {
        console.log("[QR] done");
      }
    }
  );
}

// ---------------------------
// Event Listeners & init
// ---------------------------
function attachEventListeners() {
  // Click anywhere on idle-screen (canvas area) to start countdown for next shot
  idleScreen.addEventListener("click", () => {
    console.log("[FLOW] idle-screen click");

    if (!CONFIG) {
      console.warn("Config not loaded yet.");
      return;
    }

    if (!video.srcObject) {
      console.warn("[FLOW] video.srcObject is null, camera not ready yet");
      return;
    }

    // If already counting down, ignore clicks
    if (currentCountdownText) {
      console.log("[FLOW] countdown running, ignore click");
      return;
    }

    const totalShots = CONFIG.capture?.totalShots ?? 3;

    // If we already finished shots but somehow stayed on this screen, reset
    if (currentShotIndex >= totalShots) {
      currentShotIndex = 0;
      capturedCanvases.length = 0;
      frozenFrame = null;
      freezeUntil = 0;
    }

    // Start countdown for next shot
    startCountdown();
  });

  // Back button from result → idle
  backBtn.addEventListener("click", () => {
    console.log("[FLOW] result → idle");
    if (!CONFIG) return;

    // Reset session but keep stream alive
    currentShotIndex = 0;
    currentCountdownText = "";
    capturedCanvases.length = 0;
    frozenFrame = null;
    freezeUntil = 0;
    selectedTemplateIndex = null; // Reset template selection

    // Clear QR canvas
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
    console.log("[INIT] Photobooth ready.");
  } catch (err) {
    console.error("[INIT] Failed to initialize:", err);
    alert("Failed to load photobooth configuration.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  init();
});
// ----------------------------------
// END OF FILE
// --------------------------