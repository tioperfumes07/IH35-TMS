import { logger } from "../../observability/structured-logger.js";

export type MirrorEntityResult = {
  entity: string;
  local_count: number;
  qbo_count: number;
  delta_pct: number;
  drift_detected: boolean;
  // SWL-2: true when the local count query FAILED (as opposed to a genuine 0-row count). A failed
  // count previously fell through to local_count=0, which — against a 0 remote — computed delta_pct=0
  // and reported the entity as "in sync". That is a false all-clear on a money-mirror integrity path.
  count_error?: boolean;
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
    let count_error = false;
    try {
      const res = await client.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM ${table} WHERE operating_company_id = $1::uuid`, [operatingCompanyId]);
      local_count = Number(res.rows[0]?.cnt ?? 0);
    } catch (err) {
      // SWL-2: a failed count must not masquerade as a genuine 0-row mirror (which would read as
      // "in sync" against a 0 remote). Log with context and flag the entity as errored so it
      // surfaces as drift/attention instead of a false all-clear. Per-entity best-effort — one
      // entity's failure must not abort the whole mirror sweep.
      count_error = true;
      logger.error(`qbo-mirror: local count failed for ${entity} — surfacing as drift, not "in sync"`, err, {
        company_id: operatingCompanyId,
        entity,
        table,
        surface: "qbo.verifyQboMirror",
      });
      local_count = 0;
    }
    const qbo_count = remoteCounts?.[entity] ?? local_count;
    const delta_pct = qbo_count === 0 ? 0 : Math.abs((local_count - qbo_count) / qbo_count) * 100;
    // An errored count is never "in sync": force drift_detected so the failure is visible downstream.
    out.push({ entity, local_count, qbo_count, delta_pct: Number(delta_pct.toFixed(3)), drift_detected: count_error || delta_pct > 1, ...(count_error ? { count_error: true } : {}) });
  }
  return out;
}
