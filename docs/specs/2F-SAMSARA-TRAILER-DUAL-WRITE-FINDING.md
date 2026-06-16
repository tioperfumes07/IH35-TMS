# 2F — Samsara Trailer Dual-Write Finding (POST-GO-LIVE, gated)

**Status:** DEFERRED to post-go-live by Jorge (2026-06-16). Documented so the diagnosis does not
evaporate. NOT a go-live blocker — Jorge sets the real roster manually; phantom trailers are
harmless to dispatching. Fix calmly, *with* Jorge, after go-live. **Crosses the §1.4/§2 migration
gate (data cleanup on `mdata.equipment`) — never self-merge.**

## Symptom (dispatch bug #11)
Samsara "trailers" appear in the Book Load **truck/trailer** pickers as phantom `SAM-####` rows;
real trailers are missing. UI fix #1038 split the picker by `kind`, but the underlying data is wrong.

## Root cause — the master-sync dual-writes every vehicle into BOTH tables
`apps/backend/src/integrations/samsara/samsara-master-sync.service.ts` →
`syncSamsaraVehiclesMaster()` calls `api.listVehicles()` (Samsara `GET /fleet/vehicles`, which
returns **powered vehicles / tractors only**) and then, for **every** vehicle, inserts it into:

1. `mdata.equipment` (`:269-310`) with a **hardcoded `equipment_type = 'DryVan'`**, and
2. `mdata.units` (`:353-382`).

There is **no truck-vs-trailer classification**. Consequences:

- Every Samsara **truck** becomes a phantom `SAM-####` `'DryVan'` row in `mdata.equipment`.
- The unified fleet endpoint `GET /api/v1/mdata/units?include=trailers`
  (`mdata/units.routes.ts:149` → `fetchUnifiedFleetList`) tags **all `mdata.equipment` rows as
  `kind:"trailer"`** — so those phantom trucks surface **in the trailer dropdown**.
- **Real Samsara trailers are never pulled** — trailers are separate Samsara *assets*
  (`GET /fleet/trailers`), which nothing in the codebase calls.

Schema context (already present, no schema add needed for parts 1–2):
- `mdata.equipment` has `samsara_vehicle_id` (migration `0176`), `owner_company_id` (NOT NULL),
  `currently_leased_to_company_id`, RLS enabled, `deactivated_at` (soft-delete; void-not-delete).

## The correct 3-part fix (do post-go-live, with Jorge)

1. **Stop the dual-write** — remove the `mdata.equipment` insert/update from
   `syncSamsaraVehiclesMaster()` so trucks land only in `mdata.units`. *(backend code)*
2. **Pull real trailers** — add `SamsaraClient.listTrailers()` against `GET /fleet/trailers`
   (mirror the existing `fetchSamsaraPage` pager) + a `samsara-trailer-sync.service.ts` that upserts
   trailer assets → `mdata.equipment`, mapping the Samsara trailer type → the `equipment_type`
   CHECK set (`DryVan`/`Reefer`/`Flatbed`/…). **Verify the live `/fleet/trailers` response shape on
   the real token before relying on it (§1.5 — never guess).** Like the HOS pull (#1042), the new
   `new SamsaraClient(` consumer must be allowlisted in
   `scripts/verify-cache-tier-coverage.mjs` (LEGACY_DIRECT_SAMSARA) and
   `scripts/audit-emit-allowlist.json` (telematics projection, audited at the sync-log tick).
3. **Clean up phantom rows** — deactivate (`deactivated_at = now()`, never DELETE) the `SAM-*`
   `mdata.equipment` rows whose `samsara_vehicle_id` **also** exists in `mdata.units.samsara_vehicle_id`
   (i.e. mis-synced trucks). **This is a data migration on `mdata.equipment` → §1.4/§2 financial-
   cluster gate: never self-merge; show Jorge the full SQL + row counts first.** Identity sketch:
   ```sql
   -- COUNT FIRST (show Jorge), then UPDATE in a reviewed migration:
   SELECT count(*) FROM mdata.equipment e
   WHERE e.samsara_vehicle_id IS NOT NULL
     AND e.deactivated_at IS NULL
     AND EXISTS (SELECT 1 FROM mdata.units u WHERE u.samsara_vehicle_id = e.samsara_vehicle_id);
   ```

## Block 6 interaction (demo/junk purge)
The phantom `SAM-*` `mdata.equipment` rows should be **confirmed gone / handled during the Block 6
demo+test purge** — flag them for that sweep. If Block 6 clears them first, part 3's cleanup
migration may be a no-op (still confirm counts before/after).

## Why deferred (not built the night before go-live)
2F requires a **live fleet-sync architecture change + a prod data migration on `mdata.equipment`**
hours before real-data dispatch. That is exactly the risk class we avoid. Deferred per Jorge
2026-06-16; revisit calmly post-go-live.
