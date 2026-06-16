# Block 6 — Demo/Test Purge Plan (SHOW-FIRST, GATED)

**The go-live gate.** Soft-archive (never hard-delete) the demo/test rows still live in prod so
tomorrow's real-data dispatch starts clean. **Mutates real prod rows → mandatory GUARD eyeball +
Jorge OK before anything runs (like 2E #1041). Nothing self-merges.**

## ⚠️ GUARD PRE-CHECK FINDINGS (2026-06-16) — corrections to v1 of this plan
1. **"3 RIVERS LOGISTICS" IS LIKELY REAL — DO NOT ARCHIVE THE CUSTOMER.** It has a real email
   (jeane@3riverslogistics.com), Late-pay/FMCSA tags, and sits among real freight brokers (AMPLIFY,
   Bennet, Bieri, BM2, CarrierHawk…) in a real 1209-customer QBO roster. It was only *suspected* demo
   because it appeared next to `DEMO-L00x` loads. **The DEMO marker is on the LOADS, not the customer.**
   `customer_name ILIKE '3 Rivers%'` is REMOVED from the customer predicate. **OPEN — Jorge's explicit
   call:** real (leave customer, purge only its `DEMO-L00x` loads) vs demo (archive it).
2. **FALSE-ZERO PITFALL:** `mdata/customers?...&limit=500` returns **HTTP 400** (param rejected), so any
   "0 active" from that form is a false zero, NOT real data. **Count at the DB, or via the page's
   working request (`limit=50`).** Re-report real per-table active counts.
3. **CONFIRMED SAFE targets:** 4 active `TEST-TRUCK-1/2/3/4` in `mdata.units`.
4. **Still need from GUARD (real DB counts, working request):** equipment (confirm SAM-* phantom rows
   actually EXIST before archiving any), vendors, loads (`DEMO-L%`), work orders; and the demo-driver
   list (Juan / Maria / Carlos / Ana **"Demo"** seen earlier).

**STATUS: migration NOT to be built until (a) real counts reported and (b) Jorge's 3-Rivers decision.**

## Method (reuse migration 0320's proven pattern)
- **Void-not-delete / reversible:** set the table's soft-delete column, never `DELETE`. Every archived
  id is recorded in a ledger table (mirror `migration.test_seed_archive_ledger_0320`) so the purge is
  fully reversible.
- **Idempotent:** `COALESCE(col, now())`, `IF NOT EXISTS`, re-runnable.
- **Reuse canonical predicates:** the `TEST-`/`seed-`/`@seed.invalid` patterns already enforced by
  `mdata/test-seed-archive.ts` (`TEST_SEED_DISPLAY_PATTERN`, `TEST_SEED_EMAIL_PATTERN`) and CI guards.
- **Match the column the app filters on** (verified below — it differs per table).

## Verified schema (re-read from db/migrations/ — NOT guessed)
| Table | name / id cols | **soft-delete col** | notes |
|---|---|---|---|
| `mdata.customers` | `customer_name`, `customer_code` | **`archived_at`** | app filters `archived_at IS NULL` (EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL) |
| `mdata.units` | `unit_number`, `vin` | **`deactivated_at`** | no `archived_at` |
| `mdata.equipment` | `equipment_number`, `samsara_vehicle_id` | **`deactivated_at`** | no `archived_at`; phantom SAM-* = 2F |
| `mdata.loads` | `load_number` | **`soft_deleted_at`** | links to customer_id |
| `mdata.vendors` | `vendor_name` | **`deactivated_at`** | no `archived_at` |
| `maintenance.work_orders` | `display_id`, `unit_id` | **none** (status only) | needs `archived_at` added, or defer — see §WO |

Scope = **only what 0320 did NOT cover** (0320 already archived `mdata.drivers`, `mdata.qbo_customers`,
`accounting.qbo_customers`, `identity.users` for TEST-/seed- patterns).

## STEP 1 — COUNT-FIRST queries (GUARD runs on prod; report counts BEFORE any archive)
Run each with `SET app.operating_company_id` set (RLS), per operating company.

```sql
-- 1. mdata.customers (PATTERN ONLY — 3 Rivers REMOVED, it's real pending Jorge's call)
SELECT count(*) AS demo_customers FROM mdata.customers
WHERE archived_at IS NULL AND (
     customer_name ILIKE 'TEST-%' OR customer_name ILIKE 'seed-%'
  OR COALESCE(customer_code,'') ILIKE 'TEST-%' OR COALESCE(customer_code,'') ILIKE 'seed-%'
);

-- 1b. demo DRIVERS (named "Demo" — Juan/Maria/Carlos/Ana Demo; reuse 0320's archived_at on drivers)
SELECT count(*) AS demo_drivers FROM mdata.drivers
WHERE archived_at IS NULL AND (first_name ILIKE '%Demo%' OR last_name ILIKE '%Demo%');

-- 2. mdata.units (TEST-TRUCK-3 etc.)
SELECT count(*) AS demo_units FROM mdata.units
WHERE deactivated_at IS NULL AND (unit_number ILIKE 'TEST-%' OR COALESCE(vin,'') ILIKE 'TEST%');

-- 3. mdata.equipment — TEST + phantom SAM-* (truck mis-synced as trailer: 2F)
SELECT count(*) AS demo_equipment FROM mdata.equipment
WHERE deactivated_at IS NULL AND (
     equipment_number ILIKE 'TEST-%'
  OR (samsara_vehicle_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM mdata.units u WHERE u.samsara_vehicle_id = mdata.equipment.samsara_vehicle_id))
);

-- 4. mdata.loads — DEMO-L00x marker is on the LOADS (this is what made 3 Rivers look demo)
SELECT count(*) AS demo_loads FROM mdata.loads
WHERE soft_deleted_at IS NULL AND (
     load_number ILIKE 'DEMO-L%' OR load_number ILIKE 'DEMO-%'
  OR load_number ILIKE 'TEST-%'  OR load_number ILIKE 'seed-%'
);

-- 5. mdata.vendors
SELECT count(*) AS demo_vendors FROM mdata.vendors
WHERE deactivated_at IS NULL AND (vendor_name ILIKE 'TEST-%' OR vendor_name ILIKE 'seed-%');

-- 6. work orders (linked to demo units OR test display_id)
SELECT count(*) AS demo_work_orders FROM maintenance.work_orders
WHERE COALESCE(display_id,'') ILIKE '%TEST%'
   OR unit_id IN (SELECT id FROM mdata.units WHERE unit_number ILIKE 'TEST-%' OR COALESCE(vin,'') ILIKE 'TEST%');
```

## STEP 2 — the archive (runs ONLY after Jorge OK; mirror 0320 ledger)
Each table: insert affected ids into a `migration.block6_demo_purge_ledger` row, then set the soft-delete
column to `COALESCE(col, now())` for the SAME predicate as the count query. Customers → `archived_at`;
units/equipment/vendors → `deactivated_at`; loads → `soft_deleted_at`. No `DELETE`.

## §WO — work_orders has no soft-delete column
Two options for Jorge:
- **(a) Add `archived_at` to `maintenance.work_orders`** (idempotent `ADD COLUMN IF NOT EXISTS`) and set
  it for demo-linked WOs. Complete + reversible.
- **(b) Defer WOs** — demo WOs reference demo units we're archiving; low harm if WO listings join to
  active units. Revisit post-go-live.
Recommend (a) for a clean slate unless Jorge prefers minimal schema change tonight.

## OPEN decisions / confirmations (updated after GUARD pre-check)
- **3 Rivers Logistics — Jorge's call (BLOCKING):** real (leave customer; purge only its `DEMO-L00x`
  loads) **or** demo (archive customer). Default assumption per GUARD: **REAL — do not archive.**
- **Demo drivers:** confirmed pattern is name `%Demo%` (Juan/Maria/Carlos/Ana "Demo"). GUARD reports the
  exact count via working request (`limit=50`) / DB.
- **Equipment SAM-* phantom:** CONFIRM these rows actually exist (real DB count) before the migration
  includes them — do not archive a predicate that matches zero / matches real assets.
- **All counts:** must come from the DB or the `limit=50` working request — NOT `limit=500` (HTTP 400 →
  false zero).

## STEP 3 — post-purge verification (GUARD)
- Full-DB scan: `DEMO*` / `TEST*` / `3 Rivers` / SAM-phantom → **ZERO active (non-archived) rows**.
- Active fleet/driver counts **normalize toward real** (~32 trucks / ~25 drivers per Jorge).
- Spot-check the ledger row count == sum of per-table archived counts (reversibility intact).
