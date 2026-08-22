import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiRequestFormData } from "../api/client";

export type CatalogFieldType = "text" | "number" | "boolean" | "date" | "enum" | "foreign_key" | "color";

export type CatalogFieldConfig = {
  key: string;
  label: string;
  type: CatalogFieldType;
  required?: boolean;
  readOnlyOnEdit?: boolean;
  placeholder?: string;
  enumOptions?: Array<{ value: string; label: string }>;
  foreignKey?: {
    catalogName: string;
    labelField: string;
    valueField: string;
  };
};

export type CatalogColumnConfig = {
  key: string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
};

export type CatalogSortConfig = {
  column: string;
  dir: "asc" | "desc";
};

export type CatalogRow = {
  id: string;
  code?: string;
  display_name?: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type CatalogListResponse = {
  rows: CatalogRow[];
  total: number;
};

export type CatalogListFilters = {
  operating_company_id: string;
  search?: string;
  is_active?: "true" | "false" | "all";
  limit?: number;
  offset?: number;
  sort?: string;
  dir?: "asc" | "desc";
};

export type ExcelUploadJob = {
  id: string;
  catalog_name: string;
  file_url?: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  rows_total: number;
  rows_succeeded: number;
  rows_failed: number;
  error_log: Array<{ row: number; reason: string; data?: Record<string, unknown> }>;
  started_at: string;
  completed_at: string | null;
};

export type GenericCatalogDefinition = {
  catalogName: string;
  displayName: string;
  domain: string;
  catalogKey: string;
  readOnly?: boolean;
  columns: CatalogColumnConfig[];
  fields: CatalogFieldConfig[];
  defaultSort: CatalogSortConfig;
};

/** Factory-registered catalogs (CATALOG-1 backend). Extend as catalogs migrate. */
export const GENERIC_CATALOG_REGISTRY: Record<string, GenericCatalogDefinition> = {
  // LST-A-01: registered so the generic catalog page can serve them. Column shape and both enums read
  // from prod 2026-07-28 and mirrored from the live CHECK constraints — these use `label`, not
  // display_name, and event_type/severity are NOT NULL with a fixed domain.
  // OWNER RULING 2026-07-28 — every catalog gets a QuickBooks-style creator wizard. Uses the canonical
  // code/display_name shape (verified against prod information_schema, not assumed), so the generic
  // catalog page renders its list AND its create/edit form with no bespoke code.
  // LST-WIRE-01 — canonical code/display_name shape, verified against prod information_schema.
  // LST-WIRE-02 — 29 catalogs that had a working backend route and NO registry entry, so
  // catalogKeyToCatalogName() returned null and the page rendered "unknown catalog". Generated from
  // the backend configs themselves (same extractor the completeness gate uses) so the domain and
  // catalogKey cannot drift from the route that serves them. Label column verified per table against
  // prod information_schema: most use display_name; asset_*/lease_terms/tractor_statuses/
  // trailer_statuses/trailer_types/unit_ownership_types use `name`.
  "fleet.asset_condition_codes": {
    catalogName: "fleet.asset_condition_codes",
    displayName: "Asset Condition Codes",
    domain: "fleet",
    catalogKey: "condition-codes",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Asset Condition Code", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Asset Condition Code", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fleet.asset_locations": {
    catalogName: "fleet.asset_locations",
    displayName: "Asset Locations",
    domain: "fleet",
    catalogKey: "asset-locations",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Asset Location", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Asset Location", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fleet.asset_statuses": {
    catalogName: "fleet.asset_statuses",
    displayName: "Asset Statuses",
    domain: "fleet",
    catalogKey: "asset-statuses",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Asset Statuse", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Asset Statuse", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.expensive_states": {
    catalogName: "fuel.expensive_states",
    displayName: "Expensive States",
    domain: "fuel",
    catalogKey: "expensive-states",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Expensive State", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Expensive State", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.fuel_brands": {
    catalogName: "fuel.fuel_brands",
    displayName: "Fuel Brands",
    domain: "fuel",
    catalogKey: "brands",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Fuel Brand", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Fuel Brand", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.fuel_card_types": {
    catalogName: "fuel.fuel_card_types",
    displayName: "Fuel Card Types",
    domain: "fuel",
    catalogKey: "card-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Fuel Card Type", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Fuel Card Type", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.fuel_dispatch_routes": {
    catalogName: "fuel.fuel_dispatch_routes",
    displayName: "Fuel Dispatch Routes",
    domain: "fuel",
    catalogKey: "dispatch-routes",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Fuel Dispatch Route", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Fuel Dispatch Route", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.fuel_exception_types": {
    catalogName: "fuel.fuel_exception_types",
    displayName: "Fuel Exception Types",
    domain: "fuel",
    catalogKey: "exception-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Fuel Exception Type", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Fuel Exception Type", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.fuel_grades": {
    catalogName: "fuel.fuel_grades",
    displayName: "Fuel Grades",
    domain: "fuel",
    catalogKey: "grades",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Fuel Grade", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Fuel Grade", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.fuel_pump_types": {
    catalogName: "fuel.fuel_pump_types",
    displayName: "Fuel Pump Types",
    domain: "fuel",
    catalogKey: "pump-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Fuel Pump Type", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Fuel Pump Type", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.fuel_station_brands": {
    catalogName: "fuel.fuel_station_brands",
    displayName: "Fuel Station Brands",
    domain: "fuel",
    catalogKey: "station-brands",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Fuel Station Brand", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Fuel Station Brand", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.fuel_station_states": {
    catalogName: "fuel.fuel_station_states",
    displayName: "Fuel Station States",
    domain: "fuel",
    catalogKey: "station-states",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Fuel Station State", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Fuel Station State", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.fuel_stop_reason_codes": {
    catalogName: "fuel.fuel_stop_reason_codes",
    displayName: "Fuel Stop Reason Codes",
    domain: "fuel",
    catalogKey: "stop-reason-codes",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Fuel Stop Reason Code", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Fuel Stop Reason Code", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.fuel_tax_jurisdictions": {
    catalogName: "fuel.fuel_tax_jurisdictions",
    displayName: "Fuel Tax Jurisdictions",
    domain: "fuel",
    catalogKey: "tax-jurisdictions",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Fuel Tax Jurisdiction", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Fuel Tax Jurisdiction", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fleet.lease_terms": {
    catalogName: "fleet.lease_terms",
    displayName: "Lease Terms",
    domain: "fleet",
    catalogKey: "lease-terms",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Lease Term", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Lease Term", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.maintenance_failure_codes": {
    catalogName: "maintenance.maintenance_failure_codes",
    displayName: "Maintenance Failure Codes",
    domain: "maintenance",
    catalogKey: "failure-codes",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Maintenance Failure Code", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Maintenance Failure Code", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.maintenance_labor_codes": {
    catalogName: "maintenance.maintenance_labor_codes",
    displayName: "Maintenance Labor Codes",
    domain: "maintenance",
    catalogKey: "labor-codes",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Maintenance Labor Code", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Maintenance Labor Code", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.maintenance_parts": {
    catalogName: "maintenance.maintenance_parts",
    displayName: "Maintenance Parts",
    domain: "maintenance",
    catalogKey: "parts",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Maintenance Part", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Maintenance Part", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.maintenance_priority_levels": {
    catalogName: "maintenance.maintenance_priority_levels",
    displayName: "Maintenance Priority Levels",
    domain: "maintenance",
    catalogKey: "priority-levels",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Maintenance Priority Level", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Maintenance Priority Level", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.maintenance_service_tasks": {
    catalogName: "maintenance.maintenance_service_tasks",
    displayName: "Maintenance Service Tasks",
    domain: "maintenance",
    catalogKey: "service-tasks",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Maintenance Service Task", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Maintenance Service Task", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.maintenance_shop_locations": {
    catalogName: "maintenance.maintenance_shop_locations",
    displayName: "Maintenance Shop Locations",
    domain: "maintenance",
    catalogKey: "shop-locations",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Maintenance Shop Location", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Maintenance Shop Location", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.maintenance_vendors": {
    catalogName: "maintenance.maintenance_vendors",
    displayName: "Maintenance Vendors",
    domain: "maintenance",
    catalogKey: "vendors",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Maintenance Vendor", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Maintenance Vendor", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.mpg_bands": {
    catalogName: "fuel.mpg_bands",
    displayName: "MPG Bands",
    domain: "fuel",
    catalogKey: "mpg-bands",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Mpg Band", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Mpg Band", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "driver.pay_rate_templates": {
    catalogName: "driver.pay_rate_templates",
    displayName: "Pay Rate Templates",
    domain: "driver",
    catalogKey: "pay-rate-templates",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Pay Rate Template", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Pay Rate Template", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fleet.tractor_statuses": {
    catalogName: "fleet.tractor_statuses",
    displayName: "Tractor Statuses",
    domain: "fleet",
    catalogKey: "tractor-statuses",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Tractor Statuse", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Tractor Statuse", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fleet.trailer_statuses": {
    catalogName: "fleet.trailer_statuses",
    displayName: "Trailer Statuses",
    domain: "fleet",
    catalogKey: "trailer-statuses",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Trailer Statuse", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Trailer Statuse", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fleet.trailer_types": {
    catalogName: "fleet.trailer_types",
    displayName: "Trailer Types",
    domain: "fleet",
    catalogKey: "trailer-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Trailer Type", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Trailer Type", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fleet.unit_ownership_types": {
    catalogName: "fleet.unit_ownership_types",
    displayName: "Unit Ownership Types",
    domain: "fleet",
    catalogKey: "ownership-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Unit Ownership Type", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Unit Ownership Type", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.work_order_statuses": {
    catalogName: "maintenance.work_order_statuses",
    displayName: "Work Order Statuses",
    domain: "maintenance",
    catalogKey: "work-order-statuses",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Work Order Statuse", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Work Order Statuse", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  // LST-WIRE-09 — CoA lookups plus the READ-ONLY audit event taxonomy.
  "accounting.account_types": {
    catalogName: "accounting.account_types",
    displayName: "Account Types",
    domain: "accounting",
    catalogKey: "account-types-lookup",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Type", sortable: true, filterable: true },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Type", type: "text", required: true },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  "accounting.detail_types": {
    catalogName: "accounting.detail_types",
    displayName: "Detail Types",
    domain: "accounting",
    catalogKey: "detail-types-lookup",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Detail Type", sortable: true, filterable: true },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Detail Type", type: "text", required: true },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  "audit.audit_event_types": {
    catalogName: "audit.audit_event_types",
    displayName: "Audit Event Types",
    domain: "accounting",
    catalogKey: "audit-event-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Event", sortable: true, filterable: true },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Event", type: "text", required: true },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  // LST-WIRE-07/08 — customer types, termination reasons, and two alias-served maintenance catalogs.
  "maintenance.labor_rates": {
    catalogName: "maintenance.labor_rates",
    displayName: "Labor Rates",
    domain: "maintenance",
    catalogKey: "labor-rates",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Rate", sortable: true, filterable: true },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Rate", type: "text", required: true },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  "maintenance.maintenance_part_locations": {
    catalogName: "maintenance.maintenance_part_locations",
    displayName: "Part Locations",
    domain: "maintenance",
    catalogKey: "part-locations",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Location", sortable: true, filterable: true },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Location", type: "text", required: true },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  "driver.driver_termination_reasons": {
    catalogName: "driver.driver_termination_reasons",
    displayName: "Termination Reasons",
    domain: "driver",
    catalogKey: "termination-reasons",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Reason", sortable: true, filterable: true },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Reason", type: "text", required: true },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  "customers.customer_types": {
    catalogName: "customers.customer_types",
    displayName: "Customer Types",
    domain: "customers",
    catalogKey: "customer-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Customer Type", sortable: true, filterable: true },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Customer Type", type: "text", required: true },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  // LST-WIRE-06 — seven catalogs whose backend routes are registered with `catalogPath` rather than
  // `urlSegment`. The completeness gate could not see that spelling, so it reported them as wired when
  // their pages could not resolve. Frontend registry entries only; no accounting.* code or migration.
  "accounting.journal_entry_types": {
    catalogName: "accounting.journal_entry_types",
    displayName: "Journal Entry Types",
    domain: "accounting",
    catalogKey: "journal-entry-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Journal Entry Type", sortable: true, filterable: true },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Journal Entry Type", type: "text", required: true },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  "accounting.accounts": {
    catalogName: "accounting.accounts",
    displayName: "Accounts",
    domain: "accounting",
    catalogKey: "chart-of-accounts",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Account", sortable: true, filterable: true },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Account", type: "text", required: true },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  "accounting.classes": {
    catalogName: "accounting.classes",
    displayName: "Classes",
    domain: "accounting",
    catalogKey: "classes",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Classe", sortable: true, filterable: true },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Classe", type: "text", required: true },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  "accounting.payment_terms": {
    catalogName: "accounting.payment_terms",
    displayName: "Payment Terms",
    domain: "accounting",
    catalogKey: "payment-terms",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Payment Term", sortable: true, filterable: true },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Payment Term", type: "text", required: true },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  "accounting.items": {
    catalogName: "accounting.items",
    displayName: "Items",
    domain: "accounting",
    catalogKey: "items",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Item", sortable: true, filterable: true },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Item", type: "text", required: true },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  "accounting.posting_templates": {
    catalogName: "accounting.posting_templates",
    displayName: "Posting Templates",
    domain: "accounting",
    catalogKey: "posting-templates",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Posting Template", sortable: true, filterable: true },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Posting Template", type: "text", required: true },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  "accounting.account_role_bindings": {
    catalogName: "accounting.account_role_bindings",
    displayName: "Account Role Bindings",
    domain: "accounting",
    catalogKey: "account-role-bindings",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Account Role Binding", sortable: true, filterable: true },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Account Role Binding", type: "text", required: true },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  // LST-WIRE-05 — the eight financial catalogs. Each already had a working backend route and no
  // registry entry, so its page rendered "unknown catalog". Frontend-only: no accounting.* code and no
  // migration is touched here — those remain the money lane's.
  "accounting.chart_of_accounts_seeds": {
    catalogName: "accounting.chart_of_accounts_seeds",
    displayName: "Chart of Accounts Seeds",
    domain: "accounting",
    catalogKey: "chart-of-accounts-seeds",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Chart of Accounts Seed", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Chart of Accounts Seed", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "accounting.expense_categories": {
    catalogName: "accounting.expense_categories",
    displayName: "Expense Categories",
    domain: "accounting",
    catalogKey: "expense-categories",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Expense Categorie", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Expense Categorie", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "accounting.payment_methods": {
    catalogName: "accounting.payment_methods",
    displayName: "Payment Methods",
    domain: "accounting",
    catalogKey: "payment-methods",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Payment Method", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Payment Method", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "accounting.tax_codes": {
    catalogName: "accounting.tax_codes",
    displayName: "Tax Codes",
    domain: "accounting",
    catalogKey: "tax-codes",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Tax Code", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Tax Code", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "accounting.currency_codes": {
    catalogName: "accounting.currency_codes",
    displayName: "Currency Codes",
    domain: "accounting",
    catalogKey: "currency-codes",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Currency Code", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Currency Code", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "driver.driver_deduction_types": {
    catalogName: "driver.driver_deduction_types",
    displayName: "Driver Deduction Types",
    domain: "driver",
    catalogKey: "deduction-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Driver Deduction Type", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Driver Deduction Type", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "driver.driver_pay_types": {
    catalogName: "driver.driver_pay_types",
    displayName: "Driver Pay Types",
    domain: "driver",
    catalogKey: "pay-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Driver Pay Type", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Driver Pay Type", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "driver.escrow_types": {
    catalogName: "driver.escrow_types",
    displayName: "Escrow Types",
    domain: "driver",
    catalogKey: "escrow-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Escrow Type", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Escrow Type", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  // LST-WIRE-04 — vendor types. The picker was a frozen TypeScript union; this makes the catalog the
  // single source so the owner can add, rename and retire types per entity.
  "vendors.vendor_types": {
    catalogName: "vendors.vendor_types",
    displayName: "Vendor Types",
    domain: "vendors",
    catalogKey: "vendor-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Vendor Type", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Vendor Type", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  // LST-WIRE-03 — registry entries for the 23 newly-routed catalogs.
  "safety.accident_types": {
    catalogName: "safety.accident_types",
    displayName: "Accident Types",
    domain: "safety",
    catalogKey: "accident-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Accident Type", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Accident Type", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "safety.workplace_incident_types": {
    catalogName: "safety.workplace_incident_types",
    displayName: "Workplace Incident Types",
    domain: "safety",
    catalogKey: "workplace-incident-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Workplace Incident Type", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Workplace Incident Type", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "driver.cdl_endorsements": {
    catalogName: "driver.cdl_endorsements",
    displayName: "Cdl Endorsements",
    domain: "driver",
    catalogKey: "endorsements",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Cdl Endorsement", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Cdl Endorsement", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "driver.cdl_restrictions": {
    catalogName: "driver.cdl_restrictions",
    displayName: "Cdl Restrictions",
    domain: "driver",
    catalogKey: "restrictions",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Cdl Restriction", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Cdl Restriction", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "driver.employment_statuses": {
    catalogName: "driver.employment_statuses",
    displayName: "Employment Statuses",
    domain: "driver",
    catalogKey: "employment-status",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Employment Statuse", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Employment Statuse", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "driver.license_classes": {
    catalogName: "driver.license_classes",
    displayName: "License Classes",
    domain: "driver",
    catalogKey: "license-classes",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "License Classe", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "License Classe", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "driver.medical_card_statuses": {
    catalogName: "driver.medical_card_statuses",
    displayName: "Medical Card Statuses",
    domain: "driver",
    catalogKey: "medical-card-status",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Medical Card Statuse", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Medical Card Statuse", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "driver.leave_types": {
    catalogName: "driver.leave_types",
    displayName: "Leave Types",
    domain: "driver",
    catalogKey: "leave-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Leave Type", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Leave Type", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "driver.cash_advance_types": {
    catalogName: "driver.cash_advance_types",
    displayName: "Cash Advance Types",
    domain: "driver",
    catalogKey: "cash-advance-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Cash Advance Type", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Cash Advance Type", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.pm_intervals": {
    catalogName: "maintenance.pm_intervals",
    displayName: "Pm Intervals",
    domain: "maintenance",
    catalogKey: "pm-intervals",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Pm Interval", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Pm Interval", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.repair_locations": {
    catalogName: "maintenance.repair_locations",
    displayName: "Repair Locations",
    domain: "maintenance",
    catalogKey: "repair-locations",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Repair Location", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Repair Location", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.work_order_templates": {
    catalogName: "maintenance.work_order_templates",
    displayName: "Work Order Templates",
    domain: "maintenance",
    catalogKey: "work-order-templates",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Work Order Template", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Work Order Template", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.air_bag_catalog": {
    catalogName: "maintenance.air_bag_catalog",
    displayName: "Air Bag",
    domain: "maintenance",
    catalogKey: "air-bag-catalog",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Air Bag", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Air Bag", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.battery_catalog": {
    catalogName: "maintenance.battery_catalog",
    displayName: "Battery",
    domain: "maintenance",
    catalogKey: "battery-catalog",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Battery", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Battery", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.tire_catalog": {
    catalogName: "maintenance.tire_catalog",
    displayName: "Tire",
    domain: "maintenance",
    catalogKey: "tire-catalog",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Tire", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Tire", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.trailer_parts": {
    catalogName: "maintenance.trailer_parts",
    displayName: "Trailer Parts",
    domain: "maintenance",
    catalogKey: "trailer-parts",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Trailer Part", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Trailer Part", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "maintenance.truck_parts": {
    catalogName: "maintenance.truck_parts",
    displayName: "Truck Parts",
    domain: "maintenance",
    catalogKey: "truck-parts",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Truck Part", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Truck Part", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.def_stations": {
    catalogName: "fuel.def_stations",
    displayName: "Def Stations",
    domain: "fuel",
    catalogKey: "def-stations",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Def Station", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Def Station", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.fuel_stations": {
    catalogName: "fuel.fuel_stations",
    displayName: "Fuel Stations",
    domain: "fuel",
    catalogKey: "fuel-stations",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Fuel Station", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Fuel Station", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.relay_accounts": {
    catalogName: "fuel.relay_accounts",
    displayName: "Relay Accounts",
    domain: "fuel",
    catalogKey: "relay-accounts",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Relay Account", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Relay Account", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "fuel.toll_providers": {
    catalogName: "fuel.toll_providers",
    displayName: "Toll Providers",
    domain: "fuel",
    catalogKey: "toll-providers",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Toll Provider", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Toll Provider", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "dispatch.load_trailer_equipment": {
    catalogName: "dispatch.load_trailer_equipment",
    displayName: "Load Trailer Equipment",
    domain: "dispatch",
    catalogKey: "load-trailer-equipment",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Load Trailer Equipment", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Load Trailer Equipment", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "dispatch.mx_customs_brokers": {
    catalogName: "dispatch.mx_customs_brokers",
    displayName: "Mx Customs Brokers",
    domain: "dispatch",
    catalogKey: "brokers",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Mx Customs Broker", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Mx Customs Broker", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "dispatch.load_types": {
    catalogName: "dispatch.load_types",
    displayName: "Load Types",
    domain: "dispatch",
    catalogKey: "load-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Load Type", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Load Type", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  // LST-WIRE-01 — canonical code/display_name shape, verified against prod information_schema.
  "dispatch.detention_reasons": {
    catalogName: "dispatch.detention_reasons",
    displayName: "Detention Reasons",
    domain: "dispatch",
    catalogKey: "detention-reasons",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Reason", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Reason", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  // LST-WIRE-01 — canonical code/display_name shape, verified against prod information_schema.
  "dispatch.pickup_time_types": {
    catalogName: "dispatch.pickup_time_types",
    displayName: "Pickup Time Types",
    domain: "dispatch",
    catalogKey: "pickup-time-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Type", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Type", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  // LST-WIRE-01 — canonical code/display_name shape, verified against prod information_schema.
  "dispatch.additional_charges": {
    catalogName: "dispatch.additional_charges",
    displayName: "Additional Charges",
    domain: "dispatch",
    catalogKey: "additional-charges",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Charge", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Charge", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "dispatch.lumper_providers": {
    catalogName: "dispatch.lumper_providers",
    displayName: "Lumper Providers",
    domain: "dispatch",
    catalogKey: "lumper-providers",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Provider", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Sort", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Provider", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
  "dispatch.dispatcher_error_reasons": {
    catalogName: "dispatch.dispatcher_error_reasons",
    displayName: "Dispatcher Error Reasons",
    domain: "dispatch",
    catalogKey: "dispatcher-error-reasons",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "label", label: "Label", sortable: true, filterable: true },
      { key: "event_type", label: "Event Type", sortable: true, filterable: true },
      { key: "severity", label: "Severity", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "label", label: "Label", type: "text", required: true },
      { key: "event_type", label: "Event Type", type: "enum", required: true,
        enumOptions: [{ value: "customer_complaint", label: "Customer Complaint" }, { value: "missed_appointment", label: "Missed Appointment" }, { value: "unpaid_invoice_responsibility", label: "Unpaid Invoice Responsibility" }, { value: "abandoned_load_dispatcher_fault", label: "Abandoned Load Dispatcher Fault" }, { value: "rate_below_threshold_unjustified", label: "Rate Below Threshold Unjustified" }, { value: "driver_complaint_validated", label: "Driver Complaint Validated" }, { value: "commendation", label: "Commendation" }, { value: "training_required", label: "Training Required" }, { value: "policy_violation", label: "Policy Violation" }, { value: "other", label: "Other" }] },
      { key: "severity", label: "Severity", type: "enum", required: true,
        enumOptions: [{ value: "info", label: "Info" }, { value: "warning", label: "Warning" }, { value: "severe", label: "Severe" }] },
      { key: "description", label: "Description", type: "text", required: false },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  "customers.customer_quality_event_reasons": {
    catalogName: "customers.customer_quality_event_reasons",
    displayName: "Customer Quality Event Reasons",
    domain: "customers",
    catalogKey: "customer-quality-event-reasons",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "label", label: "Label", sortable: true, filterable: true },
      { key: "event_type", label: "Event Type", sortable: true, filterable: true },
      { key: "severity", label: "Severity", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "label", label: "Label", type: "text", required: true },
      { key: "event_type", label: "Event Type", type: "enum", required: true,
        enumOptions: [{ value: "late_payment", label: "Late Payment" }, { value: "non_payment", label: "Non Payment" }, { value: "lumper_dispute", label: "Lumper Dispute" }, { value: "detention_dispute", label: "Detention Dispute" }, { value: "tonu_dispute", label: "Tonu Dispute" }, { value: "load_cancelled", label: "Load Cancelled" }, { value: "rate_dispute", label: "Rate Dispute" }, { value: "damage_claim", label: "Damage Claim" }, { value: "commendation", label: "Commendation" }, { value: "other", label: "Other" }] },
      { key: "severity", label: "Severity", type: "enum", required: true,
        enumOptions: [{ value: "info", label: "Info" }, { value: "warning", label: "Warning" }, { value: "severe", label: "Severe" }] },
      { key: "description", label: "Description", type: "text", required: false },
    ],
    defaultSort: { column: "code", dir: "asc" },
  },
  "fleet.equipment_types": {
    catalogName: "fleet.equipment_types",
    displayName: "Equipment Types",
    domain: "fleet",
    catalogKey: "equipment-types",
    columns: [
      { key: "code", label: "Code", sortable: true, filterable: true },
      { key: "display_name", label: "Display Name", sortable: true, filterable: true },
      { key: "description", label: "Description", sortable: false, filterable: false },
      { key: "sort_order", label: "Order", sortable: true, filterable: false },
      { key: "is_active", label: "Status", sortable: true, filterable: false },
    ],
    fields: [
      { key: "code", label: "Code", type: "text", required: true, readOnlyOnEdit: true },
      { key: "display_name", label: "Display Name", type: "text", required: true },
      { key: "description", label: "Description", type: "text", required: false },
      { key: "sort_order", label: "Sort Order", type: "number", required: true },
      { key: "is_active", label: "Active", type: "boolean", required: false },
    ],
    defaultSort: { column: "sort_order", dir: "asc" },
  },
};

const LEGACY_HAND_ROLLED_CATALOG_PAGES = new Set([
  "apps/frontend/src/pages/lists/fleet/EquipmentTypesListPage.tsx",
]);

export function getLegacyHandRolledCatalogPages(): ReadonlySet<string> {
  return LEGACY_HAND_ROLLED_CATALOG_PAGES;
}

export function catalogKeyToCatalogName(domain: string, catalogKey: string): string | null {
  const normalizedKey = catalogKey.replace(/-/g, "_");
  const candidate = `${domain}.${normalizedKey}`;
  if (GENERIC_CATALOG_REGISTRY[candidate]) return candidate;
  for (const def of Object.values(GENERIC_CATALOG_REGISTRY)) {
    if (def.domain === domain && def.catalogKey === catalogKey) return def.catalogName;
  }
  return null;
}

export function catalogNameToRoutePath(catalogName: string): string {
  const def = GENERIC_CATALOG_REGISTRY[catalogName];
  if (def) return `/lists/${def.domain}/${def.catalogKey}`;
  const [domain, table] = catalogName.split(".");
  const catalogKey = (table ?? "").replace(/_/g, "-");
  return `/lists/${domain}/${catalogKey}`;
}

export function catalogNameToApiBasePath(catalogName: string): string {
  // Prefer registry catalogKey — it is the same contract as FE routes and backend
  // urlSegment. Deriving the segment from the table half of catalogName breaks when
  // the table is domain-prefixed (e.g. maintenance.maintenance_part_locations →
  // maintenance-part-locations 404 while the live route is …/part-locations).
  const def = GENERIC_CATALOG_REGISTRY[catalogName];
  if (def) return `/api/v1/catalogs/${def.domain}/${def.catalogKey}`;
  const [domain, table] = catalogName.split(".");
  const segment = (table ?? "").replace(/_/g, "-");
  return `/api/v1/catalogs/${domain}/${segment}`;
}

function buildListQuery(filters: CatalogListFilters): string {
  const params = new URLSearchParams();
  params.set("operating_company_id", filters.operating_company_id);
  if (filters.search) params.set("search", filters.search);
  if (filters.is_active) params.set("is_active", filters.is_active);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.offset !== undefined) params.set("offset", String(filters.offset));
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.dir) params.set("dir", filters.dir);
  return params.toString();
}

export function listCatalogRows(catalogName: string, filters: CatalogListFilters) {
  const base = catalogNameToApiBasePath(catalogName);
  return apiRequest<CatalogListResponse>(`${base}?${buildListQuery(filters)}`);
}

export function getCatalogRow(catalogName: string, id: string, operating_company_id: string) {
  const base = catalogNameToApiBasePath(catalogName);
  return apiRequest<CatalogRow>(`${base}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`);
}

export function createCatalogRow(catalogName: string, operating_company_id: string, body: Record<string, unknown>) {
  const base = catalogNameToApiBasePath(catalogName);
  return apiRequest<CatalogRow>(`${base}?operating_company_id=${encodeURIComponent(operating_company_id)}`, {
    method: "POST",
    body,
  });
}

export function updateCatalogRow(
  catalogName: string,
  id: string,
  operating_company_id: string,
  body: Record<string, unknown>
) {
  const base = catalogNameToApiBasePath(catalogName);
  return apiRequest<CatalogRow>(`${base}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`, {
    method: "PATCH",
    body,
  });
}

export function archiveCatalogRow(catalogName: string, id: string, operating_company_id: string) {
  const base = catalogNameToApiBasePath(catalogName);
  return apiRequest<{ ok: true }>(`${base}/${id}?operating_company_id=${encodeURIComponent(operating_company_id)}`, {
    method: "DELETE",
  });
}

export function restoreCatalogRow(catalogName: string, id: string, operating_company_id: string) {
  const base = catalogNameToApiBasePath(catalogName);
  return apiRequest<CatalogRow>(
    `${base}/${id}/restore?operating_company_id=${encodeURIComponent(operating_company_id)}`,
    { method: "POST" }
  );
}

export function importCatalogExcel(catalogName: string, operating_company_id: string, file: File) {
  const base = catalogNameToApiBasePath(catalogName);
  const formData = new FormData();
  formData.append("file", file);
  return apiRequestFormData<{ job_id: string }>(
    `${base}/import?operating_company_id=${encodeURIComponent(operating_company_id)}`,
    formData
  );
}

export function getExcelUploadJob(jobId: string) {
  return apiRequest<ExcelUploadJob>(`/api/v1/catalogs/excel-upload-jobs/${encodeURIComponent(jobId)}`);
}

export function catalogExportCsvUrl(catalogName: string, operating_company_id: string): string {
  const base = catalogNameToApiBasePath(catalogName);
  return `${base}/export.csv?operating_company_id=${encodeURIComponent(operating_company_id)}`;
}

type UseCatalogQueryOptions = {
  catalogName: string;
  companyId: string;
  search?: string;
  isActive?: "true" | "false" | "all";
  sort?: CatalogSortConfig;
  enabled?: boolean;
};

export function useCatalogQuery({
  catalogName,
  companyId,
  search,
  isActive = "true",
  sort,
  enabled = true,
}: UseCatalogQueryOptions) {
  const definition = GENERIC_CATALOG_REGISTRY[catalogName];
  const defaultSort = sort ?? definition?.defaultSort ?? { column: "sort_order", dir: "asc" as const };

  return useQuery({
    queryKey: ["catalog", catalogName, companyId, search, isActive, defaultSort.column, defaultSort.dir],
    queryFn: () =>
      listCatalogRows(catalogName, {
        operating_company_id: companyId,
        search: search || undefined,
        is_active: isActive,
        sort: defaultSort.column,
        dir: defaultSort.dir,
        limit: 200,
        offset: 0,
      }),
    enabled: enabled && Boolean(companyId),
  });
}

export function useCatalogMutations(catalogName: string, companyId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["catalog", catalogName] });
  };

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => createCatalogRow(catalogName, companyId, body),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      updateCatalogRow(catalogName, id, companyId, body),
    onSuccess: invalidate,
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveCatalogRow(catalogName, id, companyId),
    onSuccess: invalidate,
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreCatalogRow(catalogName, id, companyId),
    onSuccess: invalidate,
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => importCatalogExcel(catalogName, companyId, file),
  });

  return {
    createMutation,
    updateMutation,
    archiveMutation,
    restoreMutation,
    importMutation,
  };
}

export function useExcelUploadJobQuery(jobId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["catalog-excel-job", jobId],
    queryFn: () => getExcelUploadJob(jobId!),
    enabled: enabled && Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === "completed" || status === "failed") return false;
      return 1500;
    },
  });
}
