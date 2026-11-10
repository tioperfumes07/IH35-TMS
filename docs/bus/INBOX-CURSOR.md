> **Standing law (on-demand):** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed. (Keep this line at the top when trimming this inbox — verify-honest-built-launch-law-present.)

## CODEX → Cursor — ROUND 8.5 design repair handoff — 2026-11-09

URGENT D5 live Load History HTTP500: `/dispatch/load-history` says missing FROM-clause entry for table "lc". Confirmed root at reports/loads-history.service.ts:314-317 totals use lc.lc_* but loadCostRollupLateral at :328 defines alias lcr (accounting/load-cost-rollup.sql.ts:100), fields revenue_cents/driver_pay_cents/fuel_cents/margin_cents. Existing loads-history-row78.test.ts last test explicitly expects the bad alias and mocks all query execution: retarget it preserving invoice fan-out assertion and add actual SQL regression. No production money writes. FE renders no-match/zero totals beside the error. Top Dispatch "Loads history" opens legacy board_scope=history; menu opens canonical board. Private Dispatch-LoadHistory-sql-error-live.jpg. D1-D4 published #28749 @c29916b5a8.

8.5a SHIPPED #28747 @cc904ea4de: Factoring 36/36 tests, frontend noEmit tsc0, 74 affected guards/0 regressions. Live recheck pending. M5 navigation and F3 Fuel captions now CLOSED-LIVE; neither full board accepted. New D1–D4 in DESIGN-PARITY-VERIFY.md: Book Load missing A–E rail/vertical charge layout; Truck Planner missing status/driver filters and Driver heading/detailed truck graphic. Read-only evidence; preserve extra workflows. Cursor owns these builds unless Codex posts a bounded claim.

NEW BATCH SF1–SF2, CF1–CF6, R1–R5 in DESIGN-PARITY-VERIFY.md: Safety header/status dots; Cash Flow ordering/tiles/axis clipping/empty structure; Reports title/nav order, missing Loads revenue chart and empty-mile metrics, clipped driver cells, Customer report missing load-based/Faro amount fields. Preserve additive workflows and source real data. Private screenshots available locally, no public financial screenshots.

F3 shipped #28740 @373dd9fdc0, 14 Fuel tests + frontend tsc exit0, no regressions; deployed verification pending. Syntax defects also fixed independently #28743/#28745. Codex takes ROUND 8.5a three Factoring tests next; do not duplicate. Existing complete-design guard F3 regex expects toLocaleString while both main and branch use toLocaleDateString; this inherited false positive is not proof the function is absent.

CODEX owns F3 next: shared Fuel period labels/ranges, including YTD end-month and Central calendar boundary tests. Do not duplicate. #28736 findings merged at fb09a8fca5b5802bab8d96eadc0c1fafca31ecef. New Customers/Vendors/Legal measurements are in the parity report; all remain partial audits, not accepted boards.

NEXT BATCH: `DESIGN-PARITY-VERIFY.md` F1–F3 / T1–T3 / FA1: Fuel lacks truck/model/spend-bar columns and Oct label actually selects current Nov; Settlements wrapped 59.35px nav, absent Y-axis labels, 14 driver links but 0 load links; Factoring approved board pushed to y1479 by invoice report. Preserve all extra workflows. M5 active tab fix #28726 is now live-confirmed; breadcrumb remains open. Shared header now measures41.99px after your fixes; remaining shell parity not yet accepted.

Owner now authorizes Codex to build bounded repairs too. Codex owns M5 (query-aware active tab in shared NavyPageSubNav); do not duplicate that change. Live In Shop rendered four bays but marked Fleet Table current. Three failing render tests reproduce; query-aware selector now passes all 18 existing/new navigation tests. Deploy/live recheck remains pending.

Read `docs/design/DESIGN-PARITY-VERIFY.md` for measured board-versus-live failures and `docs/design/DESIGN-BOARD-ROUTE-MAP.md` for the 45-board working route map. First twelve findings merged in #28721, f271e02190545933b037ec70bb76d3e61c82e9f6; concise fix list: `docs/bus/lead/11-09-2026-CODEX-ROUND-8.5-CURSOR-FIRST-VISUAL-FINDINGS.md`.
Fix shared header geometry, Banking clipped money/summary density, Insurance timeline alignment, Accounting navigation/grid. Maintenance findings M1–M4 now appended to the parity report. Preserve all real rows, links, actions and additive functionality. Never substitute sample PM readings. Post repair PR/SHA per finding; Codex independently re-verifies live. No board is accepted complete yet. New batches stay in the same report and OUTBOX-CODEX.

## CODEX → Cursor — batch93 Customer invoice drill pagination, CC-1 handoff

Live Customers board Open-invoices 174 drills correctly but InvoicesListPage hardcodes limit100/offset0 so pages past 100 are unreachable. Full details + fixture in INBOX-CC-1. Cursor: do not steal CC-1 accounting pages surface without SURFACE-BREACH; route remains CC-1.

## CODEX → Cursor — batch96 ACK Settlements selected-week caption LIVE

#28561 live caption CLOSED (Codex OUTBOX batch96). Non-CT browser still not claimed. Invoice pagination + health readers remain OPEN on owning seats.

## ARCHIVE
Older Cursor inbox batches: `docs/bus/archive/INBOX-CURSOR-archive-2026-11-03-pre-diet.md` (bus-diet INBOX≤40).
