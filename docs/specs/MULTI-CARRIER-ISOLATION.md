# Multi-Carrier Isolation (USMCA-1)

Third carrier **USMCA Freight Solutions** (`org.companies.code = USMCA`) is pre-seeded with `is_active = false` until the July 2026 launch toggle (USMCA-3). IH 35 Trucking (`TRK`) and IH 35 Transportation (`TRANSP`) share the same multi-tenant model.

## Session variable contract

| Variable | Purpose |
|----------|---------|
| `app.operating_company_id` | Primary tenant scope for carrier-scoped tables (uuid) |
| `app.current_user_id` | Identity RLS + role checks |
| `app.bypass_rls = lucia` | Auth bootstrap only (`withLuciaBypass`) |

Backend helpers live in `apps/backend/src/auth/operating-company-scope.ts`:

- `setOperatingCompanyScope(client, id)` — sets session var inside a transaction
- `requireOperatingCompanyScope(client)` — throws if unset/invalid before carrier queries
- `withOperatingCompanyScope(userId, companyId, fn)` — request wrapper (BEGIN/COMMIT)

## Carrier-scoped table inventory (pattern)

Every table below includes `operating_company_id uuid NOT NULL REFERENCES org.companies(id)` (or equivalent FK) and must have:

1. `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
2. A tenant policy referencing `app.operating_company_id` (usually with `identity.is_lucia_bypass()` OR branch)
3. `NULLIF(current_setting('app.operating_company_id', true), '')::uuid` cast (see migration `0359_rls_uuid_cast_defensive.sql`)

### Domains (representative tables)

| Schema | Tables | Scope column | RLS |
|--------|--------|--------------|-----|
| `mdata` | customers, vendors, locations, drivers, units, equipment, qbo_accounts, qbo_items, … | operating_company_id | tenant policies per migration |
| `catalogs` | complaint_types, equipment_types, dispatch_flag_colors, … | operating_company_id | tenant policies |
| `dispatch` | loads, stops, documents, … | operating_company_id | tenant policies |
| `accounting` | qbo_accounts, journal entries, … | operating_company_id | tenant policies |
| `compliance` | form_425c_reports, csa_basic_scores, drug_alcohol_* | operating_company_id | tenant policies |
| `qbo_sync` | drift_log, drift_alert_throttle | operating_company_id | **0385** (USMCA-1 audit fix) |
| `integrations` | qbo_payroll_links | operating_company_id | **0385** (USMCA-1 audit fix) |
| `org` | companies | global read; Owner write | company_select_all + lucia bypass |

Global/reference tables without `operating_company_id` (e.g. `reference.*`, audit append-only) are out of scope for tenant session vars but remain protected by role policies.

## CI guards (USMCA-1)

| Script | Checks |
|--------|--------|
| `verify:rls-operating-company-scope` | Static module + migration 0385; live DB audit that all `operating_company_id` tables have RLS + policies |
| `verify:no-cross-carrier-data-leak` | Runtime: seed under TRANSP, assert USMCA/fake UUID sessions see zero rows |

## USMCA launch notes

- USMCA company row exists in `org.companies` but is hidden from office UI until `is_active` flips (USMCA-3).
- Owner retains DB-level access via `org.user_accessible_company_ids()` for bootstrap (USMCA-2).
