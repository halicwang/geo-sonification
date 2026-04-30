# 2026-04-30 — Refactor: Hover-glow Occam Sweep

A second-pass cleanup over the M6 hover-glow surface after the GPU
custom-layer rewrite. The first sweep (`hover-glow-cleanup-sweep`)
removed defensive guards justified by earlier iterations; this one
removes whole shapes — duplicate ownerships, unreachable branches,
and a "JS reference implementation" that locked only itself.

Nine sub-items, bundled into one commit per the Occam-Group commit
policy.

## #1 — Drop the JS curve helpers + their tests

`frontend/hover-glow.js` was exporting `cursorFactor`, `borderFactor`,
`glowFor`, and `rByZoom` "as the JS-side specification of the curves
the fragment shader replicates". Reality after the GPU rewrite:

- `grep` showed module-external callers were exclusively
  `frontend/__tests__/hover-glow.test.js`.
- `glowFor` had zero callers in the production tree — even
  `hover-glow.js` itself never used it.
- `rByZoom` had zero callers — `hover-glow-layer.js` already had its
  own `lerpStops`.
- There was **no test cross-checking JS output against GPU output**
  (no puppeteer, no headless WebGL). So if the GLSL fragment shader
  drifted from the JS reference, nothing would catch it. The "lock"
  was JS-locking-JS.

Cut the four functions plus the local `hermiteBlend` helper, and
deleted the four corresponding `describe` blocks in the test file
(~200 lines net). The curve shape is now defined by the tunables
tables in `frontend/config.js` plus the single GLSL implementation
in `hover-glow-shaders.js`. A puppeteer screenshot test is the right
place to lock end-to-end output; it is recorded as a follow-up.

## #2 — `lerpStops` single-owner; bogus "circular import" note dropped

`hover-glow.js` had its own special-cased `rByZoom` linear-interp
function and `hover-glow-layer.js` had a generic `lerpStops` with a
note "kept inline here to avoid a circular import". The dependency
graph is one-way (`hover-glow.js → hover-glow-layer.js`); the
circular import was hypothetical. After #1 cuts `rByZoom`, layer's
`lerpStops` becomes the sole implementation. The misleading comment
is removed.

## #3 — Collapse `__hg.tune` patch validation into `setTunables`

`window.__hg.tune` had five `if (Array.isArray(patch.X))` /
`if (typeof patch.X === 'number')` branches that mutated a `tunables`
object, then called `glowLayer.setTunables(patch)` which does the
**exact same five branches** on the **same** object reference. The
two paths were not isolating writes — they were duplicating them.

`__hg.tune` is now a thin wrapper:

```js
tune: (patch) => {
    glowLayer.setTunables(patch);
    return { ...tunables };
},
```

## #4 — Remove `packBorderFalloff` empty-array fallback

The `if (!Array.isArray(stops) || stops.length === 0)` branch packed
"all-zero falloff" for degenerate input. Tracing every call site:

- The default `HOVER_GLOW_BORDER_FALLOFF` const has 4 stops.
- The only mutator is `setTunables`, which is gated by
  `if (Array.isArray(patch.borderFalloff))`.

Empty / non-array can't reach the function. Branch removed; the
"handles empty input" test removed alongside.

## #5 — `packBorderFalloff` over-cap silent truncation → throw

The same function used `n = Math.min(stops.length, MAX_FALLOFF_STOPS)`,
silently dropping trailing stops. `MAX_FALLOFF_STOPS` is coupled to
three things in GLSL — `uniform vec2 uFalloff[4]`, the `for (i = 0;
i < 3; i++)` bound inside `borderFactor()`, and the const itself —
none of which are cross-checked at runtime. If a future caller
passed 6 stops, the curve would be quietly mutated to 4 stops with
zero signal.

Replaced silent truncation with a `throw` that names all three
GLSL spots that need to grow together. Updated the
`MAX_FALLOFF_STOPS` JSDoc to spell out the coupling. Test
"truncates tables longer than" rewritten as "throws on tables
longer than".

## #6 — Drop unreachable trailing return in `lerpStops`

The function clamps both endpoints (`x <= first`, `x >= last`) before
the for-loop, and the loop iterates over every adjacent pair of a
strictly-increasing-in-x table. The trailing
`return stops[stops.length - 1][1]` after the loop is unreachable
under those invariants. Deleted (the M6 cleanup-sweep already did
the same surgery on `borderFactor` / `rByZoom` in the previous
iteration; this is the symmetric cut for the `lerpStops` that
survived the GPU rewrite).

## #7 — Drop the second `try/catch` in `initHoverGlow`

The first `try/catch` around `fetchGridIndex()` is load-bearing —
network failures or missing sidecars are real; the warning + early
return is the documented "graceful disable" path.

The second `try/catch` wrapped `new HoverGlowLayer(...)` plus
`map.addLayer(glowLayer)`. The ctor cannot throw under any code
path. `map.addLayer` failure means a true bug (duplicate layer id,
style not loaded yet) — silently warning and returning hides the
error from the caller (`map.js`'s own `try/catch` around `map.load`
would otherwise see and log it). Removed.

## #8 — Module-level `gridIndex` / `glowLayer` collapsed into closure

`let gridIndex` and `let glowLayer` lived at module scope with a
single writer (`initHoverGlow`) and two readers (the closure's own
event handlers, plus the exported `getGridIndex()` accessor).

`grep` showed `getGridIndex` had **zero** module-external callers —
DevTools introspection was already covered by `window.__hg.getGridIndex`.
Removed the `getGridIndex` export and moved both `let`s inside
`initHoverGlow` as `const` closure locals. The module now exposes
two functions only: `parseGridIndex` (for tests) and
`initHoverGlow`.

## #9 — Delete `_visible` flag and `setVisible`; sentinel cursor on hide

`HoverGlowLayer._visible` flipped to `true` on first `setCursorLngLat`
and to `false` on `mouseleave` / `blur`. Its only render-side effect
was `gl.uniform1f(uCursorFloor, this._visible ? cursorFloor : 0)` —
i.e. when "hidden", the cursorFloor uniform was zeroed but the
cursor coords themselves were stale. That left a frozen-in-place
border-only halo at the last cursor position until the next
mouseenter, which was a half-effect the design didn't ask for.

Replaced with: `mouseleave` / `blur` push the cursor to the sentinel
position `(999, 999)`. The fragment shader's `distKmToCursor` returns
a huge value, `cursorFactor` returns 0 everywhere, and the existing
`if (cf < uEps) discard;` culls the entire frame — no halo of any
kind. The ctor now initialises cursor at the same sentinel, so
nothing paints between layer-add and the first mousemove.

`_visible` field gone. `setVisible` method gone. Render path's
ternary collapsed to a constant uniform write. `setVisible(false)`
test deleted; new test asserts the sentinel-init invariant.

## Side cleanup — stale "skeleton stage" docstrings

The vertex+fragment shader file and the layer file both still
carried the original GPU-rewrite-in-progress wording ("the fragment
shader is a discard placeholder", "this commit"). The fragment
shader has carried the full glow math for several commits; updated
both file-level docstrings to reflect the final state. Also fixed
the layer's `mix()` polarity description — it had been written for
an older argument order before the projection-fix commit.

## Verification

- `npm test` (server jest) — 193 passing.
- `npm run test:frontend` (vitest) — 91 passing (down from 107: -22
  tests in the four removed JS curve `describe` blocks; +2 new
  tests for sentinel-init and over-cap throw; -1 for the deleted
  `setVisible` test; +diffs in the modified packBorderFalloff
  block).
- `npm run lint` — clean.
- `npm run format:check` — clean.
- Browser smoke (Claude Preview, zoom 5 over Franco-German border):
  - `__hg.getGridIndex().count === 67331`, `getLayer('hover-glow')`
    returns the registered custom layer.
  - Layer impl exposes `_cursorLng=999, _cursorLat=999` at startup.
    `setVisible` is `undefined`, `_visible` field is absent.
  - `setCursorLngLat(7.5, 49)` paints the expected halo: bright
    white at the cursor centre, smoothstep falloff outward, the
    border-distance "tube" visible along the Franco-German /
    Belgian / Dutch boundaries.
  - `canvas.dispatchEvent('mouseleave')` and
    `window.dispatchEvent('blur')` both reset `_cursorLng/_Lat` to
    999/999. Halo gone.
  - `__hg.tune({ cursorFloor: 0.42 })` returns `{ cursorFloor:
    0.42, ... }`; subsequent `getTunables()` confirms the patch.
  - Real `mousemove` at the canvas centre unprojects to (7.5, 49)
    and updates `_cursorLng/_Lat` accordingly — the full DOM →
    unproject → uniform path is intact.
  - No console errors or warnings during the entire smoke run.

## Files changed

- `frontend/hover-glow.js` — REWRITE. Module shrinks to
  `parseGridIndex` + `initHoverGlow`. Curve helpers (`cursorFactor`,
  `hermiteBlend`, `borderFactor`, `glowFor`, `rByZoom`) deleted.
  `gridIndex` / `glowLayer` moved into closure. `getGridIndex`
  export removed. `__hg.tune` thinned. Second try/catch removed.
  `mouseleave` / `blur` push cursor to (999, 999) sentinel.
- `frontend/hover-glow-layer.js` — MODIFY. `_visible` field and
  `setVisible` method removed. `setCursorLngLat` no longer flips a
  flag. Render path's ternary on `_visible` collapsed. Initial
  cursor set to (999, 999) sentinel. `lerpStops` trailing
  unreachable return removed. Misleading "circular import" note
  removed. Stale "skeleton stage" file-level docstring + inverted
  `mix()` polarity description corrected.
- `frontend/hover-glow-shaders.js` — MODIFY. `packBorderFalloff`
  empty-array fallback removed; over-cap silent truncation
  replaced with `throw`. `MAX_FALLOFF_STOPS` JSDoc enumerates the
  three GLSL spots that must grow together. Stale "skeleton
  stage" / "next commit" wording dropped from file-level
  docstring.
- `frontend/__tests__/hover-glow.test.js` — REWRITE. `cursorFactor`,
  `borderFactor`, `rByZoom`, `glowFor` `describe` blocks removed.
  `packBorderFalloff` "empty input" test removed; "truncates"
  rewritten as "throws on tables longer than". `HoverGlowLayer`
  block: `_visible` references dropped; `setVisible` test deleted;
  new sentinel-init test added; layer constructor extracted into
  a `makeLayer` helper.
- `docs/DEVLOG.md` — MODIFY (index this entry).
- `docs/devlog/M6/2026-04-30-M6-hover-glow-occam-sweep.md` — NEW.
