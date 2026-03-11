# CLAUDE.md — Project Instructions

## Memory System

This project uses a persistent memory system stored locally in the `memory/` directory at the project root.

### On session start
- Read `memory/MEMORY.md` to see available memory files
- Read any memory files relevant to the current task

### During a session
- When you learn new information about the user, project, or external references, update the appropriate memory file
- When the user gives feedback or correction, create/update a feedback memory file
- Always keep `MEMORY.md` index in sync when adding or removing memory files

### Memory file format
Each memory file uses this frontmatter format:

```markdown
---
name: {{memory name}}
description: {{one-line description}}
type: {{user | feedback | project | reference}}
---

{{content}}
```

### What to store
- **user**: Role, preferences, expertise, collaboration style
- **feedback**: Corrections and guidance from the user (include the "why")
- **project**: Ongoing work, goals, decisions, deadlines (use absolute dates)
- **reference**: Pointers to external systems, URLs, dashboards

### What NOT to store
- Code patterns or architecture derivable from reading the code
- Git history (use `git log` / `git blame`)
- Anything already in this CLAUDE.md file
- Temporary or conversation-scoped information

## Project Quick Reference

- **Stack**: Vanilla HTML/CSS/JS frontend, external backend on Railway, Cloudinary for images
- **Deploy**: `netlify.toml` publishes `public/` directory
- **Config**: `public/config.json` (templates, dimensions, server URL)
- **Admin panels**: `admin.html` (basic) and `superadmin.html` (full management)
