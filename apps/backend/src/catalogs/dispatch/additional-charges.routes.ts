import type { FastifyInstance } from "fastify";
import { registerDispatchCatalogCrudRoutes } from "./shared.js";

export async function registerAdditionalChargesCatalogRoutes(app: FastifyInstance) {
  registerDispatchCatalogCrudRoutes(app, {
    catalogPath: "additional-charges",
    tableName: "additional_charges",
    auditKey: "additional_charges",
  });
}
