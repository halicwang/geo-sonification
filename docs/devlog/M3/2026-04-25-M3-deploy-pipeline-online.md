# 2026-04-25 — Design: Deploy Pipeline Online (Pages + Fly Auto-Deploy)

Refresh `docs/DEPLOYMENT.md` to reflect the now-live auto-deploy
pipelines for Cloudflare Pages and Fly.io. Pair entry to the Fly
GitHub Action devlog
(`docs/devlog/M3/2026-04-25-M3-fly-deploy-github-action.md`); this
one captures the doc-side changes and the Cloudflare dashboard config
that doesn't live in the repo.

## What's now automatic

- **Cloudflare Pages** — connected to `halicwang/geo-sonification`
  via the Pages dashboard. Every push to `main` runs
  `node scripts/build-pages.js` and atomically deploys `dist/`. PRs
  receive preview URLs at
  `https://<sha>.placeecho-geo-sonification.pages.dev`.
  Build env vars are configured under Pages project Settings →
  Environment variables (Production).
- **Fly.io** — `.github/workflows/fly-deploy.yml` runs
  `flyctl deploy --remote-only` on every push to `main` whose changes
  match `server/**`, `data/raw/**`, the Docker recipe, or `fly.toml`.
  Frontend-only and docs-only commits skip the workflow. Required
  GitHub secret `FLY_API_TOKEN` is created via
  `fly tokens create deploy -x 999999h`.

## What stays manual

- **R2 large assets** (PMTiles, Opus ambience) — updated a handful of
  times per project lifetime; the 185 MB PMTiles upload would burn
  GitHub Actions runner minutes for marginal benefit.
- **Cloudflare Worker reverse proxy** — `worker.js` is 30 lines and
  has changed once since launch; manual `wrangler deploy` is faster
  than the round-trip of editing a workflow file.

These remain documented in the "How to re-deploy each layer" section
with the same `wrangler` / shell commands as before.

## Doc edits

**`docs/DEPLOYMENT.md`:**
- "How to re-deploy each layer" — Pages and Fly sections rewritten
  as "auto-deploys on push to main" with the manual commands kept as
  emergency fallback. R2 and Worker sections clarify why they're
  intentionally not automated.
- "Cloudflare dashboard state" — replace the "Not yet connected to
  GitHub" note on the Pages project with the actual production env
  var matrix.
- "TODO" list — strike through the two now-done items (CF Pages ↔
  GitHub, GitHub Actions → Fly.io). Also strike through "Opus-encode
  ambience WAVs" which landed on 2026-04-24 but had been left
  un-checked.

## Why pair these as one commit

The DEPLOYMENT.md changes describe the intended state (Pages + Fly
both automated). The CF Pages dashboard config is owned by the
operator (it's not committed; see "Cloudflare dashboard state"
section), so the doc must be merged in lockstep with the dashboard
edit. This is intentional: the doc represents what the deployment
*is*, not what it could be.

The Fly workflow file lives in the repo, so its devlog is separate
(see the pair entry). They land back-to-back so a `git log` reader
can follow the full migration in two adjacent commits.

## Files changed

- `docs/DEPLOYMENT.md` — refresh "How to re-deploy each layer", the
  Pages dashboard description, and the TODO checklist.
- `docs/DEVLOG.md` — index entry for this devlog.
