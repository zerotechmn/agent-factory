import { respond } from "../lib/respond";
import * as LibrarianService from "./librarian.service";

export async function getOverview() {
  return respond(() => LibrarianService.getOverview(), { tag: "librarian" });
}

export async function getRunLibrarian(runId: string) {
  return respond(() => LibrarianService.getRunLibrarian(runId), { tag: "librarian" });
}
