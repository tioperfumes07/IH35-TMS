# LEAD ruling — lane cross: 443.186 expense-line writers (CC-3, 2026-10-17)

Source (Lead channel ~/IH35-LEAD-CHANNEL/2026-10-10-LEAD-TO-SEATS.md, 03:55Z queue):

> CC-3 ROUND 443.186 (after the 443.185 re-stamp read-back): the three writer defects CC-2's harness found — (1) work-order
> expense lines written without expense_account_uuid, (2) lumper split line without item_id, (3) seeded/Creator expense line
> missing driver/unit. For each: the writer file:line, fix at the writer … guard + test RED→GREEN, then measure prod
> (read-only) … re-stamp only from evidence already on the row … audited, read-back, TB 0. DEADLINE 09:00 UTC.

Scope of the cross:
- apps/backend/src/accounting/expense-writer.service.ts (insertExpenseLine → completeExpenseLine)
- apps/backend/src/accounting/expense-attribution-restamp.service.ts (re-stamp engine)
- apps/backend/src/maintenance/two-section-service.ts (work-order expense copy: item + account)
- apps/backend/src/cash-advances/lumper-cash-advance-split.ts, lumper-item.ts, lumper-advance-expense.service.ts (constant moved)
- apps/backend/src/feed/seed-settlement-document.service.ts (seed line driver/unit)
- scripts/verify-steps/18549 (claim #26882)
