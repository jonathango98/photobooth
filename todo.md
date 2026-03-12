# Photo Booth UI Redesign — Todo

## Context
The current camera page feels bare and generic — just a canvas with "PRESS TO START" text on a dark background. It doesn't match the warm, editorial, grainy aesthetic seen in the templates (gradient orbs, elegant serif typography, film-grain texture). All three screens need a visual upgrade.

## Design Direction
**Style**: Warm gradient orbs (teal, burnt orange, cream), grainy/film-noise texture, elegant serif typography, moody dark palette. The booth UI should feel sophisticated, immersive, and event-worthy.

---

## 1. Global / Shared Changes

- [ ] **Replace IBM Plex Mono with a serif font** (e.g., Playfair Display, Cormorant Garant, or similar elegant Google Font)
- [ ] **Refine color palette** — move from pure black (#000) + cream (#f7f2d5) to warmer tones pulled from the templates: deep warm black/charcoal, muted orange, teal, warm cream
- [ ] **Add subtle film-grain overlay** via CSS (pseudo-element with noise texture or SVG filter) to match the grainy texture in the background and templates
- [ ] **Improve background treatment** — the current background.png is good but feels flat; consider adding a subtle CSS vignette or radial gradient overlay to add depth
- [ ] **Add smooth screen transitions** — fade or crossfade between screens instead of hard show/hide toggling

## 2. Camera / Idle Screen

- [ ] **Add branding elements** — small event wordmark or logo in a corner of the screen (configurable per event)
- [ ] **Redesign "PRESS TO START" text** — use the serif font, larger size, more elegant letter-spacing; consider a subtle breathing/pulse animation instead of static text
- [ ] **Add a frosted glass or soft border treatment** around the camera canvas — e.g., a glowing warm border or soft gradient frame instead of just a box-shadow
- [ ] **Improve the countdown overlay** — style the countdown numbers (3, 2, 1) with the serif font, large and cinematic; add a subtle scale or fade animation per number
- [ ] **Style the "SMILE!" text** — make it feel celebratory, possibly with a slight glow or warm color accent
- [ ] **Add a shot counter pill/badge** — instead of plain "1/3" text drawn on canvas, create a styled pill badge (e.g., rounded, semi-transparent background) positioned elegantly
- [ ] **Flash effect on capture** — add a brief white flash or warm flash overlay when a photo is taken for tactile feedback
- [ ] **Consider adding the event theme name** somewhere subtle on the idle screen (pulled from config)

## 3. Template Selection Screen

- [ ] **Restyle the "CHOOSE A TEMPLATE" heading** — use the serif font, add more visual weight; consider a subheading like "select your style" in lighter weight
- [ ] **Improve template card styling** — add a warm glow on hover instead of white box-shadow; use a more refined selected state (e.g., warm orange/gold border ring instead of just scale + white shadow)
- [ ] **Add template names or numbers** below each card for easier identification
- [ ] **Improve the selection interaction** — add a checkmark or visual indicator on the selected template; make the confirm action clearer (currently double-click is not discoverable)
- [ ] **Add a "Confirm" button** that appears after selection instead of relying on double-click — much better UX for kiosk/touch devices
- [ ] **Consider adding a subtle parallax or float animation** to unselected templates

## 4. Result / QR Screen

- [ ] **Redesign the layout** — current side-by-side (photo left, QR right) feels utilitarian; consider stacking or using a more editorial layout with better visual hierarchy
- [ ] **Style the QR code area** — add a warm background card/container around the QR code instead of bare white square; round the corners to match the overall aesthetic
- [ ] **Redesign "Scan to Download" text** — use serif font, add a subtle icon (phone/camera icon) or decorative element
- [ ] **Restyle "Start Over" button** — the current plain pill button is too generic; make it match the brand with warm colors, serif font, and a hover effect (e.g., warm glow)
- [ ] **Add a subtle auto-reset timer** indicator so kiosk users know the screen will reset (visual countdown ring or progress bar)

## 5. Animations & Micro-interactions

- [ ] **Screen transitions**: fade-in/out between idle -> template -> result screens (CSS transitions on opacity + transform)
- [ ] **Button hover states**: warm glow effect on interactive elements
- [ ] **Template hover**: smooth scale with warm shadow, not abrupt
- [ ] **Countdown animation**: scale-in + fade-out per number for cinematic feel
- [ ] **Photo capture**: brief flash overlay + subtle camera shutter sound (optional)
- [ ] **Idle screen ambient animation**: subtle floating/drifting of background gradient orbs (CSS keyframes)

## 6. Responsive & Kiosk Considerations

- [ ] **Ensure touch-friendly tap targets** — all interactive elements should be large enough for finger taps
- [ ] **Test on landscape tablet/kiosk dimensions** — the primary use case
- [ ] **Hide cursor on idle** — for kiosk mode, hide the mouse cursor after inactivity
- [ ] **Prevent pull-to-refresh and overscroll** on touch devices

---

## Files to Modify
- `public/style.css` — primary redesign target (all visual changes)
- `public/index.html` — add branding elements, confirm button, structural changes
- `public/main.js` — screen transitions, countdown animations, flash effect, auto-reset timer
- `public/config.json` — add new config options (auto-reset timeout)

## Priority Order
1. Typography + color palette (biggest visual impact, least effort)
2. Camera/idle screen redesign (the most-seen screen)
3. Animations and transitions (adds polish)
4. Template selection UX improvements
5. Result screen redesign
6. Kiosk hardening
