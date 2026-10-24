# INBOX-CURSOR

Archived 2026-10-17 — content moved to [archive/INBOX-CURSOR-archive-2026-10-17.md](archive/INBOX-CURSOR-archive-2026-10-17.md). Live seat orders: the Lead channel (LEAD-TO-SEATS).

## CURRENT (2026-10-24 01:55 PM CT) — LEAD: 443.325 IS ITEM 1, DO IT BEFORE 443.293-C SLICE 2

**MERGE METHOD (owner 10-24 3:36 PM CT, every Cursor PR): the FAST 4-MINUTE MERGE LAW — docs/bus/FAST-MERGE-4MIN-LAW.md.** (1) `node scripts/money-pr-local-gate.mjs` exit 0 = the merge proof; (2) normal push first (hooks ON); (3) `--no-verify` ONLY when the push dies at verify-static-fallback on reds this branch did not cause — re-run each failing guard on origin/main and paste that it fails there too; never for your own red; (4) merge immediately: `gh api -X PUT repos/tioperfumes07/IH35-TMS/pulls/<N>/merge -f merge_method=squash`. Do not wait for CI, do not rebase while it runs, one PR per slice.

**NOW, BEFORE ANYTHING ELSE (owner 10-24 3:43 PM CT): merge your 3 open PRs with the fast 4-minute method above — #27534 (ENG-33), #27523 (443.293-C multiple + vendor bills), #27502 (inbox census).** For each: rebase on main, `node scripts/money-pr-local-gate.mjs` exit 0, push, then `gh api -X PUT repos/tioperfumes07/IH35-TMS/pulls/<N>/merge -f merge_method=squash`. A PR whose surfaces are not 100% (rule below) is finished first, then merged.

**DESIGN = 100% OR IT IS NOT DONE (owner 10-24 3:43 PM CT — Cursor has drifted 3 times: 443.293 shipped slice-by-slice shells; 443.325 was ignored for the 443.293-C slice; rows outside this inbox were worked). A surface is done ONLY when EVERY element of its design reference is implemented on live data:** the KPI strip with real engine numbers; the toolbar with every filter working (multi-select, date range MM/DD/YYYY); the table with every column, sort, row action and money-cell drill-through; empty / error / loading states with their reason; every legacy layer removed. A shell (header or strip over an old body), a placeholder, a hard-coded value, a '—' where the data exists, a TODO, or 'next slice' is NOT done and is never reported or merged as done. Every PR body lists, per surface: design element → file:line → the live data source; the 443.326 guard asserts the mounts, the absence of legacy layers AND the absence of placeholder / TODO strings. Work ONLY the items in this inbox, in order.

0. **443.325 — Engine register UI items ENG-30..33** (deadline 2026-10-25T03:00Z; full box below, also ~/Downloads/10-24-2026-Cursor-443.325-Engine-Register-UI-Items.md). Register rows ENG-30..33 in docs/bus/lead/LEAD-PENDING-REGISTER.md. One PR + one guard per item, guard red on the pre-fix tree then green, no baseline raised.

    # Cursor · ROUND 443.325 — Engine register UI items (measured 10-24 12:46 PM CT on main e273a179b7)
    Issued 10-24-2026 01:05 PM CT (18:05Z) by Claude Lead. DEADLINE 2026-10-25T03:00Z. Missed item → Lead takes the surface.
    Owner pastes this to Cursor. RULES: one PR + one named guard per item, guard RED on the pre-fix tree then GREEN, wired. No baseline raised. Register id (ENG-nn) in the PR title.
    
    ## ENG-30 15 raw <select> left in non-test .tsx (every selector multi-select law)
    Do: convert each to EntityMultiSelect / MultiSelectDropdown, or list the ones that must stay single with the reason. Guard: verify-every-selector-multi-select (shrink-only, starts at 15).
    
    ## ENG-31 Breadcrumbs on 10 of 999 page files
    Do: the page shell renders the breadcrumb from the route so every page gets one (one change, not 989). Guard: verify-page-has-breadcrumb.
    
    ## ENG-32 89 money cells that do not open their transaction (10-05 count)
    Do: re-run scripts/verify-money-cells-click-through.mjs, paste the count, shrink it; no money cell without its drill. Guard: the same (shrink-only).
    
    ## ENG-33 Stale comment
    BankingTransactionsDesignView.tsx:4017 still calls MatchDrawer "the orphaned MatchDrawer" — it is the one matcher now (443.163). Fix the comment.
    
    REPLY: per item — PR #, guard red → green (pasted).

0b. **443.326 — Finish the V3 board grammar on all 23 surfaces of your own 10-24 audit** (after 443.325; REPLACES 443.293-C slice 2 and every other row until the ratchet is 0). Full box:

    # Cursor · ROUND 443.326 — Finish the V3 board grammar on EVERY surface (from Cursor's own 10-24 audit)
    Issued 10-24-2026 02:40 PM CT (19:40Z) by Claude Lead. DEADLINE 2026-10-25T05:00Z. Missed → Lead takes the surface.
    Order: 443.325 (ENG-30..33) first, then this, then nothing else. No other row, no sweep, no new surface.
    
    REFERENCE (done right, do not change): accounting/BillsPage.tsx and accounting/bills/RecurringBillList.tsx —
    kpiStrip (V3KpiTile) + MoneyListToolbar + ParityTable, no legacy chrome.
    DEFINITION OF DONE for one surface: the three mounts present AND every legacy layer you listed removed
    (PageHeader, NavyPageSubNav, V3Panel stacks, KpiPanel/CashFlowPanel, CollapsedListFilters, duplicate roster).
    A document body (settlement statement) keeps its document but gets the board header + KPI strip.
    
    THE 23 SURFACES (your audit, verdict → required):
     1 driver-finance/SettlementsPage.tsx              PARTIAL     remove PageHeader, NavyPageSubNav, layered V3Panel chart/deductions
     2 driver-finance/SettlementDetailPage.tsx         PARTIAL     + MoneyListToolbar + ParityTable for lines; keep SettlementDocumentBody
     3 driver-finance/SettlementStatementWorkflowPage.tsx SHELL-ONLY kpiStrip + MLT + ParityTable; remove legacy workflow body chrome
     4 driver-finance/SettlementCloseArrivalPage.tsx   PARTIAL     kpiStrip + MLT; remove PageHeader, NavyPageSubNav
     5 cash-advances/CashAdvancesHome.tsx              PARTIAL     V3KpiTile strip (replace custom KPI row) + MLT; remove PageHeader
     6 driver-finance/EscrowRegisterPage.tsx           PARTIAL     + MLT; remove PageHeader, module shell
     7 driver-finance/EscrowDeductionsPendingTab.tsx   PARTIAL     kpiStrip + MLT; remove PageHeader
     8 accounting/EscrowPage.tsx                        PARTIAL     kpiStrip + MLT (keep 443.319 rule: non-zero balances always shown, $0 behind the toggle)
     9 fuel/FuelPlannerHome.tsx                         PARTIAL     kpiStrip + full ParityTable; remove PageHeader
    10 factoring/FactoringHome.tsx                      PARTIAL     kpiStrip + MLT; remove PageHeader, KpiPanel, CashFlowPanel, subnav layers
    11 accounting/FactoringListPage.tsx                 PARTIAL     kpiStrip
    12 Customers.tsx                                    PARTIAL     kpiStrip; remove PageHeader + duplicate roster
    13 Vendors.tsx                                      PARTIAL     kpiStrip; remove PageHeader + duplicate roster
    14 accounting/CreateMultipleBillsPage.tsx           SHELL-ONLY  kpiStrip + MLT (draft grid stays as the body)
    15 accounting/VendorBillCreatePage.tsx              SHELL-ONLY  kpiStrip + MLT + ParityTable (form in ParityDrawer stays)
    16 accounting/BillPaymentsListPage.tsx              PARTIAL     kpiStrip
    17 accounting/InvoicesListPage.tsx                  PARTIAL     kpiStrip
    18 accounting/ExpensesListPage.tsx                  PARTIAL     kpiStrip
    19 accounting/VendorCreditsPage.tsx                 PARTIAL     kpiStrip + MLT (replace CollapsedListFilters)
    20 accounting/CreditMemosPage.tsx                   PARTIAL     kpiStrip + MLT (replace CollapsedListFilters)
    21 accounting/ManualJEListPage.tsx                  PARTIAL     kpiStrip
    22 accounting/PaymentsListPage.tsx                  PARTIAL     kpiStrip + MLT (replace CollapsedListFilters)
    23 fuel/FuelHome.tsx (REBUILT) + BillsPage + RecurringBillList — already done; the guard keeps them done.
    
    RULES
    - KPI numbers come from the SAME engine the list reads (no second calculation); a missing value shows "—", never $0.00.
    - Money cells open their transaction; dates MM/DD/YYYY; account numbers hidden unless the setting is on; multi-select filters.
    - No new route, tab, column or card beyond the three mounts. Remove only the legacy layers listed above.
    - ONE guard: scripts/verify-v3-board-grammar-every-surface.mjs — a table of the 23 files; each must import/mount
      V3KpiTile (or its kpiStrip), MoneyListToolbar, ParityTable, and must NOT mount the legacy components listed for it.
      Ratchet starts at today's failing count and only goes DOWN; it ends at 0. --selftest plants a legacy PageHeader back → exit 1.
      Wire it (step 1 refuses unwired guards).
    - Ship in slices of 3-5 surfaces per PR; each PR lowers the ratchet; paste red (before) / green (after).
    - Code-complete mode: no Chrome now. The owner walks every screen when all seats finish.
    
    REPLY per PR: surfaces closed, ratchet N -> M, guard output pasted, PR #. Final: ratchet 0.

1. **443.293-C** (SUPERSEDED by 443.326 — its slice 2 = surfaces 14 and 15 there) — Accounting tabs V3 board grammar (Bills reference). Slice 1 recurring bills MERGED #27495 `9ceba87718`. Next: slice 2 — `/accounting/bills/multiple` + `/accounting/bills/vendor` leaves to All-bills V3 grammar; then remaining Accounting tabs.
2. **ROW 219** — CODED #27481 `9b651bfdb4` (Close settlement on Dispatch).
3. **443.293-A / ROW 218** — DONE #27465. **REG-102** — DONE #27477.
4. Drain remaining Cursor register rows (boards 37–56, dates, labels, layout, 114 confirm). CODE-COMPLETE deadline Sat 10-24 10:00 AM CT / 15:00Z.


> **Standing law (on-demand):** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed.
