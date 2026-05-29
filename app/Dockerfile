FROM node:20-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# Ops/migration scripts run via tsx in prod (one-off jobs); ship them unbuilt.
COPY scripts/ ./scripts/

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /build/package.json ./
COPY --from=builder /build/package-lock.json* ./
RUN npm install --omit=dev

COPY --from=builder /build/dist/ ./dist/

# Migration runner + ops scripts (run via `npm run migrate`/`backfill:*`/`diff:*` as
# one-off jobs). They execute the TypeScript directly via tsx (now a prod dep) and
# resolve their `../src/...` imports + read the migration .sql files, so ship both.
COPY --from=builder /build/src/ ./src/
COPY --from=builder /build/scripts/ ./scripts/

ENV NODE_ENV=production

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]
