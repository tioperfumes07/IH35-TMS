export type EnsureUnitAssetClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
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

/** Mint the insurance-facing asset counterpart for one canonical tractor, idempotently. */
export async function ensureUnitAsset(client: EnsureUnitAssetClient, input: EnsureUnitAssetInput): Promise<void> {
  await client.query(
    `
      INSERT INTO mdata.assets (tenant_id, unit_code, asset_type, vin, make, model, year, status, unit_id)
      VALUES ($1::uuid, $2, 'tractor', $3, $4, $5, $6, 'active', $7::uuid)
      ON CONFLICT (tenant_id, unit_code) DO NOTHING
    `,
    [input.tenantId, input.unitCode, input.vin, input.make, input.model, input.year, input.unitId]
  );
}
