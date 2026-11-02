# express-spa-server

A single-container Node backend that meets the factory's app contract: Express 4 serves the JSON API under `/api`, `GET /health`, and the Vite-built React app (with index.html for client routes). It uses SQLite through better-sqlite3 under `/data`, returns JSON errors, and has a two-stage Dockerfile. `createApp()` doesn't listen, so tests can import it directly.

Tags: express, node, better-sqlite3, sqlite, vite, docker, dockerfile, server, api, health, bootstrap

## Contract

- **Stack:** Node 22, Express 4 (the `app.get('*')` fallback is Express 4 syntax), better-sqlite3, Vite with `@vitejs/plugin-react`. ES modules (`"type": "module"`).
- **Layout:** `server/` (this item), `web/` (the Vite root, e.g. the `zt-app-shell` catalog item), built into `dist/web`.
- **package.json** needs at least:

  ```json
  {
    "type": "module",
    "scripts": { "build:web": "vite build", "start": "node server/index.js", "test": "<your test runner>" },
    "dependencies": { "better-sqlite3": "^11", "express": "^4" },
    "devDependencies": { "@vitejs/plugin-react": "^4", "vite": "^6" }
  }
  ```
- **`createApp({ dbPath = ':memory:', seed = true })`** returns `{ app, db }`. Tests can use `supertest(createApp().app)`, which gives each test a fresh in-memory database.
- **Errors:** throw `badRequest`, `forbidden`, `notFound`, `conflict` or `validationError({ field: message })` from `server/errors.js`. Clients receive `{ error, errors? }` with the status code.

## Adapt it

1. `server/schema.sql`: one `CREATE TABLE IF NOT EXISTS` per entity in the architecture's data model.
2. `server/routes/`: one router per resource, listed in `routes/index.js`. Add session or auth middleware where `app.js` marks it.
3. `server/seed.js`: demo data for every screen, including one record with very long text.
4. `Dockerfile`: add a `COPY` line for any other folder the server imports at runtime (e.g. `shared/`).

Keep these as they are:
- `0.0.0.0` and `$PORT` in `server/index.js`
- the `/health` route
- the JSON 404 for unknown `/api` paths

The verify gate and the browser checks depend on them.

## Origin

Generalised from run `wdy8xjndga` (deployed, all checks green). Its routes, auth, schema and seed data were removed; the server bootstrap, error handling and Docker setup were kept.
