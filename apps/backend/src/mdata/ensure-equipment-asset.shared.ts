// INSURED-ASSET-RECONCILIATION-2026-08-31 -- the trailer counterpart to ensure-unit-asset.shared.ts's
// ensureUnitAsset. insurance.policy_unit.asset_id and insurance.claim.asset_id resolve ONLY through
// mdata.assets (resolve-asset-id.shared.ts), and until now mdata.assets never got a row for
// mdata.equipment (trailers) -- it only ever received tractor rows via ensureUnitAsset. That is the
// verified, live root cause of "the 20 insured USMCA trailers cannot be attached to any policy":
// mdata.assets held 90 rows, 100% asset_type='tractor', zero trailer rows.
//
// Mirrors ensureUnitAsset exactly: same ON CONFLICT (tenant_id, unit_code) natural key on
// mdata.assets, same "insured_value_cents stays NULL, never 0" rule (0 would assert a
// valued-at-nothing asset into a table insurance reads -- the owner supplies real insured values),
// same idempotent mint-or-relink contract. Going-forward fix only: wired into equipment create so
// every NEW trailer gets its asset counterpart automatically. Backfilling the pre-existing 20
// trailer rows is a separate, sequenced step (docs/bus/CLAUDE-OWNED-INSURED-ASSET-RECONCILIATION-
// 2026-08-31.md) that waits on the duplicate-asset-register dedup CC-2 must grade first.

export type EnsureEquipmentAssetClient = {
  query: (
    sql: string,
    values?: unknown[],
  ) => Promise<{ rows: Array<{ id?: string; equipment_id?: string }> }>;
};

export type EnsureEquipmentAssetInput = {
  tenantId: string;
  equipmentId: string;
  equipmentNumber: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
};

/** Mint or relink the insurance-facing asset counterpart for one canonical trailer/equipment row. */
export async function ensureEquipmentAsset(
  client: EnsureEquipmentAssetClient,
  input: EnsureEquipmentAssetInput,
): Promise<string> {
  const result = await client.query(
    `
      INSERT INTO mdata.assets (tenant_id, unit_code, asset_type, vin, make, model, year, status, equipment_id)
      VALUES ($1::uuid, $2, 'trailer', $3, $4, $5, $6, 'active', $7::uuid)
      ON CONFLICT (tenant_id, unit_code) DO UPDATE SET
        vin = EXCLUDED.vin,
        make = EXCLUDED.make,
        model = EXCLUDED.model,
        year = EXCLUDED.year,
        equipment_id = EXCLUDED.equipment_id,
        updated_at = now()
      WHERE mdata.assets.equipment_id IS NULL OR mdata.assets.equipment_id = EXCLUDED.equipment_id
      RETURNING id::text AS id, equipment_id::text AS equipment_id
    `,
    [
      input.tenantId,
      input.equipmentNumber,
      input.vin,
      input.make,
      input.model,
      input.year,
      input.equipmentId,
    ],
  );
  const asset = result.rows[0];
  if (!asset?.id || asset.equipment_id !== input.equipmentId)
    throw new Error("equipment_asset_identity_conflict");
  return asset.id;
}
