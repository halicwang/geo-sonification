# 2026-05-04 — Feature: Light / Dark / Auto Theme Switching

The frontend was dark-only. Added a Light theme alongside Dark with auto-detection of the OS preference (Windows / macOS / mobile via `prefers-color-scheme`) and a top-right toggle button that cycles **Auto → Light → Dark → Auto**. Default is `Auto`. Persisted under `localStorage['GEO_SONIFICATION_THEME']`.

## Why

Mobile users on a light-mode OS, and any desktop user who prefers a light surface, were locked into a pure-black canvas. A theme switch is the lowest-cost way to expand reach without redesigning anything; the existing CSS-variable architecture in `frontend/style.css` made the change additive rather than invasive.

## How it works

### Storage and resolution — `frontend/config.js`

New theme module appended to `config.js` (kept colocated with the existing `getClientId` / `getLoudnessNormEnabled` localStorage helpers rather than spawning a new file):

- `getThemeMode()` — returns `'auto' | 'light' | 'dark'`, default `'auto'`.
- `setThemeMode(mode)` — persists to `localStorage`, no-ops on unknown modes or storage failure.
- `getResolvedTheme()` — folds `'auto'` onto `window.matchMedia('(prefers-color-scheme: light)').matches`, returns `'light' | 'dark'`.
- `applyTheme()` — writes `documentElement.dataset.theme` (resolved) and `dataset.themeMode` (raw); briefly toggles `[data-theme-switching]` for one paint frame so transitions don't animate every panel color on flip.
- `subscribeTheme(cb)` — register a listener; fires when the resolved theme changes (manual mode flip or OS-preference change while in `'auto'`).

A single module-scope `MediaQueryList` listener on `(prefers-color-scheme: light)` re-applies the theme only when mode is `'auto'`. Manual mode flips do their own `applyTheme()` and bypass the system listener.

### CSS — `frontend/style.css`

Dark stays the default in `:root`. A new `:root[data-theme="light"]` block overrides every color token. Two new theme-relative tokens — `--color-overlay-strong` (mobile sheet handle) and `--color-overlay-weak` (volume slider track) — replace four hardcoded `rgba(255,255,255,...)` sites that were invisible against the white panel:

- `.sheet-handle-bar` background
- `.landcover-swatch` border (now `--color-border`)
- Webkit slider runnable track gradient (off-fill portion)
- Firefox `::-moz-range-track` background

A flicker-suppression rule sits next to the theme block:

```css
[data-theme-switching] *,
[data-theme-switching] *::before,
[data-theme-switching] *::after {
    transition: none !important;
}
```

Without it, the audio button / panel / connection dot transitions all animated concurrently on toggle, reading as a slow tinted flash. The attribute is removed on the next double-rAF in `applyTheme()`.

### Light palette

Brand teal `#5cffc8` is the dark-theme `--color-accent`, surfacing on the `Playing` state and focus rings. In light mode a darker AA-contrast teal `#14a37a` replaces it so accent text and borders read on white. The WebGL hover halo is theme-aware independently — white over dark, black over light — and lives in `hover-glow.js HALO_COLOR_BY_THEME` rather than the CSS token table.

| Token                    | Light value                 |
| ------------------------ | --------------------------- |
| `--color-bg`             | `#f7f7f8`                   |
| `--color-bg-panel`       | `rgba(255, 255, 255, 0.72)` |
| `--color-text`           | `#1a1a1c`                   |
| `--color-accent`         | `#14a37a`                   |
| `--color-text-tier1/2/3` | `rgba(0,0,0, 0.88/0.6/0.38)`|
| `--color-overlay-strong` | `rgba(0, 0, 0, 0.32)`       |
| `--color-overlay-weak`   | `rgba(0, 0, 0, 0.12)`       |

### Anti-FOUC inline bootstrap — `frontend/index.html`

A tiny synchronous `<script>` in `<head>` (after the `style.css` link) duplicates the resolution logic and writes `dataset.theme` + `dataset.themeMode` to `<html>` before the first paint. Without this, the browser would render the dark-default tokens for the first frame, then `main.js` (a deferred module) would flip on `DOMContentLoaded` — a visible color flash. The inline script is wrapped in try/catch with a dark-default fallback. `applyTheme()` runs once again from `main.js` as a safety net so the module-scope `lastResolvedTheme` cache aligns with the dataset.

### Toggle button — `frontend/index.html` + `frontend/main.js`

A third `.floating-btn` sits between the audio button and the hamburger inside `#controls-bar`. Single button cycles three states with unicode glyphs:

- ◐ Auto (`U+25D0`)
- ☀ Light (`U+2600`)
- ☾ Dark (`U+263E`)

`title` and `aria-label` describe the current state and the next-on-click state, e.g. `Theme: Auto (click for Light)`.

### Map paint sync — `frontend/map.js`

Mapbox style specs cannot reference CSS custom properties. A small `MAP_THEME` table maps the resolved theme to the three paint properties that need to flip:

- `background.background-color` (`#000` ↔ `#f7f7f8`)
- `grid-dots.circle-color` (`#606060` ↔ `#a5a5a5`)
- `grid-dots.circle-stroke-color` (`rgba(255,255,255,0.18)` ↔ `rgba(0,0,0,0.18)`)

`#606060` reads as solid mid-grey on the black canvas, but on the near-white `#f7f7f8` it skews toward black and the dot grid over-asserts. `#a5a5a5` reads as a softer neutral grey there without competing with the panel chrome.

`initMap()` reads `getResolvedTheme()` once when assembling the inline minimal style so the canvas paints the correct background from the very first frame (eliminates the cold-load black flash under a light-mode OS). After `addGridLayer()` resolves, `subscribeTheme()` is wired to call `setPaintProperty` on subsequent flips. Both writes are guarded by `map.getLayer(id)` so an in-flight grid-tile failure does not throw on a later theme toggle.

## Files changed

- `frontend/config.js` — added theme storage / resolution / subscribe API (~120 LoC at end of file).
- `frontend/style.css` — added `:root[data-theme="light"]` overrides, two `--color-overlay-*` tokens, `[data-theme-switching]` rule; replaced four hardcoded white-alpha sites.
- `frontend/index.html` — added inline anti-FOUC bootstrap in `<head>`; added `#theme-toggle` button to `#controls-bar`.
- `frontend/main.js` — cached new DOM elements; added cycle handler with icon / aria-label refresh; calls `applyTheme()` once after `DOMContentLoaded`.
- `frontend/map.js` — added `MAP_THEME` table; reads `getResolvedTheme()` for the initial inline-style background; subscribes to theme changes after `addGridLayer()`.
- `frontend/__tests__/theme.test.js` — new vitest suite (14 tests): default mode, persistence, resolution under all three modes, mq listener gated to auto, dataset writes, unsubscribe, throwing-storage fallbacks.

## Verification

- `npm run test:frontend` → 11 files, 139 tests passed (14 new).
- `npm test` → 17 suites, 189 tests passed (server unaffected; sanity check).
- `npm run lint` → clean.
- `npm run format:check` → clean.
- Browser preview (port 58909):
    - Cold load with empty storage and `prefers-color-scheme: light` → page renders light, button shows ◐ Auto.
    - `localStorage.setItem('GEO_SONIFICATION_THEME', 'dark')` + reload → page renders dark immediately, no flash, button shows ☾ Dark.
    - Cycle button: Auto → Light → Dark → Auto across icon, aria-label, dataset, body bg, panel bg, Mapbox `background-color`, and `grid-dots.circle-stroke-color`. No console errors.
    - System-flip while in Auto: emulated `colorScheme: dark` then `colorScheme: light` → page follows both directions; `dataset.themeMode` stays `auto`.
    - Mobile width (366 × 788) and desktop (1280 × 800): both themes render correctly; sheet handle visible against either background.

## Follow-up: limb-vignette mask for the globe rim ring

Once the light theme was on screen, a previously hidden artifact stood out: a visibly darker ring around the globe silhouette. Spherical foreshortening compresses the viewport-aligned `grid-dots` circles into a narrow band near the limb, so dot density per pixel spikes 5–10×. With `circle-color: #606060` at `circle-opacity: 0.92`, the alpha-over composition saturates toward solid grey at the rim — which on the near-white canvas reads as a dark ring (and on black, as a fainter bright ring).

### Approach

A new Mapbox custom WebGL layer (`LimbVignetteLayer`) draws one fullscreen triangle and the fragment shader paints a feathered alpha mask in the theme's background color over the band just inside the silhouette. The mask is painted between `grid-dots` and `hover-glow` so it covers the rim pile-up but the cursor halo still floats above. Mercator (z ≥ 5) has no rim artifact, so `render()` early-returns when Mapbox doesn't pass the `globeToMercator` arg.

Why a custom layer and not `setFog()` or a CSS vignette: Mapbox v3's `fog` is a bundled atmosphere+sky+fog config — any non-null value re-introduces the halo that was explicitly nulled out at `map.js:326`. A CSS radial gradient can't follow the globe center (which tracks `map.getCenter()` under pan, not viewport center) or scale with the nonlinear zoom→radius relationship.

### Geometry

Two values determine the mask each frame:

- **Globe center on screen:** `map.project(map.getCenter())`. Always equals the viewport center under pitch=0 / bearing=0, but reading it from `project` keeps the layer correct under any future camera change.
- **Globe radius in screen pixels:** distance from screen center to `map.project([center.lng, rimLat])`, where `rimLat = lat ≥ 0 ? lat - 90 : lat + 90`. The naive eastward sample `(lng+90, lat)` is only at the silhouette when `lat = 0` — going east stays on the parallel and lands at angular distance `acos(sin²lat)`, which collapses near the poles. The meridian sample is always exactly 90° away on the great circle, so the projected screen distance equals the apparent radius at any latitude.

Both values are uploaded as uniforms; the fragment shader computes `dNorm = distance(gl_FragCoord, center) / radius` and outputs `bgColor * a` with `a = smoothstep(0.92, 1.04, dNorm) × (1 - smoothstep(1.04, 1.08, dNorm))`. Two smoothsteps make a band, not a fill — the outer falloff dies just past the silhouette so the inline minimal-style background isn't double-painted.

### Buffer/CSS scale gotcha

`window.devicePixelRatio` is the wrong scale to use when converting from `map.project()`'s top-left CSS pixels to `gl_FragCoord`'s bottom-left drawing-buffer pixels. Mapbox sets the canvas backing store to 2× CSS even on non-retina displays for sharper rendering, and `devicePixelRatio` reports the OS value (1 on a 1× display). The layer reads the ratio off the canvas itself: `canvas.width / canvas.clientWidth`. Without this, the mask painted at half the correct radius and offset.

### Theme integration

`MAP_THEME[*].background` is the single source of truth for the mask color. A small `hexToRgb01` helper in `map.js` parses the existing hex value into a 0..1 RGB triple. The existing `subscribeTheme` callback at `map.js:362` was extended to call `limbVignette.setBgColor(...)` alongside the existing background and dot-stroke updates, so theme flips propagate the mask color synchronously with no flash.

A `window.__lv` debug surface mirrors `window.__hg` from hover-glow: `__lv.tune({ band: [a, b] })` lets DevTools fine-tune the inner/outer mask edges live.

### Files changed

- `frontend/limb-vignette-layer.js` — new. `mapboxgl.CustomLayerInterface` impl; project-based radius (no empirical lerp); `setBgColor` and `setTunables` for theme + DevTools.
- `frontend/limb-vignette-shaders.js` — new. Fullscreen-triangle vertex shader (`gl_VertexID`-only, no VBO) + radial-band fragment shader.
- `frontend/map.js` — import + create the layer after `addGridLayer()` and before `initHoverGlow()`; wire `setBgColor` into the existing `subscribeTheme` callback; add `hexToRgb01` helper; expose `state.runtime.limbVignette` and `window.__lv`.
- `frontend/__tests__/limb-vignette.test.js` — new vitest suite (9 tests): CustomLayerInterface shape, default state, `setBgColor` mutates in-place + triggers repaint, `setTunables` patches band, malformed inputs no-op, `render()` early-returns in mercator and before `onAdd`.

### Verification

- `npm run test:frontend` → 12 files, 151 tests pass (9 new).
- `npm run lint` and `npm run format:check` clean.
- Browser preview at 1600×900 viewport, light + dark themes:
    - z=2, z=3, z=4, z=4.99 in globe mode → silhouette is clean, no dark/bright ring.
    - z=5.01 → projection switches to mercator, vignette correctly does nothing (early-return on missing `globeToMercator`).
    - z=4.5 reverse → vignette re-engages cleanly, no flash.
    - Pan to `[-120, 50]` (lat=50, North America) → `rimLat = -40`, computed radius 547.8 px is exact, mask tracks the new silhouette. The earlier `(lng+90, lat)` sample would have underestimated radius by ~19% here.
    - Theme toggle live at z=3 → mask color flips synchronously with bg color, no wrong-color frame.

### Fix: ray-sphere silhouette test (replaces screen-space radius)

Once tested at higher zoom, the screen-space approach above turned out to be wrong. At zoom > ~2.5 in globe mode the mask shrank below the visible silhouette: a coloured ring appeared inside the globe and the actual rim ring became visible outside the mask, getting worse with zoom.

#### Root cause

Two stacked errors in the original screen-space radius:

1. **Perspective vs orthographic.** The 90° meridian sample's screen distance equals the apparent globe radius only in orthographic projection. Mapbox uses perspective: the visible silhouette projects to `R / sqrt(1 − r²)` where `r = R / D_camera`. The 90° sample lands on `R` (in world units), undersizing the radius by `sqrt(1 − r²)`. At z=2.5 with r ≈ 0.4, that's a ~10% inset; at z=4 it grows past 30%.
2. **Center-on-screen assumption.** Even with a per-zoom correction, the implementation assumed the silhouette is an axis-aligned circle centered on `map.project(getCenter())`. That holds only at pitch=0, bearing=0, no padding. Future horizontal globe-translation animations (via `padding`, custom offsets, or bearing) would skew the meridian sample geometrically and place the mask off-center.

A pure-zoom correction (whether a two-sample math derivation or empirical `rByZoom` stops mirroring `hover-glow-layer.js`) fixes (1) but not (2).

#### Approach

Move the silhouette test into the fragment shader and do it in world space (ECEF). For each fragment:

1. Convert `gl_FragCoord.xy` to NDC via `uViewportPx`.
2. Reproject NDC near (z=−1) and far (z=+1) through `uClipToEcef` and homogeneous-divide to get two ECEF points along the camera ray.
3. `rayOrigin` is the near point; `rayDir` is the normalized direction to the far point.
4. The perpendicular from the globe center (ECEF origin) to the ray has length `|O − (O·D) D|`. Normalized by Mapbox's `GLOBE_RADIUS = EXTENT / (2π) ≈ 1303.8`, this gives `dNorm` — `<1` inside the silhouette, `=1` on it, `>1` outside.

The same `smoothstep` band `[0.92, 1.04]` and outer falloff `+0.04` apply unchanged.

This is **geometrically exact** under any camera state — zoom, pan, bearing, pitch, padding, or future custom transforms — because the sphere's silhouette test does not depend on a screen-space center or radius. It works as long as Mapbox's `customLayerMatrix * globeToMercator` faithfully maps ECEF to clip, which is the same contract `hover-glow-layer.js` already relies on.

#### JS-side composition

Per frame:

```
ecefToClip = customLayerMatrix · globeToMercator   // 4x4 multiply
clipToEcef = inverse(ecefToClip)                    // 4x4 invert
upload uClipToEcef, uViewportPx, uGlobeRadiusEcef, uTransition, uBand, uBgColor
```

Two pure functions in a new `frontend/mat4.js` (column-major, `out` parameter for buffer reuse). Scratch `Float32Array(16)` buffers allocated once in `onAdd` so render does zero per-frame allocation. Net cost is comparable to (slightly cheaper than) the previous two `map.project()` calls — each of those internally does an ECEF transform, a matrix multiply, and a perspective divide.

#### Transition-zone fadeout

`uTransition` (Mapbox's globe→mercator interpolation, `0` in pure globe, `1` in pure mercator) is multiplied into the mask alpha as `(1 − uTransition)`. Across the transition zone (z ∈ [5, 6]) the geometry stops being a sphere, so the mask fades out cleanly. Previously the layer painted in the transition zone with a misaligned mask — this is a free side-improvement.

#### Files changed (fix)

- `frontend/mat4.js` — new module. Hand-written `mat4Multiply` (16-line unrolled) and `mat4Invert` (cofactor expansion, returns null on singular). No new npm dep per CLAUDE.md.
- `frontend/limb-vignette-shaders.js` — fragment shader rewritten to do the per-fragment ray-sphere test. Vertex shader unchanged (still gl_VertexID-only fullscreen triangle).
- `frontend/limb-vignette-layer.js` — `render()` now composes `ecefToClip` and inverts; uniforms are `uClipToEcef`, `uViewportPx`, `uGlobeRadiusEcef`, `uTransition`, `uBand`, `uBgColor` (replacing `uGlobeCenterPx`, `uGlobeRadiusPx`). Drops `map.getCenter()` / `map.project()` entirely. Adds `MAPBOX_GLOBE_RADIUS = 8192/(2π)` constant (mirror of the same constant in `hover-glow-layer.js`).
- `frontend/__tests__/mat4.test.js` — new vitest suite (13 tests): identity, composition (translation/rotation/scale), Float32Array support, return-value chaining; invert round-trip on simple and composed transforms, singular-matrix returns null, perspective-like matrix.
- `frontend/__tests__/limb-vignette.test.js` — render-signature comments updated; new test for the singular-matrix early-return path.

#### Verification (fix)

- `npm run test:frontend` → all suites pass including 13 new mat4 tests and 10 limb-vignette tests.
- `npm run lint` and `npm run format:check` clean.
- Browser preview, light theme:
    - z=1, 2, **2.5**, 3, 3.5, 4, 4.5, 4.99 — no inset coloured ring inside the globe and no visible rim ring outside the mask.
    - Pan to `[-120, 50]` and `[80, -30]` at z=3.5 — mask follows under pan.
    - `map.setBearing(45)` at z=3 — mask stays aligned with the silhouette.
    - `map.setPitch(30)` at z=3 — mask follows the now-elliptical silhouette outline.
    - `map.setPadding({left: 200})` at z=3 — globe shifts right on screen, mask shifts with it.
    - z=5.5 transition zone — mask invisible (`uTransition` near 1 fades it).
    - z=6.5 pure mercator — clean handoff (existing early-return on missing `globeToMercator`).
- Dark theme sanity at z=3 — bright rim ring also absent.

### Tweak: re-center the band so the peak lands on the silhouette

After the ray-sphere fix the rim was geometrically tracked, but a faint dark arc was still visible on the light theme at 1080p+. Diagnosed by temporarily swapping the mask color to red and screenshotting at 800×800: the most-saturated red ring sat *outside* the silhouette (`dNorm ≈ 1.04`), while `dNorm = 1.0` had only `aIn ≈ 0.74` — not enough to fully erase the dot pile-up where it actually peaks.

Changed two values:

- `DEFAULT_BAND` in `frontend/limb-vignette-layer.js`: `[0.92, 1.04] → [0.94, 1.0]`. Peak alpha (`smoothstep(0.94, 1.0, 1.0) = 1.0`) now lands on the silhouette.
- Outer falloff in `frontend/limb-vignette-shaders.js`: `+0.04 → +0.08`. Doubles the silhouette-outside coverage so the viewport-aligned `circle-radius` overshoot (each dot's sprite extends `~circle-radius` px past the silhouette in screen space) is fully absorbed rather than left as scattered visible dots just outside the mask.

The inner ramp width (0.06) is the smallest that still hits α=1 on the silhouette without obvious quantization. A wider inner ramp like `[0.85, 1.0]` (tested first) erased the rim but also thinned the dot density too far inward — the spherical curvature was no longer visible against the light-theme background, and the globe stopped reading as a sphere. `[0.94, 1.0]` keeps a visible dot ring just inside the silhouette that reads as the globe's outline while the peak still wipes out the high-density pile-up at `dNorm = 1.0`.

#### Verification (tweak)

- `npm run test:frontend` → 13 files, 165 tests pass (test fixture didn't assert the default band value, so no test changes needed).
- `npm run lint` and `npm run format:check` clean.
- Browser preview at 800×800, panels hidden via DevTools so the full silhouette was visible:
    - Light theme, z=2 with center `[-30, 0]` — silhouette reads as a clear arc; no dark ring just inside or outside.
    - Live A/B via `__lv.tune({ band: [0.85, 1.0] })` then `[0.94, 1.0]` then back to original `[0.92, 1.04]` — the chosen value is the smallest inner ramp that fully removes the rim while leaving the spherical outline intact. `[0.85, 1.0]` washes the globe edge into the background; `[0.92, 1.04]` brings the dark arc back.
    - Dark theme, z=2 — bright-ring counterpart of the dark-theme rim is also gone, silhouette outline still reads.
