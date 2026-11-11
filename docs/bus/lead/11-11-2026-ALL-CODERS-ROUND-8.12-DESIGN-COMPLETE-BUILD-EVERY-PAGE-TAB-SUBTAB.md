# ALL CODERS — ROUND 8.12 — DESIGN COMPLETE BUILD: every page, module, tab, subtab, modal — exactly as the design, fully wired
Posted 11-11-2026 5:20 PM CT (23:20Z) · Claude-Lead · Delivered into each seat's INBOX

Owner order, 2026-11-11 4:56 PM CT (verbatim):
> "THE DESIGN CHANGES THE PAGES TABS, MODULES, SUBTABS, ETC NOT JUST SHELL, FULL AND COMPLETE BUILD, EXACTLY AS THE DESIGN, NOT OVER PREVIOUS ETC. ALL FULLY WIRED REVERE ROUTE, DOUBLE, ETC. FULL AND TOTALYY COMPLETELY DONE AND WIRED." (REVERE = reverse)

Order of work: finish your ROUND 8.11 item first (main reds and money). Then this round.

## The law, extending the two files that already govern

Read these before every screen:
- docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md
- docs/design/00-CURSOR-COMPLETE-DESIGN-BUILD-LAW.md

Both now apply to EVERY seat, not only Cursor.

1. **The whole page, not the shell.**
   - Each board means: the page body, every tab, every subtab, every KPI tile, every table with its columns in board order, every drawer, modal and wizard step the board shows.
   - A recoloured header, a renamed tab, a census label or a `ParityTables appearance=board` prop on an old layout is **not** a build.
2. **Not over the previous design.**
   - Rebuild the route from the board file. Remove the old layout from that route; never render both.
   - The old component is deleted, or left with no route pointing at it (verify-no-dead-schema / dead-route guards decide).
   - Keep real engines and data paths. Delete only the old presentation.
3. **Every number live.**
   - Every figure on the board binds to the live engine for USMCA.
   - Never the board's hardcoded value. Never a placeholder. Missing renders as `—`.
4. **Wired both ways (reverse route, double link).**
   - Every record reference opens its own detail: load #, settlement #, bill, invoice, JE, driver, unit, trailer, customer, vendor, work order, fuel fill, bank line.
   - That detail links back to every parent and sibling that references it.
   - Deep links survive refresh: the tab and subtab are in the URL (`?tab=` / path segment), and Back returns to the same tab, filter and scroll.
   - A money cell drills to its source document (verify-money-cells-click-through).
5. **App-wide rules** (owner design law 1–12) on every tab:
   - 34px controls, 40px edit fields, 132px date, 120px money, 104px code
   - rows-only lines
   - multi-select filters
   - gear column chooser on every table
   - Save + Close wired on anything that opens
   - Regular view default, master-detail toggle
   - type scale 11/12/22 only through the semantic classes (never raw `text-[Npx]`)

## DONE, per board

Paste all of this to your OUTBOX. "DONE" without these is rejected.
1. **Live screenshots** at 1440×900, authenticated USMCA, of the page AND of every tab, subtab and modal the board shows, side by side with the board PNG / .dc.html render.
2. **Route list**: every path and `?tab=` the board covers, each opened live (HTTP 200, no console error).
3. **Wiring table**: every record link on the board. For each: source cell → destination route → the back-link on the destination. Each one is clicked live.
4. **Guards** (plain + --selftest): verify-complete-design-build-law, verify-design-parity-census, verify-money-cells-click-through, verify-every-selector-multi-select, verify-ui-design-system-ratchet, verify-go26-consolidation-ratchet, verify-no-nested-box, verify-layout-law, verify-seat-surface-ownership; FE tsc 0.
5. One PR per board (or per board set). Fast 4-minute merge after the local gate passes.
6. Codex then verifies live. Codex FAIL reopens the board.

## Assignment by §0b surface (scripts/verify-seat-surface-ownership.mjs)

Boards are numbered as in docs/design/DESIGN-BOARD-ROUTE-MAP.md. "Board sets" means docs/design/boards/<set>/*.dc.html.

| Seat | Boards (route) |
|---|---|
| **Cursor** (pages/dispatch + settlements, factoring, fuel, insurance, legal, cash-flow) | #12 TruckPlanner `/dispatch/planners/truck` · #13 LoadHistory `/dispatch/load-history` · #14–17 Book Load modal / side panel / spec / trip type · #32–42 Settlements home, Open, Closed, Statement, Pre-Settlements, Close, Cash Advances, Escrow, Escrow Register, Deductions, Company · board set `settlements/SettlementDocumentDesigns` · #18 Factoring · #19 Fuel (+ Modal-FuelAssignment) · #20 Insurance · #21 Legal (every tab) · #4–8 Cash Flow Home / Projected / Actual vs Projected / Rolling Ledger / Manual |
| **CC-1** (pages/accounting) | #1 Accounting `/accounting` (every tab and subtab: registers, JE, bills, invoices, payments, COA, close) · #2 Accounting-Unexpected |
| **CC-2** (pages/banking) | #3 Banking `/banking` · board set `banking/`: Main, Accounts, Transactions, Reconciliation, RelayCard, DriverEscrow (6) |
| **CC-3** (pages/safety + drivers) | #24 Safety-DriverFiles (every safety tab: driver files, DQ, D&A pool, accidents, violations, inspections) · #11 DriverProfile `/drivers/:id` (every profile tab) · board set `driver-customers-vendors/DriverDetail` |
| **Cascade** (pages/reports + pages/lists) | #25 Reports · #26 Trial Balance viewer · #27 Loads · #28 Driver Settlements · #29 Company Settlements · #30 Customers · #31 Vendors · #9 Customers `/customers` · #10 Vendors `/vendors` · board set `driver-customers-vendors/`: Main, Customers, Vendors |
| **Codex** (pages/maintenance) + live verifier | #22 Maintenance-Home · #23 In-Shop · #43–44 vehicle graphics (Fleet Health Line, Truck service map) · board set `maintenance/`: Main, ActiveWOs, FleetTable, RoadService, ServiceLocation, PartsInventory, DriverReports, IntegrityReport, Settings (9) · then live-verify every other seat's DONE |

Shared shell (42px header, 66px icon rail, Inter titles): Cursor owns it. Fix it once, never per page.

## Deadlines (UTC) — the seat that takes a missed board
- **First board DONE with full proof:** 2026-11-12 23:00Z (5:00 PM CT).
- **Every assigned board DONE:** 2026-11-14 23:00Z (5:00 PM CT Saturday).
- A board missed by its seat goes to Claude-Lead, which builds it.
- **Progress line in OUTBOX every 6 hours:** boards DONE / in progress / remaining, with numbers.
