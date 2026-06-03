export type ActiveFilter = "is_active" | "deactivated_at" | "archived_at" | "none";

export type ModuleCountTableSpec = {
  table: string;
  activeFilter: ActiveFilter;
  companyScoped: boolean;
  schema?: "catalogs" | "reference";
};

/** Live catalog tables per LISTS hub domain — default list filter (active only, no search). */
export const LISTS_MODULE_COUNT_SPECS: Record<string, ModuleCountTableSpec[]> = {
  safety: [
    { table: "internal_fine_reasons", activeFilter: "is_active", companyScoped: true },
    { table: "civil_fine_types", activeFilter: "is_active", companyScoped: true },
    { table: "company_violation_types", activeFilter: "is_active", companyScoped: true },
  ],
  dispatch: [
    { table: "load_types", activeFilter: "is_active", companyScoped: true },
    { table: "detention_reasons", activeFilter: "is_active", companyScoped: true },
    { table: "pickup_time_types", activeFilter: "is_active", companyScoped: true },
    { table: "additional_charges", activeFilter: "is_active", companyScoped: true },
  ],
  drivers: [
    { table: "pay_rate_templates", activeFilter: "is_active", companyScoped: true },
    { table: "driver_deduction_types", activeFilter: "is_active", companyScoped: true },
    { table: "driver_pay_types", activeFilter: "is_active", companyScoped: true },
    { table: "escrow_types", activeFilter: "is_active", companyScoped: true },
    { table: "license_classes", activeFilter: "archived_at", companyScoped: false, schema: "reference" },
    { table: "cdl_endorsements", activeFilter: "archived_at", companyScoped: false, schema: "reference" },
    { table: "cdl_restrictions", activeFilter: "archived_at", companyScoped: false, schema: "reference" },
    { table: "medical_card_statuses", activeFilter: "archived_at", companyScoped: false, schema: "reference" },
    { table: "employment_statuses", activeFilter: "archived_at", companyScoped: false, schema: "reference" },
  ],
  maintenance: [
    { table: "maintenance_failure_codes", activeFilter: "is_active", companyScoped: true },
    { table: "maintenance_labor_codes", activeFilter: "is_active", companyScoped: true },
    { table: "maintenance_parts", activeFilter: "is_active", companyScoped: true },
    { table: "maintenance_priority_levels", activeFilter: "is_active", companyScoped: true },
    { table: "maintenance_service_tasks", activeFilter: "is_active", companyScoped: true },
    { table: "maintenance_shop_locations", activeFilter: "is_active", companyScoped: true },
    { table: "maintenance_vendors", activeFilter: "is_active", companyScoped: true },
    { table: "work_order_statuses", activeFilter: "is_active", companyScoped: true },
  ],
  fuel: [
    { table: "fuel_card_types", activeFilter: "is_active", companyScoped: true },
    { table: "fuel_exception_types", activeFilter: "is_active", companyScoped: true },
    { table: "fuel_station_brands", activeFilter: "is_active", companyScoped: true },
    { table: "fuel_stop_reason_codes", activeFilter: "is_active", companyScoped: true },
    { table: "mpg_bands", activeFilter: "is_active", companyScoped: true },
    { table: "expensive_states", activeFilter: "is_active", companyScoped: true },
    { table: "fuel_tax_jurisdictions", activeFilter: "is_active", companyScoped: true },
    { table: "fuel_brands", activeFilter: "is_active", companyScoped: true },
    { table: "fuel_station_states", activeFilter: "is_active", companyScoped: true },
    { table: "fuel_pump_types", activeFilter: "is_active", companyScoped: true },
    { table: "fuel_grades", activeFilter: "is_active", companyScoped: true },
    { table: "fuel_dispatch_routes", activeFilter: "is_active", companyScoped: true },
  ],
  fleet: [
    { table: "tractor_statuses", activeFilter: "is_active", companyScoped: true },
    { table: "trailer_statuses", activeFilter: "is_active", companyScoped: true },
    { table: "asset_condition_codes", activeFilter: "is_active", companyScoped: true },
    { table: "equipment_types", activeFilter: "is_active", companyScoped: true },
    { table: "tire_positions", activeFilter: "is_active", companyScoped: true },
    { table: "unit_ownership_types", activeFilter: "is_active", companyScoped: true },
    { table: "trailer_types", activeFilter: "is_active", companyScoped: true },
    { table: "lease_terms", activeFilter: "is_active", companyScoped: true },
    { table: "asset_statuses", activeFilter: "is_active", companyScoped: true },
    { table: "asset_locations", activeFilter: "is_active", companyScoped: true },
  ],
  accounting: [
    { table: "accounts", activeFilter: "deactivated_at", companyScoped: false },
    { table: "classes", activeFilter: "deactivated_at", companyScoped: false },
    { table: "payment_terms", activeFilter: "deactivated_at", companyScoped: false },
    { table: "items", activeFilter: "deactivated_at", companyScoped: false },
    { table: "posting_templates", activeFilter: "is_active", companyScoped: false },
    { table: "account_role_bindings", activeFilter: "deactivated_at", companyScoped: false },
    { table: "qbo_categories", activeFilter: "is_active", companyScoped: true },
    { table: "chart_of_accounts_seeds", activeFilter: "is_active", companyScoped: true },
    { table: "expense_categories", activeFilter: "is_active", companyScoped: true },
    { table: "payment_methods", activeFilter: "is_active", companyScoped: true },
    { table: "tax_codes", activeFilter: "is_active", companyScoped: true },
    { table: "currency_codes", activeFilter: "is_active", companyScoped: true },
  ],
  names_master: [],
};

/** Code-defined journal entry types (read-only catalog route). */
export const ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT = 3;

export const LISTS_MODULE_KEYS = Object.keys(LISTS_MODULE_COUNT_SPECS);

const TABLE_NAME_GUARD = /^[a-z_]+$/;

export function buildModuleCountQuery(specs: ModuleCountTableSpec[]): string {
  if (specs.length === 0) {
    return "SELECT 0::int AS count";
  }

  const parts = specs.map((spec) => {
    if (!TABLE_NAME_GUARD.test(spec.table)) {
      throw new Error(`invalid_table_name_for_module_count: ${spec.table}`);
    }
    const schema = spec.schema ?? "catalogs";
    const alias = "t";
    const filters: string[] = [];
    if (spec.companyScoped) filters.push(`${alias}.operating_company_id = $1`);
    if (spec.activeFilter === "is_active") filters.push(`${alias}.is_active = true`);
    if (spec.activeFilter === "deactivated_at") filters.push(`${alias}.deactivated_at IS NULL`);
    if (spec.activeFilter === "archived_at") filters.push(`${alias}.archived_at IS NULL`);
    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    return `(SELECT COUNT(*)::int FROM ${schema}.${spec.table} ${alias} ${where})`;
  });

  return `SELECT (${parts.join(" + ")})::int AS count`;
}
