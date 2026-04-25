# 2026-04-25 — Refactor: Static Asset Cache Headers

Add `Cache-Control: public, max-age=…` headers to PMTiles (7 days) and
ambience Opus files (30 days), and reorder the static mounts so the
explicit routes win over the catch-all `frontend` mount.

## Why now

When iterating locally on the grid overlay, every hard reload re-fetched
the 185 MB PMTiles archive even though the file hadn't changed. Same
story for the seven Opus ambience files. Adding browser-side cache hints
turns subsequent reloads into 304 Not Modified (or no request at all
within the cache window).

This is a stage in the broader grid drag-perf push (see
`docs/devlog/M3/2026-04-25-M3-server-response-compression.md`). It
matters most on the cold-load side of the user-perceived "loading time
is slow" complaint.

## Changes

**`server/index.js`:**
- `app.use('/tiles', express.static(..., { maxAge: '7d' }))` — sends
  `Cache-Control: public, max-age=604800`. Deliberately omits
  `immutable` so `npm run build:tiles` (which overwrites in-place) is
  picked up via ETag / `If-Modified-Since` on hard reload.
- `app.use('/audio/ambience', express.static(..., { maxAge: '30d' }))`
  — `Cache-Control: public, max-age=2592000`. Opus files are content-
  addressed in practice (the encoder pipeline writes new files; no
  in-place re-encoding), so 30 days is safe.
- **Mount order**: both explicit routes are now declared **before** the
  catch-all `app.use(express.static('../frontend'))`. The frontend
  directory contains `audio/ambience/` too, so the catch-all was winning
  the route match for `/audio/ambience/*.opus` requests and serving them
  with the default `max-age=0`. Reordering fixes the bug — verified
  via `curl -sI`.
- `index.html`, JS bundles, and CSS continue to use the default
  `max-age=0` from the catch-all `express.static`. Local dev iteration
  on those is fast enough that aggressive caching would be a net
  negative.

## Production note

In production, PMTiles and ambience are served from R2 via
`assets.placeecho.com` (configured in `frontend/config.runtime.js` /
`ASSET_BASE`), which carries its own cache strategy. These headers
take effect only on local dev and on any deployment that serves
assets directly from the Node origin.

## Verification (local)

`npm run lint`, `npm run format:check`, `npm test --prefix server`
(153/153 tests pass). `npm start` + `curl`:

```
$ curl -sI http://localhost:3000/tiles/grids.pmtiles | grep -i cache
Cache-Control: public, max-age=604800

$ curl -sI http://localhost:3000/audio/ambience/forest.opus | grep -i cache
Cache-Control: public, max-age=2592000

$ curl -sI http://localhost:3000/ | grep -i cache
Cache-Control: public, max-age=0
```

Range requests on `/tiles/grids.pmtiles` continue to return `206 Partial
Content` correctly (PMTiles loader's first read is a header range
fetch).

## Files changed

- `server/index.js` — add `maxAge` options to two `express.static`
  mounts; move them above the catch-all frontend mount.
- `docs/DEVLOG.md` — index entry for this devlog.
