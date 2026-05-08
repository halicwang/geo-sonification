# 2026-04-29 — Feature: Border-distance Pipeline (M6 P0)

Phase 0 of M6: bake a per-cell `border_dist_km` (minimum great-circle
distance to the nearest country border or coastline) into the existing
PMTiles, plus emit a parallel binary sidecar `grid_index.bin` for the
frontend to scan in JS at runtime. The runtime hover-glow itself
(P1+) will multiply this with a cursor-distance falloff to decide
which existing grid dots brighten on hover. **No new render layer is
introduced** — the upcoming runtime modulates the existing `grid-dots`
layer's `circle-color` via `feature-state`.

This phase ships the data side only — runtime wiring and verification
follow in P1 / P2.

## Context

A previous attempt at the same feature (rolled back before this work)
went off the rails for three identifiable reasons, captured in
[the M6 plan](../../plans/M6/2026-04-29-M6-hover-glow-proposal.md)
(forthcoming). Two of those failure modes belong to runtime; the
third — accidentally pairing tippecanoe's `--use-attribute-for-id`
with Mapbox's source-side `promoteId` — is settled here at the
data layer with a single rule: **build-time only, never both**.

## Pipeline overview

```
data/sources/natural-earth/   <-- scripts/download-natural-earth.js (idempotent)
  ne_10m_coastline.geojson
  ne_10m_admin_0_boundary_lines_land.geojson
                       │
                       ▼
scripts/compute-border-distance.js
  ── flatten 476,139 segments into Float32Array
  ── 1° bbox-grid index, antimeridian-aware
  ── per-cell 7×7 ring query, equirectangular point-to-segment
                       │
                       ▼
data/cache/border-distance.v1.json   (1.18 MB, fingerprinted; ~3.6s build)
                       │
                       ▼
scripts/build-tiles.js (modified)
  ── joinBorderDistance + assignFids (sorted-by-grid_id, 1-indexed)
  ── tippecanoe --use-attribute-for-id=fid
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
data/tiles/grids.pmtiles (167.7 MB)   data/tiles/grid_index.bin (1.08 MB)
                                      ├─ header GSIDX001 + count + gridSize
                                      └─ 67,331 × {fid:u32, lon:f32,
                                                   lat:f32, distKm:f32}
```

## Algorithm — `pointToSegmentDistKm`

Equirectangular point-to-segment distance with the query point as the
local origin. Inside the 250 km radius the runtime cares about,
equirectangular error vs full geodesic is < 0.5% even at lat 80°, so
no spherical / 3D fallback is needed.

```
cosLat0 = cos(plat * π/180)
factor  = π/180 * R_earth  (R_earth = 6371 km)

normalize lng deltas into [-180, 180]
ax = dLonA · factor · cosLat0     ay = (alat - plat) · factor
bx = dLonB · factor · cosLat0     by = (blat - plat) · factor

t = clamp(0, 1) of -(ax·dx + ay·dy)/|d|²
return |(ax + t·dx, ay + t·dy)|
```

Antimeridian: lng deltas are normalized into [-180, 180] before
scaling, so a segment crossing `lon=180` looks contiguous regardless
of which side of the seam the query point is on.

## Index — 1° bbox grid

Each segment is inserted into every 1° cell its bbox overlaps.
Antimeridian: when |Δlon| > 180 we shift one endpoint by ±360 so the
bbox is contiguous in extended coords, then wrap each integer ix into
the canonical [-180, 179] range when keying into the index. Query at
a grid cell takes a 7×7 ring (3 cells in each direction, ~330 km
worst case) and dedupes via a per-query `Set`. Build cost:

| Stage                   | Cost          |
| ----------------------- | ------------- |
| Load + flatten segments | 0.2s          |
| Build 1° index          | 0.0s          |
| Load grid (server data) | 0.3s          |
| Per-cell distance query | 3.1s          |
| **Total**               | **3.6s**      |

Distribution of 67,331 cells:

| Range                           | Count   | Share |
| ------------------------------- | ------- | ----- |
| < 50 km from a border/coast     | 22,500  | 33%   |
| < 100 km                        | 31,676  | 47%   |
| capped at 300 km (deep interior)| 17,131  | 25%   |
| median                          | 113.8 km |      |

Sanity probes:

| Place                          | Distance |
| ------------------------------ | -------- |
| London (-0.5°, 51.5° cell)      | 54.8 km |
| Berlin (13.0°, 52.5° cell)      | 59.9 km |
| Paris (2.0°, 48.5° cell)        | 153.1 km|
| Taymyr coast (105°, 76°)        | 42.2 km |
| Sahara interior (10°, 25°)      | 22.9 km |
| Mongolia interior (100°, 47°)   | 300 km (capped) |
| Antimeridian land east (179° belt)| 1.5–16 km |

## The `promoteId` footgun (settled here)

Tippecanoe's `--use-attribute-for-id=fid` consumes the `fid` property
at encode time and writes it to the MVT feature.id field. The
attribute itself is no longer present in the tile. If the frontend's
`addSource` call also sets `promoteId: 'fid'`, Mapbox looks for an
attribute that isn't there and resolves `feature.id` to `null` —
breaking `setFeatureState` entirely. This was exactly the bug the
previous attempt hit and recorded in its devlog before rollback.

This phase pins the rule:
- `scripts/build-tiles.js`: pass `--use-attribute-for-id=fid`
- `frontend/map.js` (current state): no `promoteId` on the source

Two source-level tests in `server/__tests__/build-tiles.test.js`
guard the rule:
- `expect(buildTiles_src).toMatch(/--use-attribute-for-id=fid/)`
- `expect(map_src).not.toMatch(/promoteId/)`

A change in either direction has to update both files together,
which is exactly what we want.

## fid offset (1, not 0)

First build emitted the warning `Can't represent too-large feature
ID 0` once and dropped the value. Tippecanoe / MVT treat ID 0 as
"no ID assigned"; the fid range needs to start at 1. Fixed by
changing `assignFids` to write `i + 1` instead of `i`. Test:
`assignFids → fid[0] === 1`.

## Sidecar format — `grid_index.bin`

```
bytes  0..7    magic         "GSIDX001" (ASCII, 8 bytes)
bytes  8..11   count         u32 little-endian
bytes 12..15   gridSize      f32 little-endian
bytes 16..end  body          count × 16 bytes
                             [fid:u32, lon:f32, lat:f32, distKm:f32]
```

The frontend can then create two typed-array views over the same
buffer slice — `Uint32Array` for fid and `Float32Array` for the
three floats — and read both correctly without per-element
DataView calls. A round-trip test pins this layout.

## Cache invalidation

`data/cache/border-distance.v1.json` carries `{schemaVersion: 1,
sourceFingerprint, gridSize, distancesByGridId}`. The fingerprint
is SHA1 of (path, size, mtimeMs) for both NE files. On rerun the
script skips recomputation if fingerprint and gridSize both match
— ~50ms cache hit vs ~3.6s cold build. Schema bump to v2 in the
future would invalidate the cache automatically.

## Tests

24 new tests across 3 suites, all passing:

- `server/__tests__/border-distance.test.js` — 14 tests covering
  endpoint case, perpendicular distance, projection-clamp, both
  sides of antimeridian (segment- and point-side), high-latitude
  acceptable error, degenerate segment, and the bbox-prefilter +
  query path including the cap.
- `server/__tests__/grid-index.test.js` — 5 tests covering
  round-trip header, centroid offset (`lon + half`), bad-magic and
  bad-length rejection, and the dual `Uint32Array`+`Float32Array`
  view layout the frontend will use.
- `server/__tests__/build-tiles.test.js` (extended) — 5 new tests
  covering the new TILE_PROPERTIES, `assignFids` ordering and 1-base,
  `joinBorderDistance` cap-default, the source-level
  `--use-attribute-for-id=fid` assertion, and the `not.toMatch
  promoteId` invariant on the frontend.

Total server suite: 194 passing (was 170 → +24).

## Files changed

- `scripts/download-natural-earth.js` — NEW, idempotent NE GeoJSON
  fetch (Node 18+ global fetch, size sanity check).
- `scripts/compute-border-distance.js` — NEW, offline distance
  computation. Exports `pointToSegmentDistKm`, `buildSegmentIndex`,
  `queryDistance`, `iterSegments`, `MAX_BORDER_DIST_KM`,
  `QUERY_RING` for tests.
- `scripts/build-grid-index.js` — NEW, sidecar emitter. Exports
  `encodeGridIndex`, `decodeGridIndex`, `MAGIC`, `HEADER_BYTES`,
  `ENTRY_BYTES`, `MAX_BORDER_DIST_KM` for tests.
- `scripts/build-tiles.js` — MODIFY: TILE_PROPERTIES gains `fid`
  and `border_dist_km`; new `assignFids` and `joinBorderDistance`
  helpers; tippecanoe args gain `--use-attribute-for-id=fid`;
  pipeline now emits `grid_index.bin` after tippecanoe.
- `server/__tests__/border-distance.test.js` — NEW (14 tests).
- `server/__tests__/grid-index.test.js` — NEW (5 tests).
- `server/__tests__/build-tiles.test.js` — EXTEND (5 new tests).
