# LIVE TRANSACTION BATTERY — USMCA

> Hub for every PASS/FAIL run against the USMCA entity (`5c854333-6ea5-4faa-af31-67cb272fef80`).  
> Evidence is SQL on prod branch `br-fancy-credit-akjnd07a`, app SHA `dad611e` (live at run time).  
> FAIL rows become OPEN rows on the owning lane's INBOX (money→CC-1, mechanical→CC-2).

---

## Run 2026-11-09 — Verification pass on existing USMCA data

App: `https://ih35-tms.onrender.com` SHA `dad611ebf3` · DB branch `br-fancy-credit-akjnd07a` · project `tiny-field-89581227`

Chrome extension was unavailable this session; creation battery deferred to next live-Chrome session. This run is a SQL verification pass only.

### Baseline counts (prod, bypass_rls not needed — owner session)

| table | n |
|---|---:|
| `mdata.customers` | 1226 |
| `mdata.vendors` | 618 |
| `mdata.loads` | 198 |
| `accounting.invoices` | 243 |
| `accounting.bills` | 199 |
| `accounting.journal_entries` | 3282 |
| `maintenance.work_orders` | 0 |
| `fuel.fuel_transactions` | 962 |
| `driver_finance.driver_settlements` | 122 |
| `banking.bank_transactions` | 1753 |

---

### UNIT-1 · Bill → JE registration

**Verdict: PASS**

```sql
SELECT COUNT(*) AS bills_no_je
FROM accounting.bills b
WHERE b.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
  AND b.voided_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM accounting.journal_entry_postings p
    WHERE p.source_transaction_id = b.id::text
      AND p.operating_company_id = b.operating_company_id
  );
-- bills_no_je = 0
```

199 bills, 0 without JE posting. All bills register downstream.

---

### UNIT-2 · Invoice → JE registration

**Verdict: PASS (JE) / FAIL (load linkage — CC-1 OPEN)**

JE check:
```sql
SELECT COUNT(*) AS invoices_no_je
FROM accounting.invoices i
WHERE i.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
  AND i.voided_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM accounting.journal_entry_postings p
    WHERE p.source_transaction_id = i.id::text
      AND p.operating_company_id = i.operating_company_id
  );
-- invoices_no_je = 0
```

Load linkage check:
```sql
SELECT COUNT(*) AS invoices_no_load
FROM accounting.invoices
WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
  AND voided_at IS NULL AND source_load_id IS NULL;
-- invoices_no_load = 2
```

Offenders (both TMS-native, status='sent', created 2026-10-16):
- `02a454bf-c5ca-4fe0-ba78-5c0f1576429a`
- `9fa8c31e-7c3e-4ea5-b4f4-aac586f8592d`

TIER 1 LINKAGE LAW: a TMS-native invoice must link to a load. These two do not. → **OPEN CC-1**

---

### UNIT-3 · Fuel transaction → JE registration

**Verdict: FAIL — 824 manual fuel txns have no GL posting → CC-1 OPEN**

```sql
-- Source breakdown
SELECT source, COUNT(*) AS n FROM fuel.fuel_transactions
WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
GROUP BY source;
-- import: 84, manual: 878

-- JE posting by source_transaction_type on JE postings
SELECT source_transaction_type, COUNT(*)
FROM accounting.journal_entry_postings
WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
GROUP BY source_transaction_type ORDER BY 2 DESC LIMIT 5;
-- fuel_event: 1926 (the import path), no 'manual' fuel type

-- Active manual without JE
SELECT COUNT(*) FROM fuel.fuel_transactions f
WHERE f.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
  AND f.source='manual' AND f.voided_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM accounting.journal_entry_postings p
    WHERE p.source_transaction_id = f.id::text
      AND p.operating_company_id = f.operating_company_id
  );
-- fuel_active_no_je = 824
```

Root cause: the GL posting service for fuel recognises `source_transaction_type='fuel_event'` (the Relay import path) but has no posting handler for `source='manual'` TMS-created fuel transactions. 824 live USMCA fuel entries carry economic value but no GL debit/credit. → **OPEN CC-1**

---

### UNIT-4 · Void path verification

**Verdict: PASS**

Voided fuel txn `27422d90-4fa4-401f-989d-8d764abfb8d5` (voided 2026-11-04T15:59:01Z):
```sql
SELECT COUNT(*) FROM audit.row_changes
WHERE table_name='fuel_transactions'
  AND row_pk='27422d90-4fa4-401f-989d-8d764abfb8d5'
  AND new_data::text LIKE '%voided_at%';
-- audit_rows = 2, last_change = 2026-11-04T15:59:01.463Z
```

Void reason documented (ACCT-F11105 / ENG-65 sweep). Audit trail exists. WORM satisfied.

---

### UNIT-5 · Load → Party + Driver linkage (TIER 1)

**Verdict: PASS**

```sql
SELECT
  SUM(CASE WHEN customer_id IS NULL THEN 1 ELSE 0 END) AS no_customer,
  SUM(CASE WHEN assigned_primary_driver_id IS NULL THEN 1 ELSE 0 END) AS no_driver
FROM mdata.loads
WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
  AND voided_at IS NULL;
-- no_customer=0, no_driver=0
```

198 loads, all linked to customer and driver.

---

### UNIT-6 · Bill → Vendor linkage

**Verdict: PASS**

```sql
SELECT COUNT(*) FROM accounting.bills
WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
  AND voided_at IS NULL AND vendor_id IS NULL;
-- bills_no_vendor = 0
```

---

### UNIT-7 · Settlement → Load + Tour linkage

**Verdict: PASS (load) / PARTIAL (tour — needs investigation)**

```sql
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN first_load_id IS NULL THEN 1 ELSE 0 END) AS no_first_load,
  SUM(CASE WHEN tour_id IS NULL THEN 1 ELSE 0 END) AS no_tour
FROM driver_finance.driver_settlements
WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
  AND voided_at IS NULL;
-- total=92, no_first_load=0, no_tour=11
```

92 active settlements, 0 without first_load — load linkage PASS. 11 without tour_id — these may be pre-tour settlements or settlements created before tour field existed. Needs investigation to determine if FAIL or EXPECTED STATE. Not filed as defect until origin-class determined.

---

### UNIT-8 · Work Orders (USMCA)

**Verdict: GAP — 0 work orders exist**

`maintenance.work_orders WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'` → 0 rows.

If no maintenance events have occurred for USMCA-leased trucks, this is EXPECTED STATE. Requires a live Chrome session to create a work order through the maintenance module and verify the downstream JE + linkage. Deferred to Chrome-available session.

---

## Open actions from this run

| id | lane | description | status |
|---|---|---|---|
| BAT-001 | CC-1 | Fuel manual posting gap: 824 USMCA fuel txns with no GL JE (`source='manual'`, no posting handler) | OPEN |
| BAT-002 | CC-1 | 2 TMS-native invoices without source_load_id (TIER 1 violation) | OPEN |

Both filed to `docs/bus/INBOX-CC-1.md` this session.
