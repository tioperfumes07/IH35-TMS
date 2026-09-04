import type { FastifyInstance } from "fastify";
import { registerDispatchCatalogCrudRoutes } from "./shared.js";

export async function registerLoadCommoditiesCatalogRoutes(app: FastifyInstance) {
  registerDispatchCatalogCrudRoutes(app, {
    catalogPath: "load-commodities",
    tableName: "load_commodities",
    auditKey: "load_commodities",
  });
}
