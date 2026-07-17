/**
 * Insurance policy_unit / claim store mdata.assets.id, but fleet + insurance wizards pick
 * mdata.units.id. Bridge unit-or-asset id → canonical mdata.assets.id (same resolution as
 * GET /api/v1/assets/:id/coverage).
 */
export type InsuranceAssetQueryable = {
  query: <R = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ) => Promise<{ rows: R[]; rowCount?: number }>;
};

export const RESOLVE_MDATA_ASSET_ID_SQL = `
  SELECT a.id::text
  FROM mdata.assets a
  WHERE a.tenant_id = $1::uuid
    AND (
      a.id = $2::uuid
      OR a.unit_id = $2::uuid
      OR a.unit_code IN (SELECT u.unit_number FROM mdata.units u WHERE u.id = $2::uuid AND (u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid))
    )
  LIMIT 1
`;

export async function resolveMdataAssetId(
  client: InsuranceAssetQueryable,
  operatingCompanyId: string,
  unitOrAssetId: string,
): Promise<string | null> {
  const res = await client.query<{ id: string }>(RESOLVE_MDATA_ASSET_ID_SQL, [
    operatingCompanyId,
    unitOrAssetId,
  ]);
  return res.rows[0]?.id ?? null;
}
