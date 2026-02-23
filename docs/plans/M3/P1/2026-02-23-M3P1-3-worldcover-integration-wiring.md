# P1-3 — WorldCover Integration Wiring

**Prerequisite:** P1-2 complete; P0 gate must be green (all golden baseline tests passing)
**Trace:** Milestone 3 Phase 1 — Open Ingestion + Control Plane
**Covers original:** Packet P1-A (Implementation Guide §10.2) — core file updates (part 3 of 3)
**EVID coverage:** EVID-P1-006 (compatibility regression — partial gate)

## Context

Wire the new adapter/registry system into the existing server startup path. This is the first P1 stage that **modifies existing production files**.

After `loadGridData()` completes, the WorldCover adapter is registered in the channel registry, making the built-in source addressable through the same registry API as future imported sources. Also add `GET /api/channels` to expose the registry contents.

**Critical constraint:** All P0 golden baseline tests must remain green after these changes.

## New Dependency

Install `supertest` as a dev dependency for HTTP endpoint testing (used here and in later stages):

```bash
cd server && npm install --save-dev supertest
```

## Changes

### `server/data-loader.js`

- Import `ChannelRegistry` and `createWorldCoverAdapter`
- Add a module-level singleton `channelRegistry` (initially null)
- After `loadGridData()` completes, initialize the registry and register the WorldCover adapter
- Export a `getChannelRegistry()` getter
- Update `module.exports` to include `getChannelRegistry`

### `server/index.js`

- Import `getChannelRegistry` from data-loader
- Add `GET /api/channels` endpoint:
  - Returns 503 if data not loaded / registry not available
  - Returns `{ channels: registry.getAllChannels() }`

## Tests

Create `server/__tests__/worldcover-integration.test.js`. Should cover:
- `GET /api/channels` returns 503 when data not loaded (use `_setDataLoaded(false)`)
- Channel response shape verification (14 WorldCover channels, correct indices 0-13, all keys match `worldcover.*`, metric channels present)

Note: these can be unit tests against a locally instantiated registry — they don't require `loadGridData()` to run (which needs real CSV files).

## Exit

```bash
npm test && npx jest golden-baseline --verbose && npm run lint
```

All suites green. Golden baseline: no regression. `GET /api/channels` returns 14 WorldCover channels.
