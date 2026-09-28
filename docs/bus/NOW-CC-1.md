# ROUND 206 — item_id finished, B-LEDGER-1 fixed+documented, exact GRANT/REVOKE for approval — CC-1 — 2026-09-28
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-r205.5-superseded.md`.

## 1. The 205.3 migration box — stands, nothing further from me.

## 2. item_id — 4 more resolved live, 124 honestly remain (was 128 at investigation start; the Lead's
"123 of 214" is an earlier snapshot — live denominator is now 358, the feed keeps growing).

Real evidence found for 4 rows this pass, applied live and committed:
- **"Driver Pay-Desenlonada"** ($25.00) + **"Driver Pay-Enlonada"** ($25.00), both USMCA — these are
  unambiguous, unlike the bundled description below. Mapped to the existing combined catalog item
  **"Driver Pay-Tarp-Enlonada/Desenlonada"** (USMCA `8dea02de-...`), the same combined-item convention
  already used for both tarp directions.
- **"Driver Pay-Layover-Estancia 21y22 DE SEPTIEMBRE"** ($50.00), USMCA — the date suffix is just
  descriptive detail; mapped to **"Driver Pay-Layover-Estancia"** (USMCA `b2f21729-...`).
- **"AlwaysTrack settl 5818: Admin fee"** ($10.00), USMCA, `deduction` — this is the same row I
  already recommended in ROUND 201 ("Driver-Deductions-Miscellaneous", not a catalog gap). I had only
  recommended it then; now actually mapped to that item (USMCA `48208aa4-...`).

All 4: `quantity=1, rate_cents=round(amount*100), unit_of_measure='each'` (the ROUND 198 pattern for
flat-dollar lines), constraint verified (`round(quantity*rate_cents) = round(amount*100)`) before
commit. No migration needed — data-only, same as ROUND 198's resolutions.

**124 honestly remain, unchanged reasoning from ROUND 198, re-verified live just now:**
- **68 (34 `earnings` + 34 `deadhead_pay`) — still accessorial-only expected state.** Re-checked the
  invariant live: 0 of these 68 have `quantity` set. Not a new gap; the check constraint's
  all-four-or-none design means these were never meant to carry an item.
- **56 `extra_pay`, still genuinely ambiguous — not resolved, and I looked for new evidence before
  reporting that.** Each is `"AlwaysTrack tarp/other/extra-stop load NNNNN settl NNNN"` — a real,
  distinct load/settlement per row (not one literal bundled description as ROUND 198's count implied;
  56 distinct descriptions, one ambiguous CONCEPT). Confirmed there is no raw itemized AlwaysTrack
  payload table anywhere in this schema to disambiguate which of the 3 real items (Tarp-Enlonada/
  Desenlonada, Extra Pick Up, Extra Delivery/Drop) applies to any given row — searched
  `information_schema.tables` for anything raw/settlement/alwaystrack-shaped, found none. Naming a
  specific item for any of these 56 without that evidence would be inventing a business fact, which
  is exactly what the owner's 2026-09-10 ruling forbids. Standing by if a raw payload source exists
  outside this database that I don't have access to.

## 3. B-LEDGER-1 — investigated, root-caused, fixed. Applied and tracked live.

**What happened, precisely:** `fuel.fuel_transactions.gross_cost/discount_amount/fee_amount` were
applied directly to prod on 2026-09-28 at 05:17:33Z and 05:27:05Z, under migration numbers
`202614420000` and `202614430000` — **with no .sql file ever committed to this repo for either run**
(different checksums between the two runs, so not a retry of identical content). Those same two
12-digit numbers were **legitimately re-claimed the same day** by two unrelated, real, committed
migrations: `202614420000_mdata_drivers_merged_into_driver_id.sql` (applied 06:03:54Z) and
`202614430000_worm_check_engine_banking_tables.sql` (applied 07:51:48Z) — confirmed both of those
applied correctly with their own tracker rows; **nothing was skipped or overwritten**, this is a pure
numbering collision, not a lost migration.

**Data integrity checked, not assumed — no evidence of double-application:** of 2,081 `fuel_transactions`
rows, 1,631 carry a non-null `gross_cost`, and every one of them satisfies `gross_cost = total_cost`
exactly (avg diff `0.00000000000000000000`, zero rows at 2x `total_cost`). No audit trigger exists on
this table (a separate, already-tracked gap) and Neon's query-log telemetry is not enabled for this
region, so the original SQL text could not be recovered — but the live data itself is sane.

**Fixed, not just reported:**
1. `db/migrations/202614550000_fuel_transactions_genesis_anchor_gross_cost_discount_fee_documented.sql`
   — idempotent (`ADD COLUMN IF NOT EXISTS`, backfill `WHERE gross_cost IS NULL`), gives the repo the
   durable record it never had. Applied live and tracked in both `_system._schema_migrations` and
   `ih35_migrations.applied_migrations` (a genuine no-op against current state, confirmed).
2. `scripts/verify-fuel-transactions-genesis-anchor-documented.mjs` (verify-step 11727) — asserts the
   3 columns exist and the baseline relationship holds; live `PASS`.

## 4. RLS/CI bypass — exact GRANT/REVOKE for approval. NOT executed. Bigger than my ROUND 205.5 scope.

Measured live before drafting anything: `ih35_ci_readonly` is not just `BYPASSRLS` — it is also a
**member of `neon_superuser`** (not only `ih35_app`), and separately carries its own `CREATEDB` and
`CREATEROLE` attributes. It has **zero direct grants of its own** on any existing table
(`information_schema.role_table_grants` = 0 rows for it) — every bit of its current read access is
**entirely inherited** from those two memberships (`ih35_app` alone holds direct `SELECT` on 752 of
794 base tables). **A bare REVOKE of those memberships would drop it to zero read access on
everything and break every live guard immediately** — so the safe order is grant-first, then revoke,
then strip the attributes, then verify nothing broke:

```sql
-- Step 1: give ih35_ci_readonly its own direct, real, read-only grants BEFORE removing the
-- memberships it currently (and only) reads through. One GRANT per schema ih35_app already reads
-- everything in (71 schemas, enumerated live via role_table_grants, not guessed):
GRANT USAGE ON SCHEMA _system, accounting, admin, alerts, analytics, audit, bank, banking,
  brokerupdate, catalogs, chat, compliance, customer, dispatch, docs, documents, driver_finance,
  driver_pwa, driveralert, drivers, email, events, expense_attribution, factor, factoring, finance,
  fixed_assets_archived, forecast, fuel, geo, geofence, governance, hos, identity, ifta,
  ih35_migrations, insurance, integrations, integrity, legal, lib, maint, maintenance, master_data,
  mdata, notifications, onboarding, ops, org, outbox, owner, payroll, payroll_integration, public,
  pwa, qbo, qbo_archive, qbo_sync, reconciler, reference, reporting, reports, safety, safetydoc,
  samsara, search, settlement, settlements, shipper_portal, tasks, telematics, usmca_ops,
  utilization, views
  TO ih35_ci_readonly;
-- then, per schema in that same list:
GRANT SELECT ON ALL TABLES IN SCHEMA <schema> TO ih35_ci_readonly;
-- (the ALTER DEFAULT PRIVILEGES entries for ih35_ci_readonly already exist for every one of these
-- schemas, confirmed live in pg_default_acl -- this step only needs to catch EXISTING tables up to
-- what future tables already get automatically.)

-- Step 2: remove the two inherited-privilege escalations.
REVOKE neon_superuser FROM ih35_ci_readonly;
REVOKE ih35_app FROM ih35_ci_readonly;

-- Step 3: strip the role's own excess attributes -- a dedicated read-only guard/gate role has no
-- legitimate need for any of these.
ALTER ROLE ih35_ci_readonly NOBYPASSRLS NOCREATEDB NOCREATEROLE;
```

**Verification plan before calling this done (still no data touched, read-only checks):** re-run the
11-guard list from ROUND 205.5 as `ih35_ci_readonly` and confirm each still connects/reads correctly
(Step 1 didn't break anything); confirm `pg_roles.rolbypassrls/rolcreatedb/rolcreaterole` are all now
`false`; re-confirm a real cross-tenant read now correctly returns 0 rows (the guard's second
assertion — the "should not see" branch) instead of passing vacuously.

**Waiting on your go-ahead for these exact statements before running any of them**, per the
instruction. Also note: this is bigger than what I scoped in ROUND 205.5 (bypassrls alone) — the
`neon_superuser` membership and `CREATEDB`/`CREATEROLE` attributes are the same class of excess
privilege and belong in the same fix, not a follow-up.

## Status
Items 1-3 done. Item 4 is a precise, ready-to-run proposal awaiting approval — nothing executed.
