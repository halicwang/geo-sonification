# M4 P0-5 — Baseline Notes

**Status:** tool-only delivery (2026-04-27).
**Decision:** P0-5 ships the recording instrument (`scripts/record-audio-baseline.html`) and a server-side numeric baseline. The 5×30 s audio reference clips and the 5-minute Chrome DevTools idle CPU JSON were **not captured** by direct user decision (logged in `docs/devlog/M4/2026-04-27-M4-baseline-tool-only.md`).

---

## What was captured

### Server viewport-processor benchmark (2026-04-27, HEAD = `c7a2be7`)

Captured by running the dev server (`npm start`) and `npm run benchmark` against `http://localhost:3000`. Hardware: macOS, Apple M1 Pro (10 cores), Node v25.9.0. 100 requests per scenario.

| Scenario | Description | p50 (ms) | p95 (ms) | p99 (ms) | min (ms) | max (ms) |
|---|---|---:|---:|---:|---:|---:|
| `land-dense` | Dense forest area (mid-latitude) | 0.469 | 0.795 | 0.923 | 0.312 | 0.932 |
| `ocean` | Open ocean (no data) | 0.376 | 0.577 | 0.614 | 0.261 | 0.688 |
| `coastal` | Coastal mixed region | 0.398 | 0.623 | 0.699 | 0.258 | 3.400 |
| `wide-area` | Wide viewport (low zoom) | 1.020 | 1.903 | 6.231 | 0.802 | 8.980 |

**Quote these numbers when verifying P1-1, P1-4, and any later perf-related stage's "before/after" delta.** The `wide-area` p99 spike (~6 ms) is the long tail that P1-1 (spatial bucket-range collapse) targets.

### Code-volume baseline (HEAD = `c7a2be7`, post-P0-3 + P0-4)

| Indicator | Value |
|---|---:|
| `frontend/audio-engine.js` | 1124 lines |
| `frontend/main.js` | 304 lines |
| `frontend/` total LOC (excl `__tests__/`) | 3044 lines |
| `server/index.js` | 516 lines |
| `server/` total LOC (excl `__tests__/`) | 3279 lines |
| Server jest test count | 153 tests |
| Frontend vitest test count | 17 tests |
| `frontend/audio/utils.js` coverage | 100% / 100% / 100% / 100% |

These are the M4-execution starting points (M3's audit numbers were 1186 / 292 / 2918 / 516 / 3279; the deltas reflect P0-3 audio extraction and P0-2 build-tag inject, with `main.js` at 304 vs the audit's 292 because of the build-tag banner addition).

### Wire-format contract (HEAD = `c7a2be7`)

Captured separately at `scripts/wire-format-baseline.json` (P0-1) — 3 HTTP routes, 1 WS inbound type, 2 WS outbound types, 45 verified field names. `npm run smoke:wire-format` checks drift on every push.

---

## What was NOT captured

### Audio reference recordings (5 × 30 s WAVs)

The proposal asked for clips at Beijing, Los Angeles, London, Sydney, Cairo (each = 10 s static + 10 s drag + 10 s announcer dwell), to be archived externally to `~/Documents/M4-baseline/` and used by P3-5 / P3-6 / P5-1 for ΔLUFS ≤ 0.5 LU + spectrogram visual diff + RMS Δ ≤ 1% comparisons.

**Decision:** skipped at the user's direction. Justification recorded in the P0-5 devlog. The 5×30 s recordings would have caught audible regressions that escape unit tests (subtle gain drift, click/pop at swap boundaries, equal-power curve phase issues).

**Replacement protocol** for P3-5 / P3-6 / P5-1:

1. **Unit tests** — every extracted module gets vitest coverage that asserts routing topology and parameter values via the audio-context mock (P0-1 `frontend/__tests__/_helpers/audio-context-mock.js`).
2. **Manual A/B listening** — before each P3 commit, run `npm run dev` locally, toggle audio on, drag through forest / urban / ocean for ~30 s, and listen for clicks, pops, gain steps, or pitch shifts. Listen with the audio engine settled (≥ 5 s after toggle). If anything sounds wrong, fix before commit.
3. **Numeric verification** — for any stage that touches a constant or a curve, do the kind of DevTools-eval check P0-3 used: confirm post-refactor values are byte-identical (or float-epsilon close) to pre-refactor values.
4. **Code review** — every P3 stage must include a "what nodes connect to what" review in its devlog, naming the AudioNode types and connection order. P3-5 explicitly lists this in its DoD.

If a regression slips past these and reaches `placeecho.com` at the P5-4 merge, fix forward with a hotfix to `main`. Worst case: revert the P3-5 / P3-6 commits on `feat/M4` before P5-4 merges.

### 5-minute idle Chrome DevTools Performance JSON

Used by P5-1 to verify the idle-detection optimization actually drops main-thread CPU. The proposal's quantitative target (drop ≥ 30% or ≤ 3.5%) **becomes unverifiable** without this baseline.

**Replacement protocol** for P5-1:

- Capture a fresh idle Performance trace at the time P5-1 lands (rather than at P0-5). The "baseline" is whatever the M4 codebase runs at the moment P5-1 starts; the comparison is against the same codebase _after_ the idle-detection patch. This is a weaker test (it only proves the patch helps, not that the absolute number is good), but it is enough to confirm the optimization works.
- The proposal §11 quantitative target row for "Audio idle main-thread CPU median" is reinterpreted accordingly (see proposal §11 update).

---

## How to opt-in to a full P0-5 capture later

If at any point during M4 the operator wants the full 5×30 s + 5-minute idle JSON:

1. Open `scripts/record-audio-baseline.html` from the same origin as the dev server (copy under `frontend/` if cross-origin blocks the popup capture). Follow the on-screen prompts per city.
2. For idle CPU: open `http://localhost:3000` in Chrome, hit Record in DevTools Performance, stop interacting for 5 minutes, save the JSON.
3. Archive both under `~/Documents/M4-baseline/` (do **not** commit — proposal §2.E).
4. Append a new dated section to this file with the captured numbers and the macOS / Chrome / Mapbox-zoom configuration used.

The recorder file remains in-tree; it does not need to be deleted just because P0-5 ships in tool-only mode.

---

## File locations

- **Tool**: `scripts/record-audio-baseline.html`
- **Server numeric baseline**: this file (the table above) plus the timestamp `2026-04-27` in the heading.
- **Wire-format baseline**: `scripts/wire-format-baseline.json` (P0-1).
- **External archive directory** (if used later): `~/Documents/M4-baseline/`.
