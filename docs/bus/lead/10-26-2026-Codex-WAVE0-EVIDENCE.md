# Codex Wave 0 — first measurement batch, 2026-10-26

Scope: USMCA only. No production writes. Measured main and API health SHA both
`24e7c34e8c17de5421a6303facbc08077fa7a473`. Branch assertion verified
`br-fancy-credit-akjnd07a`; database `neondb`, role `neondb_owner`. Credentials never logged.

## Closed in this batch

| Row | Measured result | Guard / selftest / execution wiring |
|---|---|---|
| ENG-11 | 198 active linehaul rows, 198 loads, zero duplicate loads | `node scripts/verify-one-active-linehaul-per-load.mjs` with configured prod URL and read-only PGOPTIONS: exit 0; `--selftest`: exit 0; step 18799 invokes the guard |
| ENG-14 | 209 bills total, 190 live, zero live bills missing unit | `node scripts/verify-driver-bills-unit-stamp-wired.mjs`: exit 0; `--selftest`: exit 0, 7/7 removal plants caught; step 18823 invokes the guard |
| ENG-63 | Both named guard regressions resolved on deployed source | `node scripts/verify-list-empty-settled.mjs` and `node scripts/verify-entity-label-rejects-uuid-shaped-name.mjs`, each with and without `--selftest`: all exit 0; steps 12410 and 2978 invoke them |

ENG-63 closes the two named static failures only. The list guard still reports 21 advisory
not-yet-migrated sites. This is not a browser acceptance claim or closure of those other sites.

## Read-only count proof

Private execution harness: `~/Downloads/codex-engine-wave0-measure.mjs`, exit 0 at
2026-10-26T21:19:54Z. It asserts the Neon branch through the API before connecting,
begins READ ONLY, sets local bypass/company context, checks the role and nonempty
same-table populations, and rolls back. Reproducible queries (bind `$1` to USMCA):

```sql
BEGIN READ ONLY;
SET LOCAL app.bypass_rls = 'lucia';
SELECT set_config('app.operating_company_id', $1, true);
SELECT current_user, current_database();
SELECT count(*) AS total_active_lines, count(DISTINCT load_id) AS loads
FROM dispatch.load_charge_lines
WHERE operating_company_id=$1 AND is_active AND charge_code='linehaul';
SELECT count(*) AS duplicate_loads FROM (
  SELECT load_id FROM dispatch.load_charge_lines
  WHERE operating_company_id=$1 AND is_active AND charge_code='linehaul'
  GROUP BY load_id HAVING count(*)>1
) d;
SELECT count(*) AS total,
 count(*) FILTER (WHERE voided_at IS NULL AND status NOT IN ('void','voided')) AS live,
 count(*) FILTER (WHERE voided_at IS NULL AND status NOT IN ('void','voided') AND unit_id IS NULL) AS missing_unit
FROM driver_finance.driver_bills WHERE operating_company_id=$1;
ROLLBACK;
```

## Measured, not newly closed

- ENG-01: 122 settlements, zero live closed-unposted; Lead already closed this row.
- ENG-03: 62 escrow ledger rows, zero missing load; Lead already closed this row.
- ENG-15: 191 bills but zero work-order-source bills. Writer guard selftest catches 5/5 plants,
  but no positive live work-order bill population exists. Keep OPEN, not false-green.
- ENG-29 / miles: 45 of 198 nondeleted, nonvoided loads carry actual miles. Keep OPEN.
- ENG-09: existing selftest claims three mutations, but its missing-wiring mutation silently
  skips when its chosen guard is already wired. The eight-entry static array does not enforce
  all DONE-LIVE JSON rows. Reported to Lead; this batch does not weaken or change any guard.

No financial amounts, personal names, credentials, or raw production evidence are included.
