# syntax=docker/dockerfile:1
#
# Production image for the geo-sonification Node.js backend (viewport
# aggregation + WebSocket stream). Intended to run on Fly.io or any
# PaaS that supplies a `PORT` env var; front-end and large static
# assets are served separately (Cloudflare Pages + R2).
FROM node:20-alpine

WORKDIR /app

# Install server dependencies using the lockfile under server/.
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev

# Copy server source and raw CSVs (cache is rebuilt in the next step).
COPY server/ ./server/
COPY data/raw/ ./data/raw/

# Pre-warm the spatial index cache so cold starts don't block 10-30s
# re-parsing CSVs on every machine start. loadGridData() writes
# data/cache/all_grids.json and data/cache/normalize.json.
RUN node -e "require('./server/data-loader').loadGridData().then(() => console.log('[docker] spatial cache warmed')).catch((err) => { console.error('[docker] cache warmup failed:', err); process.exit(1); })"

# Fly.io injects PORT; 8080 is a local docker-run default.
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/index.js"]
