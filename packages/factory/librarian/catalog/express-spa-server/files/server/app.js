import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { systemToday } from './clock.js';
import { seedIfEmpty } from './seed.js';
import { loadUser } from './auth.js';
import { HttpError } from './errors.js';
import { usersRouter } from './routes/users.js';
import { carsRouter } from './routes/cars.js';
import { bookingsRouter } from './routes/bookings.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.join(here, '..', 'dist', 'web');

export function createApp({ dbPath = ':memory:', today = systemToday, seed = true } = {}) {
  const db = openDb(dbPath);
  if (seed) seedIfEmpty(db, today());

  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  });

  const api = express.Router();
  api.use(loadUser(db));
  api.use(usersRouter(db));
  api.use(carsRouter(db, today));
  api.use(bookingsRouter(db, today));
  api.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use('/api', api);

  app.use(express.static(WEB_DIR, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => {
    const index = path.join(WEB_DIR, 'index.html');
    if (!fs.existsSync(index)) return res.status(503).type('text').send('The web app has not been built. Run npm run build.');
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
