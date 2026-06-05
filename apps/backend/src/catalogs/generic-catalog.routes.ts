import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { getExcelUploadJob } from "./excel-uploader.js";
import { createCatalogRoutes, type GenericCatalogConfig } from "./generic-catalog.factory.js";
import { currentAuthUser, idParamSchema, validationError } from "./fleet/shared.js";

const equipmentTypeCodeRegex = /^[A-Z][A-Z0-9_-]+$/;

export const fleetEquipmentTypesCatalogConfig: GenericCatalogConfig = {
  catalogName: "fleet.equipment_types",
  tableName: "equipment_types",
  routePrefix: "/api/v1/catalogs/fleet",
  urlSegment: "equipment-types",
  displayName: "Equipment Types",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(equipmentTypeCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
};

export async function registerGenericCatalogRoutes(app: FastifyInstance) {
  createCatalogRoutes(app, fleetEquipmentTypesCatalogConfig, { mode: "extensions" });

  app.get("/api/v1/catalogs/excel-upload-jobs/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);

    const job = await withCurrentUser(authUser.uuid, async (client) => getExcelUploadJob(client, parsedParams.data.id));
    if (!job) return reply.code(404).send({ error: "excel_upload_job_not_found" });
    return job;
  });
}
