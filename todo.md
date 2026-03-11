# Superadmin Page — Frontend Todo

## Overview
Create a superadmin page (`/superadmin.html`) that can browse the entire S3 bucket, view all photos regardless of event, navigate a folder tree, and delete files/folders. Uses a separate password from the admin page.

---

## 1. Create `public/superadmin.html`
- [ ] Login screen (same pattern as `admin.html` login box)
  - Password input with id `superadmin-password`
  - Login button
- [ ] Split layout after login:
  - **Left sidebar** — folder tree view (collapsible)
  - **Right panel** — file/photo grid for the selected folder
- [ ] Top bar with:
  - Title: "Super Admin"
  - Current path breadcrumb
  - Logout button
- [ ] Delete controls:
  - "Delete Selected" button (for selected files)
  - Right-click or icon button on folders in the tree to delete entire folder
  - Confirmation modal before any delete action
- [ ] Link to `superadmin.js` script

## 2. Create `public/superadmin.js`

### Authentication
- [ ] On load, check `localStorage.getItem('superadminPassword')`
- [ ] On login, store password in `localStorage` with key `superadminPassword`
- [ ] Send password via `x-superadmin-password` header on all API requests
- [ ] On 401 response, clear localStorage and reload (same pattern as `admin.js`)
- [ ] Logout button clears `localStorage` and reloads

### Folder Tree
- [ ] Fetch tree from `GET /api/superadmin/tree` (with auth header)
- [ ] Render tree as nested collapsible list in the sidebar
  - Show folder names with expand/collapse toggle
  - Show file count per folder
  - Clicking a folder loads its contents in the right panel
- [ ] Highlight currently selected folder

### File/Photo Grid
- [ ] Fetch files for selected folder from `GET /api/superadmin/photos?prefix=<folder_path>` (with auth header)
- [ ] Display photos in a grid (similar to admin page photo grid)
  - Show thumbnail with filename label
  - Checkbox overlay for selection (reuse `.photo-item` pattern from admin)
- [ ] For non-image files, show a file icon with the filename
- [ ] Select all / clear selection buttons

### Delete Operations
- [ ] **Delete files**: `DELETE /api/superadmin/file` with body `{ key: "path/to/file.jpg" }`
  - Confirmation prompt: "Are you sure you want to delete [filename]?"
  - After success, remove from grid and refresh tree counts
- [ ] **Delete folder**: `DELETE /api/superadmin/folder` with body `{ prefix: "folder/path/" }`
  - Confirmation prompt: "Are you sure you want to delete folder [name] and all its contents?"
  - After success, remove from tree and refresh
- [ ] **Delete selected**: batch delete all selected files
  - Confirmation: "Delete [N] selected files?"

### API Base URL
- [ ] Read from `config.json` or hardcode same as admin: `https://photobooth-server-production.up.railway.app`

## 3. Styling
- [ ] Reuse existing styles from `admin.html` where possible (login box, photo grid, buttons)
- [ ] Add new styles for:
  - Split layout (sidebar + main content)
  - Folder tree (nested list with indentation, expand/collapse icons)
  - Breadcrumb navigation
  - Delete confirmation modal
  - Folder action buttons (delete icon)

## 4. Environment / Config
- [ ] Add `SUPERADMIN_PASSWORD` to `.env` for local development
- [ ] No changes needed to `config.json` (uses same `serverUrl`)

## 5. Navigation
- [ ] Optionally add a link to superadmin from admin page (or keep it unlisted/hidden)
