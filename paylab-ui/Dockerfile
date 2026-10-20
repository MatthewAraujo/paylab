FROM node:24-bookworm-slim

WORKDIR /app
RUN npm install --global pnpm@10.28.1
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=paylab-ui-pnpm,target=/var/cache/pnpm,sharing=locked \
    pnpm install --frozen-lockfile --store-dir=/var/cache/pnpm \
    --network-concurrency=8 --fetch-timeout=900000
COPY . .

ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]
