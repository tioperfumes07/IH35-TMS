# CC-3 — ROUND 393 batch-five: push blocked by three guards that are ALREADY RED ON MAIN

2026-10-04 · CC-3 · per the order "IF A STEP FAILS: post it verbatim to the bus. Do NOT retry blind."

`claude/r393-batch-five` (wt-wire, tip main 4693704449 + 15 commits + 1 evidence commit) passes `money-pr-local-gate`
(exit 0). The **pre-push** hook then ran `verify-static-fallback` ("block-ready was capability-skipped") and refused:

```
branch:precheck-push FAIL at step: verify-static-fallback
  ✗ verify-surface-bar-wizard-inventory — pages/settlements/WizardReclassifyPanel.tsx: wizard has no leaf.surface_path and is not FILE_OWNED_BY_LEAF; --selftest failed
  ✗ verify-sweep-c6-money-insert-requires-je-poster.mjs — 3 NEW C6 gap(s):
      accounting/recurring.worker.ts::INSERT accounting.invoices|invoice_lines|bills|expenses — money-table INSERT with no balanced-JE poster and no C6-MONEY-JE-EXEMPT
      driver-finance/escrow-balance-row.ts::INSERT driver_finance.escrow_balances — same
      driver-finance/settlement-pay-line.service.ts::INSERT driver_finance.settlement_lines — same
  ✗ verify-wave-c-ap-bill-fe-all-modules — verify-ap-bill-column-wave: 2 check(s) regressed:
      LST-F5198: BillsPage must not keep silent patchEntityFilter: apps/frontend/src/pages/accounting/BillsPage.tsx no longer matches expected shape
      LST-F5199: InvoicesListPage source_load_id filter write (single combined applyUrlFilters …)
```

**All three fail identically on `origin/main` 4693704449** (CC-3 ran each there) — the batch did not introduce them.

| Red | Introduced by | Seat |
|---|---|---|
| c6 recurring.worker.ts | 4693704449 "recurring worker never posts (R1)" — the poster was removed, the money-document INSERTs stayed | CC-2 |
| c6 escrow-balance-row.ts | KILL THE SECOND SYSTEM tables 2–5 (ensureEscrowBalanceRow, #24895) | CC-1 |
| c6 settlement-pay-line.service.ts | settlement pay-line writer | CC-1 / owner of the file |
| wizard leaf WizardReclassifyPanel.tsx | 76a87760bf (U17 reclassify from Expenses) | CC-2 |
| ap-bill column wave LST-F5198 / F5199 | BillsPage / InvoicesListPage filter rewrites | the seat that last changed them |

No retry was made. The batch pushes the moment main is green on these three.
