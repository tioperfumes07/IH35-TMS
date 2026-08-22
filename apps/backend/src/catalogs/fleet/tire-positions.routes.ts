import type { FastifyInstance } from "fastify";
import { createCatalogRoutes } from "./factory.js";

/**
 * Tire positions are a global reference taxonomy (not an operating-company fact), but they still
 * require the same governed creator, audit, and void-not-delete lifecycle as every other editable
 * Lists catalog. The 500-row limit is retained for the Maintenance WO picker.
 */
export async function registerTirePositionsCatalogRoutes(app: FastifyInstance) {
  createCatalogRoutes(app, {
    tableName: "tire_positions",
    urlSegment: "tire-positions",
    routePrefix: "/api/v1/catalogs/fleet",
    displayName: "Tire Positions",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
    companyScoped: false,
    listLimitMax: 500,
  });
}
