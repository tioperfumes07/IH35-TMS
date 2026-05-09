import type { FastifyInstance } from "fastify";
import { createCatalogRoutes } from "./factory.js";

export async function registerFuelCatalogRoutes(app: FastifyInstance) {
  createCatalogRoutes(app, {
    tableName: "fuel_card_types",
    urlSegment: "fuel-card-types",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "Fuel Card Types",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "fuel_exception_types",
    urlSegment: "fuel-exception-types",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "Fuel Exception Types",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "fuel_station_brands",
    urlSegment: "fuel-station-brands",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "Fuel Station Brands",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "fuel_stop_reason_codes",
    urlSegment: "fuel-stop-reason-codes",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "Fuel Stop Reason Codes",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "mpg_bands",
    urlSegment: "mpg-bands",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "MPG Bands",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "expensive_states",
    urlSegment: "expensive-states",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "Expensive States",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "fuel_tax_jurisdictions",
    urlSegment: "fuel-tax-jurisdictions",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "Fuel Tax Jurisdictions",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });
}
