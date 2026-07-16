# 21 — FLEET

**Verdict:** Fleet sidebar door reuses Maintenance `FleetTablePage` for `/fleet` roster + unit/trailer profiles — solid ops spine; almost no EntityLink usage inside fleet pages; create-unit CTA not first-class on Fleet home; transfers route exists.

## Live evidence notes
**REPO-ONLY.**
- Sidebar FLEET → `/fleet` (role-gated) `sidebar-config.ts` L102–108
- Routes: `/fleet`, `/fleet/units/:id`, `/fleet/units/:id/detail`, `/fleet/trailers/:id`, `/fleet/transfers-in-progress` (manifest ~L3988–4020)
- Home: `FleetHomePage.tsx` wraps `FleetTablePage` with `defaultActiveOnly`
- Profiles: `VehicleProfilePage.tsx`, `TrailerProfilePage.tsx` (Edit modals)
- EntityLink unit/trailer → `/fleet/units/:id`, `/fleet/trailers/:id`
- Maintenance also has Fleet Table tab — shared component (KEEP both doors)

## Surface / button inventory

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar FLEET | Nav | `/fleet` | HAVE |
| `/fleet` | Title + company gate | | HAVE |
| `/fleet` table | Status KPIs / type filter / soft-delete Active·Inactive·All | URL `?status=` etc. | HAVE |
| `/fleet` table | Row → unit/trailer profile | `/fleet/units/:id` or trailers | HAVE |
| `/fleet` (vs Maint) | Maint-status columns | Flagged off on `/fleet` | DRIFT (intentional thinner) |
| `/fleet/units/:id` | **Edit** | `EditVehicleModal` | HAVE |
| `/fleet/trailers/:id` | **Edit** | `EditTrailerModal` | HAVE |
| `/fleet/transfers-in-progress` | Transfers list | equipment-transfers API | HAVE |
| Dispatch flyout | Equipment Transfers | `/dispatch/equipment-transfers` | DRIFT (second transfers door — keep) |
| Create unit / trailer CTA | On Fleet home header | Not present on FleetHomePage | MISSING (may live in Maint Master Data) |
| Bulk status change | On FleetTable (Maint design) | BulkActionBar when enabled | MIXED (verify /fleet path) |

## Connectivity to money/ops
- Units link to maintenance WOs, service timeline, fuel, dispatch assignment (profiles).
- EntityLink kind unit/trailer used from reports/banking elsewhere; fleet module pages themselves underuse EntityLink.
- Asset ownership entity (TRK vs TRANSP) is a hard entity-facts risk — profiles must show operating_company / owner entity clearly (verify on VehicleProfile).

## HAVE / MISSING / DRIFT / WILL FAIL
**HAVE:** Roster home; unit/trailer detail + edit; transfers page; shared table with Maint.
**MISSING:** Explicit + Create Unit/Trailer on Fleet home; fleet-specific arch module section (fleet mostly under Maintenance design).
**DRIFT:** Dual Fleet Table (sidebar Fleet vs Maintenance tab); thinner columns on `/fleet`.
**WILL FAIL:** Operators can’t create a unit from Fleet door if create only lives buried in Maintenance Master Data.

## Professional recommendation
Keep `/fleet` and Maintenance Fleet Table (never delete). Add + Create Unit / + Create Trailer on Fleet home pointing to the same modals Maint uses. Surface Transfers in a Fleet flyout. EntityLink driver/load/WO ids on profile activity. Confirm TRK/TRANSP ownership fields are visible before cutover.

## Deep button inventory (repo) — finish pass 2026-07-15

**Evidence root:** `apps/frontend/src/pages/fleet/` · shared `maintenance/FleetTablePage.tsx` · sidebar `sidebar-config.ts:102-106`

### Entry / roster
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Sidebar FLEET | `sidebar-config.ts:102-106` | `/fleet` | HAVE |
| Fleet home | `FleetHomePage.tsx:10-28` | Wraps `FleetTablePage` `defaultActiveOnly` | HAVE |
| Company gate | `FleetHomePage.tsx:20-25` | Select company message | HAVE |
| Shared table | `FleetTablePage.tsx:67+` | Status URL filters; Maint columns flagged via `showMaintenanceColumns` | HAVE / DRIFT (thinner on `/fleet`) |
| **+ Create Unit/Trailer** on Fleet home | Not in `FleetHomePage.tsx` | | MISSING |

### Profiles / transfers
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Unit **Edit** | `VehicleProfilePage.tsx:298,363-367` | `EditVehicleModal` | HAVE |
| Unit Save | `VehicleProfilePage.tsx:343-345` | Profile save mutation | HAVE |
| Trailer **Edit** | `TrailerProfilePage.tsx:146,159-163` | `EditTrailerModal` | HAVE |
| Transfers in progress | `TransfersInProgressPage.tsx:15-38` | equipment-transfers API `pending_to_confirm` | HAVE |
| EntityLink on fleet pages | Grep under `pages/fleet/` | **None** | DRIFT (underuse) |
| Dispatch equipment transfers door | Separate `/dispatch/equipment-transfers` | Dual transfers | DRIFT — KEEP both |

### Top WILL FAIL (new evidence)
1. **Cannot create unit/trailer from Fleet door** — `FleetHomePage.tsx` has title only; create buried in Maint Master Data.
2. **Transfers rows show ack only** — `TransfersInProgressPage.tsx:35-38` no EntityLink to unit/driver.
3. **TRK vs TRANSP ownership** must be verified on profile before cutover (entity-facts risk).

**Never delete** `/fleet` or Maintenance Fleet Table tab — shared component, dual doors intentional.
