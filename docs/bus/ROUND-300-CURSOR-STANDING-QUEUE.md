# NOW — CURSOR — ROUND 300 QUEUE. Work it top to bottom. DO NOT GO IDLE.
Issued 2026-09-30 16:1x CT by Claude Lead. One PR + one named guard + Chrome proof per item.
Finish an item, ACK in OUTBOX, START THE NEXT. Do not wait for a new order.

The Lead measures every UI item in the owner's Chrome before it is closed. A merge SHA is not done.

## THE QUEUE
1. **FINISH #23495 (C-31..C-35).** Then I measure: with-transaction counts (~65 customers / ~34
   vendors), KPI block <= 90px, chrome-before-first-row <= 260px on /drivers/profiles, tbody > 0,
   and no -$0.00 anywhere.
2. **C-36 MAINTENANCE: 16 TABS -> 9** (the owner approved the preview canvas).
   KEEP Maintenance Home · Fleet Table · Active WOs · Service/Location · Driver Reports ·
   Road Service · Parts Inventory · Integrity Report · Settings.
   DELETE Brake Wear and Tire Wear. FOLD Arriving Soon and At Risk into Home. MERGE Damage Reports
   and In-Transit Issues into Driver Reports as a Kind column. DVIR belongs to Safety — a DVIR
   DEFECT appears in Driver Reports tagged DVIR. Severe Repairs is the red kanban column, not a tab.
   Every module home page states Home. Render the integration strip ONCE — it currently draws twice
   on one screen. Remove the four KPI tiles that duplicate kanban column counts 81px below them.
3. **C-37 THE HOUSE TABLE FORMAT, every table in the app.** Right-aligned tabular-nums, thousands
   separators, currency 2dp, negatives in red parentheses, missing renders "—" NEVER 0.
   LINES FOR ROWS, NEVER FOR COLUMNS — no cell declares a left or right border, anywhere.
   Zebra even rows, sticky header, pinned totals row.
4. **C-38 THE HOUSE CONTROL SIZES, app-wide.** filter/select/search 34px tall; a field being
   edited 40px; DATE BOX 132px wide everywhere with tabular figures; money box 120px right-aligned;
   short code 104px; only a free-text field grows. A ten-character date never gets a 600px box.
5. **C-39 FILTERS AND GEAR, every list.** Unit filter is multi-select chips PLUS a dropdown, and a
   second selector by TYPE read from mdata.units.vehicle_type and mdata.equipment — never a
   hardcoded list. Date range, status, vendor. Active filters as removable chips. Save view.
   A gear icon on EVERY table opening a column chooser that persists per user.
6. **C-40 REGULAR AND MASTER-DETAIL** on Customers and Vendors. Regular (the table) is the default;
   Master-detail is the second view. Same toggle, same place, same size on every list.
7. **C-41 BANKING REDESIGN** — 10 tabs. The Lead's design canvas lands next; build to it.
   Banking Home must surface what is currently buried: 931 of 947 uncategorized, 0 of 8 accounts
   ever reconciled, Cash GL unbound on 3 of 8, QBO not connected.
8. **C-42** — when 1-7 are shipped, re-read this file. A new queue will be here.

## SAVE AND CLOSE
Anything that opens — modal, drawer, editor — carries Save and Close, both wired. No dead buttons.
