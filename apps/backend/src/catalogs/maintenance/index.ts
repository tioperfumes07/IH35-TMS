import type { FastifyInstance } from "fastify";
import { createCatalogRoutes } from "./factory.js";

export async function registerMaintenanceCatalogRoutes(app: FastifyInstance) {
  createCatalogRoutes(app, {
    tableName: "maintenance_failure_codes",
    urlSegment: "failure-codes",
    routePrefix: "/api/v1/catalogs/maintenance",
    displayName: "Maintenance Failure Codes",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "maintenance_labor_codes",
    urlSegment: "labor-codes",
    routePrefix: "/api/v1/catalogs/maintenance",
    displayName: "Maintenance Labor Codes",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "maintenance_parts",
    urlSegment: "parts",
    routePrefix: "/api/v1/catalogs/maintenance",
    displayName: "Maintenance Parts",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "maintenance_priority_levels",
    urlSegment: "priority-levels",
    routePrefix: "/api/v1/catalogs/maintenance",
    displayName: "Maintenance Priority Levels",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "maintenance_service_tasks",
    urlSegment: "service-tasks",
    routePrefix: "/api/v1/catalogs/maintenance",
    displayName: "Maintenance Service Tasks",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "maintenance_shop_locations",
    urlSegment: "shop-locations",
    routePrefix: "/api/v1/catalogs/maintenance",
    displayName: "Maintenance Shop Locations",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "maintenance_vendors",
    urlSegment: "vendors",
    routePrefix: "/api/v1/catalogs/maintenance",
    displayName: "Maintenance Vendors",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });

  createCatalogRoutes(app, {
    tableName: "work_order_statuses",
    urlSegment: "work-order-statuses",
    routePrefix: "/api/v1/catalogs/maintenance",
    displayName: "Work Order Statuses",
    codeRegex: /^[A-Z][A-Z0-9-]+$/,
  });
}
