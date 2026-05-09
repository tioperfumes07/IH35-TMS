import type { FastifyInstance } from "fastify";
import { createCatalogRoutes } from "./factory.js";

export async function registerDriverCatalogRoutes(app: FastifyInstance) {
  createCatalogRoutes(app, {
    tableName: "pay_rate_templates",
    urlSegment: "pay-rate-templates",
    routePrefix: "/api/v1/catalogs/driver",
    displayName: "Pay Rate Templates",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "driver_deduction_types",
    urlSegment: "deduction-types",
    routePrefix: "/api/v1/catalogs/driver",
    displayName: "Driver Deduction Types",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "driver_pay_types",
    urlSegment: "pay-types",
    routePrefix: "/api/v1/catalogs/driver",
    displayName: "Driver Pay Types",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "escrow_types",
    urlSegment: "escrow-types",
    routePrefix: "/api/v1/catalogs/driver",
    displayName: "Escrow Types",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });
}
