# ORDER 2026-09-04 — CC-3 · SAMSARA GEOFENCE IMPORT (TOP ITEM)

**Status:** BINDING. Owner 2026-09-04: *"Samsara has 100s of previous geofence."*  
**This is CC-3’s #1.** Supersedes the prior “file three telematics defects first” priority for sequencing — those three stay yours and unfinished, but **this import is higher leverage and goes first.**

## Why (owner math — do not argue)

`geo.geofences` = **2 rows in the whole DB** (one yard, one custom — not two per USMCA, two across all three entities).  
No `integrations.samsara_addresses` table. Collector polls only `vehicles` + `drivers`. API is live (today 17:05:04Z, HTTP 200, USMCA drivers 93 / vehicles 100). Pipe is open. Nobody asked for addresses.

Without consignee geofences: no arrival → no delivery event → no POD prompt → no invoice conversion → no factoring packet → no detention clock → no tour close. Importing the hundreds already drawn turns all of that on.

## Step 1 — COUNT (one line)

Add `entity_type = 'addresses'` to `samsara-remote-count-collector.cron.ts`. Run for both live entities. **Report one line: the count.** That sizes the work and confirms “hundreds” against the API.

## Step 2 — IMPORT

**New table** `integrations.samsara_addresses`:
- `samsara_address_id` (natural key)
- `operating_company_id`
- `name`, `formatted_address`, `lat`, `lng`
- `geofence_json` — Samsara’s own shape (circle radius or polygon vertices). **Bring it. Do not redraw it.**
- `tags`, `notes`, `raw_json`, `synced_at`
- Idempotent on `samsara_address_id` — re-run never duplicates

**Project** each into `mdata.locations` + `geo.geofences`:
- `location_kind` = `customer_site` / `vendor_site` / `yard`
- `location_ref_id` back-link
- `source` = Samsara + `samsara_address_id` — **never lose the link**

**Circles → polygons:** `geo.geofences.vertices_json` needs ≥3 vertices (migration 0220). Generate polygon from centre + radius; **store the radius** so it can be regenerated.

## Step 3 — MATCHING (do not be clever)

Match existing `mdata.locations` by **proximity AND name**.  
**NEVER auto-merge on a name guess.** City text ≠ location (LAREDO→LAREDO spans 3.6–1,098.8 mi across 12 loads; LAREDO→YOAKUM resolved to Yoakum County on 10 loads at +116% with no error).  
Report match rate + every collision. Ambiguous → file for owner, not merge.

## Step 4 — IMPORT ALL, INCLUDING JUNK

Hundreds over years: old customers, closed docks, duplicates, test shapes. **Import all.** Stamp Samsara id + sync date. Live loads prove which fire. Deactivate later on evidence — never on a guess. **Nothing is ever deleted.**

## Step 5 — PUSH BACK (contract with Cursor before either builds)

Book Load wizard creates a location → push to Samsara as address + geofence so arrival/departure fire on Samsara too. **Cursor owns wizard call; you own Samsara write.** Agree the bus contract first. Cursor is waiting.

## Guards

- `verify-samsara-address-sync-idempotent`
- `verify-geofence-carries-samsara-source-id`
- `verify-no-geofence-around-unresolved-point` — failed geocode → NULL + reason, never a shape around a guess

## Still yours (after / parallel, not instead)

- DRV-03 DQF checklist
- `driver_samsara_links` migration handed to CC-1
- accident-liabilities VOID with no frontend caller
- Three telematics defects: `vehicle_latest_position` **two rows/unit**; city/state/formatted_location **NULL on every row today**; **T144** silent since **2025-07-09** yet ran settlement **5760** in July 2026

## Report

1. Address count (Step 1) — one line  
2. Imported / matched / ambiguous / projected  
3. Guard SHAs  
4. Push-back contract ACK with Cursor  

**ACK:** `CC-3 | ACK | SAMSARA-GEOFENCE-IMPORT TOP · COUNT THEN IMPORT ALL | GO`
