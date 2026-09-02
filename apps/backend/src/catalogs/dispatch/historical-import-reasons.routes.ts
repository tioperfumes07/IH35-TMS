import type { FastifyInstance } from "fastify";
import { registerDispatchCatalogCrudRoutes } from "./shared.js";

// GO-21 B3 — same generic dispatch-catalog CRUD factory as detention-reasons/load-types/
// pickup-time-types/additional-charges, new table only (migration 202613480001). Backs the Book
// Load "Historical import reason" quick-pick — see BookLoadModalV4.tsx.
export async function registerHistoricalImportReasonsCatalogRoutes(app: FastifyInstance) {
  registerDispatchCatalogCrudRoutes(app, {
    catalogPath: "historical-import-reasons",
    tableName: "historical_import_reasons",
    auditKey: "historical_import_reasons",
  });
}
