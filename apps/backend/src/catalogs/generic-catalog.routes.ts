import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createGenericCatalogRoutes, registerExcelUploadJobRoute } from "./generic-catalog.factory.js";

const equipmentTypeValidators = {
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_-]+$/)
    .min(2)
    .max(40),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  is_active: z.boolean().default(true),
};

export async function registerGenericCatalogRoutes(app: FastifyInstance) {
  createGenericCatalogRoutes(app, {
    catalogName: "fleet.equipment_types",
    tableName: "equipment_types",
    routePrefix: "/api/v1/catalogs/fleet",
    urlSegment: "equipment-types",
    displayName: "Equipment Types",
    allowedColumns: ["code", "name", "description", "sort_order", "is_active"],
    requiredColumns: ["code", "name"],
    validators: equipmentTypeValidators,
    searchableColumns: ["code", "name", "description"],
    defaultSort: { column: "sort_order", dir: "asc" },
    softDeleteColumn: "is_active",
  });

  registerExcelUploadJobRoute(app);
}
