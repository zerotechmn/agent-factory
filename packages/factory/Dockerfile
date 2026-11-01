# The factory image doubles as the agents' execution environment, so it carries
# every runtime a generated app may use. It has no Docker socket by design.
FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git unzip jq sqlite3 \
      python3 python3-pip python3-venv golang-go build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY --from=oven/bun:1.3 /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx

WORKDIR /app
COPY package.json bun.lock ./
COPY packages/factory/package.json packages/factory/
COPY packages/deployer/package.json packages/deployer/
COPY packages/portal/package.json packages/portal/
RUN bun install --frozen-lockfile --filter @factory/factory
COPY packages/factory packages/factory

RUN mkdir -p /data && git config --system init.defaultBranch main
COPY packages/factory/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENV DATA_DIR=/data PORT=4000
EXPOSE 4000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "packages/factory/src/server.ts"]
