# Frontend Todo — Event-Based Configuration

## Modify `public/main.js` — Dynamic Config Loading

- [ ] Update the `loadConfig()` function to fetch config from the server API first:
  1. Read `serverUrl` from a bootstrap fetch of `config.json` (the `serverUrl` field already exists)
  2. Try `GET {serverUrl}/api/event/config`
  3. If successful, map the response to the existing `CONFIG` shape:
     ```js
     CONFIG = {
       siteName: eventConfig.event_name,
       serverUrl: serverUrl,
       saveApiUrl: `${serverUrl}/api/save`,
       templates: eventConfig.templates,
       capture: eventConfig.capture,
       countdown: eventConfig.countdown,
       qr: eventConfig.qr,
     };
     ```
  4. If the server call fails, fall back to the full static `config.json` (existing behavior)
- [ ] Update `document.title` with the event name from the server config
- [ ] Preload template images from the config as before

---

## Modify `public/superadmin.html` — Add Tab Bar & Events View

### Tab Bar

- [ ] Insert a tab bar between `#top-bar` and `#main-layout`:
  ```html
  <div id="tab-bar">
    <button class="sa-tab active" data-tab="files">Files</button>
    <button class="sa-tab" data-tab="events">Events</button>
  </div>
  ```

- [ ] Add CSS for the tab bar:
  ```css
  #tab-bar {
    background: #0d0d0d;
    border-bottom: 1px solid rgba(247,242,213,0.1);
    padding: 0 20px;
    display: flex;
    gap: 4px;
  }
  .sa-tab {
    padding: 10px 20px;
    border: none;
    background: transparent;
    color: rgba(247,242,213,0.5);
    cursor: pointer;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 13px;
    border-bottom: 2px solid transparent;
  }
  .sa-tab:hover { color: rgba(247,242,213,0.8); }
  .sa-tab.active {
    color: #f7f2d5;
    border-bottom-color: #f7f2d5;
  }
  ```

### Wrap Existing Layout

- [ ] Wrap the existing `#main-layout` div inside a new `<div id="files-view">` container
  - The files view contains the sidebar + right panel (unchanged)

### Events View

- [ ] Add a new `<div id="events-view" class="hidden">` as a sibling to `#files-view` inside `#app-section`:
  ```html
  <div id="events-view" class="hidden" style="padding: 20px; overflow-y: auto; flex: 1;">
    <div id="events-toolbar" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0; font-size: 16px;">Event Configurations</h2>
      <button class="btn" id="create-event-btn" style="padding: 8px 16px; background: #f7f2d5; color: #000; border: none; border-radius: 4px; cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 13px;">+ New Event</button>
    </div>
    <div id="events-list"></div>
  </div>
  ```

### Event Form Modal

- [ ] Add an event form modal for create/edit:
  ```html
  <div id="event-form-overlay"> <!-- same styling as #modal-overlay -->
    <div id="event-form-box"> <!-- same styling as #modal-box but wider (max-width: 600px) -->
      <h3 id="event-form-title">New Event</h3>
      <form id="event-form">
        <!-- event_id: text input (disabled on edit) -->
        <!-- event_name: text input -->
        <!-- is_active: checkbox -->
        <!-- capture.totalShots: number input -->
        <!-- capture.photoWidth: number input -->
        <!-- capture.photoHeight: number input -->
        <!-- countdown.seconds: number input -->
        <!-- countdown.stepMs: number input -->
        <!-- qr.size: number input -->
        <!-- qr.margin: number input -->
        <!-- background_url: text input -->
        <!-- templates: JSON textarea (pre-filled with default array) -->
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
          <button type="button" id="event-form-cancel">Cancel</button>
          <button type="submit" id="event-form-save">Save</button>
        </div>
      </form>
    </div>
  </div>
  ```
- [ ] Style the form inputs to match the existing dark theme (background: `#1a1a1a`, color: `#f7f2d5`, border: `rgba(247,242,213,0.2)`)
- [ ] Use labels for each field, grouped into sections (General, Capture, Countdown, QR, Templates)

---

## Modify `public/superadmin.js` — Event Management Logic

### Tab Switching

- [ ] Add click handlers on `.sa-tab` buttons:
  - Remove `active` class from all tabs, add to clicked tab
  - Toggle visibility of `#files-view` and `#events-view`
  - When "Events" tab is selected, call `loadEvents()`

### Load Events

- [ ] `async function loadEvents()`:
  - `GET {API_BASE}/api/superadmin/events` with `x-superadmin-password` header
  - Handle 401 (trigger logout)
  - Pass events array to `renderEventsList(events)`

### Render Events List

- [ ] `function renderEventsList(events)`:
  - Clear `#events-list`
  - For each event, render a card showing:
    - `event_id` (monospace, prominent)
    - `event_name`
    - Active/inactive badge (green/gray)
    - Number of templates
    - Capture settings summary (e.g., "3 shots, 880x495")
    - Created / updated dates
    - **Edit** button → opens form modal pre-filled with event data
    - **Delete** button → confirmation modal → calls `deleteEvent(eventId)`
  - If no events, show empty state message

### Create Event

- [ ] `async function createEvent(eventData)`:
  - `POST {API_BASE}/api/superadmin/events` with JSON body and superadmin auth header
  - On success, reload events list
  - On error, show alert with error message

### Update Event

- [ ] `async function updateEvent(eventId, eventData)`:
  - `PUT {API_BASE}/api/superadmin/events/{eventId}` with JSON body and superadmin auth header
  - On success, reload events list
  - On error, show alert with error message

### Delete Event

- [ ] `async function deleteEvent(eventId)`:
  - Use existing `confirmAction()` modal pattern for confirmation
  - `DELETE {API_BASE}/api/superadmin/events/{eventId}` with superadmin auth header
  - On success, reload events list
  - Note: this only deletes the config, not S3 photos

### Event Form Modal Logic

- [ ] `function openEventForm(event = null)`:
  - If `event` is provided → edit mode (pre-fill fields, disable `event_id` input, title = "Edit Event")
  - If `null` → create mode (empty fields, title = "New Event")
  - Show the `#event-form-overlay`
  - Pre-fill templates textarea with `JSON.stringify(event.templates, null, 2)` or default template JSON

- [ ] Form submit handler:
  - Parse all form fields into an event data object
  - Parse templates JSON textarea (validate it's valid JSON)
  - Call `createEvent()` or `updateEvent()` depending on mode
  - Close modal on success

- [ ] Cancel button → close modal

---

## Testing

- [ ] Load the photobooth (`index.html`) → verify it fetches config from server API (check console)
- [ ] If server is down, verify fallback to `config.json` works
- [ ] Open superadmin → verify "Files" and "Events" tabs appear
- [ ] "Files" tab should work exactly as before (no regressions)
- [ ] "Events" tab → should list all events from the database
- [ ] Create a new event → verify it appears in the list
- [ ] Edit an event → change the event name → verify it updates
- [ ] Delete an event → confirm → verify it's removed from the list
- [ ] Create an event with different capture settings → change `EVENT_ID` on server → verify photobooth loads the new config
