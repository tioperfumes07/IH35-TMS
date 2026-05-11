import type { FastifyInstance } from "fastify";
import { registerDispatchCatalogCrudRoutes } from "./shared.js";

export async function registerPickupTimeTypesCatalogRoutes(app: FastifyInstance) {
  registerDispatchCatalogCrudRoutes(app, {
    catalogPath: "pickup-time-types",
    tableName: "pickup_time_types",
    auditKey: "pickup_time_types",
  });
}
