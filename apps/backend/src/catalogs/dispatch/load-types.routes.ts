import type { FastifyInstance } from "fastify";
import { registerDispatchCatalogCrudRoutes } from "./shared.js";

export async function registerLoadTypesCatalogRoutes(app: FastifyInstance) {
  registerDispatchCatalogCrudRoutes(app, {
    catalogPath: "load-types",
    tableName: "load_types",
    auditKey: "load_types",
  });
}
