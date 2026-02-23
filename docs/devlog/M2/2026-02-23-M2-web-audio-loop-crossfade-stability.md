# 2026-02-23 — Fix: Web Audio Loop Crossfade Stability

Improved loop playback continuity in the browser audio engine to remove audible loop-boundary artifacts. The loop path now uses double-buffered overlap crossfades with equal-power fade curves, and loading state handling was hardened so quick stop/start cycles cannot leave buses stuck in a stale `loading` state.

## Changes

- **`frontend/audio-engine.js`**: Replaced `AudioBufferSourceNode.loop=true` playback with A/B voice swapping per bus, driven by a shared global swap clock (`bufferDuration - 1.875s` cycle).
- **`frontend/audio-engine.js`**: Updated crossfade envelopes from linear ramps to equal-power curves (`sin/cos`) to reduce perceived loudness dip at the crossfade midpoint.
- **`frontend/audio-engine.js`**: Added generation-owned loading state tracking (`loadingGenerations`) so stale async loads reset only their own state and cannot overwrite newer load attempts.
- **`frontend/audio-engine.js`**: On `stop()`, immediately reset in-flight `loading` buses to `pending`, preventing retry lockout after rapid stop/start.

## Verification

- `node --check frontend/audio-engine.js`
- `npm test` (all suites passed)

## Files changed

- `frontend/audio-engine.js` — loop playback graph, equal-power crossfade envelopes, and load-generation state guard (modified)

