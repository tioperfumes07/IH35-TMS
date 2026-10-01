/**
 * The ONE driver <-> Samsara driver resolver for CC-3's engines.
 *
 * mdata.driver_samsara_accounts is the CANONICAL map (one driver may hold several Samsara accounts;
 * UNIQUE samsara_driver_id; ROUND 181.1, guarded by verify-driver-samsara-map-one-to-many). The legacy
 * mdata.drivers.samsara_driver_id column is read-only history (merged losers keep it for audit) and is
 * never used to resolve a driver. A merged driver resolves to its survivor.
 * Measured 2026-10-01: 95 active USMCA rows, 0 Samsara ids on two drivers.
 */
type Db = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export const SAMSARA_DRIVER_LINKS_SQL = `
  SELECT a.samsara_driver_id::text AS sid, COALESCE(d.merged_into_driver_id, d.id)::text AS driver_id
    FROM mdata.driver_samsara_accounts a
    JOIN mdata.drivers d ON d.id = a.driver_id
   WHERE a.operating_company_id = $1::uuid AND a.is_active
`;

/** Samsara driver id -> local driver id (canonical, merges followed). */
export async function loadDriverIdBySamsaraId(client: Db, operatingCompanyId: string): Promise<Map<string, string>> {
  const res = await client.query(SAMSARA_DRIVER_LINKS_SQL, [operatingCompanyId]);
  return new Map(res.rows.map((r) => [String(r.sid), String(r.driver_id)]));
}

/** Local driver id -> all of its Samsara driver ids (canonical, merges followed). */
export async function loadSamsaraIdsByDriverId(client: Db, operatingCompanyId: string): Promise<Map<string, string[]>> {
  const res = await client.query(SAMSARA_DRIVER_LINKS_SQL, [operatingCompanyId]);
  const out = new Map<string, string[]>();
  for (const r of res.rows) {
    const list = out.get(String(r.driver_id)) ?? [];
    list.push(String(r.sid));
    out.set(String(r.driver_id), list);
  }
  return out;
}
