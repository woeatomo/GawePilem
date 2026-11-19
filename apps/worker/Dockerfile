# Worker render & AI job (BullMQ + FFmpeg). Build dari root repo:
#   docker build -f apps/worker/Dockerfile -t atomo-worker .
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-ibm-plex ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
# Manifest web ikut disalin supaya lockfile workspace valid; kodenya tidak.
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter "@atomo/worker..." \
 && mkdir -p /app/.media && chown -R node:node /app/.media
ENV NODE_ENV=production
USER node
WORKDIR /app/apps/worker
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node_modules/.bin/tsx", "src/index.ts"]
