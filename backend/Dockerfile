# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
# pnpm comes from corepack, pinned by the packageManager field in package.json.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN pnpm run build && pnpm prune --prod

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
USER node
EXPOSE 8001
# Apply pending migrations with the pinned Prisma CLI (no download at startup), then start.
# Startup seeding is idempotent.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
