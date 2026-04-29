# 2026-04-28 — Fix: Single-Port Smoke Script Drift

Self-check found that `npm run smoke` still expected the pre-M3 split-port
`/api/config` fields `wsPort` and `httpPort`. The runtime API intentionally
dropped those fields in the single-port migration, so the app worked but the
live HTTP + WebSocket smoke failed 10/12 checks.

## What Changed

- `scripts/smoke-worldcover.js` now validates the current `/api/config`
  contract: `gridSize` and `landcoverMeta`.
- `README.md` no longer describes `/api/config` as returning ports.
- `frontend/main.js` mirrors the inline boot script by setting
  `aria-expanded="false"` when mobile first-load collapse runs.
- `frontend/__tests__/_helpers/audio-context-mock.js` now returns a default
  4-second decoded buffer so the audio engine tests do not emit false
  `Invalid loop cycle` errors against the 1.875-second overlap.

## Verification

- `npm run smoke` passed against a running local server on port 3000.
- `npm run lint` passed.
- `npm run format:check` passed.
- `npm test` passed: 173/173.
- `npm run test:frontend` passed: 79/79, without the previous mock loop-cycle
  error spam.
- `npm run smoke:wire-format` passed.

## Files Changed

- **Modified** `scripts/smoke-worldcover.js` — align live smoke with the
  single-port `/api/config` contract.
- **Modified** `README.md` — remove stale port wording from the endpoint list.
- **Modified** `frontend/main.js` — keep mobile initial collapse ARIA state
  synchronized in the module path.
- **Modified** `frontend/__tests__/_helpers/audio-context-mock.js` — use
  realistic mock buffer duration for engine loop tests.
- **Added** `docs/devlog/M5/2026-04-28-M5-single-port-smoke-fix.md` — this
  entry.
