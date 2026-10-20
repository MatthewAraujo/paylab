FROM node:24-bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@11.9.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN --mount=type=cache,id=paylab-api-pnpm,target=/var/cache/pnpm,sharing=locked \
    pnpm install --frozen-lockfile --store-dir=/var/cache/pnpm \
    --network-concurrency=8 --fetch-timeout=900000
# Nest watch uses ps to terminate the previous application process tree.
RUN apt-get update && apt-get install -y --no-install-recommends procps \
    && rm -rf /var/lib/apt/lists/*
COPY . .

ENV NODE_ENV=development
EXPOSE 3333
CMD ["pnpm", "dev"]
