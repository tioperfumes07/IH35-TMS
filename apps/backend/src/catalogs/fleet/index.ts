import type { FastifyInstance } from "fastify";
import { createCatalogRoutes } from "./factory.js";

export async function registerFleetCatalogRoutes(app: FastifyInstance) {
  createCatalogRoutes(app, {
    tableName: "tractor_statuses",
    urlSegment: "tractor-statuses",
    routePrefix: "/api/v1/catalogs/fleet",
    displayName: "Tractor Statuses",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "trailer_statuses",
    urlSegment: "trailer-statuses",
    routePrefix: "/api/v1/catalogs/fleet",
    displayName: "Trailer Statuses",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "asset_condition_codes",
    urlSegment: "condition-codes",
    routePrefix: "/api/v1/catalogs/fleet",
    displayName: "Asset Condition Codes",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "equipment_types",
    urlSegment: "equipment-types",
    routePrefix: "/api/v1/catalogs/fleet",
    displayName: "Equipment Types",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "tire_positions",
    urlSegment: "tire-positions",
    routePrefix: "/api/v1/catalogs/fleet",
    displayName: "Tire Positions",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "unit_ownership_types",
    urlSegment: "ownership-types",
    routePrefix: "/api/v1/catalogs/fleet",
    displayName: "Unit Ownership Types",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });
}
