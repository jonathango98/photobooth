# Photobooth App — Requirements

## Overview

A web-based photo booth application for events (weddings, parties, conferences). Users capture multiple photos in a session, select a decorative template, and receive a collage with a QR code for instant download. An admin panel provides photo management and bulk download capabilities.

---

## Tech Stack

- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla HTML/CSS/JS, Canvas API
- **Storage**: Cloudinary (cloud image hosting)
- **Upload Handling**: Multer (in-memory)
- **QR Generation**: qrcode.js (client-side, via CDN)
- **Font**: IBM Plex Mono (Google Fonts)
- **Deployment**: Render.com (stateless, no database)

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

### 4. Collage Generation

- Photos composited onto a canvas at template dimensions
- Template overlay PNG drawn on top for decorative frames/borders
- Output: vertical collage (~1080×1920px)

### 5. QR Code Display

- QR code generated linking to the uploaded collage on Cloudinary
- Displayed alongside the collage with "Scan to Download" label
- Configurable size and margin

### 6. Session Loop

- "Start Over" button resets to camera screen
- Camera stream persists between sessions (no re-initialization)

---

## Admin Panel

### 1. Authentication

- Password-based login
- Password validated against `ADMIN_PASSWORD` env var via custom HTTP header
- Password persisted in browser localStorage
- Logout clears stored password

### 2. Photo Dashboard

- Fetches all photos from Cloudinary (`collage/` and `raw/` folders)
- Groups photos by session (using session timestamp)
- Sessions sorted newest-first

### 3. Tab-Based Organization

- **Collages tab**: 9:16 portrait grid
- **Raw Images tab**: 16:9 landscape grid

### 4. Selection & Download

- Individual photo selection with checkbox overlay
- "Select All" / "Clear Selection" controls
- Download counter shows number of selected photos
- "Download Selected" generates a ZIP via Cloudinary
- "Download All as ZIP" downloads all photos from both folders

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | No | Serves main photobooth page |
| `GET` | `/admin.html` | No | Serves admin dashboard |
| `POST` | `/api/save` | No | Uploads raw photos + collage to Cloudinary |
| `GET` | `/api/admin/photos` | Yes | Lists all photos grouped by session |
| `POST` | `/api/admin/download-selected` | Yes | Generates ZIP URL for selected photos |
| `GET` | `/api/admin/download-zip` | Yes | Generates ZIP URL for all photos |
| `GET` | `/static/*` | No | Serves static assets |

---

## Upload & Storage Flow

1. Frontend captures photos as canvas elements
2. Builds final collage canvas from selected template
3. Converts all canvases to JPEG blobs
4. Sends via `FormData` POST to `/api/save`
5. Server uploads to Cloudinary via streaming:
   - Raw photos → `raw/session_[timestamp]_raw[1-3].jpg`
   - Collage → `collage/session_[timestamp]_collage.jpg`
6. Returns collage URL for QR code generation

---

## Configuration

### `config.json` (Frontend)

- `siteName` — Browser tab title
- `publicBaseUrl` — Base URL for QR codes (defaults to `window.location.origin`)
- `saveApiUrl` — Upload endpoint (default: `/api/save`)
- `templates[]` — Array of template definitions (dimensions, photo slot positions, overlay PNG path)
- `capture.totalShots` — Number of photos per session (default: 3)
- `capture.photoWidth` / `capture.photoHeight` — Raw photo dimensions (default: 880×495)
- `countdown.seconds` — Countdown duration (default: 3)
- `qr.size` — QR code canvas size (default: 300)
- `qr.margin` — QR code margin (default: 1)

### Environment Variables (`.env`)

- `CLOUDINARY_CLOUD_NAME` — Cloudinary account identifier
- `CLOUDINARY_API_KEY` — Cloudinary API key
- `CLOUDINARY_API_SECRET` — Cloudinary API secret
- `ADMIN_PASSWORD` — Admin panel password
- `PORT` — Server port (default: 3000)

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
booth/
├── server.js
├── package.json
├── .env / .env.example
├── public/
│   ├── index.html          # Main photobooth UI
│   ├── admin.html          # Admin dashboard
│   ├── main.js             # Photobooth logic
│   ├── admin.js            # Admin logic
│   ├── style.css           # Shared styles
│   ├── config.json         # App configuration
│   ├── templates/          # PNG template overlays
│   └── assets/             # Background images
└── photos/                 # Local storage (if used)
```
