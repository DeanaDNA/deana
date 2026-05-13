# syntax=docker/dockerfile:1.7

ARG BUN_IMAGE=oven/bun:1.3.10-slim

FROM ${BUN_IMAGE} AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY index.html tsconfig*.json vite.config.ts vite.config.js vite.config.d.ts ./
COPY public ./public
COPY src ./src
COPY api ./api
RUN bun run build

FROM ${BUN_IMAGE} AS production-deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM ${BUN_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

COPY --from=production-deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --chown=bun:bun package.json ./
COPY --chown=bun:bun server ./server
COPY --chown=bun:bun api/ai-status.ts api/chat.ts api/chat-title.ts ./api/
COPY --chown=bun:bun src/lib ./src/lib
COPY --chown=bun:bun src/types.ts ./src/types.ts

USER bun
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || '8080') + '/healthz').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"
CMD ["bun", "run", "start"]
