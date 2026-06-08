import { verifyQboMirror } from "./mirror-integrity.service.js";

type Client = { query: <T=Record<string,unknown>>(sql:string,values?:unknown[])=>Promise<{rows:T[]}> };

export async function runDailyReconciliation(client: Client, operatingCompanyId: string, remoteCounts?: Record<string, number>) {
  const results = await verifyQboMirror(client, operatingCompanyId, remoteCounts);
  for (const row of results) {
    const severity = row.delta_pct > 5 ? "critical" : row.delta_pct > 1 ? "warn" : "info";
    await client.query(
      `INSERT INTO qbo.reconciliation_alerts (operating_company_id, entity_type, local_count, qbo_count, delta_pct, severity)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [operatingCompanyId, row.entity, row.local_count, row.qbo_count, row.delta_pct, severity]
    );
  }
  return { entities_checked: results.length, drifts: results.filter((r) => r.drift_detected).length };
}
