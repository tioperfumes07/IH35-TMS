# INBOX-CC-1 · GO-20 FORCE · SERIAL MONEY

`git pull --ff-only origin main`

**Law:** `docs/lockdown/GO-20-EIGHT-FEATURES.txt` · `docs/lockdown/GO-20-BUILD-THE-EIGHT-POINTER.md` · `docs/lockdown/GO-19-BUILD-QUEUE.txt` · `docs/bus/PASTE-ALL-SEATS-GO-20-2026-09-02.md`

**Migration lane:** HH 00–11 UTC · one money PR serial · CC-1 builds — Cursor supervises only.

## SCHEMA REMINDER (read before SQL)
- Most tables PK **`id`**. These three PK **`uuid`**: `dispatch.cargo_sensor_readings`, `maintenance.brake_projections`, `maintenance.tire_projections` — FK must say uuid or migration fails apply.
- `mdata.units` has no company column — scope via the row that carries `operating_company_id`.

## VOID
- **`inventory.parts`** · **`maintenance.labor_rates` table** — FORBIDDEN (GO-20 F/G = CC-3 screen).
- POST Book Load · seat prod money · **$7,500** (LOCKED **$7,000**).

## NOW (serial — one money PR at a time)

1. **GO-19 slice 17 — Capitalize threshold** — wire `capitalize-threshold.ts` into `wo-ap-posting.service.ts` (not category default). Guard/tests: **$6,999 → expense account · $7,001 → capitalize account**. **$700_000 LOCKED.**
2. **GO-20 slice C — Accident liabilities** — `safety.accident_liabilities` + wire `insurance.claim.liability_id`. Filing creates liability from cost lines · **POSTS NOTHING**. Owner-only `decide`: chargeback = **pending** deduction (never auto/silent) · split must sum to **net_exposure_cents** · company_absorbs / insurance_only per spec.
3. **GO-20 slice A — Bank drift alerts** — `banking.reconciliation_drift_alerts` on existing `banking.reconciliation_sessions.variance_cents` (+ live balance/stale feed). Detector **never posts JE**.
4. **GO-19 slice 20 — Company settlement 5753** — after liability chain: period grain · many loads · eight sections · guard P&L tie **2415.11** exactly (`8100 − 73.50 − 1897.95 − 100 − 3491.92 − 121.52`).

ACK `CC-1 | ACK | GO-20 FORCE | NOW=17 capitalize→C accident liabilities→A bank drift→20 settlement 5753 · $7000 NEVER 7500 · NEVER POST Book Load | GO`
