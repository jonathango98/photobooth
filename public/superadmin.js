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
    const selectAllBtn = document.getElementById('select-all-btn');
    const clearSelectionBtn = document.getElementById('clear-selection-btn');
    const photoCountEl = document.getElementById('photo-count');
    const breadcrumb = document.getElementById('breadcrumb');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');

    let password = localStorage.getItem('superadminPassword');
    let currentPrefix = null;
    let currentFiles = [];
    let selectedKeys = new Set();
    let treeData = null;
    let pendingConfirmCallback = null;

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

            item.append(checkbox, label);

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
});
