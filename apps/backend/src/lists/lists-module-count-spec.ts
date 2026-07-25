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
    // Added 2026-07-25 — live on the hub since day one but never counted, so the SAFETY badge read
    // 30 while the module held 372 rows on TRANSP. Prod-verified shapes (Neon lucia,
    // br-fancy-credit-akjnd07a): each has operating_company_id + is_active + FORCE RLS.
    { table: "complaint_types", activeFilter: "is_active", companyScoped: true },
    { table: "dot_violation_types", activeFilter: "is_active", companyScoped: true },
    { table: "cargo_claim_reasons", activeFilter: "is_active", companyScoped: true },
  ],
  dispatch: [
    { table: "load_types", activeFilter: "is_active", companyScoped: true },
    { table: "detention_reasons", activeFilter: "is_active", companyScoped: true },
    { table: "pickup_time_types", activeFilter: "is_active", companyScoped: true },
    { table: "additional_charges", activeFilter: "is_active", companyScoped: true },
    // Prod-verified: operating_company_id + is_active + FORCE RLS, 12 active codes per entity.
    { table: "load_cancellation_reasons", activeFilter: "is_active", companyScoped: true },
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
    // Converted per-entity by #3408 (migration 202607890000); prod: 16 active per entity.
    { table: "driver_termination_reasons", activeFilter: "is_active", companyScoped: true },
    // Converted per-entity by #3403 (migration 202607870000); prod: 13 active per entity.
    // Hub reachability = LST-A-01; must also count in the Drivers domain badge.
    { table: "driver_load_statuses", activeFilter: "is_active", companyScoped: true },
  ],
  maintenance: [
    { table: "maintenance_failure_codes", activeFilter: "is_active", companyScoped: true },
    { table: "maintenance_labor_codes", activeFilter: "is_active", companyScoped: true },
    { table: "maintenance_parts", activeFilter: "is_active", companyScoped: true },
    { table: "oem_parts", activeFilter: "archived_at", companyScoped: false, schema: "reference" },
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
  // Fleet catalogs — PER-ENTITY as of migration 202607860000 (owner ruling 2026-07-24: "lists and
  // catalogs should be per entity, but we use the same catalog for all entities"). The 8 converted
  // tables carry operating_company_id + FORCE RLS, so their count adds `WHERE operating_company_id = $1`
  // (the count route always sets app.operating_company_id, so RLS + the explicit filter agree).
  // STILL GLOBAL: equipment_types (dual write-surface — converted in a follow-up PR) and tire_positions
  // (never converted) — both lack operating_company_id, so companyScoped MUST stay false for them or
  // the count adds a filter on a column that does not exist → 42703 → 500.
  fleet: [
    { table: "tractor_statuses", activeFilter: "is_active", companyScoped: true },
    { table: "trailer_statuses", activeFilter: "is_active", companyScoped: true },
    { table: "asset_condition_codes", activeFilter: "is_active", companyScoped: true },
    { table: "equipment_types", activeFilter: "is_active", companyScoped: true },
    { table: "tire_positions", activeFilter: "is_active", companyScoped: false },
    { table: "unit_ownership_types", activeFilter: "is_active", companyScoped: true },
    { table: "trailer_types", activeFilter: "is_active", companyScoped: true },
    { table: "lease_terms", activeFilter: "is_active", companyScoped: true },
    { table: "asset_statuses", activeFilter: "is_active", companyScoped: true },
    { table: "asset_locations", activeFilter: "is_active", companyScoped: true },
  ],
  accounting: [
    // Entity scope for accounts/classes/items is FORCE RLS + GUC, not an explicit
    // operating_company_id filter (companyScoped:true would under/over-count vs policy).
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
    // Added 2026-07-25. companyScoped values are PROD-VERIFIED, not inferred — getting these wrong
    // yields a silent 0 (filtering an all-NULL column) or a 42703 500 (filtering a missing column):
    //   journal_entry_types — NO operating_company_id, policy `qual: true` → GLOBAL, companyScoped false.
    //     Replaces the hardcoded ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT = 3; prod holds 16 active rows,
    //     so the badge was understated by 13 and could never move when the catalog changed.
    //   account_types — NO operating_company_id and RLS is OFF entirely → GLOBAL, companyScoped false.
    //   detail_types — HAS operating_company_id but every row is NULL by design (SHARED CANONICAL:
    //     policy is `operating_company_id IS NULL OR = current_setting(...)`, i.e. one system set
    //     shared by all entities). companyScoped MUST stay false or this counts 0.
    { table: "journal_entry_types", activeFilter: "is_active", companyScoped: false },
    { table: "account_types", activeFilter: "is_active", companyScoped: false },
    { table: "detail_types", activeFilter: "is_active", companyScoped: false },
    { table: "void_cancel_reasons", activeFilter: "is_active", companyScoped: true },
  ],
  names_master: [],
};

// REMOVED 2026-07-25 — ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT was a hardcoded literal `3` ADDED to the
// live accounting count. AF-5 had already replaced the 3-row in-file array with a real
// catalogs.journal_entry_types table (migration 202607120000 seeds 16 codes; the route reads the
// table — see catalogs/accounting/factory.ts). The stub was removed from the route and left in the
// count, so the badge was permanently understated by 13 and could not move. It is now a normal
// count-spec row above.

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
