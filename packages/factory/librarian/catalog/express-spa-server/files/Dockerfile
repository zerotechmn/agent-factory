FROM node:22-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 compiles a native module when no prebuilt binary matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build:web && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist
# Add COPY lines for any other runtime folder the server imports (e.g. shared/).
RUN mkdir -p /data
VOLUME /data
EXPOSE 8080
CMD ["node", "server/index.js"]
