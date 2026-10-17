# syntax=docker/dockerfile:1.4
# ========================================================
# Vargly API + background workers (one image, two commands)
#   API:     node dist/main.js                (default)
#   Worker:  node dist/workers/worker-runner.js
#   Migrate: npx prisma migrate deploy --schema=dist/database/prisma/schema.prisma
# ========================================================

# 1. Base Image
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate
WORKDIR /app

# 2. Dependencies Stage (cached until a manifest or the lockfile changes)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY packages/ui/package.json ./packages/ui/
COPY apps/api/package.json ./apps/api/
# The pnpm store lives in a BuildKit cache, so rebuilds after a lockfile change only download
# what actually changed
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --filter @vargly/api...

# 3. Build Stage
FROM deps AS builder
COPY packages ./packages
COPY apps/api ./apps/api

# Generate the Prisma client (for this platform) & compile TypeScript
RUN pnpm --filter @vargly/api prisma:generate
RUN pnpm --filter @vargly/types build
RUN pnpm --filter @vargly/api exec tsc -b

# 4. Production Runner Stage
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl dumb-init
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Security: Run as non-root user
USER node

COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages ./packages
COPY --chown=node:node --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --chown=node:node --from=builder /app/apps/api/dist ./apps/api/dist
# Fonts for the PDFs the API renders (question papers, including Hindi)
COPY --chown=node:node --from=builder /app/apps/api/assets ./apps/api/assets
COPY --chown=node:node --from=builder /app/apps/api/package.json ./apps/api/package.json
# Schema and migrations, for the migrate command
COPY --chown=node:node --from=builder /app/apps/api/src/database/prisma/schema.prisma ./apps/api/dist/database/prisma/schema.prisma
COPY --chown=node:node --from=builder /app/apps/api/src/database/prisma/migrations ./apps/api/dist/database/prisma/migrations

WORKDIR /app/apps/api

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health/live || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main.js"]
