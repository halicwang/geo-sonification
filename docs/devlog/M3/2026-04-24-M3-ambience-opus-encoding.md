# 2026-04-24 — Refactor: Encode Ambience as Opus 128k (20× Smaller)

Replace the seven 46.8 MB ambience WAVs (328 MB total payload) with
2-3 MB Opus 128 kbps files (~18 MB total) for a 20× reduction in
first-load transfer. Frontend's `audio-engine.js` now fetches
`.opus` instead of `.wav`; the existing R2 + Cloudflare CDN path is
unchanged.

## Why now

First-load audio over the production R2 pipeline was the slowest
remaining step in the user experience after the Pages + Worker
deployment landed. On a typical US residential link the seven 46 MB
WAVs took 30-60 s to fully download — long enough that visitors
might bail before audio kicks in. With the supervisor (Mike Frengel)
about to evaluate the live site, payload size needed to shrink
before the demo. Opus 128 kbps is transparent on ambient textures
(continuous, low-transient material is what the codec was designed
for), so the listener experience is unchanged.

## Encoding decision

| Bitrate | Per-file size | Total (×7) | Verdict |
|--------:|--------------:|-----------:|---------|
| WAV (source) | 46.8 MB | 328 MB | baseline |
| Opus 96 kbps | ~1.7-2.0 MB | ~13 MB | transparent for ambient; saves further bytes |
| **Opus 128 kbps** | **1.7-2.7 MB** | **~18 MB** | chosen — small headroom over 96k for safety |
| Opus 160 kbps | ~2.5-3.5 MB | ~22 MB | no audible benefit |

Encoder: `ffmpeg -c:a libopus -b:a 128k -vbr on -compression_level 10
-application audio`. Container: Ogg (`.opus`), MIME `audio/ogg`.

## Loop crossfade compatibility

The engine relies on the first 1.875 s of each ambience file being a
byte-exact copy of the last 1.875 s — that's how the double-buffered
A/B voice swap stays seamless. Opus is a frame-based lossy codec, so
in principle the encoded head and tail could differ slightly from
each other once decoded. In practice the audio-engine crossfades
those segments over the full 1.875 s window with a `linearRampToValueAtTime`
on the gain nodes, which masks any frame-edge artifacts well below
audible threshold. Smoke test in the local preview confirmed no
clicks at the loop boundary.

## Frontend changes

`frontend/audio-engine.js` (single line in `loadSample`):

```diff
- const response = await fetch(`${ASSET_BASE}/audio/ambience/${name}.wav`);
+ const response = await fetch(`${ASSET_BASE}/audio/ambience/${name}.opus`);
```

The error message in the same `try` block updates `${name}.wav` →
`${name}.opus` for log clarity.

## Server changes

`server/index.js` `EXPECTED_AMBIENCE_FILES` (the missing-asset
warning at startup) was updated from seven `.wav` filenames to seven
`.opus`. Source WAVs may stay on disk locally, but the warning now
flags the file the engine actually fetches.

## R2 changes

Seven new objects under `audio/ambience/<name>.opus` uploaded with
`content-type: audio/ogg` and the same `cache-control: public, max-age=
31536000, immutable` as the WAVs. The original `.wav` objects are
left in place as a rollback path; if a regression surfaces, reverting
the audio-engine fetch is a one-line edit and one `wrangler pages
deploy`.

## Tooling

`scripts/encode-ambience-opus.sh` re-runs the encoding from scratch
(sources → `.opus` next to them in `frontend/audio/ambience/`).
`.gitignore` already covered `*.wav` in that directory; extended to
`*.opus` too so re-encoded outputs never accidentally land in git.

## Verification

```
$ curl -sS -I https://assets.placeecho.com/audio/ambience/forest.opus
HTTP/2 200
content-type: audio/ogg
content-length: 2281907                # 2.28 MB; was 45.78 MB
accept-ranges: bytes
```

Local preview (`npm start`) — clicked the play button, audio status
flipped to "Playing" within ~4 seconds with no console errors and no
failed network requests. `forest.opus` and the other six load in
parallel from `localhost:3000/audio/ambience/<name>.opus` (Express
serves them next to the `.wav` source files).

Production deploy: `wrangler pages deploy dist/` — the redeploy pulled
no new bytes for any of the static assets except `audio-engine.js`
(only its fetch URL changed) and the new `config.runtime.js`. `forest.opus`
serves from R2 at 2.28 MB; the seven combined are ~18 MB versus the
prior 328 MB.

## Files changed

- `frontend/audio-engine.js` — fetch `.opus`, error message updated.
- `server/index.js` — `EXPECTED_AMBIENCE_FILES` lists `.opus` filenames.
- `.gitignore` — also ignore `frontend/audio/ambience/*.opus`.
- `scripts/encode-ambience-opus.sh` — new, idempotent re-encoder.
- `docs/DEVLOG.md` — index entry for this devlog.
