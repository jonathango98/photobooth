# Photobooth App

A web-based photobooth for events. Users take a configurable number of photos that are composited into a collage, then receive a QR code to download their result.

---

## Features

- **Photo Capture & Collage**: Take a configurable number of photos automatically composited into a collage using a selected template.
- **Template Selection**: Multiple templates with customizable photo slot positions.
- **Gesture Trigger**: Optional peace sign (✌️), palm (🖐️), or thumbs up (👍) detection to auto-capture photos.
- **QR Code Download**: Collage URL encoded as a QR code for instant download on any device.
- **Session Grouping**: Photos organized by timestamped sessions.
- **Auto-Reset**: Booth resets after 60 seconds of inactivity.
- **Admin Panel**: Password-protected dashboard to view, select, and bulk-download photos.
- **Super Admin Panel**: Full S3 file management, event configuration, and debug tools.

---

## Architecture

The app is split into two separate repositories:

- **Frontend** (`booth`): Vanilla HTML/CSS/JS, deployed on **Netlify** from the `public/` directory.
- **Backend** ([booth-server](https://github.com/jonathango98/photobooth-server)): Node.js/Express API, deployed on **Railway** with MongoDB and an S3-compatible bucket.

---

## Frontend Pages

| Page | Description |
|------|-------------|
| `index.html` | Main photobooth interface (idle → template select → capture → result) |
| `admin.html` | Password-protected photo management dashboard |
| `superadmin.html` | Full event and file management panel |

### Admin Panel (`/admin.html`)

- **Tabs**: Collages / Raw Images
- **Selection**: Click photos to select; "Select All" / "Clear Selection" controls
- **Downloads**: Bulk ZIP download of all or selected photos
- **Auth**: Password prompt using `ADMIN_PASSWORD`

### Super Admin Panel (`/superadmin.html`)

- **Files tab**: S3 folder tree + file grid; move, rename, delete, download files and folders
- **Events tab**: Create, edit, activate, and delete events; configure all event settings
- **Debug tab**: Live input event tracking (keyboard, mouse, gamepad, HID, touch, volume buttons)
- **Auth**: Separate `SUPERADMIN_PASSWORD`

---

## Configuration (`public/config.json`)

The frontend reads `config.json` on load. Key fields:

```json
{
  "serverUrl": "https://your-backend.railway.app",
  "siteName": "Event Name",
  "templates": [...],
  "capture": { "totalShots": 3, "photoWidth": 1080, "photoHeight": 1350 },  // totalShots is configurable
  "countdown": { "seconds": 3, "stepMs": 1000 },
  "gestureTrigger": { "enabled": true, "gestureType": "peace", "holdDuration": 2000 },
  "autoResetSeconds": 60
}
```

At runtime, config is fetched from the active event via `GET /api/event/config` and overrides `config.json`.

---

## Backend API (`booth-server`)

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/event` | Get active event ID |
| `GET` | `/api/event/config` | Get full active event config |
| `POST` | `/api/save` | Upload raw photos + collage (multipart, max 10MB per file) |

### Admin Endpoints (`x-admin-password` header)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/photos` | List all photos for the active event (7-day presigned URLs) |
| `GET` | `/api/admin/download-zip` | Download all photos as ZIP |
| `POST` | `/api/admin/download-selected` | Download selected photos as ZIP |

### Superadmin Endpoints (`x-superadmin-password` header)

**Events:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/superadmin/events` | List all events |
| `POST` | `/api/superadmin/events` | Create event |
| `PUT` | `/api/superadmin/events/:eventId` | Update event |
| `POST` | `/api/superadmin/events/:eventId/activate` | Activate event |
| `DELETE` | `/api/superadmin/events/:eventId` | Delete event |

**Files:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/superadmin/tree` | S3 file tree |
| `GET` | `/api/superadmin/photos` | List files with presigned URLs |
| `DELETE` | `/api/superadmin/file` | Delete a file |
| `DELETE` | `/api/superadmin/folder` | Delete all files under a prefix |
| `POST` | `/api/superadmin/move` | Move/rename a file |
| `GET` | `/api/superadmin/download-zip` | Download files under a prefix as ZIP |
| `POST` | `/api/superadmin/download-selected` | Download selected files as ZIP |

---

## S3 Storage Layout

```
{eventId}/
  raw/     session_{timestamp}_raw1.jpg
           session_{timestamp}_raw2.jpg
           session_{timestamp}_raw3.jpg
  collage/ session_{timestamp}_collage.jpg
```

---

## Project Structure

```
booth/
  public/
    index.html       Main photobooth UI
    admin.html       Admin dashboard
    superadmin.html  Superadmin panel
    main.js          Photobooth logic (camera, WebGL, collage, gesture detection, QR)
    admin.js         Admin panel logic (fetching, selection, ZIP)
    superadmin.js    Superadmin logic (S3 tree, event CRUD, file ops)
    style.css        Shared styles
    config.json      Default frontend configuration
  netlify.toml       Netlify deployment config (publishes public/)

booth-server/
  server.js          Express server with all routes
  db.js              MongoDB connection
  models/Event.js    Mongoose Event schema
  package.json
  .env.example
```

---

## Deployment

### Frontend (Netlify)

Netlify auto-publishes the `public/` directory on push to `main`. No build step required.

### Backend (Railway)

The server runs via Docker on Railway. Set the following environment variables:

```env
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_ENDPOINT_URL_S3=
AWS_REGION=auto
BUCKET_NAME=
ADMIN_PASSWORD=
SUPERADMIN_PASSWORD=
MONGO_URL=
PORT=3000
```

A default `test` event is seeded automatically on first startup.
