# CODEX — ROUND 8.5 — Design parity verifier: every approved board, identical in the live app
Posted 11-09-2026 8:20 PM CT (2026-11-10 02:20Z) · Lead

WHERE THE DESIGNS ARE (all on main):
- docs/design/v3/*.dc.html: the 42 APPROVED V3 boards ("V3 · IN THE LIVE APP", owner 10-22 6:10 PM). The V3- prefix is dropped in the file names. The V3-*.dc.html copies of LoadHistory, FuelAssignment and Reports-* are duplicates of the same boards.
- docs/design/v3/*.png: picture renders of the boards (37). Boards without a PNG: render them yourself (below).
- docs/design/v3/maintenance-vehicle-graphics/: Main.dc.html (Fleet Health Line), TruckProfile.dc.html (truck service map), ShopBays.dc.html (shop floor). Canvas: https://claude.ai/artifact/WMxdAZS32A9ww8G63Ncvng
- docs/design/v3/canvas-1-module-boards.json: board titles and order. Canvas: https://claude.ai/artifact/DuE4p2MZHjxXEtnboiuEBx
- Owner's export copy: ~/Downloads/11-09-2026-IH35-ALL-PAGE-DESIGNS/ (and .zip), plus README-FOR-CODEX.md.
- DO NOT BUILD and do not score: *V2, *-PREVIOUS, boards marked "PREVIOUS (rejected 4:41 PM)" in canvas json, V3-Dispatch-LoadWizard-* (superseded by BookLoad).
- .dc.html needs the canvas support.js runtime. To render one, open the canvas link, or serve it with the runtime and screenshot it with Playwright at 1440×900.
- Cursor is BUILDING these under ROUND 8.4 (docs/bus/lead/11-09-2026-CURSOR-ROUND-8.4-Design-Complete-All-Modules.md). You are the VERIFIER.

DO:
1. Board→route map. docs/design/DESIGN-BOARD-ROUTE-MAP.md: every approved board (42 + 3 maintenance) → the exact app route, tab and subtab, and modal trigger where there is one. No board left unmapped.
2. Element census per board. Extract from each .dc.html every visible element: header, KPI tiles, tabs, filters, table columns (name and order), buttons, row actions, empty states, charts/graphics, modals, side panels. Then check the live page at https://app.ih35dispatch.com (USMCA) for each one: present, same label, same order, same placement. The element must also be WIRED: a button does something, a column shows real data, a filter filters, a tile has a real number. Restyle-only, placeholder, dead button, hard-coded number = FAIL.
3. Visual diff. Playwright at 1440×900, board render vs live page, side by side. Save both PNGs plus a diff image per board: docs/design/parity/<board>/{board,live,diff}.png.
4. Report. docs/design/DESIGN-PARITY-VERIFY.md: per board, elements total / pass / fail, the exact list of each failing element (what the board shows, what live shows), and a screenshot link. Totals per module.
5. Guard. scripts/verify-design-board-parity.mjs reads the census and fails while any approved board has a failing element. Ratchet: the failing count may only go down. Next free verify-step under the claude/ lane rule; claim it in CLAIMED-NUMBERS.json.
6. Fix loop. Post each module's failing list to docs/bus/lead/ for Cursor. Any page Cursor has not fixed by the deadline: fix it yourself, with SURFACE-BREACH-AUTHORIZED: codex <board> ROUND 8.5 deadline passed. Never remove existing columns or functions; the additive-only law holds.
7. Fast merge law: branch → CI green → REST squash-merge. Every PR quotes the before→after failing count.

DONE (re-measurable): DESIGN-PARITY-VERIFY.md shows failing = 0 on all 45 boards; side-by-side PNGs committed for each board; guard green on main.

DEADLINES (UTC):
- Map + census + first report: 2026-11-10 18:00Z
- Accounting, Banking, Settlements, Factoring, Fuel, Maintenance at 0: 2026-11-11 18:00Z
- All 45 boards at 0: 2026-11-13 00:00Z
MISSED → the Lead seat takes the surface.
