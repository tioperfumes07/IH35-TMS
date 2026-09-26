// R-205 (Lead, AUTH-051) — walk every live USMCA load whose invoice is PAID or FACTORING-FUNDED
// (advanced/collected/released) forward to 'closed' through the app's own LOAD-CLOSE-LIFECYCLE decision
// (syncLoadStatusToBillingInClientTx: forward-only, allowed transitions only, refuses a close without a priced
// driver bill, audits every step). Root cause: the Faro CSV import set factoring_status='advanced' in its own
// transaction and never reached syncLoadsForFactoringAdvance, so funded loads stayed 'invoiced' /
// 'completed_docs_received'. The import is fixed in the same PR; this is the one-shot for the loads already stuck.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { syncLoadStatusToBillingInClientTx } from "../../apps/backend/src/dispatch/load-billing-lifecycle.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const auth = process.env.OWNER_AUTH_ID;
if (!auth) { console.error("OWNER_AUTH_ID required"); process.exit(1); }
execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
try {
  const candidates = (await c.query(
    `SELECT l.id::text, l.load_number, l.status::text
       FROM mdata.loads l
       JOIN LATERAL (SELECT i.status, COALESCE(i.factoring_status,'not_factored') fs FROM accounting.invoices i
                      WHERE i.source_load_id=l.id AND i.operating_company_id=l.operating_company_id AND i.voided_at IS NULL
                      ORDER BY i.created_at DESC LIMIT 1) i ON true
      WHERE l.operating_company_id=$1 AND l.voided_at IS NULL
        AND l.status::text IN ('delivered','delivered_pending_docs','completed_docs_received','invoiced','paid')
        AND (i.status='paid' OR i.fs IN ('advanced','collected','released'))
      ORDER BY l.load_number`, [USMCA])).rows;
  const out: Record<string, string[]> = {};
  for (const l of candidates) {
    const r = await syncLoadStatusToBillingInClientTx(c as never, { operatingCompanyId: USMCA, loadId: l.id, actorUserId: OWNER });
    const k = r.changed ? `${r.from}->${r.to}${r.reason ? " (" + r.reason + ")" : ""}` : `unchanged: ${r.reason}`;
    (out[k] ??= []).push(l.load_number);
  }
  const after = (await c.query(`SELECT status::text s, count(*)::int n FROM mdata.loads WHERE operating_company_id=$1 AND voided_at IS NULL GROUP BY 1 ORDER BY 1`, [USMCA])).rows;
  await c.query("COMMIT");
  console.log(JSON.stringify({ result: "COMMITTED", candidates: candidates.length, outcomes: out, loads_by_status_after: after }, null, 1));
} catch (err) {
  await c.query("ROLLBACK"); console.log(JSON.stringify({ result: "FAILED — rolled back: " + (err as Error).message })); process.exitCode = 1;
} finally { await c.end(); }
