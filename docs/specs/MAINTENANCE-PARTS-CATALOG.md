# Maintenance Parts + Services Catalog — Block 4 design

**Status:** DESIGN (doc-only). No schema/data change in this PR. The build is **gated on Jorge supplying
authoritative part data** (per-brand part numbers / fitment / intervals) — this doc has **zero fabricated
part numbers**; every concrete value is marked `«Jorge to supply»`. Schema additions are **Tier‑2** (show
the SQL, additive + idempotent migration with GRANTs + audit, CI fresh‑DB gate) — never self‑merged.

Grounded on prod `5e24d5d` (2026‑06‑22). Transportation only (`operating_company_id 91e0bf0a…`).

## 1. Current state (what already exists — do NOT rebuild)
- **`maintenance.parts`** — flat parts master (`part_number, name, vendor_default, unit_cost, qty_on_hand,
  reorder_threshold, location`), surfaced by `PartsMasterDataPage` + `parts.routes.ts`. **No** per‑brand
  structure (no VMRS system, no fitment, no condition).
- **`maintenance.parts_inventory`** — daily‑purchase / on‑hand inventory (`part_description, vendor_id,
  last_purchase_*, on_hand_qty, location`) + `parts_invoice_links` (WO ↔ vendor invoice). Anti‑theft
  pattern: minimal stock on hand.
- **`maintenance.pm_schedules` / `pm_alerts`** — PM intervals + due alerts (`interval_kind`,
  `interval_value`, `next_due_odometer`, …). Odometer feeds from Samsara via
  `telematics.vehicle_latest_position.odometer_mi` (#1289).
- **Create‑WO** (`WorkOrderDetailPage` + create modal) pulls parts/labor lines; the two‑sided reconcile
  (WO parts lines == invoice parts, WO labor lines == invoice labor) is the target Block 4 feeds.

## 2. The gaps Block 4 closes
1. **Per‑brand parts catalog** for the OWNED fleet — Freightliner Cascadia, Kenworth T680, Peterbilt 579,
   International LT, Utility reefer trailers, etc.: part #, description, **VMRS system code**, **fitment**
   (which makes/models/years a part fits), **condition options** (New / Recap / Used / Refurbished).
2. **Services / labor catalog** — standard tasks (PM‑A, PM‑B, brake job, DEF/aftertreatment, tire, DOT
   inspection, …) with **default labor hours**, so Create‑WO labor lines pull a default.
3. **Service‑interval ETA model** — derive next‑due from Samsara live mileage where available + a
   **12,000 mi/mo default** when not; **reefer hours tracked separately** from tractor odometer.

## 3. Proposed schema (additive — Tier‑2, show SQL before any apply)
All tables: UUIDv7 server PK, `operating_company_id` + RLS (`security_invoker` views), `is_active`,
append‑only `audit.row_changes`, void‑not‑delete, GRANTs to `ih35_app` (migration 0065 + DEFAULT
PRIVILEGES). Reuse existing posting/allocation infra — **no new GL math**.

### 3a. Enrich `maintenance.parts` (additive columns)
```
vmrs_system_code   text         -- VMRS 3-digit system (e.g. 013 Brakes, 045 Cab/Sheet Metal)
condition          text         -- enum: New | Recap | Used | Refurbished  (default New)
brand              text         -- OEM/aftermarket brand
-- fitment is many-to-many → its own table (3b), not a column
```

### 3b. `maintenance.part_fitment` (which part fits which make/model/year)
```
id, part_id (FK parts), make text, model text, year_from int, year_to int,
operating_company_id, is_active, created_at
```
A part fits a unit when `unit.make/model/year` falls in a fitment row. Drives the Create‑WO picker
filtering parts to the WO's unit.

### 3c. `maintenance.services` (labor/task catalog)  ← NEW
```
id, service_code text, name text, vmrs_system_code text,
default_labor_hours numeric(6,2), default_labor_rate_cents int NULL,
interval_kind text NULL (miles|hours|days), interval_value int NULL,  -- for PM-type services
operating_company_id, is_active, created_at, …audit
```
Create‑WO labor lines pull `default_labor_hours` (operator can override). PM‑type services seed
`pm_schedules`.

## 4. Per‑brand catalog structure (data — `«Jorge to supply»`)
Researched **by brand for the owned fleet**. Jorge supplies the authoritative rows; this doc only fixes
the SHAPE:

| Brand / Model | Sample part categories (VMRS) | part # | fitment | condition |
|---|---|---|---|---|
| Freightliner Cascadia | brakes (013), engine (045…), aftertreatment/DEF, filters, tires | `«supply»` | yr range `«supply»` | New/Recap/Used/Refurb |
| Kenworth T680 | … | `«supply»` | `«supply»` | … |
| Peterbilt 579 | … | `«supply»` | `«supply»` | … |
| International LT | … | `«supply»` | `«supply»` | … |
| Utility reefer trailer | reefer unit (Carrier/Thermo King), tires, brakes, lift gate | `«supply»` | `«supply»` | … |

**No part numbers are invented here.** Build seeds them from Jorge's data only.

## 5. Services catalog (default labor hours — `«Jorge to supply»` the hours)
| service_code | name | VMRS | default_labor_hours | interval |
|---|---|---|---|---|
| PM-A | PM Service A (lube/oil/filter) | 045 | `«supply»` | every `«supply»` mi |
| PM-B | PM Service B (PM-A + inspections) | 045 | `«supply»` | every `«supply»` mi |
| BRAKE-JOB | Brake job (per axle) | 013 | `«supply»` | condition‑based |
| DEF-AFTERTREAT | DEF / aftertreatment service | 043 | `«supply»` | `«supply»` |
| TIRE | Tire R&R / rotation | 017 | `«supply»` | condition‑based |
| DOT-INSP | Annual DOT inspection | 000 | `«supply»` | every 12 mo |

## 6. Service‑interval ETA model
- **With Samsara mileage** (`vehicle_latest_position.odometer_mi`, #1289): `miles_remaining =
  next_due_odometer − current_odometer`; ETA days = `miles_remaining ÷ (avg daily miles)`.
- **Without** live mileage (Samsara parked / no feed for that unit): default **12,000 mi/mo** → ETA from
  `last_service_odometer + interval − assumed_accrued`. Render an empty‑state "estimated (no live
  mileage)" badge — do NOT wire Samsara now (PARKED, Block 6).
- **Reefer hours** tracked **separately** from tractor odometer (reefer runtime hours; see Trailer
  profile `TrailerReeferSection` — already separates reefer hours). PM for reefer uses `interval_kind =
  hours`.

## 7. How it feeds Create‑WO (two‑sided reconcile)
- **Parts picker:** filter `maintenance.parts` by the WO unit's make/model/year via `part_fitment`;
  add as WO parts lines (qty × unit_cost). Reconcile: Σ WO parts lines must equal the vendor invoice
  parts total (`parts_invoice_links`).
- **Labor picker:** pick `maintenance.services`; default `default_labor_hours` → WO labor lines
  (hours × rate). Reconcile: Σ WO labor lines == invoice labor total.
- Both sides feed the existing WO posting/cost roll‑up — **reuse** `WorkOrderDetailPage` posting preview,
  no new GL math.

## 8. Build order (each its own PR; Tier‑2 writes show SQL, never self‑merge)
1. Migration: enrich `parts` (vmrs/condition/brand) + `part_fitment` + `services` (additive, GRANTs,
   audit, idempotent). **Show SQL → Jorge OK → apply.**
2. Backend: services CRUD routes + parts catalog enrich routes (reuse parts.routes patterns).
3. Frontend: Services catalog page (ParityTable, §7 navy, "+ Create" vocab) + parts catalog per‑brand
   columns; Create‑WO parts/labor pickers read the catalogs.
4. ETA model service (mileage + 12k/mo default; reefer hours separate).
5. Seed from Jorge's authoritative data (no fabrication).

## 9. Locks honored
§7 navy `#1F2A44`; "+ Create" vocab; ARCHIVE‑not‑DELETE; additive‑only; every diesel/roadside expense
FKs a load (G18); **no hazmat fields**; reuse allocation/posting infra; `mdata.units` make/model/year is
the fitment source. Related: maintenance construction package; PM auto‑engine (#37); Samsara odometer
(#1289, parked feed).
