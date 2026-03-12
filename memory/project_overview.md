---
name: Project Overview
description: IFGF NextGen Photo Booth — architecture, tech stack, key components, and current state
type: project
---

## What it is
A web-based photobooth app for IFGF NextGen events. Attendees capture 3 photos, which are composited into a vertical collage with a template overlay, then shared via QR code.

## Tech Stack
- **Frontend**: Vanilla HTML/CSS/JS (static site), IBM Plex Mono font, QRCode.js
- **Backend server**: Separate repo, hosted on Railway (`photobooth-server-production.up.railway.app`)
- **Deployment**: Netlify (frontend), Railway (server)
- **Runtime**: Deno (deno.lock present), though README references npm

## Key Files
- `public/index.html` + `public/main.js` — Main photobooth capture flow
- `public/admin.html` + `public/admin.js` — Basic admin panel (session browsing, bulk download)
- `public/superadmin.html` + `public/superadmin.js` — Extended admin (event management, DB ops)
- `public/config.json` — App configuration (templates, dimensions, server URL)
- `public/templates/` — Template overlay images (template-1/2/3.png, template-pov1/2/3.png)
- `public/assets/` — Background images

## Architecture Notes
- Backend server is NOT in this repo — it's a separate service on Railway
- Config can load dynamically from server API or fall back to local config.json
- Event-based system: supports multiple events with different configurations
- Photos: 880x495px individual, 1080x1920px collage, 3-second countdown
