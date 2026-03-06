document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const adminContent = document.getElementById('admin-content');
    const passwordInput = document.getElementById('admin-password');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const sessionsList = document.getElementById('sessions-list');
    const downloadZipBtn = document.getElementById('download-zip-btn');

    let adminPassword = localStorage.getItem('adminPassword');

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

            const data = await response.json();
            renderPhotos(data);
        } catch (err) {
            console.error(err);
            alert('Error loading photos');
        }
    }

    function renderPhotos(data) {
        const sessions = {};

        // Helper to extract session ID from public_id
        // e.g., collage/session_1741270119330_collage -> 1741270119330
        function getSessionId(publicId) {
            const match = publicId.match(/session_(\d+)/);
            return match ? match[1] : 'unknown';
        }

        data.collages.forEach(photo => {
            const sessionId = getSessionId(photo.public_id);
            if (!sessions[sessionId]) sessions[sessionId] = { collage: null, raws: [] };
            sessions[sessionId].collage = photo;
        });

        data.raws.forEach(photo => {
            const sessionId = getSessionId(photo.public_id);
            if (!sessions[sessionId]) sessions[sessionId] = { collage: null, raws: [] };
            sessions[sessionId].raws.push(photo);
        });

        const sortedSessionIds = Object.keys(sessions).sort((a, b) => b - a); // Descending order

        sessionsList.innerHTML = '';
        sortedSessionIds.forEach(sessionId => {
            const session = sessions[sessionId];
            const sessionDiv = document.createElement('div');
            sessionDiv.className = 'session';
            
            const date = sessionId === 'unknown' ? 'Unknown Date' : new Date(parseInt(sessionId)).toLocaleString();
            
            let html = `<h3>Session: ${date} (ID: ${sessionId})</h3>`;
            html += `<div class="photo-grid">`;

            if (session.collage) {
                html += `
                    <div class="photo-item">
                        <a href="${session.collage.secure_url}" target="_blank">
                            <img src="${session.collage.secure_url}" alt="Collage">
                        </a>
                        <span class="label">Collage</span>
                    </div>`;
            }

            session.raws.sort((a, b) => a.public_id.localeCompare(b.public_id)).forEach(raw => {
                html += `
                    <div class="photo-item">
                        <a href="${raw.secure_url}" target="_blank">
                            <img src="${raw.secure_url}" alt="Raw">
                        </a>
                        <span class="label">${raw.public_id.split('_').pop()}</span>
                    </div>`;
            });

            html += `</div>`;
            sessionDiv.innerHTML = html;
            sessionsList.appendChild(sessionDiv);
        });
    }
});
