# GO — SETL-TRACE-01 (2026-08-30) — SUPERSEDES prior SETL-VERIFY-01 post-on-approved

**VOID:** Any INBOX/GO that says post the single `approved` USMCA settlement (S-20260816-0168) or “pay-run poster never fired.”  
**Owner:** build one full traced settlement; leave posted; CC-2 verifies 16 links.  
**Discriminator:** `je >= 2218`, `bypass_rls=lucia`. Skip #15546 / #16895.

## Correction (verified live)

| Fact | Live |
|------|------|
| S-2026-0002 header `accounting_bill_id` | **NULL** (write-back broken) |
| S-2026-0002 `driver_settlement_gl_runs` | status **reversed** 2026-08-21, gross 29760, deductions **0**, vendor set |
| S-2026-0002 `gl_bills` | bill 35b8ce38 → JE b7575a45 → cash pmt d6f22f71 → cash JE 8bc9947e; load L-20260810-0003 |
| S-20260816-0168 | status approved, **gross_pay 0.00** — unfit |
| USMCA settlements | 17; real money non-sample **1** (the reversed one) |
| Lines approved / with posting_account | **0 / 7** |
| Pending deductions unapplied | **2** |
| Runs/bills with deduction JE/payment | **0** system-wide |
| Header bill populated | **0** of 17 |

Poster **has** fired. Deduction leg **has not**. Header back-link **never** writes.

### Confirmed root cause of header gap (repo — do not guess)

- **ONLY writer** of `driver_settlements.accounting_bill_id` / `accounting_bill_payment_id`:
  `apps/backend/src/payroll/driver-settlement.service.deprecated.ts:653-654`.
  `payroll.*` is **RETIRE** under linkage law — do **not** resurrect it.
- **Live poster** `accounting/settlement-posting/settlement-bill-payment-posting.service.ts`
  writes those IDs **only** into `driver_settlement_gl_bills` (~L647-650, L722-726), never the header.
- **TXH trap:** `system/transaction-health.service.ts:386-389` uses
  `(s.accounting_bill_id IS NOT NULL)` as linkage, with a **false comment** claiming the live poster
  writes the header. Report exact predicate before changing TXH; fix is live-poster header write-back.

**Three seats** (CC-2, Claude, Cursor) misread “0 bills” from the header alone — schema trap, not three careless seats.

## → CC-1

```
TASK: SETL-TRACE-01 — build one full traceable settlement. Owner-directed.
VOID prior SETL-VERIFY-01 "post the approved zero-dollar settlement."

CONFIRMED HEADER GAP: only deprecated payroll/*.ts:653-654 writes header bill IDs.
Live poster writes gl_bills only. FIX live poster to write header back-link.
Do NOT resurrect RETIRE payroll writer.

ALSO CONFIRM (report, do not fix blind): transaction-health.service.ts:386-389
(s.accounting_bill_id IS NOT NULL) — if that is live TXH linkage, every settlement scores unlinked.

BUILD via APP UI (not raw SQL):
  driver: real active USMCA, is_sample_data FALSE
  load:   real delivered USMCA, is_sample_data FALSE
  lines:  earnings + deduction (apply 1 of 2 pending) + reimbursement
          each posting_account_id SET, approval_status='approved'
  REQUIRED: gross>0, deductions>0, net>0, NET ≠ GROSS (fires virgin deduction leg)

Expect approval_status=approved gate to break (0 of 7 ever) — fix root cause, no bypass.
Rule 37 (CLAIM→MERGE→AUTHOR): claim verify-step EVEN number; merge claim to origin/main
BEFORE authoring scripts/verify-steps/NNNN-*.mjs. Never claim+author same PR
(chore/claimed-regen only atomic exception). WORM: reverse, never erase.
LEAVE specimen POSTED (no auto-reverse).
ACK: CC-1 | ACK | SETL-TRACE-01 | SHA=<live> | GO
```

## → CC-2

```
TASK: SETL-TRACE-01 VERIFY. Do NOT stamp until all 16 link points resolve both ways.
VOID prior "poster never fired" and VOID post-on-S-20260816-0168.

Capture UUID evidence for each of 16 points in GO-SETL-TRACE-01 §2 (loads, drivers, units,
settlement loads, lines approved+account, deduction applied, reimbursement, vendor canonical,
driver_bill, accounting_bill, bill JE DR=CR>0, cash pmt, cash JE, DEDUCTION pmt+JE,
HEADER accounting_bill_id+payment_id, bank txn+payment_state+events).

ALSO: gross - deductions = cash on BOTH gl_runs and gl_bills.
LEAVE POSTED. Reversal = separate owner call. Then Hard Rule 5 prod_verified.
Driver is real money — amount right before post.
ACK: CC-2 | ACK | SETL-TRACE-01-VERIFY | SHA=<live> | GO
```

## Still true (unchanged)

FACT-RESERVE-01 remains CC-1 P0 for Faro (parallel money lane — serialize if hotfile clash; prefer FACT-RESERVE-01 first if one PR at a time on money).
