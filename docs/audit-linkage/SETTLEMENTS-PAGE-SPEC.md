═══════════════════════════════════════════════════════════════
SETTLEMENTS PAGE — FULL SPEC (financial-write, max rigor, GATED)
Post-waves queue item #7. Replaces the Payroll tab (#26). Depends on A1 + A5.
═══════════════════════════════════════════════════════════════

PLACEMENT
  - Replaces PAYROLL tab (#26, /payroll-integration).
  - Sidebar position: between CASH FLOW (#12) and ACCOUNTING (#13).
  - Tabs: Driver settlements | Company settlements | Payroll (FUTURE sub-tab) | Closed.
  - PAYROLL becomes a future sub-tab UNDER Settlements (true W-2 employee payroll,
    kept SEPARATE — a different thing from settlements).

PURPOSE
  Single place to view ALL settlements (driver + company), CLOSE them, APPLY
  payments, APPLY to bills. Consolidates settlement logic currently scattered across
  Dispatch, Accounting, Finance.

LIST PAGE (QBO list pattern)
  - 4 metric cards: Open settlements · Ready to close · Net payable · Held/disputed
  - filter bar: search driver/load · pay period · status
  - selectable register table: driver · loads · gross · deductions · net · status · action
  - sticky footer: "Close selected (n) · applies payment + posts to ledger on close"

REVIEW DRAWER (side-drawer, NOT full page — per locked universal-grid rule)
  Opening a settlement shows a right-side drawer with:
  - gross (loads) + already-approved deductions
  - *** PENDING DEDUCTIONS panel (Jorge's core requirement) ***
      Pulls every pending deduction tied to THIS driver, from its real source:
        - Banking txns (driver-tagged fuel/cash advances)  [source: A5 feed]
        - Violations (driver-fault citations)
        - Accidents (damage assigned to driver)
        - Company-paid external fines (recoverable)
      Each line: Item · Source chip · Amount · Decision = APPROVE NOW / DEFER
        - Approve → deducted from this settlement
        - Defer  → rolls to next pay period, WITH a captured reason + carried trail
      Net payable recalculates live as lines toggle.
      Each line links to its SOURCE record (click-through) for verification.
  - totals box: gross / total approved deductions / NET PAYABLE
  - footer: "Close posts journal entry · immutable after" + Save draft / Review & close

CLOSE = FINANCIAL WRITE (max rigor, GATED on Jorge's explicit OK per build)
  - double-entry: debit = credit or FAIL HARD
  - event-sourced to spine via log_event() (every approve/defer/close logged + linked)
  - idempotency key per settlement (double-click cannot pay twice)
  - multi-step confirm before posting
  - "apply to bills / apply payment" REUSES the existing AP payment-application engine
    (do not build a parallel money path)
  - a CLOSED settlement is IMMUTABLE at the DB level; corrections = reversing entry
  - syncs to QBO consistent with the rest of the books

COMPANY SETTLEMENTS TAB
  - mirrors the table, rolls up per-company P&L close ("Company Settlement Report")
  - same close mechanics, grouped by company.

PREREQUISITES BEFORE BUILD
  - A1 (spine link columns) + A5 (banking driver-tag feed) merged.
  - LIVE QBO CAPTURE of current driver-settlement + bill-payment screens, to map the
    double-entry to the real chart of accounts.
  - Visual preview approved by Jorge (new page, but financial — preview anyway).
  - Explicit per-build OK on the write path before it goes live.
═══════════════════════════════════════════════════════════════
