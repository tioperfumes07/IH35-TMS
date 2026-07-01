# Block 10 — Load Cancellations FK → per-entity catalog (mapping + evidence)

**Migration:** `db/migrations/202606300120_load_cancellations_per_entity_fk.sql`
**Status:** BUILD-AND-HOLD (Tier-1, migration on existing FK/tables). Never self-merge / never label.
**Branch:** `chore/coder-10-11-cleanup-hold`

## Problem
`dispatch.load_cancellations.reason_code` FKs to `catalogs.cancellation_reasons` — a **legacy GLOBAL**
catalog (9 rows, **no** `operating_company_id`). Every entity's cancellations resolve against the same
global rows → entity-independence violation (matters at USMCA launch, July 2026). The modern per-entity
home is `catalogs.load_cancellation_reasons` (migration 0035; 12 codes/entity, `operating_company_id`, RLS).

## What the migration does (deterministic, additive, non-breaking, reversible)
1. Adds `billable_to_customer_default` + `requires_owner_approval` to `catalogs.load_cancellation_reasons`
   (additive, `NOT NULL DEFAULT false`) so the per-entity catalog can carry the legacy catalog's per-reason
   behavior.
2. Seeds the 9 legacy codes **verbatim per entity** into `catalogs.load_cancellation_reasons`,
   `is_active=false` (historical anchors only — hidden from active dropdowns → no list bloat, no drift).
3. Adds `dispatch.load_cancellations.reason_code_id uuid` FK → `catalogs.load_cancellation_reasons(id)`
   (+ index). Keeps the legacy `reason_code` text column (history/audit).
4. Backfills `reason_code_id` by **exact same-code + same-entity** join (zero-guess, zero-loss, never
   cross-entity).

## Row-by-row mapping (legacy global → per-entity, verbatim)
Every legacy code is seeded per entity with the **same** `reason_code`, so backfill is a 1:1 exact match —
no lossy semantic collapse of a recorded cancellation reason.

| Legacy `reason_code` (global) | Legacy label | category (assigned) | billable_default | requires_owner_approval |
|---|---|---|---|---|
| CUSTOMER_CANCELLED | Customer Cancelled | customer_initiated | true | false |
| DRIVER_ISSUE | Driver Issue | carrier_initiated | false | true |
| EQUIPMENT_ISSUE | Equipment Issue | carrier_initiated | false | false |
| WEATHER | Weather | force_majeure | false | false |
| NO_PICKUP | No Pickup Available | customer_initiated | false | false |
| RATE_DISPUTE | Rate Dispute | carrier_initiated | false | true |
| CUSTOMER_BANKRUPTCY | Customer Bankruptcy | customer_initiated | false | true |
| TRUCK_BREAKDOWN | Truck Breakdown | carrier_initiated | false | false |
| DRIVER_WALKOFF | Driver Walkoff | carrier_initiated | false | true |

`billable_default` / `requires_owner_approval` are copied verbatim from the legacy global rows
(`catalogs.cancellation_reasons`, migration 0101). `category` is assigned to the existing
`catalogs.cancellation_category_enum` (0035) since the legacy table had no category column.

## Backfill counts
Verified on a fresh CI DB (no companies / no Owner user): seed → **0 rows**, backfill → **0 rows** (clean
no-op). Prod counts to be captured by GUARD on a Neon branch (agent has no prod DB access, §1.5). The
backfill `UPDATE` matches `reason_code` within the **same** `operating_company_id`, so no TRANSP load can
ever receive a TRK/USMCA reason.

## What is DEFERRED (and why — the archive step is NOT in this migration)
The spec's step 3 asks to **archive** the legacy `catalogs.cancellation_reasons` "once nothing references
it." It is **not** yet unreferenced: **5 live backend consumers still read it** —

- `apps/backend/src/dispatch/cancellation.service.ts` — `cancelLoad` (reads `billable_to_customer_default`
  + `requires_owner_approval`, writes `reason_code`), `listCancellations` (label join),
  `listCancellationReasons` (the live cancel dropdown source).
- `apps/backend/src/dispatch/cancel-load.routes.ts` — validates the submitted code against this catalog.
- `apps/backend/src/dispatch/cancellations-report.routes.ts` — label LEFT JOIN.
- `apps/backend/src/dispatch/load-cancellations-analytics.routes.ts` — label LEFT JOIN.
- `apps/backend/src/catalogs/stub-catalog-purge.routes.ts` — references the table name.

Making it "unreferenced" therefore requires **repointing those live, money-/control-adjacent read paths**
(billable default + Owner-approval gating) AND a **product decision**: is the go-forward load-cancel list
the legacy 9 codes or the modern 12? The two catalogs use **different** codes (e.g. `WEATHER` vs
`FORCE_WEATHER`, `RATE_DISPUTE` vs `CARR_RATE_NEGOTIATION_FAILED`) and 3 legacy codes
(`CUSTOMER_BANKRUPTCY`, `TRUCK_BREAKDOWN`, `DRIVER_WALKOFF`) have no clean modern equivalent.

Per this block's own **LANE LOCK** ("Edit ONLY: the new migration + the mapping doc") and CLAUDE.md §1.7
(do not self-authorize scope on live/financial-adjacent paths), the archive + read-path repoint are
deferred to a follow-up. This migration lays the **exact, reversible foundation** (per-entity FK +
same-entity backfill) so that follow-up is a clean flip: point the 5 consumers at
`catalogs.load_cancellation_reasons` (now a superset that carries the same 9 codes + both behavioral
flags), then drop the legacy FK and rename the legacy table to an `_archive` (never DROP).

## Follow-up (proposed, for Jorge/GUARD)
1. Decide go-forward list: legacy-9 (activate the seeded rows) vs modern-12 (map legacy→modern).
2. Repoint the 5 consumers to `catalogs.load_cancellation_reasons` with `(reason_code, operating_company_id)`
   scoping; select `display_name AS reason_label`.
3. `ALTER TABLE dispatch.load_cancellations DROP CONSTRAINT` (legacy `reason_code` FK).
4. Rename `catalogs.cancellation_reasons` → `catalogs.cancellation_reasons_archive` (archive, never drop).

## Acceptance status
- load_cancellations references the per-entity catalog with same-entity backfill: **DONE** (`reason_code_id`).
- history preserved: **DONE** (legacy `reason_code` text + legacy table kept).
- legacy global table archived + unreferenced: **DEFERRED** (needs read-path repoint + product decision).
