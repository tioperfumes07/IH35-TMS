# Block-CMC: Month-close wizard

## Scope

Introduces a guided month-end close wizard that consolidates operational checklist gates before allowing period lock.

## Shipped

- `GET /api/v1/accounting/month-close-status?operating_company_id=<uuid>&period=YYYY-MM`
  - Returns checklist status for:
    - bank reconciliation completion and pending accounts
    - A/R overdue count
    - A/P overdue count
    - fuel tax filing status
    - manual adjusting entry count
    - computed `can_lock`
- `POST /api/v1/accounting/month-close`
  - Validates checklist gates before lock.
  - Executes existing period-close primitives:
    - retained earnings close journal
    - cash-basis snapshot at close
    - period status lock update (`locks_txn_dates_le = period_end`)
  - Emits audit event `accounting.month_close_locked`.
- New UI page: `/accounting/month-close`
  - Checklist rows with links to detail work areas.
  - Close action disabled until `can_lock = true`.
- CI guard:
  - `scripts/verify-month-close-requires-checklist-complete.mjs`
  - Wired into `verify:arch-design`.

## Notes

- Uses existing Block-20.3 period-close lock semantics.
- Bank reconciliation gate uses Block-29 match coverage semantics (`auto_matched`, `user_matched`, `rejected`).
- Audit requirement aligns with Block-40 conventions.
