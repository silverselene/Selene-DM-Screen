# syntax=docker/dockerfile:1.7

# ─── Build stage ──────────────────────────────────────────────────────────
# Debian-slim instead of alpine: pnpm-workspace.yaml's platform-binary
# overrides currently exclude the musl variants of rollup / esbuild /
# lightningcss / @tailwindcss/oxide. node:24-bookworm-slim ships glibc, which
# matches the linux-x64-gnu binaries that aren't excluded.
FROM node:24-bookworm-slim AS build

# Corepack is bundled with node 24; use it to materialise the exact pnpm
# version pinned by root package.json's `packageManager` field (corepack
# reads that field — NOT the lockfile — and verifies its sha512 hash).
# COREPACK_DEFAULT_TO_LATEST=0 makes corepack fail loudly if the pin is
# ever missing instead of silently downloading whatever pnpm is newest
# that day — an unpinned package manager would undercut the
# minimumReleaseAge supply-chain gate the workspace enforces on deps.
ENV COREPACK_DEFAULT_TO_LATEST=0
RUN corepack enable

WORKDIR /app

# Copy the manifest set first so the dependency-resolution layer cache
# survives source-only edits. services/ai-bridge's manifest is copied only so
# `--frozen-lockfile` can validate the full workspace against the lockfile — the
# install below is filtered to exclude it, so its Agent-SDK dependency (and the
# native Claude Code binary it bundles) never enters the image build. The bridge
# is an optional local service, not part of this deployable artifact.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/dm-screen/package.json ./artifacts/dm-screen/
COPY scripts/package.json ./scripts/
COPY services/ai-bridge/package.json ./services/ai-bridge/

# `--frozen-lockfile` fails the build if the lockfile would drift; that's
# what we want for reproducible images. The `--filter`s install only the
# deployable app and the offline data generators — the same dependency set as
# before services/ai-bridge existed.
RUN pnpm install --frozen-lockfile \
  --filter @workspace/dm-screen \
  --filter @workspace/scripts

# Everything else (source, tsconfigs, vite config, public assets, generated
# data files). .dockerignore keeps node_modules / .git / dist out.
COPY . .

# Sub-path deploys (behind a reverse proxy at e.g. /dm/) need the bundle, the
# PWA service-worker scope, and the manifest start_url rebuilt under that base.
# BASE_PATH defaults to "/" so the plain build is unchanged; override it via
# docker-compose's build.args or `docker build --build-arg BASE_PATH=/dm/`.
# vite.config.ts reads process.env.BASE_PATH, so expose the ARG as an env var
# for the build step.
ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}
RUN pnpm run build

# ─── Runtime stage ────────────────────────────────────────────────────────
# nginxinc/nginx-unprivileged:alpine is the official non-root nginx: the
# master process runs as the `nginx` user (uid 101), not root, and the cache
# / pid paths are pre-configured writable for that user. It listens on 8080
# (a non-root user can't bind the privileged port 80), so nginx.conf listens
# on 8080 and compose maps the host port to 8080. The runtime stage has no
# node deps so musl is fine here even though the build stage couldn't use it.
FROM nginxinc/nginx-unprivileged:alpine AS runtime

# Drop the default site and install a SPA-aware one. The security-headers
# snippet is included from inside nginx.conf via a relative path, so it
# has to land next to default.conf in /etc/nginx/conf.d/.
COPY artifacts/dm-screen/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY artifacts/dm-screen/docker/security-headers.conf /etc/nginx/conf.d/security-headers.conf

# Copy the built assets. dm-screen builds into dist/public/.
COPY --from=build /app/artifacts/dm-screen/dist/public /usr/share/nginx/html

EXPOSE 8080

# Healthcheck verifies the SPA shell was actually copied into /usr/share/
# nginx/html — a zero-byte or missing index.html still returns 200, so a
# raw `wget /` would falsely report healthy. Pipe the response body to
# grep for the React mount point that lives in index.html.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/index.html | grep -q 'id="root"' || exit 1
