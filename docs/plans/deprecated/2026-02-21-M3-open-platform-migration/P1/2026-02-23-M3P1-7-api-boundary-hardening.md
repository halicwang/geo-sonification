# P1-7 — API Boundary Hardening

**Prerequisite:** P1-6 complete (`POST /api/sources` operational, `getSourceType()` available)
**Trace:** Milestone 3 Phase 1 — Open Ingestion + Control Plane
**Covers original:** Packet P1-C (Migration Plan P1) — API responsibility boundary
**EVID coverage:** EVID-P1-007 (full — API boundary test)

## Context

Enforce the non-overlapping API responsibility boundary between the two registration paths per Spec §4.1 (API Responsibility Matrix):

- `POST /api/import` — data-carrying, for static/batch sources (CSV, GeoJSON)
- `POST /api/sources` — metadata-only, for stream source pre-registration

Cross-type collisions are rejected. Same-type replacement within each endpoint is still allowed.

## Changes to `server/index.js`

### `POST /api/import` — add conflict check

After sourceId is resolved, call `importManager.getSourceType(sourceId)`. If the result is `'stream'`, return:

- **409** with code `MODE_CONFLICT` — message should tell the user to delete the stream source first or use a different sourceId.

### `POST /api/sources` — add conflict check

After sourceId is sanitized, call `importManager.getSourceType(cleanSourceId)`. If the result is `'static'`, return:

- **409** with code `SOURCE_TYPE_MISMATCH` — message should tell the user to delete the static import first or use a different sourceId.

## Tests

Create `server/__tests__/api-boundary.test.js`. Should cover:
- `getSourceType()` returns correct type for each category (builtin, static, stream, null)
- Cross-type conflict: register as stream → `getSourceType` returns `'stream'` (endpoint would reject import)
- Cross-type conflict: import as static → `getSourceType` returns `'static'` (endpoint would reject stream registration)
- Same-type replacement: re-import static succeeds, re-register stream succeeds

## Exit

```bash
npm test && npm run lint
```

All suites green. Manual curl verification: register stream → attempt CSV import with same ID → 409 MODE_CONFLICT.
