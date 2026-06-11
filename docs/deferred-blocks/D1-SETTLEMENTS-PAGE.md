═══════════════════════════════════════════════════════════════
BLOCK D1 — SETTLEMENTS-PAGE ★  (FINANCIAL WRITE · max rigor · GATED)
Phase D. Replaces the Payroll tab. Requires A1 + A5 + C1 + live QBO capture + preview.
═══════════════════════════════════════════════════════════════

⚠️ WRITE PATH IS GATED: do NOT enable settlement close / payment posting without
Jorge's EXPLICIT per-build OK. Build the page + read + the close flow behind a gate.

PLACEMENT
  - Replaces PAYROLL tab (#26, /payroll-integration).
  - Sidebar position: between CASH FLOW (#12) and ACCOUNTING (#13).
  - Tabs: Driver settlements | Company settlements | Payroll (FUTURE sub-tab) | Closed.
  - PAYROLL becomes a future sub-tab UNDER Settlements (true W-2 employee payroll —
    a DIFFERENT thing, kept separate, built later).

PURPOSE
  Single place to view ALL settlements (driver + company), CLOSE them, APPLY payments,
  APPLY to bills. Consolidates settlement logic now scattered across Dispatch,
  Accounting, Finance.

LIST PAGE (QBO list pattern, locked tokens)
  - 4 metric cards: Open settlements · Ready to close · Net payable · Held/disputed
  - filter bar: search driver/load · pay period · status
  - selectable register table: driver · loads · gross · deductions · net · status · action
  - sticky footer: "Close selected (n) · applies payment + posts to ledger on close"

REVIEW DRAWER (side-drawer, NOT full page — per locked universal-grid rule)
  Opening a settlement shows a right-side drawer:
  - gross (loads) + already-approved deductions
  - *** PENDING DEDUCTIONS panel (core requirement) ***
      Pulls every pending deduction tied to THIS driver from its real source (via A5):
        - Banking txns (driver-tagged fuel/cash advances)
        - Violations (driver-fault citations)
        - Accidents (damage assigned to driver)
        - Company-paid external fines (recoverable)
      Each line: Item · Source chip · Amount · Decision = APPROVE NOW / DEFER
        - Approve → deducted from THIS settlement
        - Defer   → rolls to next pay period WITH a captured reason + carried trail
                    (deferred items are never silently dropped or double-counted)
      Net payable recalculates live as lines toggle.
      Each line LINKS to its source record (click-through) for verification.
  - totals box: gross / total approved deductions / NET PAYABLE
  - footer: "Close posts journal entry · immutable after" + Save draft / Review & close

CLOSE = FINANCIAL WRITE (max rigor — all required, all GATED)
  - double-entry: debit = credit or FAIL HARD
  - event-sourced to spine via log_event() (every approve/defer/close logged + linked)
  - idempotency key per settlement (double-click cannot pay twice)
  - multi-step confirm before posting
  - "apply to bills / apply payment" REUSES the existing AP payment-application engine
    (do NOT build a parallel money path)
  - a CLOSED settlement is IMMUTABLE at the DB level; corrections = reversing entry
  - syncs to QBO consistent with the rest of the books

COMPANY SETTLEMENTS TAB
  - mirrors the table; rolls up per-company P&L close ("Company Settlement Report")
  - same close mechanics, grouped by company.

PREREQUISITES (must be true before building D1)
  - A1 (spine link columns) + A5 (banking driver-tag feed) + C1 (settlement read model) merged.
  - LIVE QBO CAPTURE of current driver-settlement + bill-payment screens → map the
    double-entry to the REAL chart of accounts.
  - Visual preview approved by Jorge.
  - Explicit per-build OK before the write/close path goes live.

verify-settlements-page.mjs: assert close path enforces double-entry + idempotency +
immutability + spine emit; assert reuse of AP payment engine; assert write path is
gated/flagged off by default.
Build read+UI first (ungated), close path behind the gate. Push BLOCK_ID=D1-SETTLEMENTS-PAGE,
ls-remote, PR. Report PR# + SHA. DO NOT enable writes without explicit OK.
