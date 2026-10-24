# INBOX-CURSOR

Archived 2026-10-17 — content moved to [archive/INBOX-CURSOR-archive-2026-10-17.md](archive/INBOX-CURSOR-archive-2026-10-17.md). Live seat orders: the Lead channel (LEAD-TO-SEATS).

## CURRENT (2026-10-24 04:10 PM CT) — LEAD. WORK ONLY THESE, IN THIS ORDER.

**05:05 PM CT CHECK — DRIFT:** #27534 (ENG-33), #27523, #27502 are still OPEN while new PRs were opened (#27547 ENG-30). Item 1 first: merge those three now (fast 4-minute law), then continue 443.325 → 443.326. An open PR left behind is not done.

Full boxes (read them whole): [lead/CURSOR-ORDERS-443325-443326.md](lead/CURSOR-ORDERS-443325-443326.md)

**MERGE METHOD — FAST 4-MINUTE MERGE LAW** ([FAST-MERGE-4MIN-LAW.md](FAST-MERGE-4MIN-LAW.md)), every PR:
(1) `node scripts/money-pr-local-gate.mjs` exit 0 = the merge proof; (2) normal push (hooks ON);
(3) `--no-verify` ONLY when the push dies at verify-static-fallback on reds this branch did not cause — re-run each on origin/main and paste that it fails there too; never for your own red;
(4) merge now: `gh api -X PUT repos/tioperfumes07/IH35-TMS/pulls/<N>/merge -f merge_method=squash`. No waiting for CI.

**DESIGN = 100% OR NOT DONE (owner 10-24 3:43 PM CT; Cursor drifted 3 times).** A surface is done ONLY when every element of its design is live: KPI strip with real engine numbers; toolbar with every filter working (multi-select, MM/DD/YYYY ranges); table with every column, sort, row action and money-cell drill-through; empty/error/loading states with their reason; every legacy layer removed. A shell, placeholder, hard-coded value, '—' where data exists, TODO or "next slice" is NOT done and is never merged as done. Each PR body lists per surface: design element → file:line → live data source.

1. **NOW — merge your open PRs** with the method above: #27534 (ENG-33), #27523 (multiple + vendor bills), #27502 (inbox census). A PR whose surfaces are not 100% is finished first, then merged.
2. **443.325 — ENG-30..33** (deadline 2026-10-25T03:00Z). ENG-30 raw `<select>` → multi-select (15); ENG-31 breadcrumb from the page shell; ENG-32 money cells click-through (shrink to 0); ENG-33 stale MatchDrawer comment. One PR + one guard per item, red → green.
3. **443.326 — V3 board grammar on all 23 surfaces of your own 10-24 audit** (deadline 2026-10-25T05:00Z). Guard `scripts/verify-v3-board-grammar-every-surface.mjs`, ratchet only down, ends at 0. Slices of 3-5 surfaces per PR. Surface list + definition of done in the orders file.

**SUPERSEDED — do NOT work:** 443.293-C slice 2 (= 443.326 surfaces 14-15), register drain rows 37-56, GO-20 eight-features queue, GUARD-WORKORDERS. Rows 219 / 218 / REG-102 are done.

Code-complete mode: no Chrome now. REPLY per PR: surfaces/items closed, ratchet N → M, guard output pasted, PR #.

> **Standing law (on-demand):** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed.
