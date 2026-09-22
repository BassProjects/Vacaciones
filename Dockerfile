FROM node:22.23.2-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
# A failing release audit blocks this image; do not bypass it with --force.
RUN npm run check:release

FROM node:22.23.2-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080 \
    TZ=Europe/Madrid \
    SCHEMA_MANAGEMENT=external
COPY --from=build --chown=1000:1000 /app/.next/standalone ./
COPY --from=build --chown=1000:1000 /app/.next/static ./.next/static
COPY --from=build --chown=1000:1000 /app/public ./public
COPY --chown=1000:1000 scripts/start-dokploy.cjs ./scripts/start-dokploy.cjs
COPY --chown=1000:1000 lib/runtimeConfig.cjs ./lib/runtimeConfig.cjs
RUN mkdir -p .next && rm -rf .next/cache && ln -s /tmp/next-cache .next/cache
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-dokploy.cjs"]
