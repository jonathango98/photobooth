# Photobooth App — Requirements

## Overview

A web-based photo booth application for events (weddings, parties, conferences). Users capture multiple photos in a session, select a decorative template, and receive a collage with a QR code for instant download. An admin panel provides photo management and bulk download capabilities.

---

## Architecture

- **Frontend** (`booth`): Static Vanilla HTML/CSS/JS — hosted on Netlify
- **Backend** (`booth-server`): Node.js/Express server — hosted on Railway at `https://photobooth-server-production.up.railway.app`

---

## Tech Stack

### Frontend (booth)
- Vanilla HTML/CSS/JS, Canvas API
- QR Generation: qrcode.js (client-side, via CDN)
- Font: IBM Plex Mono (Google Fonts)
- Deployment: Netlify (static hosting)

### Backend (booth-server)
- Node.js, Express.js
- Storage: Railway Bucket (S3-compatible via AWS SDK)
- Upload Handling: Multer (in-memory)
- ZIP Downloads: Archiver (streamed directly)
- CORS: enabled for all origins
- Deployment: Railway

---

## User-Facing Features

### 1. Live Camera Preview

- Real-time video stream from the device camera
- Mirrored preview (selfie-style)
- Shot counter overlay (e.g., "1/3")

### 2. Multi-Shot Capture

- Configurable number of shots per session (default: 3)
- Countdown timer before each capture (default: 3 seconds)
- "SMILE!" prompt displayed 1 second before capture
- 1-second freeze-frame preview after each shot
- Auto-advance to next screen after all shots

### 3. Template Selection

- Grid of template previews (9:16 portrait aspect ratio)
- Live preview of captured photos positioned in the selected template
- Two-click confirmation flow (select → confirm)
- Templates loaded from config with PNG overlay files
- Template images pre-loaded and cached at startup

### 4. Collage Generation

- Photos composited onto a canvas at template dimensions
- Template overlay PNG drawn on top for decorative frames/borders
- Output: vertical collage (~1080×1920px)

### 5. QR Code Display

- QR code generated linking to the uploaded collage (presigned S3 URL, 7-day expiry)
- Displayed alongside the collage with "Scan to Download" label
- Configurable size and margin

### 6. Session Loop

- "Start Over" button resets to camera screen
- Camera stream persists between sessions (no re-initialization)

---

## Admin Panel

### 1. Authentication

- Password-based login
- Password validated against `ADMIN_PASSWORD` env var via `x-admin-password` HTTP header
- Password persisted in browser localStorage
- Logout clears stored password

### 2. Photo Dashboard

- Fetches all photos from Railway Bucket (`collage/` and `raw/` folders)
- Groups photos by session (using session timestamp extracted from filename)
- Sessions sorted newest-first

### 3. Tab-Based Organization

- **Collages tab**: 9:16 portrait grid
- **Raw Images tab**: 16:9 landscape grid

### 4. Selection & Download

- Individual photo selection with checkbox overlay
- "Select All" / "Clear Selection" controls
- Download counter shows number of selected photos
- "Download Selected" — POST to server, streams a ZIP file directly
- "Download All as ZIP" — GET from server, streams a ZIP file directly

---

## API Endpoints (booth-server on Railway)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Health check |
| `POST` | `/api/save` | No | Uploads raw photos + collage to S3 bucket |
| `GET` | `/api/admin/photos` | Yes | Lists all photos with presigned URLs |
| `POST` | `/api/admin/download-selected` | Yes | Streams ZIP of selected photos |
| `GET` | `/api/admin/download-zip` | Yes | Streams ZIP of all photos |

### Response: `GET /api/admin/photos`
```json
{
  "ok": true,
  "photos": [
    { "id": "raw/session_123_raw1.jpg", "url": "https://...", "folder": "raw", "uploadedAt": "..." }
  ],
  "total": 1
}
```

### Request: `POST /api/admin/download-selected`
```json
{ "photoIds": ["raw/session_123_raw1.jpg", "collage/session_123_collage.jpg"] }
```

---

## Upload & Storage Flow

1. Frontend captures photos as canvas elements
2. Builds final collage canvas from selected template
3. Converts all canvases to JPEG blobs
4. Sends via `FormData` POST to `https://photobooth-server-production.up.railway.app/api/save`
5. Server uploads to Railway S3 Bucket:
   - Raw photos → `raw/session_[timestamp]_raw[1-N].jpg`
   - Collage → `collage/session_[timestamp]_collage.jpg`
6. Server returns presigned collage URL (7-day expiry) for QR code

---

## Configuration

### `public/config.json` (Frontend)

- `siteName` — Browser tab title
- `serverUrl` — Railway server base URL
- `saveApiUrl` — Upload endpoint (full URL to Railway)
- `templates[]` — Array of template definitions (dimensions, photo slot positions, overlay PNG path)
- `capture.totalShots` — Number of photos per session (default: 3)
- `capture.photoWidth` / `capture.photoHeight` — Raw photo dimensions (default: 880×495)
- `countdown.seconds` — Countdown duration (default: 3)
- `qr.size` — QR code canvas size (default: 300)
- `qr.margin` — QR code margin (default: 1)

### Environment Variables — booth-server (Railway Dashboard)

- `AWS_ACCESS_KEY_ID` — Railway Bucket access key
- `AWS_SECRET_ACCESS_KEY` — Railway Bucket secret key
- `AWS_ENDPOINT_URL_S3` — Railway Bucket S3 endpoint
- `AWS_REGION` — Region (default: `auto`)
- `BUCKET_NAME` — Railway Bucket name
- `ADMIN_PASSWORD` — Admin panel password
- `PORT` — Server port (Railway sets this automatically)

---

## Design & UX

- Mobile-first responsive layout
- CSS Grid for photo grids
- `clamp()` for responsive font sizing
- Media queries for landscape orientation on tablets
- Mirrored camera preview, non-mirrored captures (correct for print)
- Single-page app with screen transitions (no page reloads)

---

## File Structure

```
booth/                              # Frontend (Netlify)
├── netlify.toml                    # Netlify static hosting config
├── public/
│   ├── index.html                  # Main photobooth UI
│   ├── admin.html                  # Admin dashboard
│   ├── main.js                     # Photobooth logic
│   ├── admin.js                    # Admin logic (points to Railway API)
│   ├── style.css                   # Shared styles
│   ├── config.json                 # App configuration
│   ├── templates/                  # PNG template overlays
│   └── assets/                     # Background images

booth-server/                       # Backend (Railway)
├── server.js                       # Express server with S3 + admin routes
├── package.json
└── .env.example
```
