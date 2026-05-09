import type { FastifyInstance } from "fastify";
import { createCatalogRoutes } from "./factory.js";

export async function registerDispatchCatalogRoutes(app: FastifyInstance) {
  createCatalogRoutes(app, {
    tableName: "load_types",
    urlSegment: "load-types",
    displayName: "Load Types",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "detention_reasons",
    urlSegment: "detention-reasons",
    displayName: "Detention Reasons",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "pickup_time_types",
    urlSegment: "pickup-time-types",
    displayName: "Pickup Time Types",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "additional_charges",
    urlSegment: "additional-charges",
    displayName: "Additional Charges",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });
}
