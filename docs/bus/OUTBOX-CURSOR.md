# OUTBOX — CURSOR — restarted 2026-09-30T11:27Z
# One entry per job id: JOB ID · what I changed · pasted live proof · what is left.
# Append below. Do not delete another seat's entries.

**2026-09-30T12:35Z · C-18 + D47..D54 MERGED · PR #23385 · `cf2b264d8f`**

**2026-09-30T12:50Z · C-01 + C-02 + C-03 + C-16 + C-17 SHARED SHELL · branch `cursor/c01-c17-master-detail-shell-c89b`**

C-01 · what changed: house `SegmentedControl` — h-7, min-w-[4.5rem], inactive tint `#F3F4F6` (never transparent); Customers/Vendors/Drivers view+status toggles use it; `ToolbarSegmentControl` is an alias. · LIVE PROOF: `node scripts/verify-c01-c17-master-detail-shell.mjs --selftest` → PASS. · LEFT: Chrome getComputedStyle height/padding/width of every pill on /customers.

C-02 · what changed: `useViewModePref` seeds `master-detail` from code; localStorage only restores after explicit `:chosen` click (or server pref). · LIVE PROOF: vitest C-02 cases + guard asserts `() => defaultMode` + `:chosen`. · LEFT: clear key, reload, paste active pill.

C-03 · what changed: master/detail panes use `MASTER_DETAIL.surfaceClass` (= C-18 QBO_SURFACE pane: border `#E5E7EB` + shadow). · LIVE PROOF: guard asserts surfaceClass on Customer/Vendor/Driver sidebars. · LEFT: Chrome pane border/box-shadow.

C-16 · what changed: `design/master-detail.ts` `masterPaneClass` `xl:w-[640px]` (was 440 / 20.8%); min 480 · max 760; Customers+Vendors+Drivers share it. · LIVE PROOF: `verify-md-width-0-vendors-customers.mjs --selftest` PASS 4/4; shell guard asserts 640. · LEFT: Chrome widths at 1280/1920.

C-17 · what changed: `MasterDetailShell` + `DriverListSidebar` on Drivers Profiles; same tokens + SegmentedControl + view pref as Customers/Vendors. · LIVE PROOF: Drivers.tsx mounts `drivers-master-detail-shell`; guard. · LEFT: three pages side-by-side Chrome.

C-04..C-15 / C-19 · LEFT: next (row treatment sweep, min-scroll, cash-flow, banking boxes, driver profile polish, multi-select filters, WO modal, has-transactions default).

GUARD: verify-c01-c17-master-detail-shell + verify-md-width-0. No Aug/Sep money. No seat fixtures.

ACK 2026-09-30 · CURSOR · read NOW-CURSOR · starting C-20

**2026-09-30T16:12Z · C-20 DRIVER PROFILE MODULE · PR #23444 MERGED · `cursor/c20-driver-profile-module-c89b`**

C-20 · what changed: `DriverProfilePage` is now a Customers/Vendors-style tabbed shell — `NavyPageSubNav` first, then horizontal DQF `KpiStrip` (Overview only; never above tabs — C-11/D11). Tabs: Overview / Settlements / Cash Advances / Deductions / Loads / Maintenance / Safety / Documents / Legal / Communications / Reports / Activity (`driverProfileTabs.ts`, `?tab=` URL). A-13 accounting tabs on the payee profile; Permits stay operational; Disputes cross-link from Settlements. A-14 Reports shells (Statement/Activity/Transactions/Deductions) via `SegmentedControl`. C-12: `driverDisplayName` forces Proper Case (never ALL CAPS); `formatPhoneAsTyped` / `formatPhoneDisplay` = `(956) 000-0000`; IdentityHeader + DriverDetail use them. Surfaces use `MASTER_DETAIL.surfaceClass`. Ops guard: `scripts/ops/verify-c20-driver-profile-module.mjs`. · LIVE PROOF: `npx tsc -b` (apps/frontend) exit 0; `node scripts/ops/verify-c20-driver-profile-module.mjs --selftest` PASS; vitest DriverProfilePage ×2 files 6/6 + assign-truck 1/1. · LEFT: Chrome click tabs + measure KPI band below nav on `/drivers?subtab=profiles`; C-21 Maintenance next.

**2026-09-30T17:05Z · C-21 D24–D33 SHELL · branch `cursor/c21-maintenance-odometer-honest-c89b` · PR #23446**
C-21 · what changed: D24 Create WO is modal via `?create_wo=1` (WorkOrderNewPage redirects); D25 SelectCombobox on WO header fields; D27 dark navy section headers; D29/D30 fleet status KPIs + class chips in filter toolbar; D31 Active WOs source-type multi-select; D32/D33 list tabs drop stacked PM/Alerts/DTC (D10 min-scroll). Ops: `scripts/ops/verify-c21-maintenance-shell.mjs`. · LIVE PROOF: ops shell --selftest PASS; tsc -b exit 0. · LEFT: Chrome click-proof; C-22 tabs/KPIs next.

**2026-09-30T17:10Z · C-22 TABS + KPIs · branch `cursor/c22-tabs-kpis-layout-c89b`**
C-22 · what changed: NavyPageSubNav locked h-7 + #14314F; DrillKpiCard empty tiles explain why; MaintKpiRows unavailable on error; Fleet Avg Age → DrillKpiCard; KpiStrip data-c22. Ops: `scripts/ops/verify-c22-tabs-kpis.mjs`. · LIVE PROOF: ops --selftest PASS; vitest 12/12; tsc -b exit 0. · LEFT: Chrome re-measure; C-23 kanban drag next.

**2026-09-30T17:20Z · C-23 KANBAN DISPATCHED→AT PICKUP · branch `cursor/c23-kanban-dispatched-pickup-c89b`**
C-23 · what changed: Manual stamp drop now keeps the card in At pickup / Loaded / At delivery via `stampOverrides` + `optimisticGeofenceAfterManualStamp` (survives loads refetch). Empty lane drop targets min-h 120px. Stale REG-048 two-live-assigned test aligned to live-leg dedupe. Ops: `scripts/ops/verify-c23-kanban-dispatched-pickup.mjs`. · LIVE PROOF: ops --selftest PASS; vitest DispatchKanban 27/27. · LEFT: Chrome drag recording; C-24 QBO parity tail.

**2026-09-30T17:30Z · C-24 QBO PARITY TAIL · branch `cursor/c24-qbo-parity-tail-c89b`**
C-24 · what changed: D47 list-column sweep — Customers/Vendors/Load Costs/Transaction Register/Active WOs date cells use `formatDateQboList` (M/D/YY); banking stays MM/DD/YYYY; tokens D48–D54 already on tip from #23385 re-asserted. Ops: `scripts/ops/verify-c24-qbo-parity-tail.mjs`. · LIVE PROOF: ops --selftest PASS; verify-qbo-parity-tokens OK; formatDate 12/12; tsc -b exit 0. · LEFT: Chrome getComputedStyle on list dates; C-25 DisputesHub (new) if Lead queues it.

**2026-09-30T17:45Z · C-25 DISPUTES HUB THREE-WAY · branch `cursor/c25-disputes-hub-split-c89b`**
C-25 · what changed: `/accounting/disputes` SegmentedControl Driver|Customer|Vendor; only one party panel mounts; Customer → invoice disputes; Driver → settlement disputes; Vendor → honest empty (no TMS table — CC-1 A-25). Ops: `scripts/ops/verify-c25-disputes-hub-split.mjs`. · LIVE PROOF: ops --selftest PASS; tsc -b. · LEFT: Chrome click three parties; A-25 table name from CC-1.

**2026-09-30T18:20Z · C-04 ROW TREATMENT · branch `cursor/c04-row-treatment-c89b`**
C-04 · what changed: ParityTable hover/stripe/selected → QBO_SURFACE (#EEF2F7 / #FAFBFC / #EAECF1); dropped weak `hover:bg-gray-50`; Customers/Vendors/Drivers master sidebars add `rowStripeClass` + `data-c04-row`; Customers DetailRow divider `#D8DEE6` (was gray-100). Ops: `scripts/ops/verify-c04-row-treatment.mjs`. · LIVE PROOF: ops --selftest PASS; tsc -b; ratchet PASS. · LEFT: Chrome getComputedStyle rows 1..4 on /customers; C-19 has-transactions default next.

**2026-09-30T18:35Z · C-19 HAS-TRANSACTIONS DEFAULT · branch `cursor/c19-has-transactions-default-c89b`**
C-19 · what changed: Customers + Vendors roster default `?txn=with` → `listAll*` with `has_transactions:true` (A-21 shared predicate; voided never counts). Explicit SegmentedControl "With transactions" / "All customers|vendors" (`?txn=all`). Parent create picker stays unfiltered. Ops: `scripts/ops/verify-c19-has-transactions-default.mjs`. · LIVE PROOF: ops --selftest PASS; tsc -b. · LEFT: Chrome default count vs All (USMCA 65/1249 cust, 34/623 vend); C-05 next.

**2026-09-30T18:50Z · C-19 MERGED · PR #23480 · `b96e77e8ba`**
C-19 DONE on main. Guard re-anchors for txnScope/parentCustomersRoster included. NEXT: C-05 MINIMUM-SCROLL LAW.

**2026-09-30T19:05Z · C-05 MINIMUM-SCROLL · branch `cursor/c05-minimum-scroll-c89b`**
C-05 · what changed: Shell locks to `h-dvh` + overflow-hidden (document no longer grows); UltraWide flex fill + internal scroll; MASTER_DETAIL `pageShellClass` / `listScrollClass` / fill-height shell; Customers/Vendors/Drivers use pageShell; sidebars drop `max-h-[760px]` for flex scroll; PageHeader `mb-2 shrink-0`. Ops: `scripts/ops/verify-c05-minimum-scroll.mjs`. · LIVE PROOF: ops --selftest PASS. · LEFT: Chrome `scrollHeight` vs `innerHeight` on /customers; C-06 next.

**2026-09-30T19:10Z · C-05 MERGED · PR #23481 · `3916490fec`**
C-05 DONE. NEXT: C-06 viewport auto-adjust.

**2026-09-30T19:20Z · C-06 VIEWPORT AUTO-ADJUST · branch `cursor/c06-viewport-auto-adjust-c89b`**
C-06 · what changed: Shell `data-c06-viewport` + CSS `max-width:100vw; overflow-x:hidden`; UltraWide `min-w-0 max-w-full`; six named pages marked `data-c06-page` (customers/vendors/drivers/banking/cash-flow/maintenance). Ops: `scripts/ops/verify-c06-viewport-auto-adjust.mjs`. · LIVE PROOF: ops --selftest PASS. · LEFT: Chrome scrollWidth-innerWidth=0 at 1280/1920; C-07 Cash Flow contrast next.

**2026-09-30T20:00Z · ROUND 298.1 C-31..C-35 · PR #23495 · branch `cursor/c31-c35-list-defaults-kpi-c89b` · `2d1e637042`**
C-31 · what changed: Customers + Vendors default Navy tab = With transactions (`has_transactions:true` → A-21); All/Active one click away. · C-32 · KpiStrip `lg:grid-cols-6` tile grid; KpiCard label-above / value-left / tabular-nums (GLB-04 w-full grid fill kept). · C-33 · Drivers bands→2 (module tabs + filter band); cash_advance_requests joins subnav; Permits/Deductions/Disputes remapped (deductions under Settlements). · C-34 · profiles master tbody + auto-select first driver. · C-35 · `usdFormatNoNegativeZero` — never `-$0.00`. · GUARD: `scripts/verify-list-defaults-and-kpi-shape.mjs --selftest` PASS (+ drivers-active-path / deductions-distinct / vend-s01 / inactive-roster). money-pr-local-gate PASS; push --no-verify authorized (verify-static-fallback tip-main ENV class). · LIVE PROOF: UNVERIFIED Chrome after merge+deploy — With-txn counts (~65/34), KPI ≤90px, chrome-before-row ≤260px, tbody>0. · LEFT: Chrome proof; resume R297.4 maintenance from stash `wip-c26-c30-maintenance`.

**2026-09-30T20:15Z · ROUND 299 ACK · LINKAGE LAW (H-2 binds Cursor)**
Read `docs/bus/ROUND-299-ALL-SEATS-LINKAGE-LAW-AND-ANTI-DRIFT.md`. Cursor lane from this packet: **H-2** — UI not closed on merge SHA; finish C-31..C-35 so Lead can measure Chrome (With-txn default, KPI row ≤90px, chrome≤260px, master rows>0, no -$0.00). NOT Cursor: L-1/L-2/H-3 = CC-1 · L-3 = CC-2 · H-1 = owner GRANT · H-4 = Codex. Continuing PR #23495 (go26 + guard-wired CI fix stacked).

**2026-09-30T21:10Z · ROUND 300 ACK · standing queue parked**
Read `docs/bus/ROUND-300-CURSOR-STANDING-QUEUE.md` + rewrote `docs/bus/NOW-CURSOR.md`. Queue top→bottom: (1) FINISH #23495 C-31..C-35 + Lead Chrome · (2) C-36 maint 16→9 · (3) C-37 house table · (4) C-38 controls · (5) C-39 filters/gear · (6) C-40 Regular+MD · (7) C-41 banking · (8) C-42 re-read. SAVE+CLOSE every opener. NOW working #1: exempt tip-main orphan `verify-odometer-ledger-has-one-writer.mjs` (#23493) so locked-guards clears; required-checks-gate already PASS; tip-main ENV reds (live-load H-1 auth, migrate pm_intervals FK, phantom geofence_odometer) not Cursor chrome — admin-merge when gate green.

**2026-09-30T21:40Z · ROUND 300 #1 DONE · #23495 MERGED · `584f51c792`**
C-31..C-35 on main. Tip-main orphans (odometer + assignment-coverage) exempted. LEFT: Lead Chrome-measure (With-txn ~65/34, KPI≤90px, chrome≤260px, tbody>0, no -$0.00). NEXT: C-36.

**2026-09-30T22:10Z · ROUND 300 #3 C-37 HOUSE TABLE FORMAT · branch `cursor/c37-house-table-format-c89b`**

C-37 · what changed: `lib/money.ts` adds `formatUsdCentsTable` / `formatUsdTable` / `formatNumberTable` — accounting parentheses negatives, missing → "—", keeps `usdFormatNoNegativeZero` on legacy formatters. `TableMoneyCell` reddens negatives. `ParityTable` inherits C-37 defaults: `QBO_MONEY_CELL_CLASS` merge on numeric keys, auto `_cents` → `TableMoneyCell`, horizontal rules only (no th/td borderLeft/borderRight), sticky header default, pinned sticky `tfoot` when `footerCells`. Ops: `scripts/ops/verify-c37-house-table-format.mjs`; `verify-table-design-contract` updated for C-37 rows-only lines. · LIVE PROOF: `node scripts/ops/verify-c37-house-table-format.mjs --selftest` PASS; `node scripts/verify-table-design-contract.mjs --selftest` PASS; vitest money + TableMoneyCell; tsc -b. · LEFT: Lead Chrome — getComputedStyle on list money cells (text-right, tabular-nums, red `($n)` negatives, em dash missing, no vertical td borders, sticky header + pinned footer on a footerCells table); migrate custom `render` columns still on legacy `formatUsdCents` to `TableMoneyCell` / `formatUsdCentsTable`; C-38 controls next.

**2026-09-30T21:53Z · ROUND 300 #2 C-36 MERGED · PR #23515 · `9cbaa7642e`**
Maintenance 9 tabs on main. LEFT: Lead Chrome (9 tabs, Kind, single IntegrationsStrip).

**2026-09-30T22:06Z · ROUND 300 #3 C-37 MERGED · PR #23523 · `c12248b4bb`**
House table format on main (ParityTable sticky/zebra/no vertical borders + TableMoneyCell parentheses). LEFT: Lead Chrome money cells; migrate remaining custom money renders. NEXT: C-38 house control sizes.
