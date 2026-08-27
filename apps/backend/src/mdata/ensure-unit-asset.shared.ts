export type EnsureUnitAssetClient = {
  query: (
    sql: string,
    values?: unknown[],
  ) => Promise<{ rows: Array<{ id?: string; unit_id?: string }> }>;
};

export type EnsureUnitAssetInput = {
  tenantId: string;
  unitId: string;
  unitCode: string;
  vin: string;
  make: string | null;
  model: string | null;
  year: number | null;
};

/** Mint or relink the insurance-facing asset counterpart for one canonical tractor. */
export async function ensureUnitAsset(
  client: EnsureUnitAssetClient,
  input: EnsureUnitAssetInput,
): Promise<string> {
  const result = await client.query(
    `
      INSERT INTO mdata.assets (tenant_id, unit_code, asset_type, vin, make, model, year, status, unit_id)
      VALUES ($1::uuid, $2, 'tractor', $3, $4, $5, $6, 'active', $7::uuid)
      ON CONFLICT (tenant_id, unit_code) DO UPDATE SET
        vin = EXCLUDED.vin,
        make = EXCLUDED.make,
        model = EXCLUDED.model,
        year = EXCLUDED.year,
        unit_id = EXCLUDED.unit_id,
        updated_at = now()
      WHERE mdata.assets.unit_id IS NULL OR mdata.assets.unit_id = EXCLUDED.unit_id
      RETURNING id::text AS id, unit_id::text AS unit_id
    `,
    [
      input.tenantId,
      input.unitCode,
      input.vin,
      input.make,
      input.model,
      input.year,
      input.unitId,
    ],
  );
  const asset = result.rows[0];
  if (!asset?.id || asset.unit_id !== input.unitId)
    throw new Error("unit_asset_identity_conflict");
  return asset.id;
}
