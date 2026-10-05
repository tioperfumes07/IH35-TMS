# SPEC — DRIVER PROFILE, EDIT FORM, FLEET HOME · 2026-10-05

Verified against `origin/main` `02906e8c4` and the live migrations before it was drawn. Every column
named here exists. Where a column does NOT exist it is called out as a gap, not designed around.

Preview: `~/Downloads/10-05-2026-IH35-DESIGN-PREVIEW.html` · Canvas: artifact `SQFJC6y1ixRFjUWDcJMeXQ`

---

## A. THE MODULE-HOME LAW (applies to every module, not just these)

A module root is a HOME, never a list. In this order:

1. Page title, sentence case. Never all-caps.
2. KPI tiles ACROSS, never bars down. Each tile is a link to the filtered list behind it.
3. A module tab strip on ONE line. The roster is one tab among several, not the landing page.
4. Then what needs attention.

The list is a destination you choose. `/drivers` half-follows this. `/fleet` follows none of it.

## B. THE CONTROL LAW

- ONE control height: **34 px**. Every control in the app, forms included. The old 40 px form
  exception is retired — two heights is why forms read as a different product.
- Widths, by what goes in the box: date **132**, money **120** right-aligned tabular,
  short code **104**, select/name **156–200**, email **268**. Only a free-text note grows.
- Every dropdown **filters as you type**.
- **Tab reaches every control**, in reading order. Real `<button>`, `<a href>`, `<input>`, `<select>`
  — never a div with onClick, which Tab skips. Enter saves, Esc cancels, focus ring always visible.
- Lines for rows, never for columns. Zebra + horizontal rules only.
- **Missing renders as —** , never 0, never -$0.00.
- Every credential row carries its own upload clip. The scan attaches to the thing that expires,
  never to a separate Documents screen. A filled clip draws navy.

## C. DRIVER PROFILE — 17 TABS, ONE SHELL

12 named on the strip: Overview · Settlements · Additional payments · Cash advances · Pay & escrow ·
Loads · Fuel · Reports & damage · Complaints · Safety & accidents · Documents · Driver disputes.
5 behind **More ▾**, carried from `DriverDetail.tsx` per owner ruling: Safety file · ELD edits ·
Legal matters · QBO mapping · Audit history.

Rules:
- The strip sits on ONE line and scrolls sideways when narrow. It NEVER wraps.
- Every tab renders INSIDE the profile, scoped to this driver. Clicking Loads shows HIS loads here;
  it does not open Dispatch. Complaints and Driver disputes render driver-scoped lists; the
  module-wide list is a "View all" link INSIDE the card.
- The active tab is a `?tab=` param, parsed by one exported function (same shape as
  `DRIVERS_TABS_CONFIG.parseDriverSubnav`). NOT `useState` — Back and deep links must work.
- Every card header carries a collapse chevron, open by default, choice remembered per viewer per
  tab. **A collapsed card still shows its count.** Collapsing hides rows, never the fact rows exist.

## D. EDIT FORM — 11 GROUPS, 3 ACROSS, ONE SCREEN

Identity · Contact · Emergency contact · Licence · Medical & credentials · Work authorisation ·
Equipment he runs · Tax · Pay · Payment method · Assignment · Notes.

Verified columns behind the two groups that were missing:
- **Equipment he runs** → `mdata.driver_equipment_qualifications` (driver_id × `catalogs.equipment_types`,
  `qualified_at`, `notes`, UNIQUE per pair, `deactivated_at`). Migration 0018. Chips: Dry Van, Reefer,
  Flatbed, Lowboy, Power-only, each with its qualified date. **Unticking DEACTIVATES, never deletes** —
  the record of what he was allowed to pull must survive. Dispatch reads this when offering a load.
- **Work authorisation** → `mdata.drivers.visa_type`, `visa_number`, `visa_expires_at`, `visa_b1_status`.
  Migration 0018's own comment: "Visa category, e.g. B1 (cross-border commercial) … required for
  non-US drivers." Most of the fleet is B1, so it is its own group.
- Tax group carries W-9 / W-8BEN / W-8BEN-E, signed date, ID type, tax ID, 1099 status.
- Banking renders masked; changing it is an audited event needing a second approval.

## E. FLEET HOME

Title "Fleet", sentence case. Tabs: Home · Units · Trailers · Transfers · Roster integrity · Maintenance.

Seven tiles, every one from a real column:
| tile | source |
|---|---|
| Units in service / In maintenance / Out of service | `mdata.units.status` (`InService`, `OutOfService`, `InMaintenance`, `Sold`, `Totaled`) |
| Unassigned | `mdata.units.assigned_driver_id IS NULL` |
| Trailers in service | `mdata.equipment.status` |
| Trailers unhooked | `mdata.equipment.current_unit_id IS NULL` |
| Open work orders | `maintenance.work_orders.unit_id` + status |

Cards: Needs attention (units that cannot work) · Unassigned units · Trailers not hooked ·
Units by status · Trailers by type · Transfers in progress.

**FLT-F428 — THE GAP, stated rather than designed around.** There is NO registration, inspection or
insurance expiry column anywhere on `mdata.units` or `mdata.equipment`. Drivers carry six expiry
dates; trucks carry none. A fleet tile for it would be invented data, so none is drawn. For a
trucking company this is a real hole: a lapsed registration or annual inspection is a roadside
out-of-service order. It needs its own migration and its own round — it is NOT in this PR.

---

## F. MEASURED DEFECTS THIS SPEC CLOSES

| id | defect | evidence |
|---|---|---|
| DRV-F420 | 11 of 12 profile tabs navigate AWAY from the profile | `DriverOverviewBoard.tsx:48-59`; nine land on `DriverDetail.tsx` whose `useEffect:203` swaps to its own tab set; Complaints → `/safety/complaints`, Disputes → `/drivers/disputes` |
| DRV-F421 | Edit opens the old page, not a form | `DriverOverviewBoard.tsx:105` `navigate('/drivers/${id}?tab=profile')` |
| DRV-F416 | driver tabs are `useState` + `#hash` → Back does nothing | `DriverDetail.tsx:198`, `:979` |
| DRV-F415 | two profile pages; the Samsara mapping link (#25516) is on the one the owner never opens | `DriverProfilePage.tsx:539` renders it on `/drivers/:id/profile`, Overview tab |
| DRV-F422 | cards cannot be collapsed | owner request |
| FLT-F424 | `/fleet` is a units roster, no KPIs, no tabs | `FleetHomePage.tsx`, grep for `KpiStrip|KpiCard|NavyPageSubNav` = **0** |
| FLT-F425 | trailers have no list on the fleet home | master pane is `Units (n)` only |
| FLT-F426 | `title="FLEET"` all-caps, inconsistent | `FleetHomePage.tsx:63` |
| FLT-F428 | no registration / inspection / insurance expiry on units or trailers | no such column in any migration |
