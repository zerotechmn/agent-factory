import express from 'express';

/**
 * Every API route, mounted under /api by app.js. One router per resource
 * (e.g. routes/orders.js exporting ordersRouter(db)) keeps this file a list.
 */
export function apiRoutes(db) {
  const router = express.Router();
  void db;
  // router.use(ordersRouter(db));
  return router;
}
