# 2026-04-23 — Refactor: Unify Accent Color to Mint `#5CFFC8`

Prior to this change the UI carried two neighboring cyan-green
accent shades:

- `--color-accent: #4ecdc4` — used by the play button (idle icon,
  active background, active border), the loop-progress bar fill
  and handle, the WebSocket status dot, and the `.floating-btn`
  hover / focus interaction states (via hardcoded
  `rgba(78, 205, 196, α)` alpha variants).
- `#5cffc8` — hardcoded only on the volume slider. Commit `9a6ee38`
  had deliberately kept the slider literal and the global token
  divergent under the rationale "slider is high-density and should
  read as extra-interactive."

The user has stated a clear aesthetic preference for the mint
(`#5CFFC8`), so this commit unifies the UI on that color and
supersedes the `9a6ee38` differentiation rationale. No behavior
change; every reference that previously painted cyan now paints
mint, and the code now has one source of truth per color channel.

## Changes

### `frontend/style.css`

**Tokens in `:root`:**

- `--color-accent: #4ecdc4;` → `--color-accent: #5cffc8;`
- Added `--color-accent-rgb: 92 255 200;` (space-separated triplet
  per CSS Color Module Level 4), consumed by `rgb(var(...) / α)`
  wherever a translucent variant of the accent is needed.

**Follow-through substitutions (same color, now routed through the
token):**

- `.floating-btn:hover` — `rgba(78, 205, 196, 0.18)` and
  `rgba(78, 205, 196, 0.5)` → `rgb(var(--color-accent-rgb) / 0.18)`
  and `rgb(var(--color-accent-rgb) / 0.5)`.
- `.floating-btn:focus-visible` — `rgba(78, 205, 196, 0.25)` →
  `rgb(var(--color-accent-rgb) / 0.25)`.
- Volume slider `#5cffc8` literals (5 occurrences across the
  Webkit gradient, Webkit thumb, Moz range-progress, and Moz thumb
  rules) → `var(--color-accent)`.
- Volume slider `rgba(92, 255, 200, α)` literals (6 occurrences
  across hover / active / focus-visible, Webkit + Firefox each) →
  `rgb(var(--color-accent-rgb) / α)`.
- Block comment above the volume slider no longer says "Thumb is
  10 px mint …" (the UI is now uniformly mint, so the single-use
  descriptor was misleading) — now reads "10 px accent-colored".

### Untouched

- `--color-accent-info` (`#4fc3f7`, cyan-blue) — semantic
  "per-grid mode" indicator, different channel; stays.
- `--color-danger` (`#ff6b6b`, red) — errors / disconnected; stays.
- All text / background / divider / panel tokens — unrelated.
- Every other HTML / JS / audio path — unrelated.

## Browsers affected

`rgb(r g b / α)` modern CSS color syntax requires Chromium 88+,
Firefox 113+, Safari 15+. The project already uses Mapbox GL JS
3.x, `backdrop-filter`, and `:focus-visible`, all of which
require newer versions than that, so this change does not
raise the browser-compat floor.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (server-side only; no
  server changes).
- `curl http://localhost:3000/style.css`:
    - Serves `--color-accent: #5cffc8` and
      `--color-accent-rgb: 92 255 200`.
    - No remaining `#4ecdc4`, `rgba(78, 205, 196,`, or `#5cffc8`
      string literals outside the token definitions themselves.
- Browser A/B left to the user's reload on the running dev server.
  Expected:
    - Play button (top-right): idle icon + active background
      shift from cyan toward mint.
    - Panel hamburger toggle / play button hover tint and focus
      ring use the same mint family (alpha values unchanged).
    - Loop-progress bar fill and handle (bottom of screen):
      mint instead of cyan.
    - WebSocket "connected" status dot: mint instead of cyan.
    - Volume slider: visually unchanged (it was already mint);
      the internal CSS just stopped carrying the color as
      literals.

## Design Decisions / Tradeoffs

- **Alpha-variant token (`--color-accent-rgb`).** Simpler
  alternative would have been keeping the hardcoded `rgba(92,
  255, 200, α)` strings in place and only changing
  `--color-accent`. But that would reproduce the
  "adjust-in-many-places" problem in reverse — any future accent
  retune would require hand-editing 9 rgba literals. The space-
  separated RGB triplet + `rgb(var(...) / α)` pattern is the
  idiomatic modern-CSS way to share one color across hex and
  alpha sites.
- **Supersedes `9a6ee38`'s slider-divergent decision.** That
  commit's rationale (slider uses mint for emphasis because the
  rest is cyan) is materially obsolete once the rest becomes
  mint. Kept the commit in history (per CLAUDE.md's "no history
  rewrites"); this devlog explicitly supersedes it.
- **Status dot swept up with the rest.** The WebSocket
  "connected" dot also moves from cyan to mint. It shares the
  `--color-accent` token with the play button; splitting them
  into two tokens ("accent for audio controls" vs. "accent for
  ok indicators") is over-engineering for a 6 px dot. If the user
  prefers a distinct shade for it later, hardcoding is a one-line
  follow-up.

## Rollback

Two layers:

1. **Swap back to cyan** — set `--color-accent: #4ecdc4;` and
   `--color-accent-rgb: 78 205 196;`. Every consumer updates
   automatically. Two-line diff.
2. **Git revert** — single commit reverses the color swap and
   the structural refactor (literal → token) in one step.

## Files Changed

- **Modified**: `frontend/style.css` — 1 token retune, 1 new
  token, 13 hex / rgba literals swapped to token references, 1
  comment fix.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
