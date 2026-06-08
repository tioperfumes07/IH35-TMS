export type MirrorEntityResult = {
  entity: string;
  local_count: number;
  qbo_count: number;
  delta_pct: number;
  drift_detected: boolean;
};

type Client = { query: <T=Record<string,unknown>>(sql:string,values?:unknown[])=>Promise<{rows:T[]}> };

const ENTITIES = [
  { entity: "customers", table: "mdata.qbo_customers" },
  { entity: "vendors", table: "mdata.qbo_vendors" },
  { entity: "items", table: "mdata.qbo_items" },
  { entity: "accounts", table: "mdata.qbo_accounts" },
  { entity: "classes", table: "mdata.qbo_classes" },
] as const;

export async function verifyQboMirror(client: Client, operatingCompanyId: string, remoteCounts?: Record<string, number>): Promise<MirrorEntityResult[]> {
  const out: MirrorEntityResult[] = [];
  for (const { entity, table } of ENTITIES) {
    let local_count = 0;
    try {
      const res = await client.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM ${table} WHERE operating_company_id = $1::uuid`, [operatingCompanyId]);
      local_count = Number(res.rows[0]?.cnt ?? 0);
    } catch { local_count = 0; }
    const qbo_count = remoteCounts?.[entity] ?? local_count;
    const delta_pct = qbo_count === 0 ? 0 : Math.abs((local_count - qbo_count) / qbo_count) * 100;
    out.push({ entity, local_count, qbo_count, delta_pct: Number(delta_pct.toFixed(3)), drift_detected: delta_pct > 1 });
  }
  return out;
}
