FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @pont/server... --filter @pont/store-convex... \
 && pnpm --filter @pont/store-prisma generate
RUN chown -R node:node /app
USER node
EXPOSE 8080
CMD ["pnpm", "--filter", "@pont/server", "start"]
