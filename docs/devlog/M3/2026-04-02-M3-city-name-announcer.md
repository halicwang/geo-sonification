# 2026-04-02 — Feature: City Name Announcer with Stereo Panning

Added real-time city name voice announcements to the sonification experience. When the user dwells at a location or drags past a major city at high zoom, a pre-generated TTS audio clip plays through Web Audio with stereo panning derived from the city's horizontal position in the viewport.

## Motivation

The ambient soundscape conveys land cover composition but gives no sense of *where* you are geographically. City announcements add a wayfinding layer — hearing "Tokyo" or "Lagos" while panning gives spatial context without requiring the user to read the map.

## Design

### Trigger Model

Two independent triggers share a common cooldown (4 s) and announce only when the city changes:

| Trigger   | Event       | Condition                | Behavior                                    |
| --------- | ----------- | ------------------------ | ------------------------------------------- |
| **Dwell** | `moveend`   | zoom >= 5, 500 ms still | Find nearest city in viewport, async load   |
| **Flyby** | `move`      | zoom >= 6, 200 ms throttle | Find city in center circle, cache-only play |

Dwell is the primary trigger (user stops at a location). Flyby is a bonus — during fast panning at max proximity, cities that enter the center 15% of the viewport are announced instantly if their audio is already cached (no fetch during drag).

### City Database

`data/cities.json` contains ~555 world cities with population > 1M, sourced from GeoNames (CC BY 4.0). Each entry: `{ name, lat, lng, pop, slug }`. Loaded once on module init. Lookup is a linear scan filtered to viewport bounds — fast enough for ~500 entries at 200 ms throttle.

### Audio Pipeline

Pre-generated M4A clips live in `frontend/audio/cities/{slug}.m4a`, produced by `scripts/generate-city-audio.js` using macOS `say -v Samantha` piped through `afconvert` to AAC. Files are ~3–5 KB each. Loaded on demand with a 50-entry LRU `AudioBuffer` cache.

### Audio Routing

Announcements bypass the ambient LP filter chain so they stay crisp regardless of proximity-driven cutoff:

```
AudioBufferSource → GainNode (fade-in 50ms) → StereoPannerNode → destination
```

- Gain: `masterVolume × 0.4` (TTS sits behind the ambient mix)
- Pan: `clamp((cityLng − west) / (east − west) × 2 − 1, −1, +1)`

### Integration

- `audio-engine.js` exposes `getContext()` so the announcer shares the same `AudioContext`
- `main.js` wires `map.moveend → announcer.onViewportSettle` and `map.move → announcer.onViewportMove`
- `server/index.js` adds `/data` static route to serve `cities.json`

## Files Changed

- **Added**: `frontend/city-announcer.js` — dwell + flyby triggers, spatial lookup, stereo-panned playback
- **Added**: `data/cities.json` — city database (~555 entries, GeoNames CC BY 4.0)
- **Added**: `scripts/generate-city-audio.js` — macOS TTS audio generation pipeline
- **Added**: `frontend/audio/cities/*.m4a` — ~555 pre-generated city name clips
- **Modified**: `frontend/audio-engine.js` — expose `getContext()` for shared AudioContext
- **Modified**: `frontend/main.js` — wire announcer to map events, toggle with audio play/stop
- **Modified**: `server/index.js` — add `/data` static route for cities.json
- **Modified**: `docs/ARCHITECTURE.md` — add City Announcer section
