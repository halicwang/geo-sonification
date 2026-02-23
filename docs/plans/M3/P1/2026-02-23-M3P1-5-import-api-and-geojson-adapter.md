# P1-5 — Import API Endpoints & GeoJSON Adapter

**Prerequisite:** P1-4 complete (import-manager.js and import-validator.js exist)
**Trace:** Milestone 3 Phase 1 — Open Ingestion + Control Plane
**Covers original:** Packet P1-B (Migration Plan P1) — API endpoints + GeoJSON adapter (part 2 of 3)
**EVID coverage:** EVID-P1-001 (CSV import success path), EVID-P1-002 (GeoJSON import success path)

## Context

Wire `POST /api/import`, `DELETE /api/sources/:id`, and `GET /api/sources` into `server/index.js`. Create the GeoJSON generic adapter. Create test fixture files for integration testing.

`POST /api/import` is the data-carrying registration path — accepts `multipart/form-data` with a `file` field, detects CSV vs GeoJSON by file extension, and delegates to the appropriate adapter + import-manager.

## New Dependency

Install `multer` (pre-approved, Implementation Guide §3 (Dependency Approvals)) in the **server** package:

```bash
cd server && npm install multer
```

## New Files

### `server/adapters/geojson-generic.js`

**Responsibilities:**
- Extract coordinates from GeoJSON geometry: Point uses coordinates directly; Polygon/MultiPolygon uses centroid of exterior ring; LineString uses centroid
- Detect numeric properties from feature sample (first ~10 features)
- `parseGeoJsonContent(content, sourceId, options)` → `{ records, channels, warnings }` — same shape as CSV adapter
- `createGeoJsonAdapter(sourceId, content)` → validated `DataAdapter`
- Accepts string, Buffer, or pre-parsed object input

**Same constraints as CSV adapter:** channel name sanitization, `lon_lat` cellId format, `[0,1]` clamp normalization.

### Test Fixtures

Create in `server/__tests__/fixtures/`:
- `test-import.csv` — 3 rows with lat, lon, pm25, temp_c
- `test-import.geojson` — FeatureCollection with 2 Point features, numeric properties
- `test-invalid.csv` — CSV without lat/lon columns (for error path testing)

## Changes to `server/index.js`

### `POST /api/import`

- Use `multer` memory storage with 10 MB limit
- Derive sourceId from `req.body.sourceId` or filename (sanitize via `sanitizeSourceId`)
- Detect format: `.geojson`/`.json` extension or `geo+json` mimetype → GeoJSON; else CSV
- Validate via `validateCsvImport` / `validateGeoJsonImport` before parsing
- On validation failure: 400 with `{ status: 'error', code: 'VALIDATION_FAILED', errors[] }`
- On success: delegate to adapter + `importManager.importSource()`
- Returns `{ status: 'ok', source, channels, cellCount, resolution, warnings }`

### `GET /api/sources`

- Lists all registered sources (builtin + imported) with type, mode, channelCount, status

### `DELETE /api/sources/:id`

- Delegates to `importManager.deleteSource()`
- `BUILTIN_SOURCE` → 400, `SOURCE_NOT_FOUND` → 404, other errors → 500

### Import Manager Initialization

Create or lazily initialize a module-level `ImportManager` instance, backed by `getChannelRegistry()`.

## Tests

- `server/__tests__/geojson-generic-adapter.test.js` — parse FeatureCollection, extract numeric properties, Point/Polygon coordinate extraction, missing geometry handling, string/Buffer/object input, single Feature input
- `server/__tests__/import-api.test.js` — endpoint routing and error handling: 503 when not loaded, 400 when no file attached, delete 404 for unknown source

## Exit

```bash
npm test && npm run lint
```

All suites green. Manual curl verification with running server:
- `POST /api/import` with CSV → 200
- `GET /api/sources` → includes imported source
- `GET /api/channels` → includes imported channels
- `DELETE /api/sources/:id` → 200
