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
};

export const workplaceIncidentTypesCatalogConfig: GenericCatalogConfig = {
  catalogName: "safety.workplace_incident_types",
  tableName: "workplace_incident_types",
  routePrefix: "/api/v1/catalogs/safety",
  urlSegment: "workplace-incident-types",
  displayName: "Workplace Incident Types",
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
};

export const leaveTypesCatalogConfig: GenericCatalogConfig = {
  catalogName: "driver.leave_types",
  tableName: "leave_types",
  routePrefix: "/api/v1/catalogs/driver",
  urlSegment: "leave-types",
  displayName: "Leave Types",
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
};

export const cashAdvanceTypesCatalogConfig: GenericCatalogConfig = {
  catalogName: "driver.cash_advance_types",
  tableName: "cash_advance_types",
  routePrefix: "/api/v1/catalogs/driver",
  urlSegment: "cash-advance-types",
  displayName: "Cash Advance Types",
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
};

export const pmIntervalsCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.pm_intervals",
  tableName: "pm_intervals",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "pm-intervals",
  displayName: "Pm Intervals",
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
};

export const repairLocationsCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.repair_locations",
  tableName: "repair_locations",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "repair-locations",
  displayName: "Repair Locations",
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
};

export const workOrderTemplatesCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.work_order_templates",
  tableName: "work_order_templates",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "work-order-templates",
  displayName: "Work Order Templates",
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
};

export const airBagCatalogCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.air_bag_catalog",
  tableName: "air_bag_catalog",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "air-bag-catalog",
  displayName: "Air Bag",
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
};

export const batteryCatalogCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.battery_catalog",
  tableName: "battery_catalog",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "battery-catalog",
  displayName: "Battery",
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
};

export const tireCatalogCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.tire_catalog",
  tableName: "tire_catalog",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "tire-catalog",
  displayName: "Tire",
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
};

export const trailerPartsCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.trailer_parts",
  tableName: "trailer_parts",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "trailer-parts",
  displayName: "Trailer Parts",
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
};

export const truckPartsCatalogConfig: GenericCatalogConfig = {
  catalogName: "maintenance.truck_parts",
  tableName: "truck_parts",
  routePrefix: "/api/v1/catalogs/maintenance",
  urlSegment: "truck-parts",
  displayName: "Truck Parts",
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
};

export const defStationsCatalogConfig: GenericCatalogConfig = {
  catalogName: "fuel.def_stations",
  tableName: "def_stations",
  routePrefix: "/api/v1/catalogs/fuel",
  urlSegment: "def-stations",
  displayName: "Def Stations",
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
};

export const fuelStationsCatalogConfig: GenericCatalogConfig = {
  catalogName: "fuel.fuel_stations",
  tableName: "fuel_stations",
  routePrefix: "/api/v1/catalogs/fuel",
  urlSegment: "fuel-stations",
  displayName: "Fuel Stations",
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
};

export const relayAccountsCatalogConfig: GenericCatalogConfig = {
  catalogName: "fuel.relay_accounts",
  tableName: "relay_accounts",
  routePrefix: "/api/v1/catalogs/fuel",
  urlSegment: "relay-accounts",
  displayName: "Relay Accounts",
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
};

export const tollProvidersCatalogConfig: GenericCatalogConfig = {
  catalogName: "fuel.toll_providers",
  tableName: "toll_providers",
  routePrefix: "/api/v1/catalogs/fuel",
  urlSegment: "toll-providers",
  displayName: "Toll Providers",
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
};

export const loadTrailerEquipmentCatalogConfig: GenericCatalogConfig = {
  catalogName: "dispatch.load_trailer_equipment",
  tableName: "load_trailer_equipment",
  routePrefix: "/api/v1/catalogs/dispatch",
  urlSegment: "load-trailer-equipment",
  displayName: "Load Trailer Equipment",
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
};

export const mxCustomsBrokersCatalogConfig: GenericCatalogConfig = {
  catalogName: "dispatch.mx_customs_brokers",
  tableName: "mx_customs_brokers",
  routePrefix: "/api/v1/catalogs/dispatch",
  urlSegment: "brokers",
  displayName: "Mx Customs Brokers",
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
};

export const vendorTypesCatalogConfig: GenericCatalogConfig = {
  catalogName: "vendors.vendor_types",
  tableName: "vendor_types",
  routePrefix: "/api/v1/catalogs/vendors",
  urlSegment: "vendor-types",
  displayName: "Vendor Types",
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
};

export async function registerGenericCatalogRoutes(app: FastifyInstance) {
  createCatalogRoutes(app, fleetEquipmentTypesCatalogConfig, { mode: "extensions" });
  // LST-A-01: full CRUD — these had no write path at all before.
  createCatalogRoutes(app, dispatchErrorReasonsCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, customerQualityEventReasonsCatalogConfig, { mode: "all" });
  createCatalogRoutes(app, dispatchLumperProvidersCatalogConfig, { mode: "all" });

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
