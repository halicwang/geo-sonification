# 2026-04-29 — Feature: Hover-glow Tunables + Tests (M6 P1-4/P1-5)

Stages P1-4 and P1-5 in one commit. Lifts the four hover-glow runtime
constants from inline code into `frontend/config.js`, exposes
`window.__hg.tune({...})` for live DevTools overrides, and adds 24
unit tests for the math + parser. No behavior change at default
settings.

## P1-4: Tunable knobs

Four constants moved from module-private inside `frontend/hover-glow.js`
to exported in `frontend/config.js`, with the prefix `HOVER_GLOW_*`:

| Constant | Default | Purpose |
| --- | --- | --- |
| `HOVER_GLOW_R_KM_BY_ZOOM` | `[[2,600],[5,350],[7,250],[10,180]]` | Cursor falloff radius in km, by zoom level |
| `HOVER_GLOW_BORDER_FALLOFF` | `[[0,1.0],[50,0.7],[150,0.1],[250,0]]` | Border-distance penalty curve |
| `HOVER_GLOW_MAX_GLOWING` | `1500` | Hard cap on per-frame `setFeatureState` writes |
| `HOVER_GLOW_EPS` | `0.005` | Minimum glow value to bother writing |

The runtime overlays them onto a mutable `tunables` object that
tick() reads on every frame. `window.__hg.tune({...})` patches that
object in place and triggers a `triggerRepaint()` so the change
takes effect immediately:

```js
// In DevTools: tighten the radius and stretch the border curve
__hg.tune({
    rByZoom: [[2,400],[5,200],[7,150],[10,100]],
    borderFalloff: [[0,1.0],[80,0.6],[200,0]],
});
```

The cycle is: edit value → next render tick → glow recomputed → see
result. No reload, no rebuild. This lets the user iterate on the
visual effect at the speed of moving the cursor — which is exactly
what the previous attempt's slow turnaround failed at.

`__hg.getTunables()` returns a snapshot of the current values for
introspection.

## P1-5: Unit tests

24 new tests in `frontend/__tests__/hover-glow.test.js` (vitest):

| Suite | Tests | Coverage |
| --- | ---: | --- |
| `distKm` | 5 | identity, equator-1°, cosLat-shrink at 60°, antimeridian both directions |
| `cursorFactor` | 7 | endpoints (0→1, R→0, beyond R), smoothstep midpoint, C¹-continuity at both ends, monotonicity |
| `borderFactor` | 5 | leading/trailing breakpoints, intermediate breakpoints (50, 150), monotonicity, custom-table override |
| `rByZoom` | 4 | clamp at min, clamp at max, default-table interpolation, custom-table override |
| `parseGridIndex` | 3 | round-trip parse with dual u32/f32 views, bad-magic rejection, bad-length rejection |

Total frontend suite: 78 → 103 (vitest, all passing).

Tests deliberately don't mock the browser — `mousemove`/`render`
wiring is verified via live browser interaction (recorded in the
P1-1/P1-2/P1-3 devlog) and the planned P2-1 manual scenarios. The
unit suite focuses on the math primitives and the binary parser,
which are pure and don't need DOM/Mapbox fixtures.

## Files changed

- `frontend/config.js` — MODIFY (export 4 `HOVER_GLOW_*` constants)
- `frontend/hover-glow.js` — MODIFY (import constants into a mutable
  `tunables` object; add `__hg.tune` and `__hg.getTunables`; thread
  optional table args through `borderFactor` and `rByZoom`)
- `frontend/__tests__/hover-glow.test.js` — NEW (24 tests, all passing)
