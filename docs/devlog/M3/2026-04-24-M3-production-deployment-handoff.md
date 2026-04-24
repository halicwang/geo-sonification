# 2026-04-24 — Milestone: Production Deployment Handoff

Add `docs/DEPLOYMENT.md` as the single entry-point document for
anyone (human or agent) taking over the production deployment.

## Why now

All four production layers (Pages frontend, R2 large assets, Fly
backend, Worker reverse proxy) are live and smoke-tested at
`https://placeecho.com/geo-sonification/`. The knowledge of how it
all fits together has been accumulating in devlogs across four
commits plus a conversation-only debug trail (Cache Rule pitfall,
audio first-load cost, Mapbox token restriction workflow). Without
a consolidated handoff doc, a new operator would have to reconstruct
state from the Cloudflare dashboard, Fly dashboard, and Git history.
`DEPLOYMENT.md` collapses that into one readable file.

## Contents

- Live URLs with their roles
- Three-layer architecture diagram (Browser → Worker → {Pages, R2,
  Fly}) and the reason each asset lives where it does
- Repository layout of every deployment-relevant file
- Per-layer redeploy commands (copy-paste ready)
- Cloudflare dashboard state that isn't in the repo (DNS record,
  Workers Routes, Cache Rules, R2 CORS, Pages project, Worker)
- Credential/auth table: Mapbox tokens, Fly config, wrangler config,
  `.env.deploy`
- Known issues with mitigations (Cache Rule over-broad, 328 MB audio
  first-load cost, PMTiles Range latency, globe→mercator stutter)
- Outstanding TODOs (narrow Cache Rule, CF Pages ↔ GitHub
  integration, GitHub Actions → Fly, Opus audio re-encoding, PMTiles
  Worker proxy)
- Smoke-test recipes for post-deploy verification
- Operator runbooks for common incidents (site down, token rotation,
  CSV update)

## Why separate from ARCHITECTURE.md

`ARCHITECTURE.md` describes the sound-engine data flow — a concept
that doesn't change across environments. `DEPLOYMENT.md` describes
the production topology, provider-specific config, and the quirks
of each cloud. Keeping them separate means development-time readers
don't wade through Cloudflare/Fly detail, and deploy-time readers
don't have to skim sound-design explanations. Cross-references at
the top of each document point at the other.

## Files changed

- `docs/DEPLOYMENT.md` — new, ~350 lines.
- `README.md` — one-paragraph "Live demo" block pointing at the
  production URL and `DEPLOYMENT.md`.
- `docs/ARCHITECTURE.md` — header gains a cross-reference line to
  `DEPLOYMENT.md`.
- `docs/DEVLOG.md` — index entry for this devlog.
