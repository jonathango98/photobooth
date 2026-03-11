# Photobooth App — Requirements

## Overview

A web-based photo booth application for events (weddings, parties, conferences). Users capture multiple photos in a session, select a decorative template, and receive a collage with a QR code for instant download. An admin panel provides photo management and bulk download capabilities.

---

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS, Canvas API
- **Backend**: Netlify Functions (serverless)
- **Storage**: Cloudinary (cloud image hosting)
- **Multipart Parsing**: Busboy (serverless-compatible)
- **QR Generation**: qrcode.js (client-side, via CDN)
- **Font**: IBM Plex Mono (Google Fonts)
- **Deployment**: Netlify (static hosting + serverless functions)

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

## API Endpoints (Netlify Functions)

All API endpoints are implemented as Netlify Functions under `netlify/functions/`. Netlify rewrites `/api/*` paths to the corresponding function.

| Method | Path | Auth | Function File | Description |
|--------|------|------|---------------|-------------|
| `GET` | `/` | No | — (static) | Serves main photobooth page |
| `GET` | `/admin.html` | No | — (static) | Serves admin dashboard |
| `POST` | `/api/save` | No | `save.mjs` | Uploads raw photos + collage to Cloudinary |
| `GET` | `/api/admin/photos` | Yes | `admin-photos.mjs` | Lists all photos grouped by session |
| `POST` | `/api/admin/download-selected` | Yes | `admin-download-selected.mjs` | Generates ZIP URL for selected photos |
| `GET` | `/api/admin/download-zip` | Yes | `admin-download-zip.mjs` | Generates ZIP URL for all photos |

---

## Upload & Storage Flow

1. Frontend captures photos as canvas elements
2. Builds final collage canvas from selected template
3. Converts all canvases to JPEG blobs
4. Sends via `FormData` POST to `/api/save`
5. Netlify Function parses multipart data with Busboy, then uploads to Cloudinary:
   - Raw photos → `raw/session_[timestamp]_raw[1-N].jpg`
   - Collage → `collage/session_[timestamp]_collage.jpg`
6. Returns collage URL for QR code generation

---

## Configuration

### `config.json` (Frontend)

- `siteName` — Browser tab title
- `saveApiUrl` — Upload endpoint (default: `/.netlify/functions/save`)
- `templates[]` — Array of template definitions (dimensions, photo slot positions, overlay PNG path)
- `capture.totalShots` — Number of photos per session (default: 3)
- `capture.photoWidth` / `capture.photoHeight` — Raw photo dimensions (default: 880×495)
- `countdown.seconds` — Countdown duration (default: 3)
- `qr.size` — QR code canvas size (default: 300)
- `qr.margin` — QR code margin (default: 1)

### Environment Variables (Netlify Dashboard → Site Settings → Environment Variables)

- `CLOUDINARY_CLOUD_NAME` — Cloudinary account identifier
- `CLOUDINARY_API_KEY` — Cloudinary API key
- `CLOUDINARY_API_SECRET` — Cloudinary API secret
- `ADMIN_PASSWORD` — Admin panel password

---

## Netlify Configuration

### `netlify.toml`

```toml
[build]
  publish = "public"
  functions = "netlify/functions"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200
```

### Netlify Setup Steps

1. Connect your Git repository to Netlify
2. Set the publish directory to `public`
3. Set the functions directory to `netlify/functions`
4. Add environment variables in the Netlify dashboard (Cloudinary credentials + admin password)
5. Deploy — static files are served from `public/`, API calls are routed to serverless functions

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
├── netlify.toml                          # Netlify build & redirect config
├── package.json
├── .env / .env.example
├── public/                               # Static files (served directly)
│   ├── index.html                        # Main photobooth UI
│   ├── admin.html                        # Admin dashboard
│   ├── main.js                           # Photobooth logic
│   ├── admin.js                          # Admin logic
│   ├── style.css                         # Shared styles
│   ├── config.json                       # App configuration
│   ├── templates/                        # PNG template overlays
│   └── assets/                           # Background images
└── netlify/
    └── functions/                        # Serverless API functions
        ├── save.mjs                      # POST /api/save
        ├── admin-photos.mjs              # GET /api/admin/photos
        ├── admin-download-selected.mjs   # POST /api/admin/download-selected
        └── admin-download-zip.mjs        # GET /api/admin/download-zip
```
