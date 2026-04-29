# 2026-04-28 — Refactor: Unify `getClientId` ID Format

The two ID-generation paths in `frontend/config.js` produced
different-looking strings depending on whether `localStorage.getItem`
threw:

- normal path: `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
- catch path: `client-${Math.floor(Math.random() * 1e9)}`

Both formats fed into the same `client:${id}` server key with no schema
expectation either way (no regex, no length check, no test that
asserts a specific shape), so the divergence was pure historical
sediment. Extracted a one-line `generateClientId()` helper and used
it from both paths. Three-layer fallback structure (memory → persisted
→ generated) is unchanged.

## Why

Single follow-up to the M5 Occam Razor sweep — small enough to skip A
group but called out in the post-A review (Group B item #2). The
B-group review verified there was no external dependency on either
format (server, tests, log analysis tooling) before this change.

## Verification

- `npm run lint` — clean.
- `npm run format:check` — clean.
- `npm run test:frontend` — 7 files, 79 tests, all green.
- Browser preview: cleared `localStorage`, reloaded, observed the
  persisted ID is the unified format (e.g. `client-mojixzkq-vrftjm30`),
  WebSocket connects, viewport stats stream in, zero console errors.

## Files changed

- `frontend/config.js` — added `generateClientId()` private helper;
  both the localStorage-read-throw catch path and the post-read
  generate path now call it.
- `docs/devlog/M5/2026-04-28-M5-getclientid-format-unify.md` — new
  (this entry).
- `docs/DEVLOG.md` — index row added.
