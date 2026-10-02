// Prints the banking KPI engine's output (values + drill row counts) as JSON, for
// scripts/verify-factoring-banking-kpis-tie-to-ledger.mjs. Read-only (BEGIN READ ONLY).
import pg from "pg";
import { computeBankingKpis, getBankingKpiDrill } from "../../apps/backend/src/banking/banking-kpi.service.js";

const [oci, from, to] = process.argv.slice(2);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 60000 });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const kpis = await computeBankingKpis(c as never, oci!, { from: from!, to: to! });
  const out = [];
  for (const k of kpis) out.push({ ...k, drill_count: (await getBankingKpiDrill(c as never, oci!, k.key, { from: from!, to: to! }))!.length });
  await c.query("ROLLBACK");
  process.stdout.write(JSON.stringify(out));
} finally {
  await c.end();
}
