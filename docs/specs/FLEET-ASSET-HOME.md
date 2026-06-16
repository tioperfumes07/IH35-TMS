# FLEET-ASSET-HOME — Canonical Units module: gap audit + design proposal

**SHOW-FIRST, NO CODE.** Audit of the live code vs blueprint §7.2 + a gated proposal. No source,
migration, or sidebar change this turn. **PAUSED for Jorge's placement decision (A).**
Audited 2026-06-16 ~11:30 CDT on `main`.

## Audit findings (live code, cited)

**1. Canonical `/units` list route — DOES NOT EXIST.**
No `/units` or `/fleet/units` **list** route in `routes/manifest.tsx` (grep count = 0). The only unit
"list" surface is the **Maintenance Fleet Table** at `/maintenance/fleet-table`
(`routes/manifest.tsx:1329` → `pages/maintenance/FleetTablePage.tsx`), surfaced in nav only under the
Maintenance module flyout (`components/maintenance/MAINTENANCE_NAV_CONFIG.ts:34` — "Fleet Table").
There is **no top-level Units/Fleet entry** in the locked sidebar. Unit **detail** does exist at
`/fleet/units/:id` (`manifest.tsx:3339` → `VehicleProfilePage`).

**2. Maintenance "Fleet table" — `FleetTablePage.tsx`, rows ARE click-through (not dead).**
Data: `GET /api/v1/mdata/units?include=trailers` + KPIs `GET /api/v1/maintenance/fleet-table/kpis`.
Rows drill through to the canonical profile: `components/FleetTable.tsx:49`
(`fleetProfilePath → /fleet/units/${row.id}`) + `:215` (`onClick navigate(...)`). It is effectively a
**read-only list** (no inline edit; the row action navigates to the profile).

**3. Unit EDIT + RETIRE UI — EXISTS, on the Unit profile (master_data-owned).**
`components/vehicle-profile/StatusChangeModal.tsx:72` calls `patchUnit(unitId, body)`;
`components/vehicle-profile/IdentityStatusHeader.tsx:58` calls `patchUnit(unitId, {status:"InService"})`.
API: `api/mdata.ts:1283 patchUnit(id, body)`. So an operator **can** change a unit's status
(retire/reactivate) and edit it from the profile. **Caveat:** this is a direct status `patchUnit`, not a
formal RETIRE workflow (blueprint WF-064) — no has_open_wo() gate visible at the UI layer.

**4. Unit/asset Profile component — canonical = `pages/fleet/VehicleProfilePage.tsx`** (`/fleet/units/:id`).
Covers most of §7.2.2.4: `IdentityStatusHeader` (Profile/status), `MaintenanceSnapshotSection` +
`MaintenanceAlertsBanner` (Maintenance History), `TripCostCalculator` + financial section (Cost
Allocation), `LiveTelemetrySection` (`:176`, Telematics/Samsara), `status_changes` (`:49`, audit-ish).
A separate, smaller `pages/units/UnitDetail.tsx` exists but only has Permits + Toll-Tags tabs —
**legacy/partial, NOT the canonical profile.**

**5. Maintenance KPI boxes (Total / Active / In-Shop / OOS / Avg Age) — STATIC, NOT clickable. (GAP)**
`FleetTablePage.tsx:17` `KpiCard` is a plain `<div>` (no `onClick`/`Link`); `:123-127` render them
non-interactive. The only button is "Clear filters" (`:151`). **Violates the blueprint rule "every
list/KPI is clickable" (drill-through).**

**6. Filters — by-type EXISTS (as a dropdown, not sub-tabs); active-only is implicit.**
`components/fleet/fleetTypeFilter.ts` (`FLEET_TYPE_FILTER_OPTIONS`) + `FleetTablePage.tsx:33`
(`parseFleetTypeFilter`, applied as `&type=`). It is a **dropdown**, not the Trucks/Trailers/Company
**sub-tabs** of §7.2.2.3. Active-only is **implicit** (the unified fleet endpoint already filters
`deactivated_at`); there is **no explicit active/all toggle or status sub-filter** on the surface.

**7. Trailers — real `/fleet/trailers` pull ABSENT; phantom `SAM-*` PRESENT.** Confirmed tie to 2F
(tracker 886): the fleet table's "trailers" are `mdata.equipment` rows, which today are the phantom
`SAM-*` truck-mis-synced-as-trailer rows from the master-sync dual-write. No real trailer-asset pull.

### Audit summary — what already exists vs the gaps
- **Exists:** canonical profile (`VehicleProfilePage`), master_data-owned edit/retire (`patchUnit`),
  click-through rows, a by-type filter, Telematics/Maintenance/Cost on the profile.
- **Gaps vs §7.2:** (i) no canonical Units **list home** / sidebar surfacing; (ii) **KPIs static**, not
  drill-through; (iii) type is a **dropdown, not sub-tabs**, and no explicit **active** filter;
  (iv) no **read-only embed** for Dispatch/Safety; (v) **phantom trailers** (2F dep); (vi) retire is a
  raw status patch, not the **WF-064** workflow (no has_open_wo gate at UI).

## Proposal (GATED — Jorge decides A before any build)

### A. Canonical home for unit edit/retire + how to surface it in the LOCKED sidebar — OPTIONS (Jorge picks)
master_data already owns edit/retire on `VehicleProfilePage`. The open question is the **list home** and
its **sidebar surfacing**, under the additive-only + locked-26-item-sidebar constraint
(`verify-sidebar-contract.mjs`). Options, with trade-offs — **not picking unilaterally**:

- **Option A1 — Promote the existing Maintenance Fleet Table as the canonical Units list.** Keep it at
  `/maintenance/fleet-table` (or alias `/units`), surfaced via the Maintenance flyout (already is).
  *Pro:* zero sidebar-lock change, fully additive, ships fastest. *Con:* "Units" isn't a first-class
  top-level module — discoverability is via Maintenance, which diverges from a dedicated §7.2.2.3 home.
- **Option A2 — Add a dedicated `/units` list route, surfaced as a flyout link under an existing module**
  (Maintenance or Dispatch), reusing `FleetTable`. *Pro:* a real Units list home, still no top-level
  sidebar entry → no lock change. *Con:* a second fleet list surface to keep consistent.
- **Option A3 — New top-level sidebar module "UNITS" (or "FLEET").** *Pro:* matches §7.2.2.3 most
  literally. *Con:* **changes the LOCKED 26-item sidebar** — requires Jorge's explicit OK + a
  `verify-sidebar-contract.mjs` lock-array update (locked-page gate). Heaviest.

Recommendation: surface the trade-off, don't pick. (A1 is lowest-risk/additive; A3 is most blueprint-literal
but touches the sidebar lock.)

### B. Maintenance Fleet table + KPIs → click-through to the canonical profile (READ, not a 2nd editor)
Rows already navigate to `/fleet/units/:id` (keep). Make the **4 KPI cards clickable** so they
drill into a filtered list view (Active / In-Shop / OOS / Total). **Edit/retire stays ONLY on
`VehicleProfilePage`** (master_data owns) — the Maintenance surface remains read/navigate, never a
second editor.

### C. Clickable KPIs + active filter + by-type sub-tabs (per §7.2.2.3)
On the units surface: convert the type **dropdown → Trucks / Trailers / Company Vehicles sub-tabs**
(filter `unit_class`), add an **active-only** filter (default Active), and make every **KPI card a
drill-through** to the matching filtered view. All additive to `FleetTablePage`/`FleetTable`.

### D. Read-only Fleet table embed for Dispatch + Safety
Reuse the `FleetTable` component in **read-only** mode embedded in Dispatch and Safety, each row linking
to the **same** canonical `/fleet/units/:id` profile (no duplicate editor, no duplicate data path).

### E. Sequencing dependency (NOT in scope here)
The Trailers sub-tab / item-D trailer rows depend on the **2F real `/fleet/trailers` pull** (tracker 886).
Until 2F lands, "trailers" remain the phantom `SAM-*` rows. Call out as a hard dependency; do not build
the Trailers sub-tab content on phantom data.

## Acceptance / next step
GUARD + Jorge review findings (1–7) + this proposal. **No source/migration/sidebar change made.**
**PAUSED for Jorge's placement decision (A)** (A1 / A2 / A3) before any build block is written.
