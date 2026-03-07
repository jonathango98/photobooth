document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const adminContent = document.getElementById('admin-content');
    const passwordInput = document.getElementById('admin-password');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const sessionsList = document.getElementById('sessions-list');
    const downloadZipBtn = document.getElementById('download-zip-btn');
    const tabBtns = document.querySelectorAll('.tab-btn');

    let adminPassword = localStorage.getItem('adminPassword');
    let photoData = { collages: [], raws: [] };
    let currentTab = 'collages';

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
            renderPhotos();
        });
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

    function renderPhotos() {
        const sessions = {};

        function getSessionId(publicId) {
            const match = publicId.match(/session_(\d+)/);
            return match ? match[1] : 'unknown';
        }

        if (currentTab === 'collages') {
            photoData.collages.forEach(photo => {
                const sessionId = getSessionId(photo.public_id);
                if (!sessions[sessionId]) sessions[sessionId] = [];
                sessions[sessionId].push(photo);
            });
        } else {
            photoData.raws.forEach(photo => {
                const sessionId = getSessionId(photo.public_id);
                if (!sessions[sessionId]) sessions[sessionId] = [];
                sessions[sessionId].push(photo);
            });
        }

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
            
            let html = `<h3>Session: ${date}</h3>`;
            html += `<div class="photo-grid">`;

            items.sort((a, b) => a.public_id.localeCompare(b.public_id)).forEach(item => {
                const label = item.public_id.split('_').pop();
                html += `
                    <div class="photo-item">
                        <a href="${item.secure_url}" target="_blank">
                            <img src="${item.secure_url}" alt="${label}">
                        </a>
                        <span class="label">${label}</span>
                    </div>`;
            });

            html += `</div>`;
            sessionDiv.innerHTML = html;
            sessionsList.appendChild(sessionDiv);
        });
    }
});
