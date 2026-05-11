import type { FastifyInstance } from "fastify";
import { registerDispatchCatalogCrudRoutes } from "./shared.js";

export async function registerDetentionReasonsCatalogRoutes(app: FastifyInstance) {
  registerDispatchCatalogCrudRoutes(app, {
    catalogPath: "detention-reasons",
    tableName: "detention_reasons",
    auditKey: "detention_reasons",
  });
}
