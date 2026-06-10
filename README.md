# booth

Kiosk PWA frontend for the photobooth system. Runs as a Chrome web app (installed
via "Add to Home Screen" / standalone mode) on the event kiosk device.

## What it is

Static PWA served from the `public/` directory and deployed on Netlify. The kiosk
captures photos, applies overlay templates, uploads to the backend, and shows a QR
code for guests to retrieve their images. Configuration is loaded at runtime from
`public/config.json` (not bundled at build time).

For full system architecture see [../ARCHITECTURE.md](../ARCHITECTURE.md).

## Run locally

No build step — it's plain static files. Serve the `public/` directory with any
static server, e.g.:

```
npx serve public
# or
netlify dev       # respects netlify.toml headers
```

Then open `http://localhost:3000/?event=<event_id>`.

## Configuration

Edit `public/config.json` (or `public/config.dev.json` for local overrides) to
point at the backend API URL and set other runtime options.

## Deploy

Deploys automatically to Netlify on push to `main`. Build settings in
`netlify.toml`; publish directory is `public/`.

## Chrome-only triggers

The WebHID remote-trigger and the `AudioVolumeUp` keydown trigger require Chrome
and do not exist on iPadOS Safari. The kiosk is always deployed via Chrome.
