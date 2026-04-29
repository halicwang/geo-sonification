# 2026-04-29 — Refactor: Occam's Razor Sweep (Group B)

Four small subtractive/clarifying changes from a follow-up
code-aesthetic review. Two are documentation lifts (a JSDoc typedef
for the shared `state` object and provenance comments for two audio
constants); two are subtractive (nine dead null-checks across the
audio engine, one one-line wrapper). No behavior change.

## Why now

Group A ([2026-04-28](2026-04-28-M5-occam-razor-group-a.md)) handled
comment hygiene, env-reading consolidation, and callback guards. The
review that produced this entry asked the broader question "is this
codebase professional and aesthetic?", surfacing two further classes
of friction:

- **Loose-or-absent contracts**: the shared `state` object was typed
  as `{ config: Object, runtime: Object, els: Object }` — valid, but
  invisible to IDE hover. Two audio constants
  (`LAND_FULL_COVERAGE_THRESHOLD = 0.4`, `MAX_Q1 = 4.0`) had no
  provenance, while neighbouring constants did.
- **Dead defensive guards**: `frontend/audio/engine.js` held nine
  `if (lpFilterN)` / `if (gains[i])` / `if (!incoming)` checks on
  module-scope refs that are once-init-then-permanent. The entry
  guard `if (!audioCtx) return;` already covers the only legitimate
  skip case, so the downstream checks are unreachable.

None individually warrants a dedicated commit; sweeping them
together keeps the diff scannable and the rationale singular.

## Changes by group

### B1 — JSDoc typedef for shared `state` (`frontend/config.js`)

Replaced the loose annotation with three `@typedef` blocks
(`StateConfig`, `StateRuntime`, `StateEls`) and a precise `@type`
on the export. Each field carries its type and, for `StateRuntime`,
the file that owns its mutations. `StateEls` is intentionally kept
as `Object<string, HTMLElement>` — enumerating every cached DOM
node would couple this contract to UI churn without IDE benefit.

### B2 — Provenance for two audio constants (`frontend/audio/engine.js`)

`LAND_FULL_COVERAGE_THRESHOLD = 0.4`: real land-dominant viewports
rarely exceed ~40% land-cell ratio because coastlines, lakes and
grid-edge cells always trim the count, so a linear
`cov → landMix` mapping would leave ocean dominant everywhere
outside the open continents. Compressing at 0.4 lets land textures
fully express on inland/urban viewports. The use-site
([engine.js:657](../../../frontend/audio/engine.js))
already explained the curve; the declaration site now does too.

`MAX_Q1 = 4.0`: previously shared a one-line comment with `BASE_Q1`
saying only "resonant peak at max velocity". Expanded to document
the velocity → resonance map (`Q = BASE + vel*(MAX-BASE)`), the
Butterworth-flat baseline (`BASE_Q1 = 1/√2 ≈ 0.5176`), and why
4.0 is the chosen ceiling (~+12 dB resonance at cutoff during fast
drags, below the Q ≈ 6 threshold where `BiquadFilterNode` starts
to self-oscillate / clip).

### B3 — Drop nine dead null-checks (`frontend/audio/engine.js`)

`audioCtx`, `masterGain`, `duckGain`, `lpFilter1/2/3`, and every
`gains[i]` are module-scope `let`s. They are assigned exactly once
in `ensureCtx()` and never set back to null —
`grep -n "audioCtx = null\|lpFilter1 = \|gains\[i\] = null"` over
`frontend/audio/engine.js` confirms `stop()` only suspends the
context; node references persist for the page lifetime. Hot-path
functions begin with `if (!audioCtx) return;`, which is sufficient.
Removed:

- `swapBusVoice` (~line 390): `if (!incoming || !incoming.gain)
  return;` — caller in `performGlobalSwap` already guards
  `bufferCache.has(i)` and `audioCtx` is non-null on entry, so
  `createVoice()` cannot return null on this path.
- `performGlobalSwap` (~line 462): `&& gains[i]` in the loop guard.
- `startAllSources` (~lines 501, 504): `|| !gains[i]` and
  `if (!first || !first.gain) continue;`.
- `rafLoop` (~lines 655–662): three `if (lpFilterN) lpFilterN.X.value
  = …` and one `if (lpFilter1) lpFilter1.Q.value = …`.
- `rafLoop` (~line 682): `if (gains[i] && bufferCache.has(i))`.
- `seekLoop` (~lines 926, 929): `|| !gains[i]` and
  `if (!voice || !voice.gain) continue;`.

To keep the contract discoverable, the `ensureCtx()` JSDoc now
documents the lifetime invariant: "once this function returns,
`audioCtx`, `masterGain`, `duckGain`, `lpFilter1/2/3`, and every
`gains[i]` are non-null for the rest of the page lifetime …
Hot-path functions rely on this." Future maintainers see the
contract before they are tempted to re-add a guard.

### B4 — Inline `getWebSocketURL()` wrapper

`frontend/config.js:185-187` was a one-line `return buildWsUrl();`
wrapper. Only consumer was `frontend/websocket.js:52`. Deleted the
wrapper; updated the import and call site to use `buildWsUrl()`
directly. Same name-and-place as `buildWsUrl`, no call-graph change.

## Why each removal was safe

- **B1, B2**: comment-only changes, zero behavior.
- **B3**: lifetime-invariant verified via grep over the only
  assignment sites in `engine.js`. `engine.test.js`'s `stop
  lifecycle` and `stop() is idempotent` tests pass unchanged,
  proving `stop()` does not break the invariant. Idle suspend, tab
  visibility transitions, and re-`start()` cycles also remain
  green.
- **B4**: single consumer, identical implementation, zero
  call-graph change.

## Verification

- `npm run lint` — clean.
- `npm run format:check` — clean.
- `npm test` — 15 suites, 172 tests, green.
- `npm run test:frontend` — 7 files, 79 tests, green (covers
  `engine.js` hot paths via the 16-test `engine.test.js` suite).

## Files changed

- `frontend/audio/engine.js` — provenance for
  `LAND_FULL_COVERAGE_THRESHOLD`, expanded `BASE_Q1` / `MAX_Q1`
  comment, lifetime invariant on `ensureCtx`, removed nine dead
  null-checks across `swapBusVoice`, `performGlobalSwap`,
  `startAllSources`, `rafLoop`, and `seekLoop`.
- `frontend/config.js` — JSDoc `@typedef` blocks for `StateConfig`,
  `StateRuntime`, `StateEls`; deleted `getWebSocketURL` wrapper.
- `frontend/websocket.js` — import and call site switched from
  `getWebSocketURL` to `buildWsUrl`.
- `docs/devlog/M5/2026-04-29-M5-occam-razor-group-b.md` — new
  (this entry).
- `docs/DEVLOG.md` — index row added.
