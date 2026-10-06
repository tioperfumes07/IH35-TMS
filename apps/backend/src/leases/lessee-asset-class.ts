/** Find-or-create lease asset class — leaf module to break the lease engine cycle. */
type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export async function ensureAssetClass(client: DbClient, opco: string, asset: { unitId?: string | null; equipmentId?: string | null; label: string }, actorUserId: string): Promise<string> {
  const col = asset.unitId ? "unit_id" : "equipment_id";
  const id = asset.unitId ?? asset.equipmentId;
  const found = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.classes WHERE operating_company_id = $1::uuid AND ${col} = $2::uuid AND deactivated_at IS NULL LIMIT 1`,
    [opco, id]
  );
  if (found.rows[0]) return found.rows[0].id;
  const made = await client.query<{ id: string }>(
    `INSERT INTO catalogs.classes (class_name, class_code, operating_company_id, ${col}, notes, created_by_user_id)
     VALUES ($1, $1, $2::uuid, $3::uuid, 'Class = unit (lease bill engine)', $4::uuid)
     ON CONFLICT DO NOTHING
     RETURNING id::text`,
    [asset.label, opco, id, actorUserId]
  );
  if (made.rows[0]) return made.rows[0].id;
  const again = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.classes WHERE operating_company_id = $1::uuid AND ${col} = $2::uuid AND deactivated_at IS NULL LIMIT 1`,
    [opco, id]
  );
  return again.rows[0].id;
}
