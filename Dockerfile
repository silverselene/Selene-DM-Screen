# syntax=docker/dockerfile:1.7

# ─── Build stage ──────────────────────────────────────────────────────────
# Debian-slim instead of alpine: pnpm-workspace.yaml's platform-binary
# overrides currently exclude the musl variants of rollup / esbuild /
# lightningcss / @tailwindcss/oxide. node:24-bookworm-slim ships glibc, which
# matches the linux-x64-gnu binaries that aren't excluded.
FROM node:24-bookworm-slim AS build

# Corepack is bundled with node 24; use it to materialise the exact pnpm
# version pinned by the lockfile.
RUN corepack enable

WORKDIR /app

# Copy the manifest set first so the dependency-resolution layer cache
# survives source-only edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/dm-screen/package.json ./artifacts/dm-screen/
COPY scripts/package.json ./scripts/

# `--frozen-lockfile` fails the build if the lockfile would drift; that's
# what we want for reproducible images.
RUN pnpm install --frozen-lockfile

# Everything else (source, tsconfigs, vite config, public assets, generated
# data files). .dockerignore keeps node_modules / .git / dist out.
COPY . .

# Default PORT/BASE_PATH are fine; the build step is environment-free since
# Phase 4 made those env vars optional.
RUN pnpm run build

# ─── Runtime stage ────────────────────────────────────────────────────────
# nginx:alpine is the smallest battle-tested static server. The runtime
# stage has no node deps so musl is fine here even though the build stage
# couldn't use it.
FROM nginx:alpine AS runtime

# Drop the default site and install a SPA-aware one.
COPY artifacts/dm-screen/docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built assets. dm-screen builds into dist/public/.
COPY --from=build /app/artifacts/dm-screen/dist/public /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
