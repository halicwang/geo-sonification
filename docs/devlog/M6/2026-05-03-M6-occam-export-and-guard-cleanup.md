# 2026-05-03 — Refactor: Occam Sweep — Drop Redundant Body Guard, Narrow load-env Exports, Inline Weight-Mode Set

A second small Occam pass on `server/`, complementing the earlier 1a12db2 sweep. Three sites identified by grep evidence:

1. `routes.js` — over-defensive `req.body` type check after `express.json()`.
2. `load-env.js` — two exports never imported anywhere outside the file.
3. `config.js` — a `Set` constructed for a single startup membership check.

Bundled into one commit per the project's "one commit per Occam Group" policy.

## Why

Each site has a concrete reason it can shrink without risk:

### routes.js

```js
const body = req.body && typeof req.body === 'object' ? req.body : {};
```

`server/index.js:184` calls `app.use(express.json())`, which guarantees `req.body` is an object on the request — populated for valid JSON, `{}` for empty body. The triple `&& typeof === 'object'` is redundant after the middleware runs. The line below already validates the actual shape (`Array.isArray(body.bounds) && body.bounds.length === 4`), which is the boundary that matters.

### load-env.js exports

Current `module.exports`: `{ DEFAULT_ENV_PATH, stripInlineComment, parseEnvContent, loadEnvFile }`.

Grep evidence (`grep -rn "stripInlineComment\|DEFAULT_ENV_PATH" --include="*.js"`):

- `stripInlineComment` — only used internally by `decodeQuotedValue` (line 52). Zero external callers, zero test references.
- `DEFAULT_ENV_PATH` — only used as the default parameter for `loadEnvFile`. Zero external callers, zero test references.
- `parseEnvContent` — used by `__tests__/load-env.test.js:8`. Keep.
- `loadEnvFile` — used by `config.js:11`. Keep.

Smaller export surface = smaller refactor blast radius later.

### config.js LAND_FRACTION_WEIGHT_MODES

```js
const LAND_FRACTION_WEIGHT_MODES = new Set(['identity', 'linear', 'sqrt', 'pow']);
if (!LAND_FRACTION_WEIGHT_MODES.has(LAND_FRACTION_WEIGHT_MODE)) {
    console.error(
        `... Must be one of: ${Array.from(LAND_FRACTION_WEIGHT_MODES).join(', ')}`
    );
    process.exit(1);
}
```

Four-element membership check that runs exactly once at boot. The `Set` adds zero benefit over `[...].includes(x)` and forces an extra `Array.from()` for the error message. Inline literal is shorter and reads the same.

## What changed

### routes.js

```js
// before
const body = req.body && typeof req.body === 'object' ? req.body : {};
// after
const body = req.body;
```

The downstream `Array.isArray(body.bounds)` check returns 400 if `body.bounds` is missing (which is exactly what would happen with an empty `{}` from express.json), so the fallback `|| {}` is also unnecessary.

### load-env.js

```js
// before
module.exports = { DEFAULT_ENV_PATH, stripInlineComment, parseEnvContent, loadEnvFile };
// after
module.exports = { parseEnvContent, loadEnvFile };
```

`DEFAULT_ENV_PATH` and `stripInlineComment` remain defined at module scope — only the export entries are removed.

### config.js

```js
// before
const LAND_FRACTION_WEIGHT_MODES = new Set(['identity', 'linear', 'sqrt', 'pow']);
if (!LAND_FRACTION_WEIGHT_MODES.has(LAND_FRACTION_WEIGHT_MODE)) {
    console.error(
        `ERROR: Invalid LAND_FRACTION_WEIGHT_MODE "${LAND_FRACTION_WEIGHT_MODE}". ` +
            `Must be one of: ${Array.from(LAND_FRACTION_WEIGHT_MODES).join(', ')}`
    );
    process.exit(1);
}
// after
const ALLOWED_LAND_FRACTION_WEIGHT_MODES = ['identity', 'linear', 'sqrt', 'pow'];
if (!ALLOWED_LAND_FRACTION_WEIGHT_MODES.includes(LAND_FRACTION_WEIGHT_MODE)) {
    console.error(
        `ERROR: Invalid LAND_FRACTION_WEIGHT_MODE "${LAND_FRACTION_WEIGHT_MODE}". ` +
            `Must be one of: ${ALLOWED_LAND_FRACTION_WEIGHT_MODES.join(', ')}`
    );
    process.exit(1);
}
```

Renamed to `ALLOWED_*` to make the role read like a whitelist; otherwise behavior identical.

## Verification

### Static gates

- `npm test` (Jest server) — full suite green.
- `npm run lint` clean.

### Live request smoke (`/api/viewport`)

Server booted on `PORT=3399`. Hit the route with three malformed bodies; all returned 400 with the existing error message:

- empty JSON `{}` → 400 `"HTTP bounds must be an array: [west, south, east, north]"`
- `{"bounds": "not-an-array"}` → 400 (Array.isArray fails)
- `{"bounds": [1, 2, 3]}` → 400 (length !== 4)

A valid bounds payload (`[-180, -85, 180, 85]`) still returns 200 with stats. No regression in the boundary validation despite removing the inner type guard.

## Files changed

- **Modified** `server/routes.js` — drop redundant body type check at line 73.
- **Modified** `server/load-env.js` — narrow `module.exports` to `{ parseEnvContent, loadEnvFile }`.
- **Modified** `server/config.js` — replace `LAND_FRACTION_WEIGHT_MODES` Set with `ALLOWED_LAND_FRACTION_WEIGHT_MODES` array; reuse the same name in the error message.
- **Added** `docs/devlog/M6/2026-05-03-M6-occam-export-and-guard-cleanup.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index entry at the top of `## Entries`.
