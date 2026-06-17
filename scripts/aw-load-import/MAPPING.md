# AW → IH35-TMS load import — field mapping (show-first)

Tier-1 (writes prod load data on commit). **Dry-run by default; `--commit` is Jorge-authorized
only** (§1.3/§1.5/§1.6). The importer mirrors the EXISTING create path — `POST /api/v1/dispatch/loads`
→ `bookLoad(...)` — it never opens a parallel `INSERT INTO mdata.*`.

## Source
`aw-open-loads-2026-06-17.json` — 11 open loads from awtrack.com, rates GUARD-read per load from
Customer Invoices & Charges, captured 2026-06-17 ~04:00 CST. All TRANSP
(`operating_company_id 91e0bf0a-133f-4ce8-a734-2586cfa66d96`).

## Field mapping
| AW field | bookLoad payload | lands in |
|---|---|---|
| Broker/Customer (Chariot, HG, …) | `customer_id` (find-or-create by name, TRANSP) | `mdata.customers.customer_name` |
| WO# | `customer_wo_number` | `mdata.loads.customer_wo_number` |
| Rate (charges) | `charges:[{code:"linehaul", amount_cents}]` | `mdata.loads.rate_total_cents` (derived by bookLoad) |
| Truck (T148…) | `assigned_unit_id` (match `mdata.units` by number, TRANSP-leased) | `mdata.loads.assigned_unit_id` |
| Primary driver | `assigned_primary_driver_id` (match `mdata.drivers` by name) | `mdata.loads.assigned_primary_driver_id` |
| Trailer type (Reefer/Flatbed) | `trailer_type` (`refrigerated_van` / `flatbed`) | `mdata.loads.trailer_type` |
| Pickup city/ST + location | stop `sequence_number:1, stop_type:"pickup"` | `mdata.load_stops` |
| Delivery city/ST + location | stop `sequence_number:2, stop_type:"delivery"` | `mdata.load_stops` |
| Start (appt) | pickup `appointment_start_at` | `mdata.load_stops.appointment_start_at` (= scheduled pickup) |
| End (appt) | delivery `appointment_start_at` | `mdata.load_stops.appointment_start_at` (= **scheduled delivery**; BLOCK 1 `predicted_delivery_date` backfills = scheduled) |
| Status (Dispatched/Pending) | `status` (`dispatched` / `draft`) + `save_mode:"book_dispatch"` | `mdata.loads.status` |

Resolution of `customer_id` / `assigned_unit_id` / `assigned_primary_driver_id` happens at COMMIT
against live TRANSP data (find-or-create customer; match driver/unit). A dry run cannot read prod
(§1.5), so it reports those as `[resolve@commit]` and counts distinct names instead.

## Honored gaps (do NOT paper over)
- **13378** (Armstrong Transport GR): AW rate = `$0.00` → imported as `0`, flag `no_rate_in_aw`. No invented number.
- **77225** (JZ Logistics, Pending): blank AW load # → **held out of commit** (keyed on WO 77225). Pass `--include-pending` only after the AW load id is confirmed.

## Reconciliation — RESOLVED (2026-06-17)
Rated total = **$44,998.00** across the 10 rated loads (2500+2500+3798+4000+4900+4900+6300+3800+
6000+6300). The earlier **$42,998.00** was a summary addition error in the source message, **not**
bad load data — per-load figures stand as extracted. The dry-run now confirms (✓), no flag.

## Counts (dry-run, from dataset — new-vs-existing resolved @commit)
11 loads (10 importing, 1 held) · 9 distinct customers · 12 distinct drivers (1 team) · 11 trucks
· 11 trailers · 20 stops (10×2) · 10 rated ($44,998.00) · 1 zero-rate (13378).

## Gate
Present mapping + dry-run → Jorge reviews → GUARD verifies dry-run output matches AW source →
**only then** Jorge authorizes `--commit` (sets `IMPORT_BASE_URL` + `IMPORT_SESSION_TOKEN`). After
commit, verify the 11 (10) land with correct rates/customers/dates/per-entity scope.
