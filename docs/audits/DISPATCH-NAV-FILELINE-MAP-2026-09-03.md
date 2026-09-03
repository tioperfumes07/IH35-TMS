# Dispatch navigation file:line map

Generated from `origin/main` branch. Lists the dispatch nav entries and their route mount points. No routes were deleted.

## Primary dispatch top nav

Source: `apps/frontend/src/components/dispatch/DispatchSubnav.tsx:36-99`

| Label | href | Route mount / redirect |
|-------|------|------------------------|
| Load board | `/dispatch?view=kanban` | `routes/manifest.tsx:1385-1391` (`/dispatch`) |
| Load costs | `/accounting/load-costs` | `routes/manifest.tsx:3790-3794` |
| Assignments | `/dispatch/assignment-history` | `routes/manifest.tsx:1192-1196` |
| At-Risk | `/dispatch/at-risk` | `routes/manifest.tsx:1160-1164` |
| Detention | `/dispatch/detention` | `routes/manifest.tsx:1254-1258` |
| Border | `/dispatch/border-crossing` | `routes/manifest.tsx:1326-1330` |
| Late | `/dispatch/alerts/late-arrivals` | **NOT MOUNTED** — no matching `Route` in `routes/manifest.tsx` |
| Live Map | `/dispatch/geofencing` | `routes/manifest.tsx:1393-1399` |
| Trip Pairing | `/dispatch/trip-pairing` | `routes/manifest.tsx:4047-4051` |
| Factoring | `/dispatch/factoring-queue` | `routes/manifest.tsx:1168-1172` |
| Planning → Driver Planner | `/dispatch/planners/driver` | `routes/manifest.tsx:1230-1234` |
| Planning → Truck Planner | `/dispatch/planners/truck` | `routes/manifest.tsx:1238-1242` |
| Planning → Loads Planner | `/dispatch/planners/loads` | `routes/manifest.tsx:1246-1250` |
| Planning → Planner Calendar | `/dispatch/planner` | `routes/manifest.tsx:1222-1226` |
| Planning → Load Templates | `/dispatch/planner?panel=templates` | `routes/manifest.tsx:1222-1226` |
| Planning → Unassigned Units | `/dispatch?view=overview&panel=unassigned` | `routes/manifest.tsx:1385-1391` |
| Planning → Reserve a Load | `/dispatch/book-load?book_load=1` | `routes/manifest.tsx:1350-1357` |
| Settlements → Settlements | `/driver-finance/settlements` | `routes/manifest.tsx:1367-1375` (redirects to canonical) |
| Settlements → Pre-settlements | `/accounting/pre-settlements` | `routes/manifest.tsx:4063-4067` |
| Documents → POD Review | `/dispatch/pod-review` | `routes/manifest.tsx:1286-1290` |
| Documents → OCR Queue | `/dispatch/ocr-queue` | `routes/manifest.tsx:1270-1274` |
| Documents → Equipment transfers | `/dispatch/equipment-transfers` | `routes/manifest.tsx:1262-1266` |

## Dispatch page secondary tabs

Source: `apps/frontend/src/pages/Dispatch.tsx:43-52`
Secondary-tab route mapping: `apps/frontend/src/router/route-manifest.ts:180-196`
Route mounts: `apps/frontend/src/routes/manifest.tsx:1349-1383`

| Tab id | Label | Path |
|--------|-------|------|
| load_board | Load board | `/dispatch` |
| book_load | Book load | `/dispatch/book-load` |
| load_costs | Load costs | `/accounting/load-costs` |
| assignments | Assignments | `/dispatch/assignments` |
| settlements | Settlements | `/dispatch/settlements` (→ `/driver-finance/settlements`) |
| pre_settlements | Pre-settlements | `/dispatch/pre-settlements` |

## Findings

1. **Dead nav item — `Late` links to an unmounted route.**
   - `apps/frontend/src/components/dispatch/DispatchSubnav.tsx:51` points to `/dispatch/alerts/late-arrivals`.
   - No `<Route path="/dispatch/alerts/late-arrivals">` exists in `apps/frontend/src/routes/manifest.tsx`.
   - The related report page is mounted at `/reports/late-arrival` (`routes/manifest.tsx:3367-3371`).
   - Do not delete the route — either mount the intended component or repoint the nav href.

2. **Duplicate `Load costs` leaf in dispatch context.**
   - Primary nav already links to `/accounting/load-costs` (`DispatchSubnav.tsx:42`).
   - The secondary tab strip inside `Dispatch.tsx:48` and `router/route-manifest.ts:183` links to the same route.
   - Per `docs/bus/PASTE-ALL-SEATS-LOAD-COSTS-ELEMENT-MANIFEST-2026-09-03.md`, the canonical route is one; duplicate labels on the same screen should be removed.
