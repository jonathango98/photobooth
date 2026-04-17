async function loadServerUrl() {
  try {
    const cfg = await fetch("../config.json").then((r) => r.json());
    return cfg.serverUrl || "https://photobooth-server-production.up.railway.app";
  } catch {
    return "https://photobooth-server-production.up.railway.app";
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

async function crossfade(slot, layerState, url) {
  const nextActive = layerState.active === "a" ? "b" : "a";
  const incoming = slot.querySelector(`.layer.${nextActive}`);
  const outgoing = slot.querySelector(`.layer.${layerState.active}`);
  await new Promise((resolve) => {
    incoming.onload = resolve;
    incoming.onerror = resolve;
    incoming.src = url;
  });
  incoming.classList.add("visible");
  outgoing.classList.remove("visible");
  layerState.active = nextActive;
}

async function main() {
  const serverUrl = await loadServerUrl();
  document.documentElement.style.setProperty("--fade", "800ms");

  const SLOT_INTERVAL_MS = 3000;
  const POLL_INTERVAL_MS = 60000;

  const slots = [...document.querySelectorAll(".slot")];
  const layerState = slots.map(() => ({ active: "a" }));

  let photosById = new Map();
  let queue = [];
  let nextSlot = 0;

  async function refreshList() {
    try {
      const { photos } = await fetch(`${serverUrl}/api/public/photos`).then((r) => r.json());
      photosById = new Map(photos.map((p) => [p.id, p.url]));
      const knownInQueue = new Set(queue);
      const visible = new Set(slots.map((s) => s.dataset.currentId).filter(Boolean));
      const fresh = photos
        .map((p) => p.id)
        .filter((id) => !knownInQueue.has(id) && !visible.has(id));
      if (fresh.length > 0) queue.push(...shuffle(fresh));
    } catch (err) {
      console.error("Failed to refresh photo list:", err);
    }
  }

  function nextId() {
    if (queue.length === 0) {
      const visible = new Set(slots.map((s) => s.dataset.currentId).filter(Boolean));
      const all = shuffle([...photosById.keys()]);
      queue = [
        ...all.filter((id) => !visible.has(id)),
        ...all.filter((id) => visible.has(id)),
      ];
    }
    return queue.shift() ?? null;
  }

  async function tick() {
    const id = nextId();
    if (!id) return;
    const url = photosById.get(id);
    if (!url) return;
    const slot = slots[nextSlot];
    await crossfade(slot, layerState[nextSlot], url);
    slot.dataset.currentId = id;
    nextSlot = (nextSlot + 1) % 3;
  }

  await refreshList();
  for (let i = 0; i < 3; i++) await tick();
  setInterval(tick, SLOT_INTERVAL_MS);
  setInterval(refreshList, POLL_INTERVAL_MS);
}

main().catch(console.error);
