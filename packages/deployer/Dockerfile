FROM oven/bun:1.3-debian
# The bun image has no system CA bundle (Bun ships its own); the docker CLI
# needs one to fetch registry auth tokens during builds.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
# Docker CLI + buildx only; the daemon is the host's, reached via the mounted socket.
COPY --from=docker:29-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:29-cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx

WORKDIR /app
COPY package.json bun.lock ./
COPY packages/factory/package.json packages/factory/
COPY packages/deployer/package.json packages/deployer/
COPY packages/portal/package.json packages/portal/
RUN bun install --frozen-lockfile --filter @factory/deployer
COPY packages/deployer packages/deployer
ENV PORT=4100 RUNS_DIR=/data/runs
EXPOSE 4100
CMD ["bun", "packages/deployer/src/server.ts"]
