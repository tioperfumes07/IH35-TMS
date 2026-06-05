# Multi-Carrier Isolation (USMCA-1)

IH35-TMS is multi-tenant from day one: every carrier-scoped row carries `operating_company_id`, and PostgreSQL RLS policies filter via the session variable `app.operating_company_id`.

## Session variable contract

| Variable | Set by | Purpose |
|----------|--------|---------|
| `app.current_user_id` | `withCurrentUser()` in `apps/backend/src/auth/db.ts` | Identity RLS |
| `app.operating_company_id` | `withOperatingCompanyScope()` in `apps/backend/src/auth/operating-company-scope.ts` | Carrier partition |

Every HTTP handler that reads or writes carrier-scoped data MUST call `withOperatingCompanyScope(userId, operatingCompanyId, fn)` (or equivalent `set_config` before queries inside an open transaction).

## Companies

| Code | Role | UI visibility |
|------|------|---------------|
| TRK | Asset holder | Active |
| TRANSP | Operating carrier | Active |
| USMCA | Operating carrier (July 2026 launch) | Hidden (`is_active=false`) until USMCA-3 toggle |

## Carrier-scoped table inventory (representative)

Tables with `operating_company_id` column are audited by `verify:rls-operating-company-scope` and `verify:no-cross-carrier-data-leak`.

| Schema | Examples | RLS pattern |
|--------|----------|---------------|
| `catalogs` | accounts, complaint_types, equipment_types, … | `operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid` |
| `mdata` | customers, vendors, drivers, units, loads, … | Same tenant policy |
| `accounting` | invoices, bills, bank_accounts, … | Same tenant policy |
| `dispatch` | loads, stops, detention_events, … | Same tenant policy |
| `safety` | incidents, dvir, drug_pool, … | Same tenant policy |
| `maint` | work_orders, parts, inspections, … | Same tenant policy |

Migration `0385_rls_audit_all_tables.sql` applies `FORCE ROW LEVEL SECURITY` on any carrier-scoped table that had RLS enabled but not forced.

## CI guards

- `npm run verify:rls-operating-company-scope` — static DB catalog audit
- `npm run verify:no-cross-carrier-data-leak` — runtime partition test (TRANSP vs USMCA)

## Related blocks

- **USMCA-2** — seed USMCA carrier catalogs + CoA from TRANSP template
- **USMCA-3** — soft-launch toggle + CarrierSwitcher filtering
