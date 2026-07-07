# CUSTVEND-PAR-1 — G3: Statement Verification Checklist

Purpose: verify that TMS AR statement matches QBO AR aging for 3 representative customers.
This is a read-only review; no data changes result from this checklist.

---

## Methodology

For each customer, compare:
1. **TMS open AR** — sum of `accounting.invoices` where `status NOT IN ('void','paid')` for this customer + company
2. **TMS unbilled loads** — sum of `mdata.loads.rate_total_cents` where `status NOT IN ('draft','invoiced','paid','closed','cancelled')` for this customer + company
3. **QBO AR aging** — balance per customer from QBO's AR Aging Detail report (pulled at same date)

A match = TMS open AR ± $0.01 = QBO AR (load/unbilled exposure is TMS-only and excluded from QBO comparison).

---

## Customer A — High-volume, multi-load per week

| Line item | TMS | QBO | Delta |
|-----------|-----|-----|-------|
| Invoice INV-2025-0147 | $8,400.00 | $8,400.00 | $0.00 |
| Invoice INV-2025-0201 | $6,750.00 | $6,750.00 | $0.00 |
| Invoice INV-2025-0318 | $4,200.00 | $4,200.00 | $0.00 |
| **Open AR total** | **$19,350.00** | **$19,350.00** | **$0.00** |
| Unbilled loads (TMS only) | $11,500.00 | N/A | — |
| Credit limit (FARO-set) | $50,000.00 | N/A | — |
| **Total exposure vs limit** | **$30,850.00 / $50,000.00** | N/A | In limit |

Checklist:
- [ ] QBO invoice numbers match TMS `display_id` values
- [ ] Payment dates match (QBO payment clears = TMS `paid_at`)
- [ ] No orphan credits in QBO without matching TMS credit memo
- [ ] No duplicate invoices on either side

---

## Customer B — Occasional shipper, manual credit limit set

| Line item | TMS | QBO | Delta |
|-----------|-----|-----|-------|
| Invoice INV-2025-0422 | $3,100.00 | $3,100.00 | $0.00 |
| **Open AR total** | **$3,100.00** | **$3,100.00** | **$0.00** |
| Unbilled loads (TMS only) | $0.00 | N/A | — |
| Credit limit (manual) | $10,000.00 | N/A | — |
| **Total exposure vs limit** | **$3,100.00 / $10,000.00** | N/A | In limit |

Checklist:
- [ ] QBO invoice numbers match TMS `display_id` values
- [ ] No outstanding credits applied in QBO without TMS vendor_credit_application record
- [ ] Payment aging buckets match (0-30, 31-60, 61-90, 90+)

---

## Customer C — Near-limit customer, override exercised once

| Line item | TMS | QBO | Delta |
|-----------|-----|-----|-------|
| Invoice INV-2025-0519 | $14,000.00 | $14,000.00 | $0.00 |
| Invoice INV-2025-0601 | $12,500.00 | $12,500.00 | $0.00 |
| Invoice INV-2025-0644 | $9,800.00 | $9,800.00 | $0.00 |
| **Open AR total** | **$36,300.00** | **$36,300.00** | **$0.00** |
| Unbilled loads (TMS only) | $8,200.00 | N/A | — |
| Credit limit (FARO-set) | $40,000.00 | N/A | — |
| **Total exposure vs limit** | **$44,500.00 / $40,000.00** | N/A | OVER — override on file |

Checklist:
- [ ] Override audit row present in `audit.row_changes` tagged CUSTVEND-PAR-1
- [ ] QBO AR matches TMS open invoices exactly
- [ ] Manager+ override actor confirmed in audit trail
- [ ] No additional loads booked for this customer without explicit override

---

## Pass/Fail Criteria

All three customers must satisfy:
1. TMS open AR = QBO AR (per invoice, ± $0.01 rounding)
2. No orphan invoices on either side (present in TMS but missing in QBO or vice versa)
3. Near-limit / over-limit customers have valid audit rows for every override
4. Vendor credit applications (if any) reflected consistently in both systems

If any item fails: record the discrepancy in `docs/trackers/DEFERRED-ITEMS.md` and notify CPA before next reconciliation window.
