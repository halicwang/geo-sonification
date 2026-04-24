# 2026-04-23 — Refactor: Volume Slider Custom Paint

Finish the custom repaint of the volume slider. Commit 3 of the
info-panel overhaul already shrank the track to 2 px and the thumb to
10 px, but the track was still flat-colored (no active / inactive
split), the thumb glow had only one state, and Firefox's
`::-moz-range-progress` pseudo was not styled. This entry closes those
gaps and wires the Webkit track to a CSS custom property
(`--fill-pct`) so the filled portion tracks the thumb in real time.

## Changes

### `frontend/style.css`

- `.volume-slider` goes fully transparent; the input element no longer
  paints the track. The visual is now drawn inside the pseudo-elements.
- `::-webkit-slider-runnable-track` paints a hard-stop linear-gradient
  with a mint (`#5CFFC8`) active portion up to `var(--fill-pct, 67%)`
  and `rgba(255,255,255,0.10)` for the remainder. The `67%` default
  covers the brief window before JS sets the custom property (the
  input's default `value=100` in a `0–150` range resolves to exactly
  that).
- Firefox splits track and progress natively: `::-moz-range-track`
  carries the neutral color, `::-moz-range-progress` carries the
  mint, so no gradient math is needed on that browser.
- Thumb glow gains three distinct states, all on a 150 ms ease
  transition:
    - hover: `0 0 10px rgba(92,255,200,0.5)`
    - active (mousedown / drag): `0 0 14px rgba(92,255,200,0.6)`
    - focus-visible (keyboard focus): `0 0 0 3px rgba(92,255,200,0.25)`
      — a faint ring rather than a glow, so keyboard users see a
      stable focus indicator instead of a pulsing blob.
- Hover / active selectors moved from `::thumb:hover` to
  `:hover::thumb` so the glow triggers when the mouse enters the
  slider track, not only when it lands on the 10 px thumb. Matches
  how users actually approach a range input.
- `.volume-label` moved up from tier3 to tier2 to match the value
  label — the two-tone (tier3 label, tier2 value) on either side of
  the slider read as noisy, unifying on tier2 settles the row.
- `.volume-control` `gap` 8 → 6 px; label/value widths trimmed
  (24 → 20 px, 36 → 32 px) to match the smaller `Inter` + `JetBrains
  Mono` metrics.

### `frontend/main.js`

- New `updateVolumeFillPct()` helper reads `min` / `max` / `value` off
  the slider and writes the normalized fill percentage to
  `--fill-pct`. Called on every `input` event and once at mount so
  the initial paint matches whatever the default value resolves to
  (currently 100/150 = 66.67%, rounded to 67% for the CSS fallback).

## Design Decisions / Tradeoffs

- **Slider accent diverges from the global `--color-accent`.** The
  slider now paints in `#5CFFC8` (mint), while status dot, play
  button, and audio-load fill still use `var(--color-accent)`
  (`#4ecdc4`, cyan). A small but real inconsistency. Kept local
  because:
    - The slider is the only high-density interactive element in the
      panel; a brighter / more saturated accent reads as
      "manipulable" where the static indicators stay quieter.
    - The previous info-panel-overhaul entry already flagged that
      `#5CFFC8` is *more* saturated than `#4ecdc4`, so a wholesale
      swap would pull the whole panel louder, which is the opposite
      of the restrained-data-instrument direction.
    - If a global swap is decided later, it is a one-line token edit;
      keeping the slider-local literal makes that intent trivial to
      find via grep.
- **Hard-stop gradient, not a shadow mask.** A dual-layer track
  (background + `::before` fill) was the alternative. The gradient
  trick needs zero extra DOM and stays inside the browser-supplied
  pseudo, so it plays nicely with `-webkit-appearance: none` and
  avoids any stacking-context surprises.
- **Default `--fill-pct: 67%`, not `0%`.** If JS fails to load or
  runs late, the slider paints at approximately the HTML default
  value rather than looking empty, so a degraded state is still
  visually truthful.
- **`:focus-visible` rather than `:focus`.** Mouse users get no ring;
  keyboard users always do. Standard pattern.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (server-side only).
- `curl http://localhost:3000/style.css` — new
  `::-webkit-slider-runnable-track` gradient rule ships;
  `::-moz-range-progress` rule ships; three distinct thumb glow
  rules ship (hover / active / focus-visible on both Webkit and
  Firefox).
- `curl http://localhost:3000/main.js` — `updateVolumeFillPct` helper
  and `--fill-pct` setter ship; `state.els.volumeSlider.style.setProperty`
  call fires inside the input handler.
- Browser visual pass deferred to the user's reload on the running
  dev server (port 3000 held by the user's own instance, so a
  managed preview couldn't be started). Checklist:
    - Drag the thumb: left side of the track stays mint, right side
      stays neutral; split point follows the thumb.
    - Hover over the slider (anywhere): thumb glow fades in.
    - Mousedown / drag: glow intensifies.
    - Tab-focus the slider: thin ring appears around the thumb,
      no glow.
    - Move between buses' volume via arrow keys: fill updates each
      keypress.

## Files Changed

- **Modified**: `frontend/style.css` — full repaint of the volume
  slider's pseudo-elements (~50 lines changed), `.volume-control`
  spacing, `.volume-label` color.
- **Modified**: `frontend/main.js` — added `updateVolumeFillPct`
  helper; wired to `input` event and called once on mount.
- **Modified**: `docs/DEVLOG.md` — index entry for this refactor.
- **Added**:
  `docs/devlog/M3/2026-04-23-M3-volume-slider-custom-paint.md` —
  this entry.
