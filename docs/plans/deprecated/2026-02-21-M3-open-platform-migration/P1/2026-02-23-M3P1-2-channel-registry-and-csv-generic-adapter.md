# P1-2 — Channel Registry & CSV Generic Adapter

**Prerequisite:** P1-1 complete (adapter-interface.js and worldcover.js exist)
**Trace:** Milestone 3 Phase 1 — Open Ingestion + Control Plane
**Covers original:** Packet P1-A (Migration Plan P1) — adapter foundation (part 2 of 3)

## Context

Create the channel registry that manages source registration, namespace resolution, and channel index assignment. Also create the generic CSV adapter that can ingest arbitrary CSV files with lat/lon columns into `DataRecord[]`.

The channel registry implements the namespace strategy from Spec §3.3:
- **Storage:** bare keys (`tree`, `pm25`) + source identity
- **Query/merge:** namespaced keys (`sourceId.channelName`)
- Built-in channels get fixed index positions; imported channels append in registration order
- Emits `channel_update` event on any registry mutation (register/unregister)

The CSV adapter is the first generic import adapter (GeoJSON follows in P1-5).

These are still purely additive files — no existing production code is modified.

## New Files

### `server/channel-registry.js`

A class extending `EventEmitter`.

**Key methods:**
- `registerSource(adapter)` — stores adapter and channels, appends to source order (or replaces if same ID), increments version, emits `channel_update`
- `unregisterSource(sourceId)` — removes source and channels, emits `channel_update` with `removed: true`
- `getChannel(namespacedKey)` — parses `sourceId.channelName`, returns the matching `ChannelManifest` or null
- `getAllChannels()` — returns ordered array with `{ index, key, source, name, label, unit, group }` for all channels across all sources
- `getSourceIds()`, `hasSource(sourceId)`, `getSource(sourceId)`, `version` getter

### `server/adapters/csv-generic.js`

**Responsibilities:**
- Detect lat/lon columns from header (aliases: `lat`/`latitude`/`y`, `lon`/`longitude`/`lng`/`x`)
- Auto-discover numeric channel columns (sample first ~10 rows, skip reserved columns like timestamp/id/name/alt)
- `parseCsvContent(content, sourceId, options)` → `{ records: DataRecord[], channels: ChannelManifest[], warnings: string[] }`
- `createCsvAdapter(sourceId, csvContent)` → validated `DataAdapter`
- Uses `csv-parse/sync` (already a dependency in `server/package.json`)

**Hard constraints:**
- Channel names: sanitize with `[^a-z0-9_]` → `_` (same rule as WorldCover adapter)
- cellId format for P1: `"${lon}_${lat}"` (legacy grid key; H3 replaces in P2)
- Normalized channel values: simple `Math.max(0, Math.min(1, val))` clamp for P1 (proper normalization in P2+)
- Coordinate validation: skip rows with non-finite or out-of-range lat/lon (±90/±180)

## Tests

- `server/__tests__/channel-registry.test.js` — register WorldCover (14 channels at fixed indices), register imported source (appended after builtins), namespace resolution, unregister, re-register replacement, event emission
- `server/__tests__/csv-generic-adapter.test.js` — coordinate column detection (standard + aliases), parse valid CSV, throw on missing lat/lon, auto-discover numeric channels (skip non-numeric), handle empty/NaN values, skip invalid coordinates, Buffer input

## Exit

```bash
npm test && npm run lint
```

All suites green. Registry resolves WorldCover 14 channels. CSV adapter detects lat/lon + numeric channels.
