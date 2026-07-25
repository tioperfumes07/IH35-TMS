# Neon apply — Cost of Labor–Mexico Drivers (INTERNAL 6890)

**Owner ruling (2026-07-25 chat):** no external/QBO account number — use **internal TMS** `6890` on TRANSP and USMCA.  
**CPA locked name:** `Cost of Labor–Mexico Drivers` (Contract Labor / COGS CostOfLaborCos) — see Desktop `CPA ANSWERS.docx` + `IH35-CURSOR-AUDIT/CPA-ANSWERS-ALREADY-LOCKED-2026-07-23.md`.  
**File:** `db/migrations/202607790000_cost_of_labor_mexico_drivers_transp_usmca.sql`

---

## BOX M1 — seed accounts (paste in Neon SQL)

```sql
-- sha256 filled at commit time — see companion ledger box
BEGIN;

INSERT INTO catalogs.accounts
  (account_number, account_name, account_type, account_subtype,
   is_postable, currency_code, operating_company_id)
SELECT
  v.account_number,
  v.account_name,
  v.account_type,
  v.account_subtype,
  true,
  'USD',
  c.id
FROM (VALUES
  ('TRANSP'::text, '6890'::text, 'Cost of Labor–Mexico Drivers'::text, 'CostOfGoodsSold'::text, 'CostOfLaborCos'::text),
  ('USMCA'::text,  '6890'::text, 'Cost of Labor–Mexico Drivers'::text, 'CostOfGoodsSold'::text, 'CostOfLaborCos'::text)
) AS v(company_code, account_number, account_name, account_type, account_subtype)
JOIN org.companies c ON c.code = v.company_code AND c.deactivated_at IS NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM catalogs.accounts a
  WHERE a.operating_company_id = c.id
    AND a.deactivated_at IS NULL
    AND (
      a.account_number = v.account_number
      OR lower(a.account_name) = lower(v.account_name)
    )
)
ON CONFLICT (operating_company_id, account_number) DO NOTHING;

COMMIT;
```

---

## BOX M2 — dual ledger backfill

```sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES (
  '202607790000_cost_of_labor_mexico_drivers_transp_usmca.sql',
  'd709ac509f113e7f42e7bf9f7b94c0fa0ef740f5157a7598f7d76402c8096101',
  now(),
  'jorge-neon-hand-apply',
  0
)
ON CONFLICT (filename) DO NOTHING;

INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES (
  '202607790000_cost_of_labor_mexico_drivers_transp_usmca.sql',
  now(),
  'jorge-neon-hand-apply'
)
ON CONFLICT (name) DO NOTHING;
```

---

## BOX M3 — designate `driver_pay_expense` → 6890 (TRANSP + USMCA)

CPA already locked this role to **Cost of Labor–Mexico Drivers**. Live Neon still points TRANSP at `QBO-1150040140` Nomina and USMCA at `5100` Driver Pay / Settlements — repoint to the new internal account.

```sql
BEGIN;

UPDATE accounting.chart_of_accounts_roles r
SET account_id = a.id,
    updated_at = now()
FROM catalogs.accounts a
JOIN org.companies c ON c.id = a.operating_company_id
WHERE r.operating_company_id = c.id
  AND r.role = 'driver_pay_expense'
  AND r.is_active = true
  AND c.code IN ('TRANSP', 'USMCA')
  AND a.account_number = '6890'
  AND a.account_name = 'Cost of Labor–Mexico Drivers'
  AND a.deactivated_at IS NULL;

-- If a company had zero active driver_pay_expense rows, insert:
INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
SELECT c.id, 'driver_pay_expense', a.id, true
FROM org.companies c
JOIN catalogs.accounts a
  ON a.operating_company_id = c.id
 AND a.account_number = '6890'
 AND a.account_name = 'Cost of Labor–Mexico Drivers'
 AND a.deactivated_at IS NULL
WHERE c.code IN ('TRANSP', 'USMCA')
  AND c.deactivated_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles r
    WHERE r.operating_company_id = c.id
      AND r.role = 'driver_pay_expense'
      AND r.is_active = true
  );

COMMIT;
```

---

## BOX M4 — verify

```sql
SELECT set_config('app.bypass_rls','lucia',true);

SELECT c.code, a.account_number, a.account_name, a.account_type, a.account_subtype, a.is_postable
FROM catalogs.accounts a
JOIN org.companies c ON c.id = a.operating_company_id
WHERE a.account_name = 'Cost of Labor–Mexico Drivers'
  AND c.code IN ('TRANSP','USMCA')
ORDER BY c.code;

SELECT c.code, r.role, a.account_number, a.account_name
FROM accounting.chart_of_accounts_roles r
JOIN org.companies c ON c.id = r.operating_company_id
JOIN catalogs.accounts a ON a.id = r.account_id
WHERE r.role = 'driver_pay_expense'
  AND r.is_active = true
  AND c.code IN ('TRANSP','USMCA')
ORDER BY c.code;

SELECT EXISTS (
  SELECT 1 FROM _system._schema_migrations
  WHERE filename = '202607790000_cost_of_labor_mexico_drivers_transp_usmca.sql'
) AS in_system_ledger,
EXISTS (
  SELECT 1 FROM ih35_migrations.applied_migrations
  WHERE name = '202607790000_cost_of_labor_mexico_drivers_transp_usmca.sql'
) AS in_ih35_ledger;
```

**Expect:** two rows (TRANSP/USMCA) `6890` · roles both point at `6890` · both ledgers true.


## Owner paste results (recorded 2026-07-25)

- **M1:** Statement executed successfully (BEGIN → INSERT 2 → COMMIT)
- **M2:** Statement executed successfully (both ledger INSERTs)
- **M3:** Statement executed successfully (UPDATE 2 → INSERT → COMMIT)
- **M4:** TRANSP+USMCA accounts `6890` · both `driver_pay_expense` roles → `6890`
- Independent Neon re-proof: accounts + roles + both ledgers **true**
