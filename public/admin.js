const API_BASE = 'https://photobooth-server-production.up.railway.app';

let collageAspect = '9 / 16';
let rawAspect = '16 / 9';

fetch('config.json')
    .then(r => r.json())
    .then(cfg => {
        if (cfg.templates?.[0]) {
            collageAspect = `${cfg.templates[0].width} / ${cfg.templates[0].height}`;
        }
        if (cfg.capture?.photoWidth && cfg.capture?.photoHeight) {
            rawAspect = `${cfg.capture.photoWidth} / ${cfg.capture.photoHeight}`;
        }
    })
    .catch(() => {});

function setupPreviewLightbox() {
    const overlay = document.getElementById('preview-overlay');
    const img = document.getElementById('preview-img');
    const closeBtn = document.getElementById('preview-close');
    function close() { overlay.classList.remove('active'); img.src = ''; }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    window._showPreview = url => { img.src = url; overlay.classList.add('active'); };
}

document.addEventListener('DOMContentLoaded', () => {
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

    let adminPassword = localStorage.getItem('adminPassword');
    // photoData: { collages: [...], raws: [...] } — each item: { id, url, uploadedAt }
    let photoData = { collages: [], raws: [] };
    let currentTab = 'collages';
    let selectedIds = new Set();
    let eventId = null;

    const eventIdDisplay = document.getElementById('event-id-display');
    const urlEventId = new URLSearchParams(window.location.search).get('event');

    if (urlEventId) {
        eventId = urlEventId;
        if (eventIdDisplay) eventIdDisplay.textContent = eventId;
    } else {
        // Fetch active event ID (read-only, defaults to "test")
        fetch(`${API_BASE}/api/event`)
            .then(res => res.json())
            .then(data => {
                eventId = data.eventId || data.event_id || 'test';
                if (eventIdDisplay) eventIdDisplay.textContent = eventId;
            })
            .catch(err => {
                console.warn('Failed to fetch event ID:', err);
                eventId = 'test';
                if (eventIdDisplay) eventIdDisplay.textContent = 'test (default)';
            });
    }

    if (adminPassword) {
        showAdminContent();
    }

    passwordInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') loginBtn.click();
    });

    loginBtn.addEventListener('click', () => {
        adminPassword = passwordInput.value;
        localStorage.setItem('adminPassword', adminPassword);
        showAdminContent();
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('adminPassword');
        location.reload();
    });

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.getAttribute('data-tab');
            selectedIds.clear();
            renderPhotos();
            updateSelectionUI();
        });
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
        if (selectedIds.size === 0) {
            alert('Please select some photos first');
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/admin/download-selected`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-password': adminPassword
                },
                body: JSON.stringify({ photoIds: Array.from(selectedIds) })
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
                headers: { 'x-admin-password': adminPassword }
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

    async function showAdminContent() {
        loginForm.style.display = 'none';
        adminContent.style.display = 'block';

        try {
            const qs = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
            const response = await fetch(`${API_BASE}/api/admin/photos${qs}`, {
                headers: { 'x-admin-password': adminPassword }
            });

            if (response.status === 401) {
                localStorage.removeItem('adminPassword');
                alert('Invalid password');
                location.reload();
                return;
            }

            if (!response.ok) {
                throw new Error('Failed to fetch photos');
            }

            // booth-server returns: { ok, photos: [{ id, url, folder, uploadedAt }] }
            const data = await response.json();
            const photos = data.photos || [];

            photoData = {
                collages: photos.filter(p => p.folder === 'collage'),
                raws: photos.filter(p => p.folder === 'raw'),
            };

            renderPhotos();
        } catch (err) {
            console.error(err);
            alert('Error loading photos');
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
        const match = id.match(/session_(\d+)/);
        return match ? match[1] : 'unknown';
    }

    function renderPhotos() {
        const sessions = {};
        sessionsList.className = `tab-${currentTab}`;

        const itemsToRender = currentTab === 'collages' ? photoData.collages : photoData.raws;
        itemsToRender.forEach(photo => {
            const sessionId = getSessionId(photo.id);
            if (!sessions[sessionId]) sessions[sessionId] = [];
            sessions[sessionId].push(photo);
        });

        const sortedSessionIds = Object.keys(sessions).sort((a, b) => b - a);

        sessionsList.innerHTML = '';
        if (sortedSessionIds.length === 0) {
            sessionsList.innerHTML = '<p>No photos found in this category.</p>';
            return;
        }

        sortedSessionIds.forEach(sessionId => {
            const items = sessions[sessionId];
            const sessionDiv = document.createElement('div');
            sessionDiv.className = 'session';

            const date = sessionId === 'unknown' ? 'Unknown Date' : new Date(parseInt(sessionId)).toLocaleString();

            const h3 = document.createElement('h3');
            h3.textContent = `Event ID: ${sessionId} | ${date}`;
            sessionDiv.appendChild(h3);

            const grid = document.createElement('div');
            grid.className = 'photo-grid';

            items.sort((a, b) => a.id.localeCompare(b.id)).forEach(item => {
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
                viewBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    window._showPreview(item.url);
                });
                actions.appendChild(viewBtn);

                const img = document.createElement('img');
                img.src = item.url;
                img.alt = 'Photo';

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
