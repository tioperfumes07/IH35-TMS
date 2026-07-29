export type ActiveFilter = "is_active" | "deactivated_at" | "archived_at" | "none";

export type ModuleCountTableSpec = {
  table: string;
  activeFilter: ActiveFilter;
  companyScoped: boolean;
  schema?: "catalogs" | "reference" | "mdata";
  /**
   * LST-COUNT-01: a FIXED predicate for a domain whose live catalog is a typed slice of a shared
   * table rather than its own catalogs.* table (Names master → Brokers is mdata.customers filtered to
   * customer_type='broker'). Never user input — these are literals compiled into the spec, and the
   * same TABLE_NAME_GUARD-style discipline applies via SQL_PREDICATE_GUARD below.
   */
  whereSql?: string;
};

/** Live catalog tables per LISTS hub domain — default list filter (active only, no search). */
export const LISTS_MODULE_COUNT_SPECS: Record<string, ModuleCountTableSpec[]> = {
  safety: [
    // LST-F20: wired catalogs that no badge counted. Shapes prod-verified 2026-07-29
    // (information_schema): every one carries operating_company_id; activeFilter reflects whether
    // the table actually has is_active.
    { table: "accident_types", activeFilter: "is_active", companyScoped: true },
    { table: "workplace_incident_types", activeFilter: "is_active", companyScoped: true },
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
    // LST-F20: wired catalogs that no badge counted. Shapes prod-verified 2026-07-29
    // (information_schema): every one carries operating_company_id; activeFilter reflects whether
    // the table actually has is_active.
    { table: "dispatch_flag_colors", activeFilter: "is_active", companyScoped: true },
    { table: "load_trailer_equipment", activeFilter: "is_active", companyScoped: true },
    { table: "lumper_providers", activeFilter: "is_active", companyScoped: true },
    { table: "mx_customs_brokers", activeFilter: "is_active", companyScoped: true },
    { table: "load_types", activeFilter: "is_active", companyScoped: true },
    { table: "detention_reasons", activeFilter: "is_active", companyScoped: true },
    { table: "pickup_time_types", activeFilter: "is_active", companyScoped: true },
    { table: "additional_charges", activeFilter: "is_active", companyScoped: true },
    // Prod-verified: operating_company_id + is_active + FORCE RLS, 12 active codes per entity.
    { table: "load_cancellation_reasons", activeFilter: "is_active", companyScoped: true },
    // LST-COUNT-01: both are LIVE and per-entity on prod (verified 2026-07-28 under lucia —
    // dispatcher_error_reasons 75 rows, customer_quality_event_reasons 72 rows, each with
    // operating_company_id + is_active) and were absent from this spec entirely, so the DISPATCH badge
    // understated by 147 rows across the two.
    { table: "dispatcher_error_reasons", activeFilter: "is_active", companyScoped: true },
    { table: "customer_quality_event_reasons", activeFilter: "is_active", companyScoped: true },
  ],
  drivers: [
    // LST-F20: wired catalogs that no badge counted. Shapes prod-verified 2026-07-29
    // (information_schema): every one carries operating_company_id; activeFilter reflects whether
    // the table actually has is_active.
    { table: "cash_advance_types", activeFilter: "is_active", companyScoped: true },
    { table: "leave_types", activeFilter: "is_active", companyScoped: true },
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
    // LST-F20: wired catalogs that no badge counted. Shapes prod-verified 2026-07-29
    // (information_schema): every one carries operating_company_id; activeFilter reflects whether
    // the table actually has is_active.
    { table: "air_bag_catalog", activeFilter: "is_active", companyScoped: true },
    { table: "battery_catalog", activeFilter: "is_active", companyScoped: true },
    { table: "labor_rates", activeFilter: "is_active", companyScoped: true },
    { table: "maintenance_part_locations", activeFilter: "is_active", companyScoped: true },
    { table: "parts", activeFilter: "is_active", companyScoped: true },
    { table: "pm_intervals", activeFilter: "is_active", companyScoped: true },
    { table: "repair_locations", activeFilter: "is_active", companyScoped: true },
    { table: "tire_catalog", activeFilter: "is_active", companyScoped: true },
    { table: "trailer_parts", activeFilter: "is_active", companyScoped: true },
    { table: "truck_parts", activeFilter: "is_active", companyScoped: true },
    { table: "work_order_templates", activeFilter: "is_active", companyScoped: true },
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
    // LST-F20: wired catalogs that no badge counted. Shapes prod-verified 2026-07-29
    // (information_schema): every one carries operating_company_id; activeFilter reflects whether
    // the table actually has is_active.
    { table: "def_stations", activeFilter: "is_active", companyScoped: true },
    { table: "fuel_stations", activeFilter: "is_active", companyScoped: true },
    { table: "relay_accounts", activeFilter: "is_active", companyScoped: true },
    { table: "toll_providers", activeFilter: "is_active", companyScoped: true },
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
    // LST-F03 migration 202608000000 adds opco (HELD / not on prod yet). Count-spec must
    // stay companyScoped:false until Neon apply — otherwise WHERE opco=$1 → 42703 on live prod.
    { table: "payment_terms", activeFilter: "deactivated_at", companyScoped: false },
    { table: "items", activeFilter: "deactivated_at", companyScoped: false },
    { table: "posting_templates", activeFilter: "is_active", companyScoped: false },
    // LST-F09: schema has opco + RLS, but Neon still 0 rows — keep companyScoped:false until density / intentional flip.
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
  // LST-COUNT-01: this was `[]`, which made buildModuleCountQuery emit `SELECT 0::int` — a PERMANENT
  // ZERO badge while the hub rendered a live Brokers catalog (AllCatalogsMap: live: true). Brokers is
  // not its own catalogs.* table; it is a typed slice of mdata.customers, which is why it could not be
  // expressed before. Prod-verified 2026-07-28 under lucia: mdata.customers has customer_type,
  // operating_company_id and deactivated_at, and 4 brokers exist — so the badge was understating by 4
  // and structurally could never move.
  names_master: [
    // LST-F20: wired catalogs that no badge counted. Shapes prod-verified 2026-07-29
    // (information_schema): every one carries operating_company_id; activeFilter reflects whether
    // the table actually has is_active.
    { table: "customer_types", activeFilter: "is_active", companyScoped: true },
    { table: "vendor_types", activeFilter: "is_active", companyScoped: true },
    {
      schema: "mdata",
      table: "customers",
      activeFilter: "deactivated_at",
      companyScoped: true,
      whereSql: "customer_type::text = 'broker'",
    },
  ],
};

// REMOVED 2026-07-25 — ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT was a hardcoded literal `3` ADDED to the
// live accounting count. AF-5 had already replaced the 3-row in-file array with a real
// catalogs.journal_entry_types table (migration 202607120000 seeds 16 codes; the route reads the
// table — see catalogs/accounting/factory.ts). The stub was removed from the route and left in the
// count, so the badge was permanently understated by 13 and could not move. It is now a normal
// count-spec row above.

export const LISTS_MODULE_KEYS = Object.keys(LISTS_MODULE_COUNT_SPECS);

const TABLE_NAME_GUARD = /^[a-z_]+$/;
/** Fixed, spec-authored predicates only: identifiers, comparison, quoted literals and casts. */
const SQL_PREDICATE_GUARD = /^[a-z0-9_.:' =]+$/i;

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
    if (spec.whereSql) {
      if (!SQL_PREDICATE_GUARD.test(spec.whereSql)) {
        throw new Error(`invalid_where_predicate_for_module_count: ${spec.whereSql}`);
      }
      filters.push(`${alias}.${spec.whereSql}`);
    }
    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    return `(SELECT COUNT(*)::int FROM ${schema}.${spec.table} ${alias} ${where})`;
  });

  return `SELECT (${parts.join(" + ")})::int AS count`;
}
