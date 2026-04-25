# 2026-04-25 — Design: README Refresh for Grid Perf Stack

Add a "Performance" subsection to `README.md` summarizing the four
grid drag-perf stages landed today (server compression, cache headers,
debounce tuning, drag-state stroke suppression). Also fix the stale
`ws://localhost:3001` mention left over from the single-port refactor.

## Why

Per CLAUDE.md's Documentation Update Policy, behaviour-affecting server
and frontend changes need README / ARCHITECTURE updates if external
behaviour or operator workflow changed. The four perf stages don't
change the API surface, but they add operator-relevant verification
steps (`curl --compressed`, `[Stats]` log line) and config knobs
(`VIEWPORT_DEBOUNCE`) worth surfacing.

The stale `ws://localhost:3001` was a leftover from before commit
`924e887` (single-port refactor) — the docs missed it at the time.

## Changes

**`README.md`:**
- Replace `ws://localhost:3001` (configurable via `WS_PORT`) with
  `ws://localhost:3000` (configurable via `PORT` or `HTTP_PORT`), and
  note that `perMessageDeflate` is enabled.
- New "Performance" section (between "Audio Controls and Lifecycle"
  and "Troubleshooting") covering:
  - `VIEWPORT_DEBOUNCE` and the server's 1–2 ms compute envelope.
  - Compression layers (`compression` middleware, ws
    `perMessageDeflate`).
  - Static-asset cache headers (PMTiles 7 d, ambience 30 d).
  - Drag-state stroke suppression — explicitly noting the resting
    visual is unchanged, to avoid future readers misreading it as a
    new LOD strategy.

`docs/ARCHITECTURE.md` is intentionally untouched — it scopes to the
Web Audio engine signal chain. None of the perf stages change the
audio engine's behaviour, so there's nothing to add there.

## Files changed

- `README.md` — fix stale WS URL; add Performance subsection.
- `docs/DEVLOG.md` — index entry for this devlog.
