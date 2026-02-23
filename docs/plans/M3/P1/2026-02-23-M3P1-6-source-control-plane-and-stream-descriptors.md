# P1-6 — Source Control Plane & Stream Descriptors

**Prerequisite:** P1-5 complete (`POST /api/import`, `GET /api/sources`, `DELETE /api/sources/:id` operational)
**Trace:** Milestone 3 Phase 1 — Open Ingestion + Control Plane
**Covers original:** Packet P1-B (Implementation Guide §10.2) — stream source registration + persistence (part 3 of 3)
**EVID coverage:** EVID-P1-007 (partial — cross-endpoint basics), EVID-P1-008 (stream source descriptor persistence)

## Context

Add `POST /api/sources` for stream source pre-registration (metadata-only, no data payload). This completes the P1-B lifecycle package.

`POST /api/sources` accepts `stream_poll` and `stream_push` mode descriptors. The actual push data ingestion (`POST /api/streams/push/:sourceId`) is P3 scope — P1 only establishes the registration and persistence layer.

## Changes to `server/import-manager.js`

Extend the `ImportManager` class with stream source support.

**Constructor:** Add `this._streamSources = new Map()` alongside the existing `_manifest` and `_dataStore` maps.

**New methods:**
- `registerStreamSource(descriptor)` — validates `{ sourceId, mode, channels, schemaVersion, ownerTeam }`. Sanitizes sourceId, rejects builtins. Persists to `data/imports/stream_sources.json`. If channels are provided (as string array or object array), registers a channel manifest in the registry with `temporalType: 'stream'`.
- `isStreamSource(sourceId)`, `getStreamSourceEntries()`
- `getSourceType(sourceId)` → `'builtin'|'static'|'stream'|null` — used by P1-7 for cross-type conflict detection
- `restoreStreamSources()` — reads `data/imports/stream_sources.json` on startup
- `_persistStreamSources()` — atomic write (temp + rename), same pattern as manifest

**Hard constraints:**
- Valid modes: `['stream_poll', 'stream_push']`
- Stream sources file: `data/imports/stream_sources.json` (same directory as manifest — **not** project root)
- Atomic writes: same temp-file + rename pattern as manifest persistence

**Extend `deleteSource()`:** Before the existing `SOURCE_NOT_FOUND` check, also check `_streamSources`. If found, delete from stream sources map, unregister from registry, persist, return with `cleanedStores: ['stream_sources']`.

**Update `module.exports`** to include new constants (`STREAM_SOURCES_PATH`, `VALID_STREAM_MODES`).

## Changes to `server/index.js`

### `POST /api/sources`

- Requires `sourceId` and `mode` in request body
- Validates, then delegates to `importManager.registerStreamSource()`
- Returns `{ status: 'ok', source, mode, schemaVersion }`
- Error codes: `VALIDATION_ERROR` → 400, `BUILTIN_SOURCE` → 400

### Update `GET /api/sources`

Include stream source entries in the sources list, with appropriate `type` and `mode` fields.

## Tests

Create `server/__tests__/source-control-plane.test.js`. Should cover:
- Register `stream_push` / `stream_poll` sources
- Invalid mode rejected, missing sourceId rejected, builtin rejected
- EVID-P1-008: persistence/reload (register → new manager → `restoreStreamSources()` → still present)
- Delete stream source removes from persistence
- `getSourceType()` correctly distinguishes builtin/static/stream/null
- Channels registered for stream source in the registry

## Exit

```bash
npm test && npm run lint
```

All suites green. `POST /api/sources` operational. Stream source persistence verified.
