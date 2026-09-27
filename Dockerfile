FROM node:26-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
RUN npm install --global pnpm@11.2.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=secret,id=npm_token,env=NODE_AUTH_TOKEN,required=true \
    --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

FROM deps AS builder
COPY . .
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]
CMD ["node", "server.js"]
