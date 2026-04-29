# 2026-04-29 — Refactor: cloneSnapshot Audit and Removal

Closes the deferred item from
[Group C](2026-04-29-M5-occam-razor-group-c.md). The HTTP client-state
snapshot was clone-on-read and clone-on-write; an evidence-based audit
shows neither clone is earning rent. Removed both, plus the isolation
test that asserted the now-removed defense. ~20 LOC net reduction.

## Why now

Group C deferred this because the call-graph audit at the time was
inconclusive. A focused audit run with `grep` over `server/` clears
the ambiguity:

- **All `lcFractions[` accesses** (only 2):
  [audio-metrics.js:145](../../../server/audio-metrics.js)
  (`prev.lcFractions[index]`, read) and
  [audio-metrics.js:184](../../../server/audio-metrics.js)
  (`Number.isFinite(lcFractions[i]) ? lcFractions[i] : 0`, read).
- **All `lcFractions.push/pop/shift/unshift/splice/fill/copyWithin/reverse/sort` calls**: zero matches.
- **All `previousSnapshot` writes** (only 1):
  [viewport-processor.js:119](../../../server/viewport-processor.js)
  `clientState.previousSnapshot = delta.snapshot` — property
  reassignment, not array mutation.

No code anywhere mutates the `lcFractions` array. The clones were
defending against a class of mistake that does not exist in the
current codebase, with no test ever asserting actual mutation —
only the isolation test (deleted) which manually constructed the
threat to verify the defense.

This is the same pattern Groups A/B/C cut: defensive code that
defends against scenarios the dataflow makes impossible.

## What the audit found

### Read side: already isolated by `normalizeSnapshot`

[`computeDeltaMetrics`](../../../server/audio-metrics.js) is the
only consumer of `previousSnapshot`. Its first action is
`normalizeSnapshot(previousSnapshot)`, which returns
`{ lcFractions: normalizeLcArray(snapshot.lcFractions) }` — a fresh
array via `LC_CLASS_ORDER.map(...)`. The internal `prev` is fully
decoupled from the caller's snapshot. The read clone added a second
layer of isolation that this boundary already provided.

### Write side: input is always freshly allocated

`saveHttpClientState` is called from
[routes.js:86](../../../server/routes.js) right after
`processViewport`. At that point, `state.previousSnapshot` was
reassigned (not mutated) to `delta.snapshot` in
[viewport-processor.js:119](../../../server/viewport-processor.js).
`delta.snapshot.lcFractions === current === normalizeLcArray(...)` —
a freshly-allocated array with no aliases outside the local
`processViewport` scope. Storing it in the Map by reference is
safe; the caller's `state` variable goes out of scope immediately
after the response.

### Test was asserting the defense, not behavior

[`mutating returned state does not bleed into stored entry (deep
clone)`](../../../server/__tests__/client-state.test.js) (removed)
manually wrote `first.previousSnapshot.lcFractions[0] = 999` and
asserted the Map entry was unaffected. No production code does
this; the test constructed the threat to verify the now-removed
defense. Same shape as Group C's removed `handles null input`
test — a defensive test, not a behavior test.

## Why it's safe

| Concern | Resolution |
|---|---|
| Mutator path exists today? | No — grep across `server/` finds zero array-mutator calls on `lcFractions`. |
| Future contributor adds mutator? | The new JSDoc on `getHttpClientState` documents the contract: callers MUST NOT mutate `lcFractions`. The natural style in this codebase is reassignment (`state.previousSnapshot = newSnapshot`); index-assignment would be out of style. |
| Concurrent requests for same client? | Node single-threaded; HTTP handlers run synchronously to completion. No interleaving between `getHttpClientState` and `saveHttpClientState`. |
| Map entry holds the only outstanding reference? | Yes — `delta.snapshot` is freshly allocated in `computeDeltaMetrics` with no other aliases by the time `saveHttpClientState` runs. |
| `cloneSnapshot`'s validation (returns null on malformed input)? | All reachable inputs are either `null` (initial state) or `{ lcFractions: [11 numbers] }` (from `delta.snapshot`); the validation never fires in production. |

The comment on `getHttpClientState` makes the boundary explicit
("returned `previousSnapshot` shares its reference with the Map
entry — callers MUST NOT mutate"), so the contract is documented
where future contributors will look first.

## Verification

- `npm run lint` — clean.
- `npm run format:check` — clean.
- `npm test` — 15 suites, 170 tests, green (was 171; removed the
  isolation test).
- `npm run test:frontend` — 7 files, 79 tests, green.

The remaining `persists and restores both currentMode and
previousSnapshot in one entry` test (line 152) still validates
read-write correctness, so the persistence contract has coverage.

## Files changed

- `server/client-state.js` — deleted `cloneSnapshot` function;
  simplified `getHttpClientState` (return Map's snapshot reference
  directly) and `saveHttpClientState` (store reference directly).
  Added contract note to `getHttpClientState` JSDoc and a
  freshness note to `saveHttpClientState` JSDoc.
- `server/__tests__/client-state.test.js` — deleted `mutating
  returned state does not bleed into stored entry` test (asserted
  the now-removed defense).
- `docs/devlog/M5/2026-04-29-M5-clonesnapshot-audit-removal.md` —
  new (this entry).
- `docs/DEVLOG.md` — index row added.
