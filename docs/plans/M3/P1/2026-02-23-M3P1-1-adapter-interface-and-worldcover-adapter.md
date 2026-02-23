# P1-1 — Adapter Interface & WorldCover Adapter

**Prerequisite:** None (purely additive — no existing files modified)
**Trace:** Milestone 3 Phase 1 — Open Ingestion + Control Plane
**Covers original:** Packet P1-A (Migration Plan P1) — adapter foundation (part 1 of 3)

## Context

Create the canonical adapter interface definitions (JSDoc typedefs) and the first concrete adapter wrapping the built-in WorldCover data source. This establishes the frozen module boundary from Spec §3.5 (DataAdapter, StreamAdapter, PushAdapter contracts).

The WorldCover adapter maps the existing 14-channel manifest (11 distribution + 3 metric) from `server/landcover.js` `LANDCOVER_META` into the DataAdapter shape. It does **not** yet wire into the server startup path — that happens in P1-3.

These are purely additive files. No existing production code is touched.

## New Files

### `server/adapters/adapter-interface.js`

Frozen type definitions and a factory/validator for adapter registration.

**Responsibilities:**
- JSDoc typedefs for `ChannelManifest`, `DataAdapter`, `StreamAdapter`, `PushAdapter`, `DataRecord`, `CellSnapshot`, `SourceDescriptor`, `PushIngestAck` — shapes per Spec §3.5
- `createAdapter(config)` — validates required fields (`id`, `name`, `channels`, `temporalType`, `ingest`), channel manifest entries, and returns `{ valid, adapter|errors }`
- `validateChannelManifest(ch, index)` — validates individual channel entries (required fields, range as `[min, max]`, normalization enum)
- Export validation constants (`REQUIRED_ADAPTER_FIELDS`, `VALID_TEMPORAL_TYPES`, etc.)

### `server/adapters/worldcover.js`

Wraps the built-in WorldCover data source into the DataAdapter contract.

**Responsibilities:**
- Build `WORLDCOVER_CHANNELS` array from `LANDCOVER_META` entries (11 distribution) + 3 hardcoded metric channels (nightlight, population, forest)
- `createWorldCoverAdapter()` — returns a validated DataAdapter with `id: 'worldcover'`, `temporalType: 'static'`
- The `ingest()` method should throw — WorldCover data is loaded through `data-loader.js`, not the generic import pipeline

**Hard constraints:**
- Channel names derived from `LANDCOVER_META[code].name` must be sanitized: lowercase, take text before `/`, then replace `[^a-z0-9_]` with `_`. This ensures consistency with how csv-generic will sanitize imported channel names (e.g. `'Built-up/Urban'` → `'built_up'`, not `'built-up'`).
- The adapter must produce exactly 14 channels: 11 distribution + 3 metric.
- Distribution channels: `range: [0, 1]`, `unit: 'fraction'`, `normalization: 'linear'`, `group: 'distribution'`
- Metric channels: nightlight (`normalization: 'percentile'`), population (`normalization: 'log'`), forest (`normalization: 'linear'`)

## Tests

Create `server/__tests__/adapter-interface.test.js`. Should cover:
- Valid adapter accepted
- Missing required fields rejected (each field)
- Invalid temporalType / non-function ingest / non-array channels rejected
- Channel manifest validation (missing fields, invalid range shape, invalid normalization)
- WorldCover adapter: returns valid adapter, has 14 channels (11 distribution + 3 metric), correct metric channel names, `ingest()` throws

## Exit

```bash
npm test && npm run lint
```

All existing suites green plus new `adapter-interface` suite. WorldCover adapter: 14 channels.
