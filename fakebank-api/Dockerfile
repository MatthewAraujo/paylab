# Development image: runs `pnpm dev` (Nest watch mode). Not a production image.
FROM node:22-bookworm-slim

WORKDIR /app
# Nest watch uses ps (procps) to terminate the previous application process tree on reload.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates procps \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@11.9.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
# postinstall runs `prisma generate`, which downloads the Prisma engines.
RUN --mount=type=cache,id=fakebank-api-pnpm,target=/var/cache/pnpm,sharing=locked \
    pnpm install --frozen-lockfile --store-dir=/var/cache/pnpm \
    --network-concurrency=8 --fetch-timeout=900000
COPY . .

ENV NODE_ENV=development
EXPOSE 4000
CMD ["sh", "-ec", "pnpm prisma:migrate:deploy && exec pnpm dev"]
