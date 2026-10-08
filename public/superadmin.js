// FALLBACK_API / API_BASE / loadConfig / setupPreviewLightbox come from panel-common.js

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  setupPreviewLightbox();
  const loginSection = document.getElementById('login-section');
  const appSection = document.getElementById('app-section');
  const passwordInput = document.getElementById('superadmin-password');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const treeContainer = document.getElementById('tree-container');
  const photoGrid = document.getElementById('photo-grid');
  const emptyMsg = document.getElementById('empty-msg');
  const deleteSelectedBtn = document.getElementById('delete-selected-btn');
  const downloadSelectedBtn = document.getElementById('download-selected-btn');
  const downloadAllBtn = document.getElementById('download-all-btn');
  const selectAllBtn = document.getElementById('select-all-btn');
  const clearSelectionBtn = document.getElementById('clear-selection-btn');
  const photoCountEl = document.getElementById('photo-count');
  const breadcrumb = document.getElementById('breadcrumb');
  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalMessage = document.getElementById('modal-message');
  const modalConfirm = document.getElementById('modal-confirm');
  const modalCancel = document.getElementById('modal-cancel');
  const moveModalOverlay = document.getElementById('move-modal-overlay');
  const moveDestInput = document.getElementById('move-dest-input');
  const moveConfirm = document.getElementById('move-modal-confirm');
  const moveCancel = document.getElementById('move-modal-cancel');

  let password = sessionStorage.getItem('superadminPassword');
  let currentPrefix = null;
  let currentFiles = [];
  let selectedKeys = new Set();
  let pendingConfirmCallback = null;
  let pendingMoveSourceKey = null;
  let eventFormMode = null; // 'create' or 'edit'
  let eventFormEditId = null;
  let allEvents = [];
  let treeLoaded = false; // Files tab loads its tree on first open

  // --- Tab Switching ---

  const tabButtons = document.querySelectorAll('.sa-tab');
  const filesView = document.getElementById('files-view');
  const eventsView = document.getElementById('events-view');
  const createEventBtn = document.getElementById('create-event-btn');
  const eventFormOverlay = document.getElementById('event-form-overlay');
  const eventFormEl = document.getElementById('event-form');
  const eventFormTitle = document.getElementById('event-form-title');
  const eventFormCancel = document.getElementById('event-form-cancel');


  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((t) => t.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      filesView.classList.toggle('hidden', tab !== 'files');
      eventsView.classList.toggle('hidden', tab !== 'events');
      if (tab === 'events') loadEvents();
      if (tab === 'files' && !treeLoaded) loadTree();
    });
  });

  // Background upload reuses the wallpapers bucket prefix
  const bgUploadBtn = document.getElementById('ef-background-upload-btn');
  const bgFileInput = document.getElementById('ef-background-file');
  const bgStatus = document.getElementById('ef-background-status');

  bgUploadBtn.addEventListener('click', () => bgFileInput.click());

  bgFileInput.addEventListener('change', async () => {
    const file = bgFileInput.files[0];
    if (!file) return;
    bgUploadBtn.disabled = true;
    bgStatus.textContent = 'Uploading…';
    try {
      const formData = new FormData();
      formData.append('wallpaper', file);
      const res = await fetch(`${API_BASE}/api/superadmin/upload-wallpaper`, {
        method: 'POST',
        headers: { 'x-superadmin-password': password },
        body: formData,
      });
      if (res.status === 401) {
        handle401();
        return;
      }
      if (!res.ok) {
        bgStatus.textContent = 'Upload failed.';
        return;
      }
      const data = await res.json();
      document.getElementById('ef-background-url').value = data.url;
      bgStatus.textContent = 'Uploaded!';
      setTimeout(() => {
        bgStatus.textContent = '';
      }, 3000);
    } catch (err) {
      console.error(err);
      bgStatus.textContent = 'Upload error.';
    } finally {
      bgFileInput.value = '';
      bgUploadBtn.disabled = false;
    }
  });

  createEventBtn.addEventListener('click', () => openEventForm(null));

  // --- Auth ---

  if (password) {
    showApp();
  }

  loginBtn.addEventListener('click', () => {
    password = passwordInput.value.trim();
    if (!password) return;
    sessionStorage.setItem('superadminPassword', password);
    showApp();
  });

  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
  });

  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('superadminPassword');
    location.reload();
  });

  function authHeaders() {
    return { 'x-superadmin-password': password, 'Content-Type': 'application/json' };
  }

  function handle401() {
    sessionStorage.removeItem('superadminPassword');
    alert('Invalid or expired password.');
    location.reload();
  }

  // --- App Init ---

  async function showApp() {
    loginSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    await loadEvents();
  }

  // --- Tree ---

  async function loadTree() {
    treeContainer.innerHTML =
      '<p style="padding:12px 16px;color:#888;font-size:13px;">Loading...</p>';
    try {
      // Fetch all pages and merge trees before rendering (#36)
      const merged = { name: '/', type: 'folder', children: [] };
      let cursor = null;
      do {
        const url = cursor
          ? `${API_BASE}/api/superadmin/tree?cursor=${encodeURIComponent(cursor)}`
          : `${API_BASE}/api/superadmin/tree`;
        const res = await fetch(url, { headers: authHeaders() });
        if (res.status === 401) {
          handle401();
          return;
        }
        if (!res.ok) throw new Error('Failed to load tree');
        const data = await res.json();
        mergeIntoTree(merged, data.tree || { children: [] });
        cursor = data.cursor || null;
      } while (cursor);
      renderTree(enrichTree(merged.children, ''));
      treeLoaded = true;
    } catch (err) {
      console.error(err);
      treeContainer.innerHTML =
        '<p style="padding:12px 16px;color:#ff6b6b;font-size:13px;">Failed to load folders.</p>';
    }
  }

  function mergeIntoTree(target, source) {
    for (const child of source.children || []) {
      const existing = target.children.find((c) => c.name === child.name && c.type === child.type);
      if (existing && child.type === 'folder') {
        mergeIntoTree(existing, child);
      } else if (!existing) {
        target.children.push(child);
      }
    }
  }

  // Enrich raw tree nodes from server with prefix and fileCount
  function enrichTree(nodes, parentPrefix) {
    return nodes
      .filter((n) => n.type === 'folder')
      .map((n) => {
        const prefix = parentPrefix ? `${parentPrefix}${n.name}/` : `${n.name}/`;
        const fileCount = (n.children || []).filter((c) => c.type === 'file').length;
        const children = enrichTree(n.children || [], prefix);
        return { name: n.name, prefix, fileCount, children };
      });
  }

  function renderTree(nodes, container = treeContainer, depth = 0) {
    container.innerHTML = '';
    if (!nodes || nodes.length === 0) {
      container.innerHTML =
        '<p style="padding:12px 16px;color:#888;font-size:13px;">No folders found.</p>';
      return;
    }
    nodes.forEach((node) => {
      const nodeEl = document.createElement('div');
      nodeEl.className = 'tree-node';

      const label = document.createElement('div');
      label.className = 'tree-node-label';
      label.style.paddingLeft = `${10 + depth * 14}px`;
      if (node.prefix === currentPrefix) label.classList.add('selected');

      const toggle = document.createElement('span');
      toggle.className = 'toggle';
      toggle.textContent = node.children && node.children.length > 0 ? '▶' : ' ';

      const icon = document.createElement('span');
      icon.className = 'folder-icon';
      icon.textContent = '📁';

      const name = document.createElement('span');
      name.className = 'folder-name';
      name.textContent = node.name || node.prefix;
      name.title = node.prefix;

      const count = document.createElement('span');
      count.className = 'file-count';
      count.textContent = node.fileCount != null ? `${node.fileCount}` : '';

      const delBtn = document.createElement('span');
      delBtn.className = 'delete-folder-btn';
      delBtn.textContent = '🗑';
      delBtn.title = 'Delete folder';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmAction(
          'Delete Folder',
          `Are you sure you want to delete folder "${node.name || node.prefix}" and all its contents?`,
          () => deleteFolder(node.prefix)
        );
      });

      label.append(toggle, icon, name, count, delBtn);

      // Expand/collapse children
      let expanded = false;
      let childrenEl = null;
      if (node.children && node.children.length > 0) {
        childrenEl = document.createElement('div');
        childrenEl.className = 'tree-node-children hidden';
        renderTree(node.children, childrenEl, depth + 1);

        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          expanded = !expanded;
          toggle.textContent = expanded ? '▼' : '▶';
          childrenEl.classList.toggle('hidden', !expanded);
        });
      }

      label.addEventListener('click', () => {
        selectFolder(node.prefix, label);
      });

      nodeEl.appendChild(label);
      if (childrenEl) nodeEl.appendChild(childrenEl);
      container.appendChild(nodeEl);
    });
  }

  function selectFolder(prefix, labelEl) {
    // Deselect previous
    document
      .querySelectorAll('.tree-node-label.selected')
      .forEach((el) => el.classList.remove('selected'));
    if (labelEl) labelEl.classList.add('selected');
    currentPrefix = prefix;
    updateBreadcrumb(prefix);
    loadPhotos(prefix);
  }

  function updateBreadcrumb(prefix) {
    const parts = prefix ? prefix.replace(/\/$/, '').split('/') : [];
    breadcrumb.innerHTML = '';

    const root = document.createElement('span');
    root.textContent = 'root';
    root.dataset.prefix = '';
    root.addEventListener('click', () => selectFolder('', null));
    breadcrumb.appendChild(root);

    let accumulated = '';
    parts.forEach((part, i) => {
      accumulated += (i === 0 ? '' : '/') + part;
      const acc = accumulated + '/';
      breadcrumb.appendChild(document.createTextNode(' / '));
      const span = document.createElement('span');
      span.textContent = part;
      span.dataset.prefix = acc;
      span.addEventListener('click', () => selectFolder(acc, null));
      breadcrumb.appendChild(span);
    });
  }

  // --- Photos ---

  async function loadPhotos(prefix) {
    selectedKeys.clear();
    currentFiles = [];
    updateDeleteBtn();
    photoGrid.classList.add('hidden');
    emptyMsg.textContent = 'Loading...';
    emptyMsg.classList.remove('hidden');
    photoCountEl.textContent = '';

    try {
      const url = `${API_BASE}/api/superadmin/photos?prefix=${encodeURIComponent(prefix || '')}`;
      const res = await fetch(url, { headers: authHeaders() });
      if (res.status === 401) {
        handle401();
        return;
      }
      if (!res.ok) throw new Error('Failed to load photos');
      const data = await res.json();
      currentFiles = data.files || data.photos || [];
      renderPhotos();
    } catch (err) {
      console.error(err);
      emptyMsg.textContent = 'Failed to load files.';
    }
  }

  function renderPhotos() {
    photoGrid.innerHTML = '';
    currentFiles.sort((a, b) => {
      const ta =
        a.lastModified || a.last_modified
          ? new Date(a.lastModified || a.last_modified).getTime()
          : 0;
      const tb =
        b.lastModified || b.last_modified
          ? new Date(b.lastModified || b.last_modified).getTime()
          : 0;
      if (ta !== tb) return tb - ta;
      return (b.key || '').localeCompare(a.key || '');
    });
    if (currentFiles.length === 0) {
      emptyMsg.textContent = 'No files in this folder.';
      emptyMsg.classList.remove('hidden');
      photoGrid.classList.add('hidden');
      photoCountEl.textContent = '';
      return;
    }

    emptyMsg.classList.add('hidden');
    photoGrid.classList.remove('hidden');
    photoCountEl.textContent = `${currentFiles.length} file${currentFiles.length !== 1 ? 's' : ''}`;

    currentFiles.forEach((file) => {
      const key = file.key || file.id;
      const url = file.url;
      const filename = key.split('/').pop();
      const isImage = /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(filename);
      const isSelected = selectedKeys.has(key);

      const item = document.createElement('div');
      item.className = `photo-item${isSelected ? ' selected' : ''}${!isImage ? ' file-icon-item' : ''}`;

      const checkbox = document.createElement('div');
      checkbox.className = 'checkbox-overlay';

      if (isImage && url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = filename;
        img.loading = 'lazy';
        item.appendChild(img);
      } else {
        const iconEl = document.createElement('div');
        iconEl.className = 'file-icon-big';
        iconEl.textContent = '📄';
        const nameEl = document.createElement('div');
        nameEl.className = 'file-icon-name';
        nameEl.textContent = filename;
        item.append(iconEl, nameEl);
      }

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = filename;

      // Per-file action buttons
      const actions = document.createElement('div');
      actions.className = 'item-actions';

      if (isImage && url) {
        const previewBtn = document.createElement('button');
        previewBtn.className = 'item-action-btn';
        previewBtn.textContent = '👁';
        previewBtn.title = 'Preview';
        previewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window._showPreview(url);
        });
        actions.appendChild(previewBtn);
      }

      const dlBtn = document.createElement('button');
      dlBtn.className = 'item-action-btn';
      dlBtn.textContent = '⬇';
      dlBtn.title = 'Download';
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (url) {
          downloadFileDirect(url, filename);
        } else {
          downloadSelectedZipForKey(key);
        }
      });

      const mvBtn = document.createElement('button');
      mvBtn.className = 'item-action-btn';
      mvBtn.textContent = '✏';
      mvBtn.title = 'Move / Rename';
      mvBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openMoveModal(key);
      });

      actions.append(dlBtn, mvBtn);
      item.append(checkbox, actions, label);

      item.addEventListener('click', () => toggleFileSelection(key));

      photoGrid.appendChild(item);
    });
  }

  function toggleFileSelection(key) {
    if (selectedKeys.has(key)) {
      selectedKeys.delete(key);
    } else {
      selectedKeys.add(key);
    }
    updateDeleteBtn();
    renderPhotos();
  }

  function updateDeleteBtn() {
    deleteSelectedBtn.disabled = selectedKeys.size === 0;
    deleteSelectedBtn.textContent = `Delete Selected (${selectedKeys.size})`;
    downloadSelectedBtn.disabled = selectedKeys.size === 0;
    downloadSelectedBtn.textContent = `Download Selected (${selectedKeys.size})`;
  }

  selectAllBtn.addEventListener('click', () => {
    currentFiles.forEach((f) => selectedKeys.add(f.key || f.id));
    updateDeleteBtn();
    renderPhotos();
  });

  clearSelectionBtn.addEventListener('click', () => {
    selectedKeys.clear();
    updateDeleteBtn();
    renderPhotos();
  });

  // --- Delete ---

  deleteSelectedBtn.addEventListener('click', () => {
    if (selectedKeys.size === 0) return;
    confirmAction(
      'Delete Files',
      `Are you sure you want to delete ${selectedKeys.size} selected file${selectedKeys.size !== 1 ? 's' : ''}?`,
      () => deleteSelectedFiles()
    );
  });

  async function deleteSelectedFiles() {
    const keys = Array.from(selectedKeys);
    let failed = 0;
    for (const key of keys) {
      try {
        const res = await fetch(`${API_BASE}/api/superadmin/file`, {
          method: 'DELETE',
          headers: authHeaders(),
          body: JSON.stringify({ key }),
        });
        if (res.status === 401) {
          handle401();
          return;
        }
        if (!res.ok) failed++;
        else selectedKeys.delete(key);
      } catch {
        failed++;
      }
    }
    if (failed > 0) alert(`${failed} file(s) could not be deleted.`);
    currentFiles = currentFiles.filter(
      (f) => !keys.includes(f.key || f.id) || selectedKeys.has(f.key || f.id)
    );
    updateDeleteBtn();
    renderPhotos();
    await loadTree();
  }

  async function deleteFolder(prefix) {
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/folder`, {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ prefix }),
      });
      if (res.status === 401) {
        handle401();
        return;
      }
      if (!res.ok) {
        alert('Failed to delete folder.');
        return;
      }
      if (currentPrefix === prefix) {
        currentPrefix = null;
        currentFiles = [];
        selectedKeys.clear();
        updateDeleteBtn();
        photoGrid.classList.add('hidden');
        emptyMsg.textContent = 'Select a folder to view its contents.';
        emptyMsg.classList.remove('hidden');
        breadcrumb.innerHTML = '<span>root</span>';
      }
      await loadTree();
    } catch (err) {
      console.error(err);
      alert('Error deleting folder.');
    }
  }

  // --- Download ---

  downloadAllBtn.addEventListener('click', () => downloadZip(currentPrefix));

  downloadSelectedBtn.addEventListener('click', () => {
    if (selectedKeys.size === 0) return;
    downloadSelectedZip();
  });

  async function downloadZip(prefix) {
    const prevText = downloadAllBtn.textContent;
    downloadAllBtn.disabled = true;
    downloadAllBtn.textContent = 'Preparing…';
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/mint-download-token`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ prefix: prefix || undefined }),
      });
      if (res.status === 401) {
        handle401();
        return;
      }
      if (!res.ok) {
        alert('Download failed.');
        return;
      }
      const { token } = await res.json();
      window.location = `${API_BASE}/api/superadmin/zip/${token}`;
    } catch (err) {
      console.error(err);
      alert('Download error.');
    } finally {
      downloadAllBtn.disabled = false;
      downloadAllBtn.textContent = prevText;
    }
  }

  async function downloadSelectedZip() {
    const keys = Array.from(selectedKeys);
    const prevText = downloadSelectedBtn.textContent;
    downloadSelectedBtn.disabled = true;
    downloadSelectedBtn.textContent = 'Preparing…';
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/mint-download-token`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ keys }),
      });
      if (res.status === 401) {
        handle401();
        return;
      }
      if (!res.ok) {
        alert('Download failed.');
        return;
      }
      const { token } = await res.json();
      window.location = `${API_BASE}/api/superadmin/zip/${token}`;
    } catch (err) {
      console.error(err);
      alert('Download error.');
    } finally {
      downloadSelectedBtn.disabled = false;
      downloadSelectedBtn.textContent = prevText;
    }
  }

  async function downloadSelectedZipForKey(key) {
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/mint-download-token`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ keys: [key] }),
      });
      if (res.status === 401) {
        handle401();
        return;
      }
      if (!res.ok) {
        alert('Download failed.');
        return;
      }
      const { token } = await res.json();
      window.location = `${API_BASE}/api/superadmin/zip/${token}`;
    } catch (err) {
      console.error(err);
      alert('Download error.');
    }
  }

  function downloadFileDirect(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // --- Move / Rename ---

  function openMoveModal(sourceKey) {
    pendingMoveSourceKey = sourceKey;
    moveDestInput.value = sourceKey;
    moveModalOverlay.classList.add('active');
    moveDestInput.focus();
    moveDestInput.select();
  }

  moveConfirm.addEventListener('click', async () => {
    const destKey = moveDestInput.value.trim();
    if (!destKey || !pendingMoveSourceKey) return;
    if (destKey === pendingMoveSourceKey) {
      moveModalOverlay.classList.remove('active');
      return;
    }
    await doMoveFile(pendingMoveSourceKey, destKey);
    pendingMoveSourceKey = null;
    moveModalOverlay.classList.remove('active');
  });

  moveCancel.addEventListener('click', () => {
    pendingMoveSourceKey = null;
    moveModalOverlay.classList.remove('active');
  });

  moveModalOverlay.addEventListener('click', (e) => {
    if (e.target === moveModalOverlay) {
      pendingMoveSourceKey = null;
      moveModalOverlay.classList.remove('active');
    }
  });

  moveDestInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') moveConfirm.click();
    if (e.key === 'Escape') moveCancel.click();
  });

  async function doMoveFile(sourceKey, destKey) {
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/move`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sourceKey, destKey }),
      });
      if (res.status === 401) {
        handle401();
        return;
      }
      if (!res.ok) {
        alert('Move failed.');
        return;
      }
      await loadPhotos(currentPrefix);
      await loadTree();
    } catch (err) {
      console.error(err);
      alert('Move error.');
    }
  }

  // --- Modal ---

  function confirmAction(title, message, onConfirm, confirmLabel = 'Delete') {
    modalTitle.textContent = title;
    modalConfirm.textContent = confirmLabel;
    modalMessage.textContent = message;
    pendingConfirmCallback = onConfirm;
    modalOverlay.classList.add('active');
  }

  modalConfirm.addEventListener('click', () => {
    modalOverlay.classList.remove('active');
    if (pendingConfirmCallback) {
      pendingConfirmCallback();
      pendingConfirmCallback = null;
    }
  });

  modalCancel.addEventListener('click', () => {
    modalOverlay.classList.remove('active');
    pendingConfirmCallback = null;
  });

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.classList.remove('active');
      pendingConfirmCallback = null;
    }
  });

  // --- Events ---

  async function loadEvents() {
    const listEl = document.getElementById('events-list');
    listEl.innerHTML = '<p style="color:#888;font-size:13px;">Loading...</p>';
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/events`, { headers: authHeaders() });
      if (res.status === 401) {
        handle401();
        return;
      }
      if (!res.ok) throw new Error('Failed to load events');
      const data = await res.json();
      allEvents = data.events || data;
      renderEventsList(allEvents);
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p style="color:#ff6b6b;font-size:13px;">Failed to load events.</p>';
    }
  }

  function renderEventsList(events) {
    const listEl = document.getElementById('events-list');
    listEl.innerHTML = '';

    if (!events || events.length === 0) {
      listEl.innerHTML = '<div id="events-empty">No events yet.</div>';
      return;
    }

    const byNewest = (a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    };
    const active = events.filter((e) => e.is_active).sort(byNewest);
    const archived = events.filter((e) => !e.is_active).sort(byNewest);

    // Active events first, archived grouped below, each under a full-width heading
    const items = [];
    [
      ['Active', active],
      ['Archived', archived],
    ].forEach(([label, group]) => {
      if (group.length === 0) return;
      const heading = document.createElement('div');
      heading.className = 'events-group-heading';
      heading.textContent = `${label} (${group.length})`;
      items.push(heading, ...group);
    });

    items.forEach((event) => {
      if (event instanceof HTMLElement) {
        listEl.appendChild(event);
        return;
      }
      const card = document.createElement('div');
      card.className = 'event-card';

      const templateCount = (event.templates || []).length;
      const shots = event.capture?.totalShots ?? '?';
      const w = event.capture?.photoWidth ?? '?';
      const h = event.capture?.photoHeight ?? '?';
      const id = encodeURIComponent(event.event_id);

      // The kiosk key rides in the booth link — /api/save rejects uploads without it
      const boothUrl = () => `${BOOTH_ORIGIN}/?event=${id}&key=${encodeURIComponent(event.kiosk_key)}`;
      const adminUrl = () => `${BOOTH_ORIGIN}/admin.html?event=${id}`;
      const slideshowUrl = () =>
        `${BOOTH_ORIGIN}/preview/?event=${id}&token=${encodeURIComponent(event.slideshow_token)}`;

      // Static markup only — every user-supplied value is set via textContent below
      card.innerHTML = `
                <div class="event-card-header">
                    <span class="event-card-id"></span>
                    <button class="event-status-btn ${event.is_active ? 'active' : 'inactive'}">${event.is_active ? 'active' : 'inactive'}</button>
                </div>
                <button class="event-menu-btn" aria-label="More actions">⋮</button>
                <div class="event-menu hidden">
                    <button class="event-duplicate-btn">Duplicate</button>
                    <button class="event-delete-btn">Delete</button>
                </div>
                <div class="event-card-name"></div>
                <div class="event-card-meta"></div>
                <div class="event-card-footer">
                    <button class="event-refresh-btn" aria-label="Refresh kiosk key and slideshow token" title="Refresh kiosk key and slideshow token">↻</button>
                    <div class="event-card-links">
                        <button class="event-booth-link-btn">Booth</button>
                        <button class="event-admin-link-btn">Admin</button>
                        <button class="event-slideshow-link-btn">Slideshow</button>
                    </div>
                </div>
            `;
      // Populate all user-supplied text via textContent to prevent XSS
      card.querySelector('.event-card-id').textContent = event.event_id;
      card.querySelector('.event-card-name').textContent = event.event_name || '—';
      card.querySelector('.event-card-meta').textContent =
        `${templateCount} template${templateCount !== 1 ? 's' : ''} · ${shots} shots, ${w}×${h}${event.gif?.enabled ? ', GIF' : ''}${event.is_demo ? ' · demo' : ''}`;

      card.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('.event-menu')) return;
        openEventForm(event);
      });

      // Missing key/token is minted on first copy so the link always works.
      // Demo events take keyless uploads, so their booth link is the bare public one.
      bindCopyLink(card.querySelector('.event-booth-link-btn'), async () => {
        if (event.is_demo) return `${BOOTH_ORIGIN}/?event=${id}`;
        if (!event.kiosk_key) event.kiosk_key = await regenerateSecret(event, 'kiosk-key');
        return event.kiosk_key && boothUrl();
      });
      bindCopyLink(card.querySelector('.event-admin-link-btn'), async () => adminUrl());
      bindCopyLink(card.querySelector('.event-slideshow-link-btn'), async () => {
        if (!event.slideshow_token)
          event.slideshow_token = await regenerateSecret(event, 'slideshow-token');
        return event.slideshow_token && slideshowUrl();
      });

      const refreshBtn = card.querySelector('.event-refresh-btn');
      refreshBtn.addEventListener('click', () => {
        confirmAction(
          'Refresh links',
          `Issue a new kiosk key and slideshow token for "${event.event_id}"? The current booth and slideshow links will stop working.`,
          async () => {
            refreshBtn.disabled = true;
            const key = await regenerateSecret(event, 'kiosk-key');
            const token = await regenerateSecret(event, 'slideshow-token');
            refreshBtn.disabled = false;
            if (key) event.kiosk_key = key;
            if (token) event.slideshow_token = token;
          },
          'Refresh'
        );
      });

      const statusBtn = card.querySelector('.event-status-btn');
      statusBtn.addEventListener('click', () => {
        statusBtn.disabled = true;
        setEventActive(event, !event.is_active);
      });

      const menuBtn = card.querySelector('.event-menu-btn');
      const menu = card.querySelector('.event-menu');
      menuBtn.addEventListener('click', () => {
        const wasOpen = !menu.classList.contains('hidden');
        closeEventMenus();
        menu.classList.toggle('hidden', wasOpen);
      });

      card.querySelector('.event-duplicate-btn').addEventListener('click', () => {
        closeEventMenus();
        const copy = { ...event };
        delete copy.event_id;
        delete copy.created_at;
        delete copy.updated_at;
        openEventForm(null, copy);
      });
      card.querySelector('.event-delete-btn').addEventListener('click', () => {
        closeEventMenus();
        confirmAction(
          'Delete Event',
          `Are you sure you want to delete event "${event.event_id}"? This only removes the config, not any photos.`,
          () => deleteEvent(event.event_id)
        );
      });

      listEl.appendChild(card);
    });
  }

  function closeEventMenus() {
    document.querySelectorAll('.event-menu').forEach((m) => m.classList.add('hidden'));
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.event-menu-btn') && !e.target.closest('.event-menu')) closeEventMenus();
  });

  function bindCopyLink(btn, getUrl) {
    const label = btn.textContent;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const url = await getUrl();
        if (!url) return;
        await navigator.clipboard.writeText(url);
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = label;
        }, 2000);
      } catch (err) {
        console.error(err);
        alert('Could not copy link.');
      } finally {
        btn.disabled = false;
      }
    });
  }

  // kind: 'kiosk-key' | 'slideshow-token'. Returns the new value, or null on failure.
  async function regenerateSecret(event, kind) {
    try {
      const res = await fetch(
        `${API_BASE}/api/superadmin/events/${encodeURIComponent(event.event_id)}/regenerate-${kind}`,
        { method: 'POST', headers: authHeaders() }
      );
      if (res.status === 401) {
        handle401();
        return null;
      }
      if (!res.ok) {
        alert(`Failed to generate ${kind.replace('-', ' ')}.`);
        return null;
      }
      const data = await res.json();
      return kind === 'kiosk-key' ? data.kiosk_key : data.slideshow_token;
    } catch (err) {
      console.error(err);
      alert(`Error generating ${kind.replace('-', ' ')}.`);
      return null;
    }
  }

  async function setEventActive(event, isActive) {
    const action = isActive ? 'activate' : 'deactivate';
    try {
      const res = await fetch(
        `${API_BASE}/api/superadmin/events/${encodeURIComponent(event.event_id)}/${action}`,
        {
          method: 'POST',
          headers: authHeaders(),
        }
      );
      if (res.status === 401) {
        handle401();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Failed to ${action} event.`);
      }
      loadEvents();
    } catch (err) {
      console.error(err);
      alert(`Error trying to ${action} event.`);
      loadEvents();
    }
  }

  async function createEvent(eventData) {
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/events`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(eventData),
      });
      if (res.status === 401) {
        handle401();
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        alert('Failed to create event: ' + text);
        return;
      }
      closeEventForm();
      loadEvents();
    } catch (err) {
      console.error(err);
      alert('Error creating event.');
    }
  }

  async function updateEvent(eventId, eventData) {
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/events/${encodeURIComponent(eventId)}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(eventData),
      });
      if (res.status === 401) {
        handle401();
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        alert('Failed to update event: ' + text);
        return;
      }
      closeEventForm();
      loadEvents();
    } catch (err) {
      console.error(err);
      alert('Error updating event.');
    }
  }

  async function deleteEvent(eventId) {
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/events/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.status === 401) {
        handle401();
        return;
      }
      if (!res.ok) {
        alert('Failed to delete event.');
        return;
      }
      loadEvents();
    } catch (err) {
      console.error(err);
      alert('Error deleting event.');
    }
  }

  const DEFAULT_TEMPLATES = [
    {
      file: 'template1.png',
      width: 880,
      height: 495,
      slots: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    },
  ];

  // 'cards' | 'json'
  let templatesEditMode = 'cards';

  // -------------------------
  // Template card builder
  // -------------------------
  let tplCardCounter = 0;

  function buildSlotRow(x, y) {
    const row = document.createElement('div');
    row.className = 'tpl-slot-row';
    row.innerHTML = `
      <label>x</label>
      <input type="number" class="tpl-slot-x" step="1" />
      <label>y</label>
      <input type="number" class="tpl-slot-y" step="1" />
      <button type="button" class="tpl-mini-btn tpl-remove-slot-btn">×</button>
    `;
    // Values are set as properties, never interpolated, so pasted template JSON can't inject markup
    row.querySelector('.tpl-slot-x').value = x ?? '';
    row.querySelector('.tpl-slot-y').value = y ?? '';
    row.querySelector('.tpl-remove-slot-btn').addEventListener('click', () => {
      row.remove();
      refreshSlotWarnings();
    });
    return row;
  }

  function buildTemplateCard(tpl) {
    tplCardCounter += 1;
    const idx = tplCardCounter;
    const card = document.createElement('div');
    card.className = 'tpl-card';

    card.innerHTML = `
      <div class="tpl-card-head">
        <span class="tpl-card-title">Template ${idx}</span>
        <div class="tpl-card-actions">
          <button type="button" class="tpl-mini-btn tpl-duplicate-card-btn">Duplicate</button>
          <button type="button" class="tpl-remove-btn tpl-remove-card-btn">Remove</button>
        </div>
      </div>
      <div class="tpl-upload-row">
        <input type="text" class="tpl-file" placeholder="file URL or path" style="flex:1;padding:5px 8px;background:#1a1a1a;border:1px solid rgba(247,242,213,0.2);border-radius:4px;color:#f7f2d5;font-family:'IBM Plex Mono',monospace;font-size:12px;" />
        <button type="button" class="tpl-mini-btn tpl-upload-btn">Upload PNG</button>
        <input type="file" class="tpl-file-input" accept="image/png,image/jpeg,image/webp" style="display:none" />
        <span class="tpl-upload-status"></span>
      </div>
      <div class="form-grid-2">
        <div class="form-row">
          <label>Width (px)</label>
          <input type="number" class="tpl-width" min="1" step="1" />
        </div>
        <div class="form-row">
          <label>Height (px)</label>
          <input type="number" class="tpl-height" min="1" step="1" />
        </div>
      </div>
      <div class="tpl-slots-header">
        <span class="tpl-slots-label">Slots</span>
        <button type="button" class="tpl-mini-btn tpl-add-slot-btn">+ Add Slot</button>
      </div>
      <div class="tpl-slots-container"></div>
      <div class="tpl-warning"></div>
    `;

    card.querySelector('.tpl-file').value = tpl.file || '';
    card.querySelector('.tpl-width').value = tpl.width || 880;
    card.querySelector('.tpl-height').value = tpl.height || 495;

    const slotsContainer = card.querySelector('.tpl-slots-container');
    (tpl.slots || []).forEach(({ x, y }) => slotsContainer.appendChild(buildSlotRow(x, y)));

    card.querySelector('.tpl-remove-card-btn').addEventListener('click', () => {
      card.remove();
      refreshSlotWarnings();
    });

    card.querySelector('.tpl-duplicate-card-btn').addEventListener('click', () => {
      const copy = {
        file: card.querySelector('.tpl-file').value,
        width: parseFloat(card.querySelector('.tpl-width').value) || 880,
        height: parseFloat(card.querySelector('.tpl-height').value) || 495,
        slots: [...card.querySelectorAll('.tpl-slot-row')].map((row) => ({
          x: parseFloat(row.querySelector('.tpl-slot-x').value) || 0,
          y: parseFloat(row.querySelector('.tpl-slot-y').value) || 0,
        })),
      };
      card.after(buildTemplateCard(copy));
      refreshSlotWarnings();
    });

    card.querySelector('.tpl-add-slot-btn').addEventListener('click', () => {
      slotsContainer.appendChild(buildSlotRow(0, 0));
      refreshSlotWarnings();
    });

    // Upload button wiring
    const uploadBtn = card.querySelector('.tpl-upload-btn');
    const fileInput = card.querySelector('.tpl-file-input');
    const statusSpan = card.querySelector('.tpl-upload-status');
    const fileField = card.querySelector('.tpl-file');

    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      uploadBtn.disabled = true;
      statusSpan.textContent = 'Uploading…';
      try {
        const formData = new FormData();
        formData.append('template', file);
        const res = await fetch(`${API_BASE}/api/superadmin/upload-template`, {
          method: 'POST',
          headers: { 'x-superadmin-password': password },
          body: formData,
        });
        if (res.status === 401) {
          handle401();
          return;
        }
        if (!res.ok) {
          statusSpan.textContent = 'Upload failed.';
          uploadBtn.disabled = false;
          return;
        }
        const data = await res.json();
        fileField.value = data.url;
        statusSpan.textContent = 'Uploaded!';
        fileInput.value = '';
        setTimeout(() => {
          statusSpan.textContent = '';
        }, 3000);
      } catch (err) {
        console.error(err);
        statusSpan.textContent = 'Upload error.';
      } finally {
        uploadBtn.disabled = false;
      }
    });

    return card;
  }

  function renderTemplateCards(templates) {
    tplCardCounter = 0;
    const container = document.getElementById('ef-templates-cards');
    container.innerHTML = '';
    (templates || []).forEach((tpl) => container.appendChild(buildTemplateCard(tpl)));
    refreshSlotWarnings();
  }

  function readTemplateCards() {
    const cards = document.querySelectorAll('#ef-templates-cards .tpl-card');
    const templates = [];
    const errors = [];

    if (cards.length === 0) {
      errors.push('At least one template is required.');
      return { templates, errors };
    }

    cards.forEach((card, i) => {
      const label = `Template ${i + 1}`;
      const file = card.querySelector('.tpl-file').value.trim();
      const width = parseFloat(card.querySelector('.tpl-width').value);
      const height = parseFloat(card.querySelector('.tpl-height').value);
      const slotRows = card.querySelectorAll('.tpl-slot-row');

      if (!file) errors.push(`${label}: file is required.`);
      if (!isFinite(width) || width <= 0) errors.push(`${label}: width must be a positive number.`);
      if (!isFinite(height) || height <= 0) errors.push(`${label}: height must be a positive number.`);
      if (slotRows.length === 0) errors.push(`${label}: at least one slot is required.`);

      const slots = [];
      slotRows.forEach((row, si) => {
        const x = parseFloat(row.querySelector('.tpl-slot-x').value);
        const y = parseFloat(row.querySelector('.tpl-slot-y').value);
        if (!isFinite(x) || !isFinite(y)) {
          errors.push(`${label} slot ${si + 1}: x and y must be numbers.`);
        } else {
          slots.push({ x, y });
        }
      });

      templates.push({ file, width, height, slots });
    });

    return { templates, errors };
  }

  function refreshSlotWarnings() {
    const totalShots = parseInt(document.getElementById('ef-total-shots').value, 10) || 0;
    document.querySelectorAll('#ef-templates-cards .tpl-card').forEach((card, i) => {
      card.querySelector('.tpl-card-title').textContent = `Template ${i + 1}`;
      const slotCount = card.querySelectorAll('.tpl-slot-row').length;
      const warning = card.querySelector('.tpl-warning');
      if (totalShots > 0 && slotCount !== totalShots) {
        warning.textContent = `${slotCount} slot${slotCount !== 1 ? 's' : ''} but Total Shots is ${totalShots} — extra shots won't appear`;
      } else {
        warning.textContent = '';
      }
    });
  }

  // JSON toggle
  const jsonToggleBtn = document.getElementById('ef-templates-json-toggle');
  const jsonRow = document.getElementById('ef-templates-json-row');
  const addTemplateBtn = document.getElementById('ef-add-template');

  jsonToggleBtn.addEventListener('click', () => {
    if (templatesEditMode === 'cards') {
      // Switch to JSON: serialize cards into textarea
      const { templates } = readTemplateCards();
      document.getElementById('ef-templates').value = JSON.stringify(templates, null, 2);
      jsonRow.classList.remove('hidden');
      addTemplateBtn.classList.add('hidden');
      document.getElementById('ef-templates-cards').classList.add('hidden');
      jsonToggleBtn.textContent = 'Edit as Cards';
      templatesEditMode = 'json';
    } else {
      // Switch to cards: parse JSON back
      try {
        const raw = JSON.parse(document.getElementById('ef-templates').value);
        renderTemplateCards(raw);
        jsonRow.classList.add('hidden');
        addTemplateBtn.classList.remove('hidden');
        document.getElementById('ef-templates-cards').classList.remove('hidden');
        jsonToggleBtn.textContent = 'Edit as JSON';
        templatesEditMode = 'cards';
      } catch {
        alert('JSON is not valid — fix it before switching back to cards mode.');
      }
    }
  });

  addTemplateBtn.addEventListener('click', () => {
    const container = document.getElementById('ef-templates-cards');
    container.appendChild(
      buildTemplateCard({ file: '', width: 880, height: 495, slots: [{ x: 0, y: 0 }] })
    );
    refreshSlotWarnings();
  });

  // Refresh slot warnings whenever Total Shots changes
  document.getElementById('ef-total-shots').addEventListener('input', refreshSlotWarnings);

  // -------------------------

  const BOOTH_ORIGIN = window.location.origin;

  function updateBoothUrlPreview() {
    const preview = document.getElementById('ef-booth-url-preview');
    if (!preview) return;
    const id = document.getElementById('ef-event-id').value.trim();
    preview.textContent = id ? `${BOOTH_ORIGIN}/?event=${id}` : '';
  }

  function openEventForm(event, prefill = null) {
    const src = event || prefill;
    eventFormMode = event ? 'edit' : 'create';
    eventFormEditId = event ? event.event_id : null;
    eventFormTitle.textContent = event ? 'Edit Event' : prefill ? 'Duplicate Event' : 'New Event';

    const idInput = document.getElementById('ef-event-id');
    idInput.value = event ? event.event_id : '';
    idInput.disabled = !!event;
    updateBoothUrlPreview();

    document.getElementById('ef-event-name').value = src ? src.event_name || '' : '';
    document.getElementById('ef-background-url').value = src ? src.background_url || '' : '';
    document.getElementById('ef-admin-password').value = src ? src.admin_password || '' : '';
    document.getElementById('ef-is-demo').checked = !!src?.is_demo;
    document.getElementById('ef-total-shots').value = src ? (src.capture?.totalShots ?? 3) : 3;
    document.getElementById('ef-photo-width').value = src ? (src.capture?.photoWidth ?? 880) : 880;
    document.getElementById('ef-photo-height').value = src
      ? (src.capture?.photoHeight ?? 495)
      : 495;
    document.getElementById('ef-countdown-seconds').value = src ? (src.countdown?.seconds ?? 3) : 3;
    document.getElementById('ef-countdown-step-ms').value = src
      ? (src.countdown?.stepMs ?? 500)
      : 500;
    document.getElementById('ef-gesture-enabled').checked = src
      ? (src.gestureTrigger?.enabled ?? false)
      : false;
    const gestureTypeVal = src ? (src.gestureTrigger?.gestureType ?? 'peace') : 'peace';
    document.querySelector(`input[name="ef-gesture-type"][value="${gestureTypeVal}"]`).checked =
      true;
    document.getElementById('ef-gesture-hold-duration').value = src
      ? (src.gestureTrigger?.holdDuration ?? 2000)
      : 2000;
    document.getElementById('ef-gesture-fps').value = src
      ? (src.gestureTrigger?.detectionFps ?? 10)
      : 10;
    document.getElementById('ef-gif-enabled').checked = src?.gif?.enabled ?? false;
    document.getElementById('ef-gif-frames').value = src?.gif?.frames ?? 5;
    document.getElementById('ef-gif-interval-ms').value = src?.gif?.intervalMs ?? 150;
    document.getElementById('ef-gif-boomerang').checked = src?.gif?.boomerang ?? true;

    // Render template cards; reset to cards mode
    templatesEditMode = 'cards';
    jsonToggleBtn.textContent = 'Edit as JSON';
    jsonRow.classList.add('hidden');
    addTemplateBtn.classList.remove('hidden');
    document.getElementById('ef-templates-cards').classList.remove('hidden');
    renderTemplateCards(src ? src.templates : DEFAULT_TEMPLATES);

    eventFormOverlay.classList.add('active');
  }

  function closeEventForm() {
    eventFormOverlay.classList.remove('active');
    eventFormMode = null;
    eventFormEditId = null;
  }

  document.getElementById('ef-event-id').addEventListener('input', updateBoothUrlPreview);

  eventFormCancel.addEventListener('click', closeEventForm);

  eventFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();

    let templates;
    if (templatesEditMode === 'json') {
      try {
        const raw = JSON.parse(document.getElementById('ef-templates').value);
        templates = raw.map(({ name, preview, ...rest }) => rest);
      } catch {
        alert('Templates field is not valid JSON.');
        return;
      }
    } else {
      const { templates: parsed, errors } = readTemplateCards();
      if (errors.length > 0) {
        alert(errors.join('\n'));
        return;
      }
      templates = parsed.map(({ name, preview, ...rest }) => rest);
    }

    const eventData = {
      event_id: document.getElementById('ef-event-id').value.trim(),
      event_name: document.getElementById('ef-event-name').value.trim(),
      background_url: document.getElementById('ef-background-url').value.trim() || null,
      is_demo: document.getElementById('ef-is-demo').checked,
      ...(document.getElementById('ef-admin-password').value.trim()
        ? { admin_password: document.getElementById('ef-admin-password').value.trim() }
        : {}),
      capture: {
        totalShots: parseInt(document.getElementById('ef-total-shots').value, 10),
        photoWidth: parseInt(document.getElementById('ef-photo-width').value, 10),
        photoHeight: parseInt(document.getElementById('ef-photo-height').value, 10),
      },
      countdown: {
        seconds: parseInt(document.getElementById('ef-countdown-seconds').value, 10),
        stepMs: parseInt(document.getElementById('ef-countdown-step-ms').value, 10),
      },
      gestureTrigger: {
        enabled: document.getElementById('ef-gesture-enabled').checked,
        gestureType:
          document.querySelector('input[name="ef-gesture-type"]:checked')?.value ?? 'peace',
        holdDuration: parseInt(document.getElementById('ef-gesture-hold-duration').value, 10),
        detectionFps: parseInt(document.getElementById('ef-gesture-fps').value, 10),
      },
      gif: {
        enabled: document.getElementById('ef-gif-enabled').checked,
        frames: parseInt(document.getElementById('ef-gif-frames').value, 10),
        intervalMs: parseInt(document.getElementById('ef-gif-interval-ms').value, 10),
        boomerang: document.getElementById('ef-gif-boomerang').checked,
      },
      templates,
    };

    if (eventFormMode === 'create') {
      await createEvent(eventData);
    } else {
      await updateEvent(eventFormEditId, eventData);
    }
  });
});
