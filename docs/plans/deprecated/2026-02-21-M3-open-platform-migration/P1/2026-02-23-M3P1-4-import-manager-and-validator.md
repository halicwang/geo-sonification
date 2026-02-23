# P1-4 — Import Manager & Validator

**Prerequisite:** P1-3 complete (channel registry wired, `GET /api/channels` operational)
**Trace:** Milestone 3 Phase 1 — Open Ingestion + Control Plane
**Covers original:** Packet P1-B (Migration Plan P1) — runtime import lifecycle (part 1 of 3)
**EVID coverage:** EVID-P1-003 (restart persistence), EVID-P1-004 (duplicate sourceId replacement), EVID-P1-005 (delete + builtin rejection)

## Context

Create the import manager (orchestrates source lifecycle: import, replace, delete, persist, restore) and the import validator (pre-ingest validation checks per Implementation Guide §7.2).

The import manager persists to `data/imports/manifest.json` with atomic write semantics (temp-file + rename) per Spec §4.1.1. Builtin sources (e.g. `worldcover`) cannot be deleted or overwritten via import.

## Housekeeping

Add `data/imports/` to `.gitignore` — this directory contains runtime-generated manifest data that should not be committed.

## New Files

### `server/import-manager.js`

**Class `ImportManager`** — takes a `ChannelRegistry` instance in constructor.

**Key methods:**
- `importSource(adapter, records, metadata)` — stores records in memory, registers adapter in channel registry, persists manifest entry. Returns `{ sourceId, channels (namespaced), cellCount, warnings }`. Rejects builtin sourceIds with error code `BUILTIN_SOURCE`.
- `deleteSource(sourceId)` — removes from data store, unregisters from registry, persists. Rejects builtins (`BUILTIN_SOURCE`) and unknowns (`SOURCE_NOT_FOUND`).
- `restoreFromManifest()` — reads `data/imports/manifest.json` on startup, restores manifest metadata (not data records — those require re-import in P1).
- `getRecords(sourceId)`, `getManifestEntries()`, `hasSource(sourceId)`, `isBuiltin(sourceId)`

**`sanitizeSourceId(raw)`** — exported utility. Lowercase, replace `[^a-z0-9_]` → `_`, strip leading/trailing underscores, collapse consecutive underscores. Must start with a letter, max 64 chars. Returns `{ valid, sourceId|error }`.

**Hard constraints:**
- Manifest path: `data/imports/manifest.json`
- Atomic writes: write to `.tmp`, then `fs.rename`
- Duplicate sourceId: atomic replacement (re-register in registry, update manifest). Include "Replaced existing source" in warnings.
- Builtin source IDs set: `['worldcover']`

### `server/import-validator.js`

Pre-parse validation — runs before the expensive ingest operation.

**`validateCsvImport(content, options)`** — checks:
- File size (default 10 MB limit)
- Minimum row count (header + at least 1 data row)
- Row count cap (default 100K)
- Column count cap (default 200)
- Coordinate column detection (lat/lon aliases)
- CRS hint: reject if coordinates look projected (values > 1000)
- Swap detection: warn if lat column has values > ±90 but lon column doesn't
- Non-numeric channel detection: warn about columns that will be skipped

**`validateGeoJsonImport(content, options)`** — checks:
- Valid JSON, has `type` field
- Supported type: `FeatureCollection` or `Feature`
- Non-empty features array
- Feature count cap
- Warn about features without geometry

Both return `{ valid: boolean, warnings: string[], errors: string[] }`.

## Tests

- `server/__tests__/import-manager.test.js` — import source (channels registered, manifest persisted), EVID-P1-003 (restart persistence: import → new manager → restoreFromManifest), EVID-P1-004 (duplicate replacement: old channel gone, new present), EVID-P1-005 (delete removes from registry + manifest; delete builtin rejected with `BUILTIN_SOURCE`), `sanitizeSourceId` validation
- `server/__tests__/import-validator.test.js` — valid CSV passes, missing coords rejected, oversized rejected, projected CRS detected, swap warned, non-numeric warned, GeoJSON validation (valid/invalid JSON/missing type/empty features/missing geometry warned)

## Exit

```bash
npm test && npm run lint
```

All suites green including new `import-manager` and `import-validator` suites. EVID-P1-003/004/005 test coverage confirmed.
