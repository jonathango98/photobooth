const FALLBACK_API = 'https://photobooth-server-production.up.railway.app';
let API_BASE = FALLBACK_API;

let collageAspect = '9 / 16';
let rawAspect = '16 / 9';

async function loadConfig() {
  try {
    const cfg = await fetch('config.json').then((r) => r.json());
    if (cfg.serverUrl) API_BASE = cfg.serverUrl;
    if (cfg.templates?.[0]) {
      collageAspect = `${cfg.templates[0].width} / ${cfg.templates[0].height}`;
    }
    if (cfg.capture?.photoWidth && cfg.capture?.photoHeight) {
      rawAspect = `${cfg.capture.photoWidth} / ${cfg.capture.photoHeight}`;
    }
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

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  setupPreviewLightbox();
  const loginForm = document.getElementById('login-form');
  const adminContent = document.getElementById('admin-content');
  const passwordInput = document.getElementById('admin-password');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const sessionsList = document.getElementById('sessions-list');
  const downloadZipBtn = document.getElementById('download-zip-btn');
  const tabBtns = document.querySelectorAll('.tab-btn');

  const downloadSelectedBtn = document.getElementById('download-selected-btn');
  const selectAllBtn = document.getElementById('select-all-btn');
  const clearSelectionBtn = document.getElementById('clear-selection-btn');
  const loadMoreWrap = document.getElementById('load-more-wrap');
  const loadMoreBtn = document.getElementById('load-more-btn');
  const photoCount = document.getElementById('photo-count');

  const PAGE_SIZE = 200;

  let adminPassword = sessionStorage.getItem('adminPassword');
  // photoData: { collages: [...], raws: [...] } — each item: { id, url, thumbUrl, uploadedAt }
  let photoData = { collages: [], raws: [] };
  let currentTab = 'collages';
  let selectedIds = new Set();
  let eventId = null;
  // Pagination state — the server returns photos newest-first across both folders;
  // "Load more" appends the next page. ZIP/select-all still cover loaded items only,
  // except "Download All as ZIP" which the server builds over ALL photos server-side.
  let nextCursor = 0;
  let totalPhotos = 0;
  let isLoadingPage = false;

  const eventIdDisplay = document.getElementById('event-id-display');
  const urlEventId = new URLSearchParams(window.location.search).get('event');

  // The event in the URL is the source of truth — multiple events can be
  // active at once, so there is no "active event" to fall back to.
  if (urlEventId) {
    eventId = urlEventId;
    if (eventIdDisplay) eventIdDisplay.textContent = eventId;
  } else {
    if (eventIdDisplay)
      eventIdDisplay.textContent = 'missing — add ?event=your-event-id to the URL';
  }

  if (adminPassword) {
    showAdminContent();
  }

  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
  });

  loginBtn.addEventListener('click', () => {
    adminPassword = passwordInput.value;
    sessionStorage.setItem('adminPassword', adminPassword);
    showAdminContent();
  });

  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('adminPassword');
    location.reload();
  });

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.getAttribute('data-tab');
      selectedIds.clear();
      renderPhotos();
      updateSelectionUI();
    });
  });

  selectAllBtn.addEventListener('click', () => {
    const currentItems = currentTab === 'collages' ? photoData.collages : photoData.raws;
    currentItems.forEach((item) => selectedIds.add(item.id));
    renderPhotos();
    updateSelectionUI();
  });

  clearSelectionBtn.addEventListener('click', () => {
    selectedIds.clear();
    renderPhotos();
    updateSelectionUI();
  });

  downloadSelectedBtn.addEventListener('click', async () => {
    if (selectedIds.size === 0) {
      alert('Please select some photos first');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/admin/download-selected`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword,
        },
        body: JSON.stringify({ photoIds: Array.from(selectedIds), eventId }),
      });

      if (!response.ok) {
        alert('Error generating ZIP for selected photos');
        return;
      }

      await downloadBlob(response, 'selected-photos.zip');
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    }
  });

  downloadZipBtn.addEventListener('click', async () => {
    try {
      const qs = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
      const response = await fetch(`${API_BASE}/api/admin/download-zip${qs}`, {
        headers: { 'x-admin-password': adminPassword },
      });

      if (!response.ok) {
        alert('Error generating ZIP');
        return;
      }

      await downloadBlob(response, 'all-photos.zip');
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    }
  });

  async function downloadBlob(response, filename) {
    const blob = await response.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  loadMoreBtn.addEventListener('click', () => loadPhotosPage(false));

  async function showAdminContent() {
    loginForm.style.display = 'none';
    adminContent.style.display = 'block';
    // Reset pagination and load the first page.
    photoData = { collages: [], raws: [] };
    selectedIds.clear();
    nextCursor = 0;
    totalPhotos = 0;
    await loadPhotosPage(true);
  }

  function updateLoadMoreUI() {
    const loaded = photoData.collages.length + photoData.raws.length;
    if (nextCursor !== null && nextCursor !== undefined) {
      loadMoreWrap.style.display = 'block';
      loadMoreBtn.disabled = isLoadingPage;
      loadMoreBtn.textContent = isLoadingPage ? 'Loading…' : 'Load more';
      photoCount.textContent = `Showing ${loaded} of ${totalPhotos} photos`;
    } else {
      // All loaded — keep the count visible but hide the button.
      loadMoreBtn.style.display = 'none';
      loadMoreWrap.style.display = loaded > 0 ? 'block' : 'none';
      photoCount.textContent = loaded > 0 ? `Showing all ${loaded} photos` : '';
    }
  }

  // booth-server returns: { ok, photos: [{ id, url, thumbUrl, folder, uploadedAt }],
  //                         total, cursor, nextCursor }
  async function loadPhotosPage(reset) {
    if (isLoadingPage) return;
    if (!reset && (nextCursor === null || nextCursor === undefined)) return;
    isLoadingPage = true;
    updateLoadMoreUI();

    try {
      const cursor = reset ? 0 : nextCursor;
      const params = new URLSearchParams();
      if (eventId) params.set('eventId', eventId);
      params.set('limit', String(PAGE_SIZE));
      params.set('cursor', String(cursor));
      const response = await fetch(`${API_BASE}/api/admin/photos?${params}`, {
        headers: { 'x-admin-password': adminPassword },
      });

      if (response.status === 401) {
        sessionStorage.removeItem('adminPassword');
        alert('Invalid password');
        location.reload();
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch photos');
      }

      const data = await response.json();
      const photos = data.photos || [];
      totalPhotos = data.total ?? photos.length;
      nextCursor = data.nextCursor ?? null;

      photoData.collages.push(...photos.filter((p) => p.folder === 'collage'));
      photoData.raws.push(...photos.filter((p) => p.folder === 'raw'));

      renderPhotos();
    } catch (err) {
      console.error(err);
      alert('Error loading photos');
    } finally {
      isLoadingPage = false;
      updateLoadMoreUI();
      updateSelectionUI();
    }
  }

  function toggleSelection(id) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    renderPhotos();
    updateSelectionUI();
  }

  function updateSelectionUI() {
    downloadSelectedBtn.textContent = `Download Selected (${selectedIds.size})`;
    downloadSelectedBtn.style.background = selectedIds.size > 0 ? '#007bff' : '#6c757d';
  }

  function getSessionId(id) {
    // New collage format: eventId/collage/timestamp_random.ext
    const collageMatch = id.match(/\/collage\/([^/]+)\.\w+$/);
    if (collageMatch) return collageMatch[1];
    // New/old raw format: session_timestamp[_random]_rawN.ext
    const rawMatch = id.match(/session_([A-Za-z0-9_-]+?)_raw\d/);
    if (rawMatch) return rawMatch[1];
    // Old collage format: session_timestamp_collage.ext
    const oldCollageMatch = id.match(/session_(\d+)_collage/);
    if (oldCollageMatch) return oldCollageMatch[1];
    return 'unknown';
  }

  function renderPhotos() {
    const sessions = {};
    sessionsList.className = `tab-${currentTab}`;

    const itemsToRender = currentTab === 'collages' ? photoData.collages : photoData.raws;
    itemsToRender.forEach((photo) => {
      const sessionId = getSessionId(photo.id);
      if (!sessions[sessionId]) sessions[sessionId] = [];
      sessions[sessionId].push(photo);
    });

    const sortedSessionIds = Object.keys(sessions).sort((a, b) => {
      const tsA = parseInt(a, 10) || 0;
      const tsB = parseInt(b, 10) || 0;
      return tsB - tsA;
    });

    selectAllBtn.addEventListener('click', () => {
        const currentItems = currentTab === 'collages' ? photoData.collages : photoData.raws;
        currentItems.forEach(item => selectedIds.add(item.id));
        renderPhotos();
        updateSelectionUI();
    });

    clearSelectionBtn.addEventListener('click', () => {
        selectedIds.clear();
        renderPhotos();
        updateSelectionUI();
    });

    downloadSelectedBtn.addEventListener('click', async () => {
        if (selectedIds.size === 0) { alert('Please select some photos first'); return; }
        downloadSelectedBtn.disabled = true;
        downloadSelectedBtn.textContent = 'Preparing…';
        try {
            const res = await fetch(`${API_BASE}/api/admin/mint-download-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
                body: JSON.stringify({ photoIds: Array.from(selectedIds), eventId })
            });
            if (!res.ok) { alert('Error preparing download for selected photos'); return; }
            const { token } = await res.json();
            window.location = `${API_BASE}/api/admin/zip/${token}`;
        } catch (err) {
            console.error(err);
            alert('Error connecting to server');
        } finally {
            downloadSelectedBtn.disabled = false;
            downloadSelectedBtn.textContent = selectedIds.size > 0 ? `Download Selected (${selectedIds.size})` : 'Download Selected';
        }
    });

    downloadZipBtn.addEventListener('click', async () => {
        if (!eventId) { alert('No event selected'); return; }
        downloadZipBtn.disabled = true;
        downloadZipBtn.textContent = 'Preparing…';
        try {
            const res = await fetch(`${API_BASE}/api/admin/mint-download-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
                body: JSON.stringify({ eventId })
            });
            if (!res.ok) { alert('Error preparing download'); return; }
            const { token } = await res.json();
            window.location = `${API_BASE}/api/admin/zip/${token}`;
        } catch (err) {
            console.error(err);
            alert('Error connecting to server');
        } finally {
            downloadZipBtn.disabled = false;
            downloadZipBtn.textContent = 'Download All as ZIP';
        }
    });

    loadMoreBtn.addEventListener('click', () => loadPhotosPage(false));

      const ts = parseInt(sessionId);
      const date = sessionId === 'unknown' || !ts ? 'Unknown Date' : new Date(ts).toLocaleString();

      const h3 = document.createElement('h3');
      h3.textContent = `Session: ${sessionId} | ${date}`;
      sessionDiv.appendChild(h3);

      const grid = document.createElement('div');
      grid.className = 'photo-grid';

      items
        .sort((a, b) => a.id.localeCompare(b.id))
        .forEach((item) => {
          const isSelected = selectedIds.has(item.id);
          const itemDiv = document.createElement('div');
          itemDiv.className = `photo-item ${isSelected ? 'selected' : ''}`;
          if (currentTab !== 'collages') {
            itemDiv.style.aspectRatio = rawAspect;
          }

          const checkbox = document.createElement('div');
          checkbox.className = 'checkbox-overlay';

          const actions = document.createElement('div');
          actions.className = 'item-actions';
          const viewBtn = document.createElement('button');
          viewBtn.className = 'item-action-btn';
          viewBtn.textContent = '👁';
          viewBtn.title = 'Preview';
          viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window._showPreview(item.url);
          });
          actions.appendChild(viewBtn);

          const img = document.createElement('img');
          // Use the lightweight thumbnail for the grid; full-size `url` is used
          // for the preview lightbox and downloads. Fall back to full-size if an
          // older server response omits thumbUrl.
          img.src = item.thumbUrl || item.url;
          img.alt = 'Photo';
          img.loading = 'lazy';

          const label = document.createElement('span');
          label.className = 'label';
          label.textContent = item.id.split('_').pop();

          itemDiv.append(checkbox, actions, img, label);

          itemDiv.addEventListener('click', (e) => {
            e.preventDefault();
            toggleSelection(item.id);
          });

          grid.appendChild(itemDiv);
        });

      sessionDiv.appendChild(grid);
      sessionsList.appendChild(sessionDiv);
    });
  }
});
