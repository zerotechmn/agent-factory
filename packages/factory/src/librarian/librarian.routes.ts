import { Elysia } from "elysia";

import * as LibrarianController from "./librarian.controller";

/**
 * Read-only views for the portal. The overview is shared knowledge and counts
 * only; a run's lookups are served under that run's id, like its board.
 */
export const librarianRoutes = new Elysia({ prefix: "/api" })
  .get("/librarian", () => LibrarianController.getOverview())
  .get("/runs/:id/librarian", ({ params }) => LibrarianController.getRunLibrarian(params.id));
