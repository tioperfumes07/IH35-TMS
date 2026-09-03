# Trailer → insurance asset bridge — schema spec (owner GO-23 row 19, 2026-09-02)

**Author:** CC-3 (mechanical/entity-schema — migration is CC-1's lane, `db/migrations/*.sql` is
fail-closed banned for CC-3 by `verify-migration-lane-band.mjs`). This is a spec handoff, not a
migration. Formalizes an existing board finding (`docs/audit/GUARD-WORKORDERS.md`,
`INS-F7416-POLICY-TRAILER-PICKER-CANNOT-RESOLVE-CANONICAL-ASSET`) that was routed to CC-3 but never
built — re-verified live before writing this so the routing is current, not stale.

## Current state (verified live, Neon prod `tiny-field-89581227`, bypass_rls, just now)

- `mdata.equipment` is the canonical trailer table: **299 real rows**, `owner_company_id` +
  `currently_leased_to_company_id` (same ownership-pair pattern as `mdata.units`), plus real
  insurance-relevant fields already on the row itself (`us_insurance_policy_number`,
  `us_insurance_expiration`, `mx_insurance_policy_number`, `mx_insurance_expiration`).
- `mdata.assets` (the insurance module's own asset registry — `unit_code`, `insured_value_cents`,
  `acquisition_cost_cents`) has **112 rows, zero of which are trailers** (`asset_type ILIKE
  '%trailer%'` → 0). 78 of the 112 rows carry no `insured_value_cents` at all.
- Both mounted insurance policy creators (`PolicyCreateModal.tsx`, `PolicyCreateWizard.tsx`) read
  the unified truck+trailer fleet roster and submit every selected id as
  `insurance.policy_unit.asset_id` — but `resolve-asset-id.shared.ts` only accepts `mdata.assets.id`,
  `mdata.assets.unit_id`, or a unit-number bridge. A selected `mdata.equipment.id` (a trailer)
  therefore always reaches `asset_not_found:<equipment-id>` — the UI offers trailer coverage the
  writer can never persist.

## Proposed schema (additive, CREATE/ALTER-only, idempotent)

```sql
ALTER TABLE mdata.assets
  ADD COLUMN IF NOT EXISTS equipment_id uuid NULL
    REFERENCES mdata.equipment(id);

CREATE UNIQUE INDEX IF NOT EXISTS assets_equipment_id_unique
  ON mdata.assets (equipment_id)
  WHERE equipment_id IS NOT NULL;

COMMENT ON COLUMN mdata.assets.equipment_id IS
  'FK to mdata.equipment (trailers) -- the canonical trailer table. Nullable: an asset row for a
   truck (unit_id set instead) never has this. Unique when set: one asset per trailer, never two.';
```

- **Types:** `uuid`, matching `mdata.equipment.id` exactly.
- **Nullability:** nullable — an asset row for a truck already uses `unit_id`; this column is only
  ever set for a trailer-backed asset row.
- **Uniqueness:** one asset per equipment row, enforced by the partial unique index (mirrors
  whatever uniqueness `mdata.assets.unit_id` already carries for trucks — verify that pattern before
  authoring, do not assume).

## Idempotent backfill (safe to re-run)

```sql
INSERT INTO mdata.assets (id, unit_code, asset_type, equipment_id, owning_entity, created_at, updated_at)
SELECT
  gen_random_uuid(),
  e.equipment_number,
  'trailer',
  e.id,
  COALESCE(e.currently_leased_to_company_id, e.owner_company_id),
  now(),
  now()
FROM mdata.equipment e
WHERE e.deactivated_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM mdata.assets a WHERE a.equipment_id = e.id);
```

(Exact column list/types to be confirmed against `mdata.assets`' real INSERT contract at migration
time — `owning_entity`/`asset_type`/`created_by_user_id` NOT NULL-ness not fully re-verified here;
this is the shape, not a copy-paste-ready statement.)

## Application-code changes (CC-3, after the migration lands — not this PR)

- `resolve-asset-id.shared.ts`: accept `mdata.equipment.id` as a third valid input alongside
  `mdata.assets.id` / `mdata.assets.unit_id`, resolving through the new `equipment_id` column.
- Equipment create/edit (wherever a trailer is minted or its data changes) mints/maintains its
  `mdata.assets` row in the same transaction going forward -- the backfill above only closes the
  historical gap; new trailers must never reopen it.
- `PolicyCreateModal.tsx` / `PolicyCreateWizard.tsx`: no change needed once the resolver accepts an
  equipment id — the UI already submits the id it has.

## Linkage declaration (§10 LINKAGE LAW)

- Canonical target: `mdata.equipment` (hub-adjacent, not a RETIRE table) + `mdata.assets`
  (insurance's own registry).
- Read path: `insurance/claim.routes.ts` (already reads `mdata.equipment` directly for claims —
  unaffected), `resolve-asset-id.shared.ts` (gains the new accepted-input case).
- Write path: the backfill (one-time) + whatever service already inserts `mdata.assets` rows for
  trucks (mirror it for the equipment_id case going forward).
- Both-way: `mdata.assets.equipment_id` ⇄ `mdata.equipment.id`. `mdata.assets` remains the
  insurance-domain view; `mdata.equipment` remains the fleet-domain source of truth for the trailer
  itself (VIN, plate, ownership) — this bridge does not duplicate that data, only links to it.

## What CC-3 will NOT do here

- Not authoring the migration file (`db/migrations/*.sql`) — CC-1's lane.
- Not touching `mdata.assets`' existing truck-side (`unit_id`) contract or any live policy row.
- Not building the resolver/UI changes in this PR — those follow once the column exists live.

**Handoff:** routed to CC-1 (migration lane, 00:00–11:59 UTC window) via `docs/bus/INBOX-CC-1.md`.
