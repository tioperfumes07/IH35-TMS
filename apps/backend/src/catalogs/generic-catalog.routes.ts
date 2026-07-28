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


/**
 * LST-A-01. Two per-entity reason catalogs were reachable ONLY as read-only picker feeds inside
 * UserDetail / CustomerDetail — absent from the Lists hub, with NO write path anywhere in the product.
 * Live on prod 2026-07-28: catalogs.dispatcher_error_reasons = 75 rows and
 * catalogs.customer_quality_event_reasons = 72 rows, both across 3 entities, both FORCE RLS. The owner
 * could read 147 rows of business-critical reason codes and could not add, rename or retire a single
 * one. Registering them here gives the standard factory CRUD the rest of the hub already has.
 *
 * Column shape read from prod, not assumed: these use `label` (NOT display_name, which the factory
 * special-cases for other catalogs), plus NOT NULL `event_type` and `severity`. Both carry CHECK
 * constraints, so the validators below mirror those enums EXACTLY — a value outside them is a 400 at
 * the API instead of a 23514 from Postgres:
 *   severity   info | warning | severe                                        (both tables)
 *   event_type 10 values, DIFFERENT per table — see each validator.
 * UNIQUE (operating_company_id, code) on both, so `code` is the natural key per entity.
 *
 * The existing GET /api/v1/catalogs/{dispatcher-error-reasons,customer-quality-event-reasons} stay:
 * they are the picker feeds the events pages already consume, and they are read-only, so there is no
 * competing write path and no split brain. Consolidating those two readers onto this factory route is
 * a follow-up, deliberately NOT bundled here.
 */
const reasonCodeRegex = /^[A-Z][A-Z0-9_-]+$/;
const SEVERITY_VALUES = ["info", "warning", "severe"] as const;

export const dispatchErrorReasonsCatalogConfig: GenericCatalogConfig = {
  catalogName: "dispatch.dispatcher_error_reasons",
  tableName: "dispatcher_error_reasons",
  routePrefix: "/api/v1/catalogs/dispatch",
  urlSegment: "dispatcher-error-reasons",
  displayName: "Dispatcher Error Reasons",
  allowedColumns: ["code", "label", "description", "event_type", "severity", "is_active"],
  requiredColumns: ["code", "label", "event_type", "severity"],
  validators: {
    code: z.string().trim().regex(reasonCodeRegex),
    label: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    // Mirrors dispatcher_error_reasons_event_type_check verbatim.
    event_type: z.enum([
      "customer_complaint",
      "missed_appointment",
      "unpaid_invoice_responsibility",
      "abandoned_load_dispatcher_fault",
      "rate_below_threshold_unjustified",
      "driver_complaint_validated",
      "commendation",
      "training_required",
      "policy_violation",
      "other",
    ]),
    severity: z.enum(SEVERITY_VALUES),
    is_active: z.coerce.boolean().default(true),
  },
  searchableColumns: ["code", "label", "description"],
  defaultSort: { column: "code", dir: "asc" },
  softDeleteColumn: "is_active",
};

export const customerQualityEventReasonsCatalogConfig: GenericCatalogConfig = {
  catalogName: "customers.customer_quality_event_reasons",
  tableName: "customer_quality_event_reasons",
  routePrefix: "/api/v1/catalogs/customers",
  urlSegment: "customer-quality-event-reasons",
  displayName: "Customer Quality Event Reasons",
  allowedColumns: ["code", "label", "description", "event_type", "severity", "is_active"],
  requiredColumns: ["code", "label", "event_type", "severity"],
  validators: {
    code: z.string().trim().regex(reasonCodeRegex),
    label: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    // Mirrors customer_quality_event_reasons_event_type_check verbatim.
    event_type: z.enum([
      "late_payment",
      "non_payment",
      "lumper_dispute",
      "detention_dispute",
      "tonu_dispute",
      "load_cancelled",
      "rate_dispute",
      "damage_claim",
      "commendation",
      "other",
    ]),
    severity: z.enum(SEVERITY_VALUES),
    is_active: z.coerce.boolean().default(true),
  },
  searchableColumns: ["code", "label", "description"],
  defaultSort: { column: "code", dir: "asc" },
  softDeleteColumn: "is_active",
};

export async function registerGenericCatalogRoutes(app: FastifyInstance) {
  createCatalogRoutes(app, fleetEquipmentTypesCatalogConfig, { mode: "extensions" });
  // LST-A-01: full CRUD — these had no write path at all before.
  createCatalogRoutes(app, dispatchErrorReasonsCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, customerQualityEventReasonsCatalogConfig, { mode: "all" });

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
