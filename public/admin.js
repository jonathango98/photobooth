document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const adminContent = document.getElementById('admin-content');
    const passwordInput = document.getElementById('admin-password');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const sessionsList = document.getElementById('sessions-list');
    const downloadZipBtn = document.getElementById('download-zip-btn');
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    // Selection buttons
    const downloadSelectedBtn = document.getElementById('download-selected-btn');
    const selectAllBtn = document.getElementById('select-all-btn');
    const clearSelectionBtn = document.getElementById('clear-selection-btn');

    let adminPassword = localStorage.getItem('adminPassword');
    let photoData = { collages: [], raws: [] };
    let currentTab = 'collages';
    let selectedIds = new Set();

    if (adminPassword) {
        showAdminContent();
    }

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

    // --- Selection Handlers ---
    selectAllBtn.addEventListener('click', () => {
        const currentItems = currentTab === 'collages' ? photoData.collages : photoData.raws;
        currentItems.forEach(item => selectedIds.add(item.public_id));
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
            const response = await fetch('/api/admin/download-selected', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-admin-password': adminPassword 
                },
                body: JSON.stringify({ publicIds: Array.from(selectedIds) })
            });

            if (response.ok) {
                const data = await response.json();
                window.location.href = data.url;
            } else {
                alert('Error generating ZIP for selected photos');
            }
        } catch (err) {
            console.error(err);
            alert('Error connecting to server');
        }
    });

    downloadZipBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/admin/download-zip', {
                headers: { 'x-admin-password': adminPassword }
            });
            if (response.ok) {
                const data = await response.json();
                window.location.href = data.url;
            } else {
                alert('Error generating ZIP URL');
            }
        } catch (err) {
            console.error(err);
            alert('Error generating ZIP URL');
        }
    });

    async function showAdminContent() {
        loginForm.style.display = 'none';
        adminContent.style.display = 'block';

        try {
            const response = await fetch('/api/admin/photos', {
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

            photoData = await response.json();
            renderPhotos();
        } catch (err) {
            console.error(err);
            alert('Error loading photos');
        }
    }

    function toggleSelection(publicId) {
        if (selectedIds.has(publicId)) {
            selectedIds.delete(publicId);
        } else {
            selectedIds.add(publicId);
        }
        renderPhotos();
        updateSelectionUI();
    }

    function updateSelectionUI() {
        downloadSelectedBtn.textContent = `Download Selected (${selectedIds.size})`;
        downloadSelectedBtn.style.background = selectedIds.size > 0 ? '#007bff' : '#6c757d';
    }

    function renderPhotos() {
        const sessions = {};
        sessionsList.className = `tab-${currentTab}`;

        function getSessionId(publicId) {
            const match = publicId.match(/session_(\d+)/);
            return match ? match[1] : 'unknown';
        }

        const itemsToRender = currentTab === 'collages' ? photoData.collages : photoData.raws;
        itemsToRender.forEach(photo => {
            const sessionId = getSessionId(photo.public_id);
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
            
            let h3 = document.createElement('h3');
            h3.textContent = `Session: ${date}`;
            sessionDiv.appendChild(h3);

            let grid = document.createElement('div');
            grid.className = 'photo-grid';

            items.sort((a, b) => a.public_id.localeCompare(b.public_id)).forEach(item => {
                const isSelected = selectedIds.has(item.public_id);
                const itemDiv = document.createElement('div');
                itemDiv.className = `photo-item ${isSelected ? 'selected' : ''}`;

                const checkbox = document.createElement('div');
                checkbox.className = 'checkbox-overlay';

                const img = document.createElement('img');
                img.src = item.secure_url;
                img.alt = 'Photo';

                const label = document.createElement('span');
                label.className = 'label';
                label.textContent = item.public_id.split('_').pop();

                itemDiv.append(checkbox, img, label);

                itemDiv.addEventListener('click', (e) => {
                    e.preventDefault();
                    toggleSelection(item.public_id);
                });

                grid.appendChild(itemDiv);
            });

            sessionDiv.appendChild(grid);
            sessionsList.appendChild(sessionDiv);
        });
    }
});
