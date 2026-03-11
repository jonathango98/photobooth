---
name: External References
description: URLs and pointers to external services, deployments, and tools used by the project
type: reference
---

- **Production server**: `https://photobooth-server-production.up.railway.app` (backend API on Railway)
- **Frontend hosting**: Netlify (config in `netlify.toml`, publish dir: `public`)
- **Image storage**: Cloudinary (cloud name, API key, secret configured via env vars)
- **Git branches for deployments**: `railway`, `render`, `netlify` branches exist for platform-specific configs
