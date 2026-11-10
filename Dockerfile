# syntax=docker/dockerfile:1

# --------------------------------------------------------------------------- #
# Dependencies
# --------------------------------------------------------------------------- #
FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

# --------------------------------------------------------------------------- #
# Build (standalone output keeps the runtime image small)
# --------------------------------------------------------------------------- #
FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --------------------------------------------------------------------------- #
# Runtime
# --------------------------------------------------------------------------- #
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    AGENT_DATA_DIR=/app/data

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --create-home nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# The SQLite database (and its WAL files) live here; mount a volume to persist it.
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

COPY --chown=nextjs:nodejs docker-healthcheck.mjs ./docker-healthcheck.mjs

USER nextjs
EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "docker-healthcheck.mjs"]

CMD ["node", "server.js"]
