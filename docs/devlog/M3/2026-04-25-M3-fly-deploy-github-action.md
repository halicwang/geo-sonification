# 2026-04-25 — Feature: Fly.io Auto-Deploy via GitHub Action

Add `.github/workflows/fly-deploy.yml` so every push to `main` that
touches `server/**`, `data/raw/**`, the Docker recipe, or `fly.toml`
runs `flyctl deploy --remote-only` followed by a public `/health`
smoke probe. Frontend-only and docs-only commits no longer require a
manual `fly deploy`.

## Why now

The four-step manual deploy in `docs/DEPLOYMENT.md` was already
flagged as a TODO ("GitHub Actions → Fly.io"). Today's grid drag-perf
push landed three commits that needed `fly deploy` (gzip middleware,
debounce tuning, ws perMessageDeflate) — three context switches that
each took 3-5 minutes. Automating this removes the friction without
introducing flaky-CI risk: the workflow uses Fly's own `--remote-only`
builder, so local toolchain drift can't break the build.

## What the workflow does

**Trigger filter (`paths:`):** any of `server/**`, `data/raw/**`,
`Dockerfile`, `.dockerignore`, `fly.toml`, or the workflow file
itself. Frontend-only commits (e.g. `frontend/config.js`,
`frontend/map.js` — see today's `perf(frontend)` commits) and
docs-only commits skip the workflow entirely. `workflow_dispatch` is
also enabled so an operator can manually re-run a deploy after fixing
a secret or rolling back via the Fly dashboard.

**Concurrency**: `group: fly-deploy`, `cancel-in-progress: false`. Two
back-to-back pushes queue rather than racing, but the in-flight
deploy is never aborted mid-rollout. (Fly itself rolls one machine at
a time on a single-machine app, so a cancel mid-deploy could leave
the registry pointing at a half-pushed image.)

**Steps:**
1. `actions/checkout@v4` — full repo, including `data/raw/`.
2. `superfly/flyctl-actions/setup-flyctl@master` — installs the same
   `flyctl` your local machine uses.
3. `flyctl deploy --remote-only` — uses Fly's remote builder; image
   build runs in Fly's infra, so the pre-warm step in the Dockerfile
   that pulls in `data-loader` continues to work the same way it did
   for `fly deploy` from a laptop.
4. **Smoke test**: 6 attempts × 10 s spacing of
   `https://placeecho-geo-sonification.fly.dev/health`, requiring
   `"dataLoaded":true` in the response body. The grace window covers
   the suspend-resume cold-start path (`auto_stop_machines = "suspend"`
   in `fly.toml`).

**Required secret**: `FLY_API_TOKEN`, generated locally with
`fly tokens create deploy -x 999999h` and pasted into GitHub repo
settings → Secrets and variables → Actions.

## What it does not change

- The existing `.github/workflows/ci.yml` (commitlint + lint + format
  + test on every push/PR) is untouched. Concerns of correctness vs.
  delivery stay separated — a deploy never blocks on or contaminates
  the test matrix.
- Manual `fly deploy` from a laptop still works for emergency
  rollbacks (`fly deploy --image registry.fly.io/...:<old-sha>`) or
  for testing a Dockerfile change without a commit. The workflow
  doesn't claim exclusive ownership of the Fly app.
- Cloudflare Pages, R2 uploads, and the Worker proxy are out of
  scope for this workflow — Pages auto-deploy is configured on the
  Cloudflare side (separate devlog), and R2/Worker remain manual
  because they change too rarely to justify automation.

## Verification

After landing this commit, push to a branch and verify the workflow
runs only when paths match. Then push to `main` (with the secret
configured) — the deploy should complete in ~3-5 minutes and the
smoke test should hit `/health` once the new machine is up.

## Files changed

- `.github/workflows/fly-deploy.yml` — new workflow.
- `docs/DEVLOG.md` — index entry for this devlog.
