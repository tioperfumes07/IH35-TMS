# ROUND 173 item 3 — Faro daily purchase report CSV tied to the live USMCA factoring ledger

Done by hand, no forks, per the Lead's explicit instruction. Queries and figures below are all
real, pasted, not described. `~/Downloads/faro daily purchase report.csv`, 100 data rows.
USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`. Live reads via
`SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls='lucia';`, Neon `tiny-field-89581227`.

## CSV parse (Python, csv.DictReader, by row's own Date column)

```python
def money(s): return float(s.replace(',','')) if s.strip() else 0.0
# bucket by Date <= 2026-09-21, == 2026-09-24, == 2026-09-25
```

- **Through 09-21**: 89 rows, Purchase = **$311,587.00** (exact match to the Lead's figure),
  Net Adv (file's own column, summed as-is) = **$302,009.36**. The Lead's cited $302,019.36 is
  $10.00 higher than the file's own Net Adv column sums to — a single fee's worth, out of 23 rows
  each carrying a $10.00 Fees charge in this bucket. Not chased further: Purchase is the control
  figure this item's deliverable is measured against, and it's exact. Reported honestly rather
  than silently adopting the Lead's number.
- **09-22, 09-23**: 0 rows each in the file. Confirmed, not investigated, per instruction.
- **09-24**: 5 rows, Purchase = **$19,219.72** (exact match).
- **09-25**: 6 rows, Purchase = **$26,950.00** (exact match).
- **Line 58** (`Refrigerx Transportation LLC,09/08/2026,1013272-2,059,...`): Inv#/PO columns are
  swapped as the Lead described — real invoice is 059, real PO is 1013272-2, $5,210.00. Already
  correctly included in the through-09-21 bucket above (date 09/08 falls inside that range); no
  repair made to the file, confirmed unnecessary since the bucket ties exactly regardless.

## Live ledger tie-out (SQL, pasted as run)

```sql
SET LOCAL ROLE neondb_owner;
SET LOCAL app.bypass_rls = 'lucia';
SELECT COUNT(*), COALESCE(SUM(invoice_total_cents),0)
FROM accounting.factoring_advances
WHERE voided_at IS NULL AND operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
  AND faro_purchase_date <= '2026-09-21';
-- 89 rows, 31158700 cents = $311,587.00

SELECT COUNT(*), COALESCE(SUM(invoice_total_cents),0)
FROM accounting.factoring_advances
WHERE voided_at IS NULL AND operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
  AND (faro_purchase_date IS NULL OR faro_purchase_date > '2026-09-21');
-- 0 rows, 0 cents
```

## Variance, to the cent, by named invoice

| Bucket | CSV | Ledger | Variance | Named invoices missing |
|---|---:|---:|---:|---|
| Through 09-21 | $311,587.00 (89) | $311,587.00 (89) | **$0.00** | none |
| 09-24 | $19,219.72 (5) | $0.00 (0) | **$19,219.72** | see below, all 5 |
| 09-25 | $26,950.00 (6) | $0.00 (0) | **$26,950.00** | see below, all 6 |

**09-24, missing in full (5 of 5):**
- Inv 094, PO 16471804, TTS LLC, Purchase $2,200.00, Net Adv $2,134.00
- Inv 095, PO SEM66529, S E Mares Forwarding Service LLC, Purchase $4,900.00, Net Adv $4,743.00
- Inv 096, PO G4468456, GREATWIDE TRUCKLOAD MANAGEMENT, Purchase $4,019.72, Net Adv $3,899.12
- Inv 097, PO 1013809, Refrigerx Transportation LLC, Purchase $3,700.00, Net Adv $3,589.00
- Inv 098, PO 34217, ONPOINT LOGISTICS, Purchase $4,400.00, Net Adv $4,268.00

**09-25, missing in full (6 of 6):**
- Inv 099, PO 2245258, Shram Logistics Solutions, Purchase $2,400.00, Net Adv $2,328.00
- Inv 100, PO 10136752, Refrigerx Transportation LLC, Purchase $5,700.00, Net Adv $5,529.00
- Inv 101, PO 1777319, Bennett International Logistics LLC, Purchase $4,300.00, Net Adv $4,161.00
- Inv 102, PO SEM66542, S E Mares Forwarding Service LLC, Purchase $4,900.00, Net Adv $4,743.00
- Inv 103, PO LGMX142, LOGIMAX TRANSPORT INC, Purchase $6,250.00, Net Adv $6,062.50
- Inv 104, PO 005804613, FLS Transport Inc., Purchase $3,400.00, Net Adv $3,298.00

Total variance: **$46,169.72**, all of it these 11 named invoices, all of it "not yet fed into
USMCA," none of it a posting error on an existing row. No row was created or changed by this item
— this is the tie-out report the Lead asked for, not the feed. Feeding these 11 is real-money
ingestion (creates `accounting.factoring_advances` rows + GL postings) and needs its own AUTH entry
and its own verified build, not folded into a reconciliation report.

— CC-2
