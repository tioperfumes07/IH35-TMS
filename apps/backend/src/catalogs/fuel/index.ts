import type { FastifyInstance } from "fastify";
import { createCatalogRoutes } from "./factory.js";

export async function registerFuelCatalogRoutes(app: FastifyInstance) {
  createCatalogRoutes(app, {
    tableName: "fuel_card_types",
    urlSegment: "card-types",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "Fuel Card Types",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "fuel_exception_types",
    urlSegment: "exception-types",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "Fuel Exception Types",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "fuel_station_brands",
    urlSegment: "station-brands",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "Fuel Station Brands",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "fuel_stop_reason_codes",
    urlSegment: "stop-reason-codes",
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
    urlSegment: "tax-jurisdictions",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "Fuel Tax Jurisdictions",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "fuel_brands",
    urlSegment: "brands",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "Fuel Brands",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "fuel_station_states",
    urlSegment: "station-states",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "Fuel Station States",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "fuel_pump_types",
    urlSegment: "pump-types",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "Fuel Pump Types",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "fuel_grades",
    urlSegment: "grades",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "Fuel Grades",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "fuel_dispatch_routes",
    urlSegment: "dispatch-routes",
    routePrefix: "/api/v1/catalogs/fuel",
    displayName: "Fuel Dispatch Routes",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });
}
