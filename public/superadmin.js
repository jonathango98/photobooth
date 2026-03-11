const API_BASE = 'https://photobooth-server-production.up.railway.app';

document.addEventListener('DOMContentLoaded', () => {
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
    const moveMoveConfirm = document.getElementById('move-modal-confirm');
    const moveMoveCancel = document.getElementById('move-modal-cancel');

    let password = localStorage.getItem('superadminPassword');
    let currentPrefix = null;
    let currentFiles = [];
    let selectedKeys = new Set();
    let treeData = null;
    let pendingConfirmCallback = null;
    let pendingMoveSourceKey = null;
    let eventFormMode = null; // 'create' or 'edit'
    let eventFormEditId = null;

    // --- Tab Switching ---

    const tabButtons = document.querySelectorAll('.sa-tab');
    const filesView = document.getElementById('files-view');
    const eventsView = document.getElementById('events-view');
    const createEventBtn = document.getElementById('create-event-btn');
    const eventFormOverlay = document.getElementById('event-form-overlay');
    const eventFormEl = document.getElementById('event-form');
    const eventFormTitle = document.getElementById('event-form-title');
    const eventFormCancel = document.getElementById('event-form-cancel');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            if (tab === 'files') {
                filesView.classList.remove('hidden');
                eventsView.classList.add('hidden');
            } else if (tab === 'events') {
                filesView.classList.add('hidden');
                eventsView.classList.remove('hidden');
                loadEvents();
            }
        });
    });

    createEventBtn.addEventListener('click', () => openEventForm(null));

    // --- Auth ---

    if (password) {
        showApp();
    }

    loginBtn.addEventListener('click', () => {
        password = passwordInput.value.trim();
        if (!password) return;
        localStorage.setItem('superadminPassword', password);
        showApp();
    });

    passwordInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') loginBtn.click();
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('superadminPassword');
        location.reload();
    });

    function authHeaders() {
        return { 'x-superadmin-password': password, 'Content-Type': 'application/json' };
    }

    function handle401() {
        localStorage.removeItem('superadminPassword');
        alert('Invalid or expired password.');
        location.reload();
    }

    // --- App Init ---

    async function showApp() {
        loginSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        await loadTree();
    }

    // --- Tree ---

    async function loadTree() {
        treeContainer.innerHTML = '<p style="padding:12px 16px;color:#888;font-size:13px;">Loading...</p>';
        try {
            const res = await fetch(`${API_BASE}/api/superadmin/tree`, {
                headers: authHeaders()
            });
            if (res.status === 401) { handle401(); return; }
            if (!res.ok) throw new Error('Failed to load tree');
            const data = await res.json();
            // Server returns { ok, tree: { name: "/", type: "folder", children: [...] } }
            const rawChildren = (data.tree && data.tree.children) || [];
            treeData = enrichTree(rawChildren, '');
            renderTree(treeData);
        } catch (err) {
            console.error(err);
            treeContainer.innerHTML = '<p style="padding:12px 16px;color:#ff6b6b;font-size:13px;">Failed to load folders.</p>';
        }
    }

    // Enrich raw tree nodes from server with prefix and fileCount
    function enrichTree(nodes, parentPrefix) {
        return nodes
            .filter(n => n.type === 'folder')
            .map(n => {
                const prefix = parentPrefix ? `${parentPrefix}${n.name}/` : `${n.name}/`;
                const fileCount = (n.children || []).filter(c => c.type === 'file').length;
                const children = enrichTree(n.children || [], prefix);
                return { name: n.name, prefix, fileCount, children };
            });
    }

    function renderTree(nodes, container = treeContainer, depth = 0) {
        container.innerHTML = '';
        if (!nodes || nodes.length === 0) {
            container.innerHTML = '<p style="padding:12px 16px;color:#888;font-size:13px;">No folders found.</p>';
            return;
        }
        nodes.forEach(node => {
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
            delBtn.addEventListener('click', e => {
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

                toggle.addEventListener('click', e => {
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
        document.querySelectorAll('.tree-node-label.selected').forEach(el => el.classList.remove('selected'));
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
            if (res.status === 401) { handle401(); return; }
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
            const ta = a.lastModified || a.last_modified ? new Date(a.lastModified || a.last_modified).getTime() : 0;
            const tb = b.lastModified || b.last_modified ? new Date(b.lastModified || b.last_modified).getTime() : 0;
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

        currentFiles.forEach(file => {
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

            const dlBtn = document.createElement('button');
            dlBtn.className = 'item-action-btn';
            dlBtn.textContent = '⬇';
            dlBtn.title = 'Download';
            dlBtn.addEventListener('click', e => {
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
            mvBtn.addEventListener('click', e => {
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
        currentFiles.forEach(f => selectedKeys.add(f.key || f.id));
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
                    body: JSON.stringify({ key })
                });
                if (res.status === 401) { handle401(); return; }
                if (!res.ok) failed++;
                else selectedKeys.delete(key);
            } catch {
                failed++;
            }
        }
        if (failed > 0) alert(`${failed} file(s) could not be deleted.`);
        currentFiles = currentFiles.filter(f => !keys.includes(f.key || f.id) || selectedKeys.has(f.key || f.id));
        updateDeleteBtn();
        renderPhotos();
        await loadTree();
    }

    async function deleteFolder(prefix) {
        try {
            const res = await fetch(`${API_BASE}/api/superadmin/folder`, {
                method: 'DELETE',
                headers: authHeaders(),
                body: JSON.stringify({ prefix })
            });
            if (res.status === 401) { handle401(); return; }
            if (!res.ok) { alert('Failed to delete folder.'); return; }
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
        const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
        try {
            const res = await fetch(`${API_BASE}/api/superadmin/download-zip${qs}`, { headers: authHeaders() });
            if (res.status === 401) { handle401(); return; }
            if (!res.ok) { alert('Download failed.'); return; }
            const blob = await res.blob();
            triggerBlobDownload(blob, prefix ? `${prefix.replace(/\//g, '_').replace(/_$/, '')}.zip` : 'all.zip');
        } catch (err) {
            console.error(err);
            alert('Download error.');
        }
    }

    async function downloadSelectedZip() {
        const keys = Array.from(selectedKeys);
        try {
            const res = await fetch(`${API_BASE}/api/superadmin/download-selected`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ keys })
            });
            if (res.status === 401) { handle401(); return; }
            if (!res.ok) { alert('Download failed.'); return; }
            const blob = await res.blob();
            triggerBlobDownload(blob, 'selected.zip');
        } catch (err) {
            console.error(err);
            alert('Download error.');
        }
    }

    async function downloadSelectedZipForKey(key) {
        try {
            const res = await fetch(`${API_BASE}/api/superadmin/download-selected`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ keys: [key] })
            });
            if (res.status === 401) { handle401(); return; }
            if (!res.ok) { alert('Download failed.'); return; }
            const blob = await res.blob();
            triggerBlobDownload(blob, key.split('/').pop());
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

    function triggerBlobDownload(blob, filename) {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
    }

    // --- Move / Rename ---

    function openMoveModal(sourceKey) {
        pendingMoveSourceKey = sourceKey;
        moveDestInput.value = sourceKey;
        moveModalOverlay.classList.add('active');
        moveDestInput.focus();
        moveDestInput.select();
    }

    moveMoveConfirm.addEventListener('click', async () => {
        const destKey = moveDestInput.value.trim();
        if (!destKey || !pendingMoveSourceKey) return;
        if (destKey === pendingMoveSourceKey) { moveModalOverlay.classList.remove('active'); return; }
        await doMoveFile(pendingMoveSourceKey, destKey);
        pendingMoveSourceKey = null;
        moveModalOverlay.classList.remove('active');
    });

    moveMoveCancel.addEventListener('click', () => {
        pendingMoveSourceKey = null;
        moveModalOverlay.classList.remove('active');
    });

    moveModalOverlay.addEventListener('click', e => {
        if (e.target === moveModalOverlay) {
            pendingMoveSourceKey = null;
            moveModalOverlay.classList.remove('active');
        }
    });

    moveDestInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') moveMoveConfirm.click();
        if (e.key === 'Escape') moveMoveCancel.click();
    });

    async function doMoveFile(sourceKey, destKey) {
        try {
            const res = await fetch(`${API_BASE}/api/superadmin/move`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ sourceKey, destKey })
            });
            if (res.status === 401) { handle401(); return; }
            if (!res.ok) { alert('Move failed.'); return; }
            await loadPhotos(currentPrefix);
            await loadTree();
        } catch (err) {
            console.error(err);
            alert('Move error.');
        }
    }

    // --- Modal ---

    function confirmAction(title, message, onConfirm) {
        modalTitle.textContent = title;
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

    modalOverlay.addEventListener('click', e => {
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
            if (res.status === 401) { handle401(); return; }
            if (!res.ok) throw new Error('Failed to load events');
            const data = await res.json();
            renderEventsList(data.events || data);
        } catch (err) {
            console.error(err);
            listEl.innerHTML = '<p style="color:#ff6b6b;font-size:13px;">Failed to load events.</p>';
        }
    }

    function renderEventsList(events) {
        const listEl = document.getElementById('events-list');
        listEl.innerHTML = '';

        if (!events || events.length === 0) {
            listEl.innerHTML = '<div id="events-empty">No events found. Create one to get started.</div>';
            return;
        }

        const sorted = [...events].sort((a, b) => {
            const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
            const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
            return tb - ta;
        });

        sorted.forEach(event => {
            const card = document.createElement('div');
            card.className = 'event-card';

            const createdAt = event.created_at ? new Date(event.created_at).toLocaleString() : '—';
            const updatedAt = event.updated_at ? new Date(event.updated_at).toLocaleString() : '—';
            const templateCount = (event.templates || []).length;
            const shots = event.capture?.totalShots ?? '?';
            const w = event.capture?.photoWidth ?? '?';
            const h = event.capture?.photoHeight ?? '?';

            card.innerHTML = `
                <div class="event-card-header">
                    <span class="event-card-id">${event.event_id}</span>
                    <span class="event-badge ${event.is_active ? 'active' : 'inactive'}">${event.is_active ? 'active' : 'inactive'}</span>
                </div>
                <div class="event-card-name">${event.event_name || '—'}</div>
                <div class="event-card-meta">
                    <span>${templateCount} template${templateCount !== 1 ? 's' : ''}</span>
                    <span>${shots} shots, ${w}×${h}</span>
                    <span>Created: ${createdAt}</span>
                    <span>Updated: ${updatedAt}</span>
                </div>
                <div class="event-card-actions">
                    ${!event.is_active ? `<button class="event-activate-btn">Set Active</button>` : `<button class="event-activate-btn" disabled>Active</button>`}
                    <button class="event-edit-btn">Edit</button>
                    <button class="event-duplicate-btn">Duplicate</button>
                    <button class="event-delete-btn">Delete</button>
                </div>
            `;

            const activateBtn = card.querySelector('.event-activate-btn');
            if (!event.is_active) {
                activateBtn.addEventListener('click', () => activateEvent(event));
            }

            card.querySelector('.event-edit-btn').addEventListener('click', () => openEventForm(event));
            card.querySelector('.event-duplicate-btn').addEventListener('click', () => {
                const copy = { ...event };
                delete copy.event_id;
                delete copy.created_at;
                delete copy.updated_at;
                openEventForm(null, copy);
            });
            card.querySelector('.event-delete-btn').addEventListener('click', () => {
                confirmAction(
                    'Delete Event',
                    `Are you sure you want to delete event "${event.event_id}"? This only removes the config, not any photos.`,
                    () => deleteEvent(event.event_id)
                );
            });

            listEl.appendChild(card);
        });
    }

    async function activateEvent(event) {
        const { event_id, created_at, updated_at, ...rest } = event;
        try {
            const res = await fetch(`${API_BASE}/api/superadmin/events/${encodeURIComponent(event_id)}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ ...rest, is_active: true })
            });
            if (res.status === 401) { handle401(); return; }
            if (!res.ok) { alert('Failed to activate event.'); return; }
            loadEvents();
        } catch (err) {
            console.error(err);
            alert('Error activating event.');
        }
    }

    async function createEvent(eventData) {
        try {
            const res = await fetch(`${API_BASE}/api/superadmin/events`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(eventData)
            });
            if (res.status === 401) { handle401(); return; }
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
                body: JSON.stringify(eventData)
            });
            if (res.status === 401) { handle401(); return; }
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
                headers: authHeaders()
            });
            if (res.status === 401) { handle401(); return; }
            if (!res.ok) { alert('Failed to delete event.'); return; }
            loadEvents();
        } catch (err) {
            console.error(err);
            alert('Error deleting event.');
        }
    }

    const DEFAULT_TEMPLATES = JSON.stringify([
        {
            "file": "template1.png",
            "width": 880,
            "height": 495,
            "slots": [
                { "x": 0, "y": 0 },
                { "x": 0, "y": 0 },
                { "x": 0, "y": 0 }
            ]
        }
    ], null, 2);

    function openEventForm(event, prefill = null) {
        const src = event || prefill;
        eventFormMode = event ? 'edit' : 'create';
        eventFormEditId = event ? event.event_id : null;
        eventFormTitle.textContent = event ? 'Edit Event' : (prefill ? 'Duplicate Event' : 'New Event');

        const idInput = document.getElementById('ef-event-id');
        idInput.value = event ? event.event_id : '';
        idInput.disabled = !!event;

        document.getElementById('ef-event-name').value = src ? (src.event_name || '') : '';
        document.getElementById('ef-is-active').checked = src ? !!src.is_active : true;
        document.getElementById('ef-background-url').value = src ? (src.background_url || '') : '';
        document.getElementById('ef-total-shots').value = src ? (src.capture?.totalShots ?? 3) : 3;
        document.getElementById('ef-photo-width').value = src ? (src.capture?.photoWidth ?? 880) : 880;
        document.getElementById('ef-photo-height').value = src ? (src.capture?.photoHeight ?? 495) : 495;
        document.getElementById('ef-countdown-seconds').value = src ? (src.countdown?.seconds ?? 3) : 3;
        document.getElementById('ef-countdown-step-ms').value = src ? (src.countdown?.stepMs ?? 500) : 500;
        document.getElementById('ef-qr-size').value = src ? (src.qr?.size ?? 300) : 300;
        document.getElementById('ef-qr-margin').value = src ? (src.qr?.margin ?? 4) : 4;
        document.getElementById('ef-templates').value = src ? JSON.stringify(src.templates, null, 2) : DEFAULT_TEMPLATES;

        eventFormOverlay.classList.add('active');
    }

    function closeEventForm() {
        eventFormOverlay.classList.remove('active');
        eventFormMode = null;
        eventFormEditId = null;
    }

    eventFormCancel.addEventListener('click', closeEventForm);

    eventFormOverlay.addEventListener('click', e => {
        if (e.target === eventFormOverlay) closeEventForm();
    });

    eventFormEl.addEventListener('submit', async e => {
        e.preventDefault();

        let templates;
        try {
            templates = JSON.parse(document.getElementById('ef-templates').value);
        } catch {
            alert('Templates field is not valid JSON.');
            return;
        }

        const eventData = {
            event_id: document.getElementById('ef-event-id').value.trim(),
            event_name: document.getElementById('ef-event-name').value.trim(),
            is_active: document.getElementById('ef-is-active').checked,
            background_url: document.getElementById('ef-background-url').value.trim() || null,
            capture: {
                totalShots: parseInt(document.getElementById('ef-total-shots').value, 10),
                photoWidth: parseInt(document.getElementById('ef-photo-width').value, 10),
                photoHeight: parseInt(document.getElementById('ef-photo-height').value, 10),
            },
            countdown: {
                seconds: parseInt(document.getElementById('ef-countdown-seconds').value, 10),
                stepMs: parseInt(document.getElementById('ef-countdown-step-ms').value, 10),
            },
            qr: {
                size: parseInt(document.getElementById('ef-qr-size').value, 10),
                margin: parseInt(document.getElementById('ef-qr-margin').value, 10),
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
