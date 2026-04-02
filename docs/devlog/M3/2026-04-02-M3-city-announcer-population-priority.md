# 2026-04-02 — Feature: City Announcer Population-Weighted Priority

Added population-weighted scoring to city announcement selection. Larger cities are now prioritized when multiple candidates are at similar distances, while a clear proximity advantage still allows smaller cities to win.

## Motivation

The previous announcer used pure Euclidean distance to select which city to announce. This meant that a small city slightly closer to the viewport center would always be announced over a major city nearby — e.g., Kayseri over Istanbul when the viewport sat between the two. Users expect the more prominent city to be announced unless they have clearly moved toward the smaller one.

## Design

### Scoring Formula

Both `findNearestCity` (dwell trigger) and `findCityInCenter` (flyby trigger) now use a population-weighted effective distance:

```
effective_distance = dist² / pow(pop, POP_PRIORITY_EXPONENT)
```

Where `POP_PRIORITY_EXPONENT = 0.15`. This gives larger cities a moderate advantage: at equal distance, a 15M-population city beats a 1M-population city by a factor of ~1.64×. The smaller city needs to be roughly 40% closer to overcome the population bonus.

### Behavioral Examples (Istanbul 15M vs Kayseri 1M)

| Viewport position               | Winner   | Reason                                 |
| -------------------------------- | -------- | -------------------------------------- |
| Midpoint of the two cities       | Istanbul | Population priority at equal distance  |
| Slightly toward central Turkey   | Kayseri  | Distance advantage overcomes pop bonus |
| Centered on Istanbul             | Istanbul | Closest + largest                      |

### Guard Against Edge Cases

- `Math.max(city.pop, 1)` prevents division by zero for hypothetical zero-population entries
- When `dist = 0` (viewport center exactly on a city), score is 0 regardless of population — the city directly under the cursor always wins

### TTS Volume Adjustment

Lowered `TTS_GAIN_RATIO` from 0.4 to 0.3 (30% of master volume) for less intrusive announcements.

## Files Changed

- **Modified**: `frontend/city-announcer.js` — add `POP_PRIORITY_EXPONENT` constant, replace raw distance comparison with population-weighted scoring in `findNearestCity` and `findCityInCenter`, lower `TTS_GAIN_RATIO` from 0.4 to 0.3
