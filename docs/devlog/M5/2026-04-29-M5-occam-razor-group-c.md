# 2026-04-29 — Refactor: Occam's Razor Sweep (Group C)

Seven small subtractive changes from the same code-aesthetic review
thread that produced Groups A and B. Three classes: a deduplicated
closure pair, two inlined trivial wrappers, and four removals of
over-defensive validation on internal call paths. One configuration
surface area shrinks (a never-used PER_GRID alternative API). No
behavior change.

## Why now

Groups A ([2026-04-28](2026-04-28-M5-occam-razor-group-a.md)) and B
([2026-04-29](2026-04-29-M5-occam-razor-group-b.md)) handled comment
hygiene, dead null-checks on permanent module refs, and small
wrappers. The follow-up question that surfaced this entry was "how
do we keep cutting under Occam's Razor without removing real
defenses?". Five second-order patterns showed up:

- **Duplicated closures**: `server/index.js` constructs the same
  `incrementStats` and `getDataLoaded` arrows twice (once for
  `attachRoutes`, once for `attachWsHandler`).
- **Boundary defense leaking inward**: `audio-metrics.js` internal
  helpers `Array.isArray`-guard their inputs even though every
  caller traces back to `getLcFractionsFromDistribution`, which
  hard-returns an 11-element array via `LC_CLASS_ORDER.map(...)`.
- **Trivial wrappers**: `finiteOrZero(x)` is a 3-line wrapper around
  `Number.isFinite(x) ? x : 0`, used 3× in one file.
- **Over-defaulted object construction**: `buildStatsResult` applied
  `?? 0` to every numeric field even though the upstream `n>0 ? avg
  : 0` ternaries already guarantee a number.
- **Configurability with zero usage**: `PER_GRID_THRESHOLD` +
  `PER_GRID_HYSTERESIS` provided a "center + half-width" alternative
  to explicit `ENTER` / `EXIT`. Audit: zero deployments use it; only
  `.env.example` lights it up.

Phase 1 verification (call-graph + grep + test trace) cleared each
candidate before any code changed. The `cloneSnapshot` read/write
pair was investigated but deferred — the call-graph audit was
inconclusive, and a single-purpose sweep will resolve it later.

## Changes by group

### C1 — Deduplicate `incrementStats` and `getDataLoaded` (server/index.js)

`attachRoutes` and `attachWsHandler` previously each received their
own arrow functions:

```js
incrementStats: (elapsedMs) => { _statsCounter.viewports++; ... }
getDataLoaded: () => dataLoaded
```

Both capture identical module-scope state. Lifted both to single
`const` declarations co-located with `_statsCounter` / `dataLoaded`,
passed by reference to both consumers.

### C2 — Inline `finiteOrZero` (server/audio-metrics.js)

```js
function finiteOrZero(value) {
    return Number.isFinite(value) ? value : 0;
}
```

Three internal call sites (lines 42, 46, 107). Each replaced with
the one-liner. Function and export removed. `grep` confirmed no
external references.

### C3 — Drop internal `Array.isArray` defenses (server/audio-metrics.js)

`normalizeLcArray` (lines 106-108) and `computeBusTargets` (lines
184-188) both internally guarded `Array.isArray(values)` on their
inputs. Call-graph trace:

- `normalizeLcArray` ← `normalizeSnapshot` (already
  `Array.isArray`-checked at line 118) and ← `computeDeltaMetrics`
  ← `viewport-processor.js:117`, where `lcFractions` originates from
  `getLcFractionsFromDistribution` (always returns an array).
- `computeBusTargets` ← `viewport-processor.js:129` ← same upstream.

Both internal guards removed. The `safeVal` inner helper in
`computeBusTargets` collapsed into a direct `Number.isFinite`
ternary — no longer warranted as a named helper once the array
guard is gone.

The `audio-metrics-bus.test.js` "handles null input" test was
removed — it asserted the now-removed defense against `null`
`lcFractions`. The remaining defensive tests (`handles empty
array`, `handles short array`, `handles NaN values`) still pass
because under-length / non-finite element access falls through
to `Number.isFinite` returning `false → 0`. Production callers
(only `viewport-processor.js:129`) never pass `null`; the
upstream `getLcFractionsFromDistribution` hard-returns an
11-element array.

### C4 — Drop redundant `?? 0` defaults in `buildStatsResult` (server/spatial.js)

`buildStatsResult` defaulted 11 fields to `0` / `{}` / `[]`. Phase 1
trace through `calculateLegacyStats`, `calculateAreaWeightedStats`,
and `normalizeValues` showed the eight numeric fields are guaranteed
to arrive as finite numbers (each call site uses an `n>0 ? avg : 0`
ternary or initializes to 0 directly). Removed `?? 0` from:

- `nightlightNorm`, `populationNorm`, `forestNorm`
- `avgForestPct`, `avgPopulationDensity`
- `avgNightlightMean`, `avgNightlightP90`
- `gridCount`

Kept `lcCounts ?? {}` and `displayItems ?? []` — the
`calculateAreaWeightedStats` early-return path (when
`validLandcoverWeight <= 0`, line 482) intentionally omits both
fields to express "no breakdown". The fallback materializes them as
empty rather than `undefined` for the WebSocket schema.

JSDoc on `buildStatsResult` updated to mark the 8 number fields as
required, leaving `lcCounts` / `displayItems` / `dominantLandcover`
as optional.

### C5 — Drop `name` parameter from env parsers (server/config.js)

`parsePort`, `parseNonNegativeFloat`, `parseNonNegativeInt` each
took `(envVar, defaultValue, name)` where `name` was always a
synonym of `envVar` (e.g. `parsePort('PORT', 3000, 'PORT')`). The
single deviation was `parsePort('HTTP_PORT', 3000, 'HTTP')`, where
`'HTTP_PORT'` is in fact more accurate. Signature shrunk to
`(envVar, defaultValue)`; error messages now use `envVar` directly.

The three parsers were intentionally NOT consolidated into one —
their validation rules differ (port 1-65535, integer ≥0, float ≥0);
a single function would need a validator parameter and become
longer, not shorter.

### C6 — Drop unused `PER_GRID_THRESHOLD` + `_HYSTERESIS` API (server/config.js, .env.example)

`server/config.js` previously supported two ways to configure
per-grid mode thresholds:

- (A) explicit: `PER_GRID_THRESHOLD_ENTER` + `PER_GRID_THRESHOLD_EXIT`
- (B) derived: `PER_GRID_THRESHOLD` (center) +
  `PER_GRID_HYSTERESIS` (half-width) → `ENTER` / `EXIT` computed

Phase 1 audit:

- `.env`: empty (uses defaults).
- `.env.deploy`: no `PER_GRID_*` keys.
- `fly.toml`, CI workflows: no env injection.
- `server/__tests__/`: only ENTER/EXIT covered.
- `.env.example`: the only surface lighting up route (B).

Route (B) deleted. `ENTER` and `EXIT` now default to `50` directly
(matching the previously-derived defaults via `center=50,
hysteresis=0`). The `ENTER ≤ EXIT` validation kept.

`.env.example` updated to show `PER_GRID_THRESHOLD_ENTER` / `_EXIT`
directly. M1 design devlog left untouched — historical decision
records are not rewritten.

### C7 — Flat array unwrap in `normalizeClientId` (server/client-state.js)

The previous implementation recursed into nested arrays:

```js
if (Array.isArray(value)) {
    for (const item of value) {
        const normalized = normalizeClientId(item);
        if (normalized) return normalized;
    }
    return '';
}
```

Recursion handles `[['a'], ['b']]`-style nested inputs that don't
arise from any real client: frontend `getClientId()` always returns
a string; `express.json()` produces flat arrays; Node HTTP combines
repeated headers into comma-separated strings (no array). Replaced
with a single-pass form that preserves the "first valid item"
semantic for `body: { clientId: [...] }` without recursion:

```js
function normalizeClientId(value) {
    const candidates = Array.isArray(value) ? value : [value];
    for (const c of candidates) {
        if (typeof c !== 'string') continue;
        const trimmed = c.trim();
        if (trimmed.length > 0 && trimmed.length <= 128) return trimmed;
    }
    return '';
}
```

Existing test (`normalizeClientId handles array (repeated header)
and picks first valid`) passes unchanged — the "first valid"
contract is preserved.

## Why each removal was safe

- **C1**: both closures captured identical module-scope state; same
  semantics under any number of consumers.
- **C2**: 3 internal callers, no external references — `grep`
  confirmed.
- **C3**: all entries to `normalizeLcArray` and `computeBusTargets`
  trace back to `getLcFractionsFromDistribution`, which returns an
  array via `LC_CLASS_ORDER.map(...)`. The boundary check happens
  once, where data enters the audio-metrics module.
- **C4**: per-field upstream trace established the numeric
  invariant; `golden-baseline.test.js` guards against any
  payload-shape drift in the WebSocket envelope.
- **C5**: error-message cosmetics, not behavior.
- **C6**: no live consumer of route (B) in repo, env files,
  deployment configs, CI, or tests.
- **C7**: contract preserved (first-valid semantic retained via flat
  iteration); existing test asserts the contract.

## Out of scope (explicitly deferred)

- `cloneSnapshot` read/write pair
  ([client-state.js:65, 103](../../../server/client-state.js)) —
  Phase 1 trace inconclusive on whether either side can be safely
  removed; the read-side clone interacts with a deep-clone isolation
  test (`mutating returned state does not bleed into stored entry`).
  Single-purpose sweep planned.
- `dist/` directory — confirmed not git-tracked (`git ls-files
  dist/` returns 0 files); already a local-only build artifact.
- Cross-runtime `clamp01` / `finiteOrZero` duplication between server
  (CJS) and frontend (ESM, no-build) — sharing requires a build step,
  which CLAUDE.md's "no new npm dependencies without explicit
  approval" forbids.

## Verification

- `npm run lint` — clean.
- `npm run format:check` — clean.
- `npm test` — 15 suites, 172 tests, green.
- `npm run test:frontend` — green (must pass `engine.test.js`,
  `initial-viewport-push.test.js`, `sheet-drag.test.js`, etc.).

End-to-end smoke: `npm start`, browser at `http://localhost:3000`,
pan/zoom across ocean (gridCount=0) and high-density continental
viewports (gridCount > PER_GRID_THRESHOLD_EXIT) — confirms info
panel updates, ws-status green, audio plays, and per-grid
hysteresis still flips correctly at the boundary.

## Files changed

- `server/index.js` — lifted `incrementStats` and `getDataLoaded`
  to single module-scope declarations.
- `server/audio-metrics.js` — inlined `finiteOrZero`; removed
  internal `Array.isArray` guards from `normalizeLcArray` and
  `computeBusTargets`; removed `safeVal` inner helper.
- `server/__tests__/audio-metrics-bus.test.js` — removed
  `handles null input` test (asserted the now-removed defense).
- `server/spatial.js` — dropped 8 `?? 0` defaults from
  `buildStatsResult`; updated JSDoc to mark numeric fields required.
- `server/config.js` — dropped `name` parameter from three env
  parsers; removed `PER_GRID_THRESHOLD_CENTER` /
  `PER_GRID_HYSTERESIS` derivation and constants; defaults moved
  inline to `ENTER` / `EXIT`.
- `.env.example` — replaced PER_GRID center+hysteresis lines with
  explicit ENTER/EXIT examples.
- `server/client-state.js` — replaced recursive `normalizeClientId`
  with flat single-pass unwrap.
- `docs/devlog/M5/2026-04-29-M5-occam-razor-group-c.md` — new
  (this entry).
- `docs/DEVLOG.md` — index row added.
