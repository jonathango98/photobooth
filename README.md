# Photobooth App

A modern, web-based photobooth application with Cloudinary integration, session-based photo management, and a secure admin panel.

## Features

- **Capture & Collage**: Take 3 photos and automatically generate a vertical collage.
- **Cloudinary Storage**: Photos are uploaded directly to Cloudinary (folders: `raw` and `collage`).
- **Secure Admin Panel**: A password-protected dashboard to view and download photos.
- **Session Grouping**: Photos are grouped by timestamped sessions for easy navigation.
- **Bulk Download**: Download everything as a ZIP or select specific photos to download.
- **Responsive Design**: Modern grid layouts that work on mobile and desktop.

---

## 🔐 Admin Panel

The admin panel allows you to manage all photos captured during your event.

- **Access URL**: `/admin.html` (e.g., `https://your-app.onrender.com/admin.html`)
- **Security**: Password protected via the `ADMIN_PASSWORD` environment variable.
- **Tabs**: Switch between **Collages** and **Raw Images**.
- **Selection Mode**: Click on photos to select them individually for custom downloads.
- **Bulk Actions**: "Select All" and "Clear Selection" for fast management.
- **ZIP Generation**: Download all photos at once or just your specific selection.

---

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Variables**:
   Create a `.env` file based on `.env.example`:
   - `CLOUDINARY_CLOUD_NAME`: Your Cloudinary Cloud Name.
   - `CLOUDINARY_API_KEY`: Your Cloudinary API Key.
   - `CLOUDINARY_API_SECRET`: Your Cloudinary API Secret.
   - `ADMIN_PASSWORD`: A password of your choice for the admin panel.

3. **Run Locally**:
   ```bash
   npm start
   ```
   Access the booth at `http://localhost:3000` and the admin panel at `http://localhost:3000/admin.html`.

## Deployment (Render)

1. Push this code to a **GitHub** repository.
2. Create a new **Web Service** on [Render](https://dashboard.render.com/).
3. Connect your repository.
4. Set the **Build Command** to `npm install`.
5. Set the **Start Command** to `npm start`.
6. Add your environment variables (`CLOUDINARY_*` and `ADMIN_PASSWORD`) in the **Environment** tab.
7. Your live admin URL will be `https://your-app-name.onrender.com/admin.html`.

## Project Structure

- `server.js`: Express backend handling Cloudinary uploads and Admin APIs.
- `public/index.html`: Main photobooth interface.
- `public/admin.html`: Password-protected admin dashboard.
- `public/main.js`: Photobooth logic (camera, canvas, UI).
- `public/admin.js`: Admin panel logic (fetching, selection, ZIP generation).
- `public/config.json`: Customization for templates and capture settings.
