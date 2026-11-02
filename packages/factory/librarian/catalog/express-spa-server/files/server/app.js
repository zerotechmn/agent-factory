import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDb } from './db.js';
import { HttpError } from './errors.js';
import { apiRoutes } from './routes/index.js';
import { seedIfEmpty } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.join(here, '..', 'dist', 'web');

/**
 * Builds the app without listening, so tests can call it directly
 * (supertest(createApp().app)) with a fresh in-memory database each time.
 * server/index.js is the only place that listens.
 */
export function createApp({ dbPath = ':memory:', seed = true } = {}) {
  const db = openDb(dbPath);
  if (seed) seedIfEmpty(db);

  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  // The factory's verify gate waits for this; it also proves the database answers.
  app.get('/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  });

  const api = express.Router();
  // Put session/auth middleware here, before the routes.
  api.use(apiRoutes(db));
  // Unknown API paths answer JSON 404 instead of falling through to the SPA's index.html.
  api.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use('/api', api);

  // The built SPA, with index.html for every client route (Express 4 '*' syntax).
  app.use(express.static(WEB_DIR, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => {
    const index = path.join(WEB_DIR, 'index.html');
    if (!fs.existsSync(index)) return res.status(503).type('text').send('The web app has not been built. Run npm run build:web.');
    res.set('Cache-Control', 'no-cache').sendFile(index);
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, errors: err.errors });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return { app, db };
}
