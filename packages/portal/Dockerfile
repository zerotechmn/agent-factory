FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/factory/package.json packages/factory/
COPY packages/deployer/package.json packages/deployer/
COPY packages/portal/package.json packages/portal/
RUN bun install --frozen-lockfile --filter @factory/portal
COPY packages/portal packages/portal
RUN cd packages/portal && bun run build

FROM nginx:1.29-alpine
COPY packages/portal/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/portal/dist /usr/share/nginx/html
