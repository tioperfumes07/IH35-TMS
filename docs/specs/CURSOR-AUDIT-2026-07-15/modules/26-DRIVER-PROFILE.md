# 26 — DRIVER PROFILE (detail `/drivers/:id/profile`)

**Verdict:** Rich DQF/ops profile aggregate is real and large (identity → audit). Money and map deep-links are the failure class: settlements still read RETIRE `payroll.driver_settlements`, “Full settlements” drops `driver_id` on redirect, Assign Truck / View on Map / Current load targets are dead or wrong. Keep this page AND the Drivers list module (22) — never merge-delete.

## Live evidence notes
**REPO-ONLY.** Distinct from sidebar list module audited in `22-DRIVERS.md`.

- Route: `/drivers/:id/profile` → `DriverProfilePage` (`manifest.tsx:3972`); full record `/drivers/:id`.
- Arch: Driver Profile Parts 1–2 (`IH35_ARCHITECTURAL_DESIGN.md` ~L1080-1118) — sections 1–12 + action bar locked.
- Aggregate API: `GET /api/v1/mdata/drivers/:id?operating_company_id=` (`DriverProfilePage.tsx:118-121`).
- Settlements SQL SoR in aggregate: **`payroll.driver_settlements`** with savepoint zero fallback (`driver-aggregate.service.ts:359-403`) — conflicts with canonical `driver_finance.*` subledger law.

## Surface / button inventory

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Route | Profile page | `/drivers/:id/profile` | HAVE |
| Header | Hide from lists / Show in lists | `deactivateDriver` / `reactivateDriver` (not Terminated) | HAVE (`DriverProfilePage.tsx:237-250`) |
| Header | Open full driver record | `/drivers/:id` | HAVE |
| Header | All profiles / Back | `/drivers?subtab=profiles` (legacy query; list redirects) | DRIFT |
| §1–6 | Identity, License, Medical, Drug, HOS (30s refetch), Assignment | Aggregate sections | HAVE |
| Assignment | Default truck / Currently driving | Links `/fleet/:unitId?operating_company_id=` | HAVE (verify unit route vs `/fleet/units/:id`) |
| Assignment | Current load | `Link` → `/loads/${load_id}` | **WILL FAIL / DEAD** — no `/loads/:id` route; loads live under `/dispatch/loads/:id` / `?load_id=` (`manifest.tsx:1167`, redirect helper ~L622) |
| §7 | Performance scorecard | harsh events + rank | HAVE |
| Late arrival | `DriverLateArrivalCard` | Reports cross-link | HAVE |
| §8 Settlements | YTD / last 4 weeks / Auto-pay toggle | Reads aggregate settlements; `updateDriver({ settlement_auto_pay_enabled })` | WILL FAIL integrity if RETIRE empty (`driver-aggregate.service.ts:369`) |
| §8 | Full settlements link | `/settlements?driver_id=` → Navigate to `/driver-finance/settlements` **without query** | **WILL FAIL** (`SettlementsSection.tsx:28`; `manifest.tsx:4084`) |
| §8 | Payment methods card | `DriverPaymentMethodsCard` | HAVE |
| Layovers | Summary + View history | `/dispatch/layovers/driver/:id` | HAVE |
| §9 Training | + Add training modal | POST training API | HAVE |
| §10 Border | Credentials section | Display | HAVE |
| W-8BEN | Capture modal | Modal create | HAVE |
| Documents | Full `DocumentsTab` upload/R2 | entity_type=driver | HAVE (replaces read-only stub) |
| Communications | `DriverCommunicationsTab` | Threaded messages | HAVE |
| DQF KPI strip | Checklist counts | Display-only (no drill `to`) | HAVE / thin |
| DQF checklist | `DriverDqfPanel` editable | Safety DQF items | HAVE |
| Action bar | Edit | Navigate `/drivers/:id` | HAVE (`ActionBar.tsx:38-40`) |
| Action bar | Assign Truck | `/drivers/:id?assign_truck=1` | **DEAD** — no consumer of `assign_truck` in pages/components (repo-wide grep = ActionBar only) |
| Action bar | Send Message | Modal → messages API | HAVE |
| Action bar | View on Map | `/fleet/map?driver=` | **WILL FAIL / DEAD** — **no `/fleet/map` route**; map is `/dispatch/map` (`manifest.tsx:1111` vs fleet routes `:3988-4020`) |
| Action bar | Export PDF | `/api/v1/mdata/drivers/:id/export.pdf` | HAVE |
| Action bar | Suspend / Terminate | Confirm modals | HAVE |
| Audit History | `EntityAuditHistoryTab` | entity_type=driver | HAVE |

## HAVE / MISSING / DRIFT / WILL FAIL

**HAVE:** Full DQF profile chrome; documents upload; training CRUD; W-8BEN; communications; suspend/terminate; PDF export; company-scoped aggregate (D2 fix comment at L181-185).

**MISSING:** Working Assign Truck deep-link; working map deep-link; settlement numbers from canonical `driver_finance` ledger; load EntityLink to dispatch SoR.

**DRIFT:** Arch Part 2 still cites `payroll.driver_settlements` — RETIRE vs canonical `driver_finance.*`. Dual profile surfaces (`/drivers/:id` vs `/profile`) intentional — keep both.

**WILL FAIL**
1. **Settlement YTD/weeks show $0 while driver_finance has pay** — aggregate queries RETIRE table (`driver-aggregate.service.ts:369-387`).
2. **“Full settlements” loses driver filter** — `/settlements?driver_id=` redirect strips query (`manifest.tsx:4084`).
3. **View on Map 404 / catch-all** — `/fleet/map` does not exist.
4. **Assign Truck is a no-op deep-link** — `assign_truck=1` unread.
5. **Current load link** → `/loads/:id` does not exist.

## Professional recommendation
Point aggregate settlements at `driver_finance` (owner-gated accounting change — design block, not a silent SQL swap without CPA proof). Fix links additively: `/driver-finance/settlements?driver_id=`, `/dispatch/map?driver=`, `/dispatch/loads/:id` or `?load_id=`, and wire Assign Truck to default-truck / fleet assign modal already described in arch. Never delete Driver Profile or Drivers list. Update arch Part 2 RETIRE table reference in the same commit as the aggregate fix.

## Sources
- `apps/frontend/src/pages/drivers/DriverProfilePage.tsx`
- `apps/frontend/src/components/driver-profile/ActionBar.tsx`
- `apps/frontend/src/components/driver-profile/SettlementsSection.tsx`
- `apps/frontend/src/components/driver-profile/CurrentAssignmentSection.tsx`
- `apps/backend/src/mdata/driver-aggregate.service.ts` (L359-412)
- `apps/frontend/src/routes/manifest.tsx` (L3972, L4084, L1111, L1167, L3988-4020)
- `docs/specs/IH35_ARCHITECTURAL_DESIGN.md` (Driver Profile Parts 1–2)
- Related list audit: `modules/22-DRIVERS.md`
