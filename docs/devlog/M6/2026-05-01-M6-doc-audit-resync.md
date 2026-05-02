# 2026-05-01 — Fix: Doc Audit & Resync (README, ARCHITECTURE, DEPLOYMENT)

Audited the four primary docs against current code and fixed multiple
stale claims that survived the late-M4 / M6 churn. No code changes.

## Findings

1. **Hover glow described as the CPU implementation in two docs.** Both
   `README.md` § "Border-aware hover glow (M6)" and
   `docs/ARCHITECTURE.md` § "Hover glow" described the pre-2026-04-30
   per-`render` tick that called `setFeatureState({glow})` and
   maintained a `MAX_GLOWING (1500)` candidate cap. The 2026-04-30 GPU
   custom-layer rewrite replaced all of that with a single VBO upload
   at init plus a `vec2 uCursorLngLat` uniform per frame; the
   fragment shader does the falloff and the dot layer's
   `circle-color` is now a fixed `#606060`. Updated both docs to
   describe the GPU pipeline, the actual `__hg.tune()` surface (now
   `{ rByZoom, borderFalloff, cursorFloor, eps, haloScale }` — no
   `maxGlowing`, no `forceTick`), and the three-file split
   (`hover-glow.js` / `hover-glow-layer.js` / `hover-glow-shaders.js`).

2. **Ambience runtime format is Opus; docs said WAV.** Since
   2026-04-24 (`docs/devlog/M3/2026-04-24-M3-ambience-opus-encoding.md`)
   `frontend/audio/buffer-cache.js` has been fetching `${name}.opus`,
   not `${name}.wav`. README's setup steps, sound-mapping intro,
   troubleshooting, ARCHITECTURE's "WAV Loading" section (now
   "Ambience Loading"), DEPLOYMENT's architecture diagram, and the
   DEPLOYMENT smoke test all still referenced `.wav`. Reworked README
   to describe `.wav` as editing master and `.opus` as the runtime
   asset emitted by `scripts/encode-ambience-opus.sh`; flipped the
   DEPLOYMENT smoke `curl` to `forest.opus`; updated the diagram's
   `audio/ambience/*.wav (7 × 46 MB)` to `*.opus (7 × ~2 MB)`. Added
   a performance-bullet entry for the ~328 MB → ~14 MB first-load
   reduction.

3. **README File Structure tree was missing several modules.** Added
   `hover-glow.js`, `hover-glow-layer.js`, `hover-glow-shaders.js`
   (M6), `popup.js`, `progress.js` (M4 P3 extracts),
   `initial-viewport-push.js`, `sheet-drag.js` (M5),
   `frontend/__tests__/` (vitest harness), plus seven scripts
   (`build-grid-index.js`, `compute-border-distance.js`,
   `download-natural-earth.js`, `encode-ambience-opus.sh`,
   `measure-loudness.js`, `smoke-wire-format.js`,
   `wire-format-baseline.json`). Mirrored the relevant additions into
   DEPLOYMENT's repository-layout block.

4. **DEPLOYMENT Issue #2 contradicted TODO #4.** Issue #2 still
   described "First-load audio is 328 MB" and recommended Opus
   migration as future work, while TODO #4 marked
   `~~Opus-encode ambience WAVs~~ — done 2026-04-24`. Removed the
   obsolete issue; renumbered the downstream "Globe → mercator switch
   stutter" from #4 → #3 and updated the TODO cross-reference for the
   PMTiles Worker proxy from `#3` → `#2`.

5. **DEPLOYMENT had stale PMTiles sizes.** Live `data/tiles/grids.pmtiles`
   measures 167,652,149 bytes (~167 MB). The doc had three references
   to a 185 MB upload size and one to a `185481683` Content-Length in
   the smoke test — all from an older build. Updated the "Why this
   split" table from "PMTiles + ambience WAVs (~500 MB)" to
   "PMTiles + ambience Opus (~180 MB)", and rewrote the three 185 MB
   mentions to ~167 MB. Left the two `177 MB` references in Issue #1
   intact, since they explicitly describe the (now-corrected) M3-era
   audit-note wording.

## Verification

- All factual claims about code/runtime were verified against the
  source files before being written:
    - `frontend/hover-glow.js` (GPU layer registration + `__hg`
      surface)
    - `frontend/hover-glow-layer.js` (VBO build, per-frame uniforms,
      `setTunables` patch keys)
    - `frontend/audio/buffer-cache.js` (`.opus` fetch)
    - `frontend/map.js` (`circle-color: DOT_COLOR` confirmed; no
      `setFeatureState`)
- Border-segment count "476k" in README was confirmed by directly
  counting segments from the local Natural Earth GeoJSONs (476,139
  total — coastline 406,824 + boundary 69,315). Kept as "~476k".

## Files changed

- `README.md` — MODIFY (hover-glow section rewritten, ambience
  WAV→Opus across setup/sound-mapping/troubleshooting, added Opus
  bullet to Performance, File Structure tree expanded)
- `docs/ARCHITECTURE.md` — MODIFY (Hover glow subsection rewritten
  for GPU custom-layer implementation; map.js paint expression note
  corrected to fixed grey)
- `docs/DEPLOYMENT.md` — MODIFY (architecture diagram `*.wav` → `*.opus`,
  smoke test `.wav` → `.opus`, removed obsolete Issue #2, renumbered
  downstream issue + TODO cross-reference, expanded frontend/
  repository-layout block with hover-glow trio and other M4/M5
  modules, updated stale PMTiles sizes 185 MB → 167 MB and
  Content-Length `185481683` → `167652149`, "Why this split" R2
  total `~500 MB ambience WAVs` → `~180 MB ambience Opus`)
- `docs/devlog/M6/2026-05-01-M6-doc-audit-resync.md` — NEW (this
  entry)
- `docs/DEVLOG.md` — MODIFY (index entry added)
