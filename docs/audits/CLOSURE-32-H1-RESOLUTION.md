# CLOSURE-32 H1 — Resolution: `mdata.drivers` OCI scoping

**Severity:** HIGH (structural multi-tenant isolation defect)
**Finding source:** `docs/audits/CLOSURE-32-FINDINGS-2026-06-05.md` (§0, §5 entry `mdata.drivers/rls_coverage`, §7 H1)
**Resolved by migration:** `db/migrations/0404_drivers_rls_oci_scope.sql`
**Guard:** `scripts/verify-drivers-rls-scope.mjs` (wired in `.github/workflows/closure-checks.yml`)
**PR:** #599 · **Merge SHA:** `535c02052c482441362c071d05e996254369a288` · **Prod ledger applied:** 2026-06-06 05:13:04Z

## Finding

`mdata.drivers` carried a non-isolating SELECT policy:

```
drivers_select  USING (identity.is_lucia_bypass() OR identity.current_user_role() IS NOT NULL)
```

Any authenticated role (office or driver, any carrier) could `SELECT` **all** drivers regardless of `operating_company_id`. Zero rows leaked at audit time only because all 82 drivers belong to TRANSP; the gap activates the moment TRK/USMCA onboard drivers (July 2026 launch). `mdata.drivers` was 1 of only 2 carrier-scoped tables using neither isolation mechanism (the other, `admin.launch_toggles`, is an intentional bypass-only global config — L2).

## Pattern applied (mirrors canonical siblings)

The fix mirrors the canonical mdata carrier-table SELECT pattern (`mdata.customers`, `mdata.vendors`, `mdata.equipment`, `mdata.units`, `mdata.driver_company_authorizations`) using `org.user_accessible_company_ids()` (Pattern B / user-access scope), and preserves the Driver self-access path:

```sql
CREATE POLICY drivers_select
ON mdata.drivers
FOR SELECT
TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id IN (SELECT org.user_accessible_company_ids())
  OR identity_user_id = identity.current_user_id()
);
```

- **OCI scoping:** `operating_company_id IN (SELECT org.user_accessible_company_ids())` — office users only see drivers within their accessible operating companies.
- **Driver self-access preserved:** `identity_user_id = identity.current_user_id()` — a Driver-role user can still read their own `mdata.drivers` row (PWA), consistent with `loads_select_driver` / `driver_teams_select_driver`.
- **Role narrowed `{public}` → `{ih35_app}`** to match every other mdata SELECT policy (the app's connection role).
- **`deactivated_at IS NULL` intentionally omitted:** H1 is a tenant-isolation defect; soft-delete filtering is a separate concern and adding it would change visibility of deactivated drivers for in-OCI office/admin views. Isolation is fully achieved without it.

Idempotent migration: `ENABLE`/`FORCE` RLS (already on) + `DROP POLICY IF EXISTS` + `CREATE POLICY`. Scope limited to the `mdata.drivers` SELECT policy; no data modification; INSERT/UPDATE policies unchanged.

## Verification approach

1. **Static regression guard** (`verify:drivers-rls-scope`, CI `closure-checks`): asserts the latest migration defining `drivers_select` is OCI-scoped via `org.user_accessible_company_ids()`; fails if a future migration reintroduces an unscoped form.
2. **Runtime RLS matrix R1–R7** re-run against `mdata.drivers` from TRK + TRANSP simulated sessions (role `ih35_app`, `SET LOCAL` session vars) post-merge; requires **7/7 PASS** (cross-carrier blocked, in-OCI visible, default-deny on unset/fake context, bypass = all).

## Post-merge

- Render deploy of the merge SHA applies `0404` to production (preDeploy `db:migrate`).
- R1–R7 results recorded; `CLOSURE-32-FINDINGS-2026-06-05.md` H1 flipped to RESOLVED with the merge SHA.
