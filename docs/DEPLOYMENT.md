# Production Deployment — placeecho.com/geo-sonification

This document is the single entry point for anyone (or any agent) that
needs to understand, modify, or repair the production deployment. Read
this before touching anything in Cloudflare, Fly.io, or the deploy
scripts.

---

## Live URLs

| Purpose                 | URL                                               |
| ----------------------- | ------------------------------------------------- |
| **Public entry point**  | https://placeecho.com/geo-sonification/           |
| Cloudflare Pages origin | https://placeecho-geo-sonification.pages.dev      |
| Fly.io backend          | https://placeecho-geo-sonification.fly.dev        |
| R2 large-asset CDN      | https://assets.placeecho.com                      |
| Health check            | https://placeecho-geo-sonification.fly.dev/health |

---

## Architecture

Three layers, three providers — connected by a single-page app that
reads runtime URLs from `window.GEO_SONIFICATION_CONFIG`:

```
Browser (at https://placeecho.com/geo-sonification/)
│
├─ HTML / JS / CSS / cities.json / cities/*.m4a
│    → Worker "placeecho-geo-sonification-proxy"
│      → Pages "placeecho-geo-sonification" (frontend/ + dist/data/cities.json)
│
├─ grids.pmtiles (177 MB, Range requests)
├─ audio/ambience/*.wav (7 × 46 MB)
│    → assets.placeecho.com → R2 bucket "placeecho-assets"
│
└─ /api/config, /api/viewport (HTTP), WebSocket (wss)
     → placeecho-geo-sonification.fly.dev → Fly.io app
       → node server/index.js (single port; data/raw/ baked in image,
         cache warmed at image build time)
```

Routing to `/geo-sonification/` is done by a 30-line reverse-proxy
Worker because Cloudflare Pages custom domains cannot bind a path
prefix. The Worker strips the prefix and forwards everything else
verbatim to the Pages origin. API and R2 traffic bypass the Worker
entirely (direct browser → fly.dev / assets.placeecho.com).

### Why this split

| Concern                                                | Where it lives                  | Reason                                                                |
| ------------------------------------------------------ | ------------------------------- | --------------------------------------------------------------------- |
| Static HTML/JS/CSS (~5 MB)                             | Cloudflare Pages                | Free tier, fast edge, trivial deploys                                 |
| PMTiles + ambience WAVs (~500 MB)                      | Cloudflare R2                   | Pages has a 25 MB per-file cap; R2 egress is free                     |
| Node.js + WebSocket + 17k-grid in-memory spatial index | Fly.io (256→512 MB VM)          | Workers have a 128 MB isolate cap; `ws` package can't bind in isolate |
| `/geo-sonification/*` path prefix on `placeecho.com`   | Cloudflare Worker reverse proxy | Pages custom domains don't support subpaths                           |

---

## Repository layout (deployment-relevant files)

```
.env.deploy            ← gitignored; holds production Mapbox token + URLs
.env.deploy.example    ← template, check in
Dockerfile             ← Fly.io image recipe; bakes data/raw/ + pre-warms cache
.dockerignore          ← excludes frontend/, docs/, tests, etc.
fly.toml               ← Fly.io app config (app name, region, VM size, health check)
scripts/build-pages.js ← generates dist/ for Pages (frontend/ + cities.json + config.runtime.js)
workers/geo-sonification-proxy/
  ├── worker.js        ← reverse-proxy source
  └── wrangler.toml    ← declares the two Workers Routes on placeecho.com
server/                ← Node.js backend (runs on Fly)
frontend/              ← static site (deployed to Pages)
frontend/config.runtime.js  ← empty placeholder in repo; regenerated at build
dist/                  ← gitignored build output (Pages deploy root)
```

---

## How to re-deploy each layer

Pages and Fly auto-deploy on push to `main`. R2 and Worker stay
manual because they change too rarely to justify automation. The
manual `wrangler` / `fly deploy` paths below remain valid for
emergency rollbacks and out-of-band testing.

### Pages (frontend) — **auto-deploys on push to `main`**

Cloudflare Pages is connected to `halicwang/geo-sonification` via the
Pages dashboard (Settings → Builds & deployments → Connect to Git).
Every push to `main` triggers `node scripts/build-pages.js` followed
by an atomic Pages deployment; pull requests get preview URLs.

The five build env vars (`MAPBOX_TOKEN` encrypted, `BASE_PATH`,
`API_BASE`, `WS_URL`, `ASSET_BASE`) live on the Pages project under
Settings → Environment variables (Production). Updating any of them
requires a CF dashboard edit followed by a re-deploy from the
"Deployments" tab.

**Manual / emergency deploy** (e.g. to test a build locally without
committing, or to re-deploy after a CF outage):

```bash
node scripts/build-pages.js                                         # produces dist/
wrangler pages deploy dist/ --project-name=placeecho-geo-sonification \
  --branch=main --commit-dirty=true
```

Auto-build takes ~30 s end-to-end. No downtime — Pages serves atomic
deployments.

### Fly.io (backend) — **auto-deploys on push to `main`**

`.github/workflows/fly-deploy.yml` runs `flyctl deploy --remote-only`
on every push that touches `server/**`, `data/raw/**`, the Docker
recipe, or `fly.toml`. Frontend-only and docs-only commits skip the
workflow via the path filter. Concurrency group `fly-deploy`
serializes deploys without cancelling an in-flight rollout.
Post-deploy, the workflow polls `/health` until it returns
`"dataLoaded":true` (or fails after 60 s).

The required `FLY_API_TOKEN` GitHub secret is created with
`fly tokens create deploy -x 999999h` and pasted into repo Settings
→ Secrets and variables → Actions.

**Manual / emergency deploy** (e.g. to roll back to an earlier
image, or to redeploy after a token rotation while waiting on the
Action to pick up the new secret):

```bash
fly deploy                                                          # from project root
```

Or trigger the same Action manually from GitHub: Actions → "Fly
Deploy" → Run workflow.

Auto-deploy takes 3-5 minutes. Health-check (`/health`) gates the
new machine.

### R2 (large assets) — **manual**

Needed only when PMTiles rebuilt or ambience files change. Updates
happen at most a handful of times per project lifetime; the
185 MB PMTiles upload is heavy enough that automating it via a
GitHub Action would burn runner minutes for negligible benefit.

```bash
# PMTiles (tippecanoe-built; regenerate with: npm --prefix server run build:tiles)
wrangler r2 object put placeecho-assets/tiles/grids.pmtiles \
  --file=data/tiles/grids.pmtiles \
  --content-type="application/octet-stream" \
  --cache-control="public, max-age=31536000, immutable" \
  --remote

# Ambience Opus files (7 files; encoded by scripts/encode-ambience-opus.sh)
for clip in bare crop forest grass shrub urban water; do
  wrangler r2 object put placeecho-assets/audio/ambience/${clip}.opus \
    --file=frontend/audio/ambience/${clip}.opus \
    --content-type="audio/ogg" \
    --cache-control="public, max-age=31536000, immutable" \
    --remote
done
```

### Worker (reverse proxy) — **manual**

Needed only when `workers/geo-sonification-proxy/worker.js` or
`wrangler.toml` changes (rare — the proxy is 30 lines and has changed
once since launch).

```bash
cd workers/geo-sonification-proxy && wrangler deploy
```

---

## Cloudflare dashboard state (not in repo)

Things configured via the CF dashboard that new agents/operators need
to know exist:

- **Zone `placeecho.com`**
    - **DNS record**: `A @ 192.0.2.1` **proxied** (orange cloud).
      Placeholder IP; all traffic goes through the Worker. Replace with
      a real origin when placeecho.com main site is built.
    - **Workers Routes**:
        - `placeecho.com/geo-sonification` → `placeecho-geo-sonification-proxy`
        - `placeecho.com/geo-sonification/*` → `placeecho-geo-sonification-proxy`
    - **Cache Rules** (under Caching → Cache Rules):
        - `Cache R2 assets` — Custom filter on `hostname == assets.placeecho.com`;
          Edge TTL 1 month, Browser TTL 1 day; **⚠️ see Known Issues** — this
          rule is currently over-broad and needs to be narrowed to
          `/audio/*` only (PMTiles under this rule trigger 177 MB whole-file
          prefetches that block other requests).
- **R2 bucket `placeecho-assets`**
    - Custom Domain: `assets.placeecho.com` (auto-managed DNS + cert).
    - CORS policy: `AllowedOrigins = [https://placeecho.com, http://localhost:3000]`,
      `Methods = GET, HEAD`, `Headers = Range, If-Match, If-None-Match`,
      `ExposeHeaders = Content-Length, Content-Range, ETag, Accept-Ranges`.
- **Pages project `placeecho-geo-sonification`**
    - Production branch: `main`.
    - **Connected to `halicwang/geo-sonification`** — every push to
      `main` triggers `node scripts/build-pages.js` and an atomic
      deploy. PRs get preview URLs.
    - Build env vars (Production): `MAPBOX_TOKEN` (Encrypted),
      `BASE_PATH=/geo-sonification`,
      `API_BASE=https://placeecho-geo-sonification.fly.dev`,
      `WS_URL=wss://placeecho-geo-sonification.fly.dev`,
      `ASSET_BASE=https://assets.placeecho.com`.
- **Worker `placeecho-geo-sonification-proxy`**
    - Source and route bindings live in
      `workers/geo-sonification-proxy/wrangler.toml` and deploy from there.

---

## Credentials and auth

| What                                     | Where                                                                                        | Rotation                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mapbox production token (`pk.eyJ1…549Q`) | Embedded in `dist/config.runtime.js` at build time; source is `.env.deploy`'s `MAPBOX_TOKEN` | Mapbox dashboard → Access Tokens → `placeecho-geo-sonification` → Refresh. URL-restricted to `https://placeecho.com` and `http://localhost:3000`, `:8080`. |
| Mapbox default token                     | `frontend/config.local.js` (local dev only); **not** URL-restricted, **not** deployed        | Unchanged; used for `npm start` on localhost.                                                                                                              |
| Fly.io auth                              | `~/.fly/config.yml` (from `fly auth login`)                                                  | `fly tokens create deploy -x 999999h` for CI.                                                                                                              |
| Cloudflare auth (wrangler)               | `~/Library/Preferences/.wrangler/config/default.toml` (from `wrangler login`)                | OAuth; scopes listed in that file. Missing `zone_rulesets:edit`, so Cache Rules must be edited via the dashboard.                                          |
| `.env.deploy`                            | Local only, gitignored                                                                       | Regenerate from `.env.deploy.example` + real values.                                                                                                       |

---

## Known issues (as of 2026-04-24)

1. **Cache Rule is too broad** — the `Cache R2 assets` rule currently
   matches `hostname == assets.placeecho.com`. Cloudflare's default
   behavior for files under 512 MB is to prefetch the _entire_ object
   on the first Range request before returning a slice. For the 177 MB
   PMTiles this means the first viewport request on a cold edge pulls
   177 MB from R2 into cache, starving concurrent audio/asset fetches.
   **Fix**: narrow the filter to `hostname == assets.placeecho.com AND
starts_with(path, "/audio/")`. PMTiles then bypass cache and Range
   requests go straight to R2 (~50 ms/tile, acceptable); audio still
   hits cache after first fetch.

2. **First-load audio is 328 MB** — seven ambience WAVs at 46.8 MB
   each, served as uncompressed 48 kHz stereo. On a US residential
   100 Mbps link this is ~25-30 s; on college/hotel WiFi it can
   approach a minute. Compressing to Opus 128 kbps should land under
   ~4 MB per file (~28 MB total, ~10× reduction) without audibly
   degrading the ambient textures. Requires re-encoding via ffmpeg,
   updating `audio-engine.js` to request `.opus` (or transparently
   content-negotiate), re-uploading to R2.

3. **Grid tiles still noticeably slower than localhost** — even with
   the cache rule narrowed, Range requests to R2 cost 40-80 ms at a US
   edge (vs. ~0 ms on localhost). Stalls are most visible when
   switching between globe and mercator projections (Mapbox refetches
   the full tile set). Potential mitigations: Cloudflare Worker that
   proxies PMTiles requests and caches individual Ranges via the
   Workers Cache API (avoids the 512 MB full-file prefetch behavior);
   or a smaller PMTiles (rebuild at coarser zoom) if the project can
   tolerate less detail.

4. **Globe → mercator switch stutter** — unrelated to network; see
   `frontend/map.js` `GLOBE_ZOOM_CUTOFF`. Mapbox rebuilds tile
   coverage on projection change.

---

## TODO (not yet done)

- [ ] **Narrow the Cache Rule filter** to `/audio/*` (known issue #1 above).
- [x] ~~**CF Pages ↔ GitHub integration**~~ — done 2026-04-25; Pages
      project is connected to `halicwang/geo-sonification` with the
      five build env vars wired up.
- [x] ~~**GitHub Actions → Fly.io**~~ — done 2026-04-25;
      `.github/workflows/fly-deploy.yml` runs `flyctl deploy
--remote-only` on push to `main` for backend-relevant paths.
- [x] ~~**Opus-encode ambience WAVs**~~ — done 2026-04-24, see
      `docs/devlog/M3/2026-04-24-M3-ambience-opus-encoding.md`.
- [ ] **PMTiles Worker proxy** for per-Range caching (known issue #3 above).

---

## Smoke tests (run these after any deploy)

```bash
# Backend
curl -sS https://placeecho-geo-sonification.fly.dev/health
# → {"ok":true,"dataLoaded":true}

curl -sS https://placeecho-geo-sonification.fly.dev/api/config
# → JSON with gridSize + 11-class landcoverMeta

# R2 (Range request support + CORS)
curl -sS -I -H "Range: bytes=0-1023" https://assets.placeecho.com/tiles/grids.pmtiles
# → HTTP/2 206, content-range: bytes 0-1023/185481683

curl -sS -I -H "Origin: https://placeecho.com" \
  https://assets.placeecho.com/audio/ambience/forest.wav
# → HTTP/2 200, access-control-allow-origin: https://placeecho.com

# Worker proxy + Pages
for p in / main.js config.runtime.js data/cities.json audio/cities/new-york.m4a; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "https://placeecho.com/geo-sonification/$p")
  echo "$code  /geo-sonification/$p"
done
# → all 200 (root 200 after 308 redirect from /geo-sonification)

# End-to-end WebSocket
node -e "
  const WS = require('ws');
  const ws = new WS('wss://placeecho-geo-sonification.fly.dev');
  ws.on('open', () => ws.send(JSON.stringify({type:'viewport', bounds:[-60,-15,-50,-5], zoom:4})));
  ws.on('message', (m) => { console.log(JSON.parse(m).type); ws.close(); process.exit(0); });
"
# → 'stats'
```

---

## Operator runbooks

### "The site is down — where do I look first?"

1. `curl https://placeecho.com/geo-sonification/` — 5xx means Worker,
   Pages, or the whole Cloudflare stack is failing. `curl https://
placeecho-geo-sonification.pages.dev/` to isolate Pages vs. Worker.
2. `curl https://placeecho-geo-sonification.fly.dev/health` — non-200
   means the Fly machine is down or dataLoaded is false (mid-boot).
   `fly logs` for details; `fly machine list` to see status.
3. If Fly is fine but API calls fail from the browser, suspect the
   CORS `ALLOWED_ORIGINS` env var (`fly.toml`) or the Worker's proxy.

### "I need to update the Mapbox token"

1. Mapbox dashboard → rotate `placeecho-geo-sonification` token.
2. Edit `.env.deploy` locally with new token.
3. `node scripts/build-pages.js && wrangler pages deploy dist/ --project-name=placeecho-geo-sonification --branch=main --commit-dirty=true`.

### "I need to update a grid CSV"

1. Drop new CSV into `data/raw/`.
2. `fly deploy` — the Docker build re-runs data-loader, generates a
   new cache, bakes into the image.
