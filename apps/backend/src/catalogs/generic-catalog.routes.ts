import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { getExcelUploadJob } from "./excel-uploader.js";
import { createCatalogRoutes, type GenericCatalogConfig } from "./generic-catalog.factory.js";
import { currentAuthUser, idParamSchema, validationError } from "./fleet/shared.js";

const catalogCodeRegex = /^[A-Z][A-Z0-9_-]+$/;
const equipmentTypeCodeRegex = /^[A-Z][A-Z0-9_-]+$/;

export const fleetEquipmentTypesCatalogConfig: GenericCatalogConfig = {
  catalogName: "fleet.equipment_types",
  tableName: "equipment_types",
  routePrefix: "/api/v1/catalogs/fleet",
  urlSegment: "equipment-types",
  displayName: "Equipment Types",
  displayNameColumn: "name",
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
  hasDeactivatedAt: false,
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

/**
 * LST-WIRE-01 — four dispatch catalogs whose hub tiles were marked `live: true` with NO backend route
 * behind them. The tile opened and the API 404'd: the hub advertised a working list the operator could
 * never load, let alone edit. Found by the completeness gate (verify-every-catalog-wired), which
 * reports that state as LIE-LIVE and treats it as worse than a plain orphan.
 *
 * Column shape read from PROD (information_schema, 2026-07-29), not assumed — all four share the same
 * canonical catalog shape as fleet.equipment_types: code, display_name, description, metadata jsonb,
 * is_active, sort_order, all NOT NULL except description. Entity-scoped on operating_company_id with
 * FORCE RLS already in place, so the factory's standard scoping applies unchanged.
 *
 * additional_charges is deliberately registered ONCE here. It previously had a second registration that
 * collided with this route namespace and broke boot with "Method 'GET' already declared" (#3727); that
 * duplicate was removed, which is why the catalog has had no backend at all since.
 */
const dispatchCatalogCodeRegex = /^[A-Z][A-Z0-9_-]+$/;

const reasonCodeRegex = /^[A-Z][A-Z0-9_-]+$/;
const SEVERITY_VALUES = ["info", "warning", "severe"] as const;

export const dispatchErrorReasonsCatalogConfig: GenericCatalogConfig = {
  catalogName: "dispatch.dispatcher_error_reasons",
  tableName: "dispatcher_error_reasons",
  routePrefix: "/api/v1/catalogs/dispatch",
  urlSegment: "dispatcher-error-reasons",
  displayName: "Dispatcher Error Reasons",
  entityScoped: true,
  // CC3-CATLABEL-01: do NOT set displayNameColumn here -- this catalog's API/frontend field key
  // IS "label" (see allowedColumns/validators below), matching the physical column 1:1. Setting
  // displayNameColumn: "label" makes apiColumnForDbColumn() rename the physical `label` column to
  // API key `display_name` on every SELECT (that mechanism is for catalogs whose frontend field
  // key is generically "display_name" mapped to a differently-named physical column -- see
  // driverTerminationReasonsCatalogConfig below for the correct use of that pattern). The
  // mis-set alias silently dropped every created row's Label from list + edit (data was written
  // correctly to catalogs.dispatcher_error_reasons.label; the API just returned it under the
  // wrong key), live-reproduced via a real create + window.fetch-captured POST body + raw GET.
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
  hasDeactivatedAt: false,
};

export const customerQualityEventReasonsCatalogConfig: GenericCatalogConfig = {
  catalogName: "customers.customer_quality_event_reasons",
  tableName: "customer_quality_event_reasons",
  routePrefix: "/api/v1/catalogs/customers",
  urlSegment: "customer-quality-event-reasons",
  displayName: "Customer Quality Event Reasons",
  entityScoped: true,
  // CC3-CATLABEL-01: same fix as dispatchErrorReasonsCatalogConfig above -- this catalog's API
  // field key is also "label" directly, not the generic "display_name". Do not re-add
  // displayNameColumn here.
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
  hasDeactivatedAt: false,
};

/**
 * OWNER RULING 2026-07-28 — "each of these catalogs requires a QuickBooks-style creator wizard so we
 * can continue to edit and add these lists and catalogs." Batch 1 of that program.
 *
 * catalogs.lumper_providers (15 rows) had NO route at all. It already carries the canonical catalog
 * shape (code / display_name / description / is_active / sort_order), verified against prod
 * information_schema rather than assumed, so it needs the standard factory CRUD and nothing bespoke.
 *
 * additional_charges was in this batch and was REMOVED: it is already registered by
 * catalogs/dispatch/additional-charges.routes.ts, and declaring it again made Fastify refuse to boot
 * ("Method GET already declared"). See the PR body — my inventory had it as unrouted because that
 * older helper declares `catalogPath`, not `urlSegment`, and my extraction only looked for the latter.
 */
export const dispatchLumperProvidersCatalogConfig: GenericCatalogConfig = {
  catalogName: "dispatch.lumper_providers",
  tableName: "lumper_providers",
  routePrefix: "/api/v1/catalogs/dispatch",
  urlSegment: "lumper-providers",
  displayName: "Lumper Providers",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(catalogCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.lumper_providers has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

/**
 * LST-WIRE-03 — 23 catalogs that had NO backend route at all. The completeness gate
 * (verify-every-catalog-wired) classified them ORPHAN: an operator could not list, add, rename or
 * retire a single row in any of them, and most had no hub tile either.
 *
 * All 23 share the canonical catalog shape — code, display_name, description, is_active, sort_order,
 * entity-scoped on operating_company_id with FORCE RLS — VERIFIED per table against prod
 * information_schema (2026-07-29), not assumed. vendor_types was deliberately EXCLUDED from this
 * batch: it uses vendor_type_name/vendor_type_code and has no sort_order, so it needs an additive
 * shape migration first rather than a config that would 500 on first use.
 */
const wireCodeRegex = /^[A-Z][A-Z0-9_-]+$/;

export const accidentTypesCatalogConfig: GenericCatalogConfig = {
  catalogName: "safety.accident_types",
  tableName: "accident_types",
  routePrefix: "/api/v1/catalogs/safety",
  urlSegment: "accident-types",
  displayName: "Accident Types",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.accident_types has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const workplaceIncidentTypesCatalogConfig: GenericCatalogConfig = {
  catalogName: "safety.workplace_incident_types",
  tableName: "workplace_incident_types",
  routePrefix: "/api/v1/catalogs/safety",
  urlSegment: "workplace-incident-types",
  displayName: "Workplace Incident Types",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.workplace_incident_types has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const leaveTypesCatalogConfig: GenericCatalogConfig = {
  catalogName: "driver.leave_types",
  tableName: "leave_types",
  routePrefix: "/api/v1/catalogs/driver",
  urlSegment: "leave-types",
  displayName: "Leave Types",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.leave_types has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const cashAdvanceTypesCatalogConfig: GenericCatalogConfig = {
  catalogName: "driver.cash_advance_types",
  tableName: "cash_advance_types",
  routePrefix: "/api/v1/catalogs/driver",
  urlSegment: "cash-advance-types",
  displayName: "Cash Advance Types",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CASH-ADVANCE-TYPES-500: catalogs.cash_advance_types has a real `updated_at` (hasUpdatedAt
  // stays true so the Lists card SELECT keeps working) but NO created_by_user_id/updated_by_user_id
  // columns at all — writing them 500'd every Create/Edit with a raw Postgres 42703 surfaced
  // straight to the operator ("column \"updated_by_user_id\" of relation ... does not exist").
  hasAuditUserColumns: false,
};

export const pmIntervalsCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.pm_intervals",
  tableName: "pm_intervals",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "pm-intervals",
  displayName: "Pm Intervals",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.pm_intervals has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const repairLocationsCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.repair_locations",
  tableName: "repair_locations",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "repair-locations",
  displayName: "Repair Locations",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.repair_locations has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const workOrderTemplatesCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.work_order_templates",
  tableName: "work_order_templates",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "work-order-templates",
  displayName: "Work Order Templates",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.work_order_templates has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const airBagCatalogCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.air_bag_catalog",
  tableName: "air_bag_catalog",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "air-bag-catalog",
  displayName: "Air Bag",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.air_bag_catalog has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const batteryCatalogCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.battery_catalog",
  tableName: "battery_catalog",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "battery-catalog",
  displayName: "Battery",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.battery_catalog has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const tireCatalogCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.tire_catalog",
  tableName: "tire_catalog",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "tire-catalog",
  displayName: "Tire",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.tire_catalog has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const trailerPartsCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.trailer_parts",
  tableName: "trailer_parts",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "trailer-parts",
  displayName: "Trailer Parts",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.trailer_parts has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const truckPartsCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.truck_parts",
  tableName: "truck_parts",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "truck-parts",
  displayName: "Truck Parts",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.truck_parts has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const defStationsCatalogConfig: GenericCatalogConfig = {
  catalogName: "fuel.def_stations",
  tableName: "def_stations",
  routePrefix: "/api/v1/catalogs/fuel",
  urlSegment: "def-stations",
  displayName: "Def Stations",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.def_stations has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const fuelStationsCatalogConfig: GenericCatalogConfig = {
  catalogName: "fuel.fuel_stations",
  tableName: "fuel_stations",
  routePrefix: "/api/v1/catalogs/fuel",
  urlSegment: "fuel-stations",
  displayName: "Fuel Stations",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.fuel_stations has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const relayAccountsCatalogConfig: GenericCatalogConfig = {
  catalogName: "fuel.relay_accounts",
  tableName: "relay_accounts",
  routePrefix: "/api/v1/catalogs/fuel",
  urlSegment: "relay-accounts",
  displayName: "Relay Accounts",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.relay_accounts has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const tollProvidersCatalogConfig: GenericCatalogConfig = {
  catalogName: "fuel.toll_providers",
  tableName: "toll_providers",
  routePrefix: "/api/v1/catalogs/fuel",
  urlSegment: "toll-providers",
  displayName: "Toll Providers",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.toll_providers has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const loadTrailerEquipmentCatalogConfig: GenericCatalogConfig = {
  catalogName: "dispatch.load_trailer_equipment",
  tableName: "load_trailer_equipment",
  routePrefix: "/api/v1/catalogs/dispatch",
  urlSegment: "load-trailer-equipment",
  displayName: "Load Trailer Equipment",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.load_trailer_equipment has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const mxCustomsBrokersCatalogConfig: GenericCatalogConfig = {
  catalogName: "dispatch.mx_customs_brokers",
  tableName: "mx_customs_brokers",
  routePrefix: "/api/v1/catalogs/dispatch",
  urlSegment: "brokers",
  displayName: "Mx Customs Brokers",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.mx_customs_brokers has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

export const vendorTypesCatalogConfig: GenericCatalogConfig = {
  catalogName: "vendors.vendor_types",
  tableName: "vendor_types",
  routePrefix: "/api/v1/catalogs/vendors",
  urlSegment: "vendor-types",
  displayName: "Vendor Types",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
};

/**
 * LST-WIRE-08 — two maintenance catalogs served through COLUMN ALIASES rather than a shape migration.
 *
 * catalogs.labor_rates uses rate_code/rate_name (+ rate_per_hour, is_internal);
 * catalogs.maintenance_part_locations uses location_code/location_name (+ applies_to, category,
 * display_order, 123 live rows). Both already have a code, a name, is_active and entity scoping —
 * they were never "shape-incomplete", they are domain-named.
 *
 * The work order's default remedy for these was an additive migration adding code/display_name and
 * backfilling. That was rejected on evidence: it would store the same fact in two columns and let them
 * drift, which is exactly the split-brain that forced catalogs.vendor_types to carry a both-way sync
 * trigger. One physical column stays the truth; the factory maps it.
 */
export const laborRatesCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.labor_rates",
  tableName: "labor_rates",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "labor-rates",
  displayName: "Labor Rates",
  codeColumn: "rate_code",
  displayNameColumn: "rate_name",
  allowedColumns: ["code", "display_name", "is_active"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    is_active: z.coerce.boolean().default(true),
  },
  searchableColumns: ["rate_code", "rate_name"],
  defaultSort: { column: "code", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // CC3-CATALOG-AUDIT-COLUMNS-500-LABORRATES: catalogs.labor_rates has NEITHER updated_at NOR
  // created_by_user_id/updated_by_user_id (id, created_at, operating_company_id, rate_code,
  // rate_name, rate_per_hour, is_internal, is_active only -- confirmed live via information_schema).
  // Both flags defaulted true, so CREATE unconditionally wrote created_by_user_id/updated_by_user_id
  // -- live-reproduced real 500 (42703 "column \"created_by_user_id\" of relation \"labor_rates\"
  // does not exist") on every Create attempt. Same bug class as LST-CATALOG-AUDIT-COLUMNS-500
  // elsewhere in this file; this catalog was simply never given the flag.
  hasUpdatedAt: false,
  hasAuditUserColumns: false,
};

export const maintenancePartLocationsCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.maintenance_part_locations",
  tableName: "maintenance_part_locations",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "part-locations",
  displayName: "Part Locations",
  codeColumn: "location_code",
  displayNameColumn: "location_name",
  allowedColumns: ["code", "display_name", "is_active"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    is_active: z.coerce.boolean().default(true),
  },
  searchableColumns: ["location_code", "location_name"],
  defaultSort: { column: "code", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // CC3-CATALOG-AUDIT-COLUMNS-500-PARTLOCATIONS: catalogs.maintenance_part_locations has NEITHER
  // updated_at NOR created_by_user_id/updated_by_user_id (id, created_at, operating_company_id,
  // location_code, location_name, applies_to, category, display_order, is_active only -- confirmed
  // live via information_schema). Both flags defaulted true, so CREATE unconditionally wrote
  // created_by_user_id/updated_by_user_id -- live-reproduced real 500 (42703 "column
  // \"created_by_user_id\" of relation \"maintenance_part_locations\" does not exist") on every
  // Create attempt, distinct from CLS-CATALOG-CODE-CONFLICT-COLUMN (already fixed, a different bug
  // on this same table's conflict-check query). Same bug class as LST-CATALOG-AUDIT-COLUMNS-500
  // elsewhere in this file; this catalog was simply never given the flag.
  hasUpdatedAt: false,
  hasAuditUserColumns: false,
};

/** LST-WIRE-08 — driver termination reasons: `label` shape (no display_name/sort_order), served via alias. */
export const driverTerminationReasonsCatalogConfig: GenericCatalogConfig = {
  catalogName: "driver.driver_termination_reasons",
  tableName: "driver_termination_reasons",
  routePrefix: "/api/v1/catalogs/driver",
  urlSegment: "termination-reasons",
  displayName: "Termination Reasons",
  displayNameColumn: "label",
  allowedColumns: ["code", "display_name", "description", "is_active"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
  },
  searchableColumns: ["code", "label", "description"],
  defaultSort: { column: "code", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
};

/** LST-WIRE-07 — customer types (QuickBooks Customer Type), canonical shape from creation. */
export const customerTypesCatalogConfig: GenericCatalogConfig = {
  catalogName: "customers.customer_types",
  tableName: "customer_types",
  routePrefix: "/api/v1/catalogs/customers",
  urlSegment: "customer-types",
  displayName: "Customer Types",
  displayNameColumn: "display_name",
  allowedColumns: ["code", "display_name", "description", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "display_name", "description"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
};

/** LST-WIRE-09 — global CoA account-type lookup (no operating_company_id; `name` shape). */
export const accountTypesCatalogConfig: GenericCatalogConfig = {
  catalogName: "accounting.account_types",
  tableName: "account_types",
  routePrefix: "/api/v1/catalogs/accounting",
  urlSegment: "account-types-lookup",
  displayName: "Account Types",
  displayNameColumn: "name",
  // Global QBO-parity taxonomy — view via Lists; no operator CRUD through generic factory
  // (table has no updated_at / audit user columns).
  readOnly: true,
  hasUpdatedAt: false,
  allowedColumns: ["code", "display_name", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "name"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
};

/** LST-WIRE-09 — CoA detail types (entity-scoped, `name` shape). */
export const detailTypesCatalogConfig: GenericCatalogConfig = {
  catalogName: "accounting.detail_types",
  tableName: "detail_types",
  routePrefix: "/api/v1/catalogs/accounting",
  urlSegment: "detail-types-lookup",
  displayName: "Detail Types",
  displayNameColumn: "name",
  allowedColumns: ["code", "display_name", "is_active", "sort_order"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(160),
    is_active: z.coerce.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  },
  searchableColumns: ["code", "name"],
  defaultSort: { column: "sort_order", dir: "asc" },
  softDeleteColumn: "is_active",
  hasDeactivatedAt: false,
  // LST-CATALOG-AUDIT-COLUMNS-500: catalogs.detail_types has updated_at but no created_by_user_id/
  // updated_by_user_id columns -- writing them unconditionally 500'd every Create/Edit with a
  // raw Postgres 42703 surfaced straight to the operator. See GenericCatalogConfig.hasAuditUserColumns.
  hasAuditUserColumns: false,
};

/**
 * LST-WIRE-09 — audit event types: VISIBLE, NOT EDITABLE.
 *
 * The wiring map's remedy for this table was "add code/display_name". That is rejected on
 * audit-integrity grounds, and the alternative here is strictly better because it needs no schema
 * change at all.
 *
 * catalogs.audit_event_types is the taxonomy the audit trail itself is written against: code,
 * description, severity_default, 13 rows, NO is_active and NO operating_company_id. Every value is
 * emitted by application code. If an operator could rename or retire one, historical audit rows would
 * point at a label that no longer means what it meant when written — and the table has no is_active,
 * so a "retire" could only be a DELETE, which is void-not-delete's exact prohibition. No serious system
 * lets a user edit its own audit taxonomy; an auditor reading this table must see what the code emits.
 *
 * So it is registered READ-ONLY: the operator can see and search the full taxonomy (transparency),
 * writes return 405 (integrity). `description` serves as the display name via the alias.
 */
export const auditEventTypesCatalogConfig: GenericCatalogConfig = {
  // CATALOG-AUDIT-EVENT-TYPES-GET-500: `catalogName` was "audit.audit_event_types" (wrong schema —
  // the real table is catalogs.audit_event_types; `tableName` below already correctly reads
  // `audit_event_types` under the factory's hardcoded `catalogs.` prefix, so this string was cosmetic
  // drift, not the live bug). The real live 500 (`column t.id does not exist`, 42703) was the list
  // SELECT unconditionally hardcoding `t.id` — this table has no `id` column at all (code/description/
  // severity_default/created_at only). `idColumn: "code"` tells the factory to select+alias the real
  // natural key instead, mirroring the existing `hasUpdatedAt: false` fix for the same table's missing
  // `updated_at`.
  catalogName: "catalogs.audit_event_types",
  tableName: "audit_event_types",
  routePrefix: "/api/v1/catalogs/accounting",
  urlSegment: "audit-event-types",
  displayName: "Audit Event Types",
  displayNameColumn: "description",
  readOnly: true,
  hasUpdatedAt: false,
  idColumn: "code",
  // Physical columns: code, description, severity_default, created_at — NO is_active / updated_at.
  // softDeleteColumn was wrongly set to "code" → list WHERE t.code = true → Postgres 42883 text=boolean.
  softDeleteColumn: null,
  allowedColumns: ["code", "display_name"],
  requiredColumns: ["code", "display_name"],
  validators: {
    code: z.string().trim().regex(wireCodeRegex),
    display_name: z.string().trim().min(1).max(300),
  },
  searchableColumns: ["code", "description"],
  defaultSort: { column: "code", dir: "asc" },
  hasDeactivatedAt: false,
};

export async function registerGenericCatalogRoutes(app: FastifyInstance) {
  createCatalogRoutes(app, fleetEquipmentTypesCatalogConfig, { mode: "extensions" });
  // LST-A-01: full CRUD — these had no write path at all before.
  createCatalogRoutes(app, dispatchErrorReasonsCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, customerQualityEventReasonsCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, dispatchLumperProvidersCatalogConfig, { mode: "all" });

  createCatalogRoutes(app, accountTypesCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, detailTypesCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, auditEventTypesCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, driverTerminationReasonsCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, customerTypesCatalogConfig, { mode: "all" });
  // LST-WIRE-08 — alias-served maintenance catalogs.
  createCatalogRoutes(app, laborRatesCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, maintenancePartLocationsCatalogConfig, { mode: "all" });
  // LST-WIRE-04 — vendor types: was a hardcoded TS union; now operator-managed.
  createCatalogRoutes(app, vendorTypesCatalogConfig, { mode: "all" });

  // LST-WIRE-03 — 23 previously unrouted catalogs.
  createCatalogRoutes(app, accidentTypesCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, workplaceIncidentTypesCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, leaveTypesCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, cashAdvanceTypesCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, pmIntervalsCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, repairLocationsCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, workOrderTemplatesCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, airBagCatalogCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, batteryCatalogCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, tireCatalogCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, trailerPartsCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, truckPartsCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, defStationsCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, fuelStationsCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, relayAccountsCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, tollProvidersCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, loadTrailerEquipmentCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, mxCustomsBrokersCatalogConfig, { mode: "all" });


  app.get("/api/v1/catalogs/excel-upload-jobs/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);

    const job = await withCurrentUser(authUser.uuid, async (client) => getExcelUploadJob(client, parsedParams.data.id));
    if (!job) return reply.code(404).send({ error: "excel_upload_job_not_found" });
    return job;
  });
}
