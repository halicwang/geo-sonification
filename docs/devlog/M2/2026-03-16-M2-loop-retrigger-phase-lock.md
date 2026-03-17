# 2026-03-16 — Fix: Loop Retrigger Phase Lock

Fixed a browser-audio loop retrigger artifact where the incoming voice could sound slightly late or truncated at the swap point. The root cause was a latitude-driven `playbackRate` modulation fighting the fixed global loop clock, so the scheduled swap boundary no longer matched the buffer's real playback phase.

## What changed

- **`frontend/audio-engine.js`**: removed per-frame `playbackRate` modulation from active loop voices so the global swap clock stays phase-locked to the actual buffer timeline.
- **`frontend/audio-engine.js`**: kept the `updateMotion()` latitude argument reserved for future use, but stopped using it in the current loop engine until a timing-safe modulation path is designed.
- **`frontend/audio-engine.js`**: updated `seekLoop()` to reset the loop clock origin/count after a manual seek, so the next scheduled swap remains aligned with the newly chosen buffer offset.

## Verification

- `node --check frontend/audio-engine.js`
- `npm run lint -- frontend/audio-engine.js`

## Files changed

- `frontend/audio-engine.js` — removed timing-breaking rate modulation and re-anchored seek scheduling
- `docs/DEVLOG.md` — added entry link
- `docs/devlog/M2/2026-03-16-M2-loop-retrigger-phase-lock.md` — this entry
