# IH35-TMS — Dispatch Build: Lane Enforcement (allowed_files)
LOCKED 2026-06-08 | pairs with agent work plan + 13 dispatch blocks

RULE: any two concurrently-open PRs MUST have disjoint allowed_files. The block-ready
gate (block-ready.mjs check #9 allowed-files) fails the build if a PR touches a file
not in its list, or if two open lanes overlap. Verify paths against repo before commit;
if a block needs a file owned by the other lane → STOP and re-scope.

## LANE A — AGENT-1

Block 12 — DISP-DRAWER-WIRE (LANDS FIRST; sole writer of the drawer)
allowed_files:
  - apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx
  - apps/frontend/src/routes/manifest.tsx
  - .block-ready/DISP-DRAWER-WIRE.json

Block 1 — DISP-OVERVIEW
allowed_files:
  - apps/frontend/src/pages/dispatch/DispatchOverview.tsx (NEW)
  - apps/frontend/src/pages/Dispatch.tsx
  - .block-ready/DISP-OVERVIEW.json

Block 2 — DISP-QUEUES-NAV
allowed_files:
  - apps/frontend/src/components/dispatch/DispatchSubnav.tsx (NEW)
  - apps/frontend/src/pages/Dispatch.tsx
  - .block-ready/DISP-QUEUES-NAV.json
note: shares Dispatch.tsx with Block 1 → run SEQUENTIALLY (1 then 2), never concurrent.

Block 3 — DISP-KANBAN-STATES
allowed_files:
  - apps/frontend/src/components/dispatch/DispatchKanban.tsx
  - .block-ready/DISP-KANBAN-STATES.json

Block 4 — DISP-ROUNDTRIPS (after Block 3, before Block 5)
allowed_files:
  - apps/frontend/src/pages/dispatch/RoundTrips.tsx (NEW)
  - apps/frontend/src/components/dispatch/FleetOosStrip.tsx (NEW)
  - apps/frontend/src/pages/Dispatch.tsx
  - .block-ready/DISP-ROUNDTRIPS.json

Block 5 — DISP-LIST-TABLE-ASSIGN
allowed_files:
  - apps/frontend/src/pages/dispatch/DispatchBoard.tsx
  - .block-ready/DISP-LIST-TABLE-ASSIGN.json

Block 13 — DISP-FINES-DEDUCT
allowed_files:
  - apps/frontend/src/components/dispatch/tabs/FinesDeductionsCard.tsx (NEW)
  - apps/frontend/src/pages/safety/components/FineEntryForm.tsx (EDIT)
  - .block-ready/DISP-FINES-DEDUCT.json

Block 16 — DISP-DENSITY-NAV (LAST; preview-gated for Sidebar)
allowed_files:
  - apps/frontend/src/styles/dispatch-tokens.css
  - apps/frontend/src/components/layout/SidebarFlyoutMenu.tsx
  - apps/frontend/src/components/layout/Sidebar.tsx
  - .block-ready/DISP-DENSITY-NAV.json

## LANE B — AGENT-2
(NONE may list LoadDetailDrawer.tsx, Dispatch.tsx, DispatchBoard.tsx, DispatchKanban.tsx, Sidebar*.tsx)

Block 6 — DISP-PLANNERS
allowed_files:
  - apps/frontend/src/pages/dispatch/planners/DriverPlanner.tsx (NEW)
  - apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx (NEW)
  - apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx (NEW)
  - .block-ready/DISP-PLANNERS.json

Block 7 — DISP-FACTORING-PACKET
allowed_files:
  - apps/frontend/src/pages/factoring/FactoringHome.tsx
  - apps/frontend/src/pages/factoring/ReserveTracker.tsx (NEW)
  - apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx (NEW)
  - .block-ready/DISP-FACTORING-PACKET.json

Block 8 — DISP-CROSSBORDER
allowed_files:
  - apps/frontend/src/pages/dispatch/BorderCrossings.tsx (NEW)
  - apps/frontend/src/pages/dispatch/components/BookLoadModal.tsx (EDIT)
  - apps/frontend/src/components/dispatch/tabs/CustomsTab.tsx (NEW)
  - .block-ready/DISP-CROSSBORDER.json

Block 9 — DISP-PROFITABILITY
allowed_files:
  - apps/frontend/src/pages/dispatch/TripProfitability.tsx (NEW)
  - apps/frontend/src/components/dispatch/tabs/SettlementProfitabilityCard.tsx (NEW)
  - .block-ready/DISP-PROFITABILITY.json

Block 11 — DISP-CASHFLOW-LINK
allowed_files:
  - scripts/verify-cashflow-includes-dispatch-events.mjs (NEW)
  - .block-ready/DISP-CASHFLOW-LINK.json

## ENFORCEMENT NOTES
1. Tab children (FactoringTab, CustomsTab, SettlementProfitabilityCard, FinesDeductionsCard) live OUTSIDE LoadDetailDrawer.tsx. Block 12 imports them. Until a child lands, Block 12 imports a stub.
2. Dispatch.tsx appears in Blocks 1, 2, 4 → SEQUENTIAL within Lane A, never concurrent. Order: 1 → 2 → 4.
3. Lane A and Lane B share ZERO files → both lanes run fully in parallel.
4. STOP-THE-LINE on red main; disjoint-overlap = gate fail = re-scope, do not override.
