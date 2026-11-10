# CURSOR — ROUND 8.4 — 11-09-2026 19:55 CT (01:55Z 11-10)
FINDING: UI-F11125 · LANE: cursor/ · USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80). Transportation and Trucking: do not read, write or report.
OWNER (11-09 19:52 CT, verbatim): "i need all the designs completed in all tabs, modules, subtabs, etc."
OWNER (11-09 18:42 CT, verbatim): "you and claude coders have full permission and authorization, do not ask me for permissions."
Cross-seat surfaces: put this line in each commit body that touches another seat's §0b surface:
`SURFACE-BREACH-AUTHORIZED: <seat> — owner 11-09 19:52 CT "i need all the designs completed in all tabs, modules, subtabs" (UI-F11125)`

SPEC (the design source, in priority order; identical, not inspired):
1. docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md — app-wide rules:
   - rows lined, columns never;
   - control height 34px (40px when editing); date box 132px; money box 120px right-aligned; short code 104px;
   - KPI tiles 78px across;
   - missing value = "—";
   - gear column chooser on every table;
   - multi-select unit/account chips;
   - Save and Close wired on everything that opens;
   - Regular view default, plus a Master-detail toggle;
   - lists open on parties with real money.
2. docs/design/boards/{banking,driver-customers-vendors,maintenance,settlements}: build them pixel-identical.
3. docs/design/v3/*.dc.html (81 files) and docs/design/approved-screens/01–12 (home, maintenance, accounting, banking, fuel planner, safety, drivers, dispatch, lists/catalogs, reports, form 425c, driver app).
4. docs/design/design-parity-contract.json (12 surfaces with required tokens).
5. docs/design/ih35-design-tokens.css — tokens only, no raw hex.
Every number on a screen binds to its live engine, never a board's hardcoded value.

MEASURED (main 11-09):
- 688 routes in apps/frontend/src/routes/manifest.tsx.
- Design references cover 4 board sets, 81 v3 designs, 13 approved screens and 12 contract surfaces.
- verify-ui-design-system-ratchet passes. It only ratchets; it does not prove parity.

COMPLETE, NOT SURFACE (owner 11-09 19:56 CT, verbatim: "it must not be surface level, it must be complete design builds, not half built"):
- A screen counts as DONE only when EVERY element in its design is built and working: every tab, subtab, column, filter, KPI tile, button, modal, drawer and form field, wired to its live engine (nav → API → Neon), with Save/Close, empty "—" states and print/export where the design shows them.
- Restyling an existing screen without building the missing parts is NOT done. A placeholder, "coming soon", a dead button or a hardcoded number = FAIL.
- The census scores each route on FULL element coverage against its design file (elements in the design vs elements built and wired), not just the app-wide CSS rules.
- Design sources added 11-09 to docs/design/v3 from the owner's Downloads (the design agent's files): Dispatch-LoadHistory, Modal-FuelAssignment (+png), Reports-CompanySettlements, Reports-Customers, Reports-DriverSettlements, Reports-Loads, Reports-Vendors. v3 now has 89 files.

DO:
1. CENSUS FIRST (PR 1). Write scripts/verify-design-parity-census.mjs.
   - For every route in the manifest, record its module, tab and subtab; the design source that governs it (board, v3 file, approved screen, or "app-wide rules only"); and pass/fail on each app-wide rule, read statically from the page/components.
   - Write docs/design/DESIGN-PARITY-CENSUS.md with per-module counts. Wire it as a ratchet: failing count may only go down.
2. BUILD (one PR per module, highest money first):
   - Order: Accounting, Banking, Settlements/Driver Finance, Factoring, Customers, Vendors, Maintenance, Fuel, Dispatch, Safety/Compliance, Drivers, Fleet, Insurance, Reports, Lists/Catalogs, Home, Driver app.
   - For each tab and subtab: make it identical to its design source, then apply every app-wide rule. Screenshot proof against the board at 1440×900 (Playwright) in the PR.
   - No functional regressions; additive-only law holds.
3. Each PR follows the fast merge law (branch test → green → squash-merge) and lowers the census failing count.
DONE (re-measurable): DESIGN-PARITY-CENSUS.md failing = 0 for every route; screenshots attached per module.
DEADLINES:
- Census: 2026-11-10 12:00Z.
- Accounting, Banking, Settlements: 2026-11-11 00:00Z.
- All modules: 2026-11-13 00:00Z.
If a deadline is missed, Lead takes the surface.
