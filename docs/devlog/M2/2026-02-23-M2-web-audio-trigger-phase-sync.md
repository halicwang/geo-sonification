# 2026-02-23 — Fix: Web Audio Trigger Phase Sync

Fixed loop-swap timing drift in the browser audio engine when the JS timer wakes up late. The old path always started the incoming voice at offset `0`, so late swaps could de-sync outgoing/incoming overlap content and produce audible timing smear.

## What changed

- **`frontend/audio-engine.js`**: `createVoice()` now accepts a start offset so late swaps can start the incoming voice at the matching phase.
- **`frontend/audio-engine.js`**: `performGlobalSwap()` now advances `nextGlobalSwapTime` from the planned boundary (with catch-up), not from delayed callback time, preventing cumulative clock drift.
- **`frontend/audio-engine.js`**: crossfade duration now shrinks by late amount (`overlapRemaining = overlap - phaseDelay`) and falls back to a short recovery fade when overlap is missed.
- **`frontend/audio-engine.js`**: added late-swap warning log (`[audio-engine] Late loop swap: ...ms behind`) for runtime diagnostics.

## Verification

- `node --check frontend/audio-engine.js`
- `npm run lint -- frontend/audio-engine.js`
- `npm test`

## Files changed

- `frontend/audio-engine.js` — late-swap phase alignment, planned-clock progression, and recovery handling
- `docs/DEVLOG.md` — added entry link
- `docs/devlog/M2/2026-02-23-M2-web-audio-trigger-phase-sync.md` — this entry
