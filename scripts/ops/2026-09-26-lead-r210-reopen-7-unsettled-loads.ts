// R-210 (Lead, AUTH-070) — undo my own R-205 over-close. R-205 (AUTH-051, 02:44:10Z) walked 7 Faro-funded loads to
// 'closed' whose driver side is NOT settled (their driver bills sit in OPEN pre-settlements P-0001..P-0007). The close rule
// (ROUND 33.2 §1) requires BOTH chains; the code fix is in the same PR. This returns each of the 7 to the exact status it
// held before R-205 (audit.row_changes: completed_docs_received), only if it is still 'closed' and still unsettled.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOADS = ["13563", "13610", "13612", "13613", "13614", "13615", "13619"];
const auth = process.env.OWNER_AUTH_ID;
if (!auth) { console.error("OWNER_AUTH_ID required"); process.exit(1); }
execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
try {
  const done: string[] = [];
  for (const n of LOADS) {
    const prior = (await c.query(
      `SELECT r.old_data->>'status' AS s FROM audit.row_changes r
        WHERE r.table_name='loads' AND r.op='UPDATE' AND r.new_data->>'load_number'=$1
          AND r.old_data->>'status'='completed_docs_received' AND r.new_data->>'status'='invoiced'
          AND r.changed_at BETWEEN '2026-09-26 02:44:00Z' AND '2026-09-26 02:45:00Z'
        LIMIT 1`, [n])).rows[0]?.s;
    if (prior !== "completed_docs_received") throw new Error(`${n}: no R-205 transition found in audit`);
    const unsettled = (await c.query(
      `SELECT count(*)::int n FROM driver_finance.driver_bills b JOIN mdata.loads l ON l.id=b.load_id
         LEFT JOIN driver_finance.driver_settlements s ON s.id=b.settled_in_settlement_id
        WHERE l.operating_company_id=$1 AND l.load_number=$2 AND b.voided_at IS NULL AND COALESCE(s.status,'') <> 'closed'`, [USMCA, n])).rows[0].n;
    if (unsettled === 0) throw new Error(`${n}: driver side is settled — should stay closed`);
    const u = await c.query(`UPDATE mdata.loads SET status='completed_docs_received'::mdata.load_status_enum, updated_at=now()
        WHERE operating_company_id=$1 AND load_number=$2 AND voided_at IS NULL AND status='closed' RETURNING id::text`, [USMCA, n]);
    if (u.rowCount !== 1) throw new Error(`${n}: not in 'closed'`);
    await appendCrudAudit(c as never, OWNER, "dispatch.load_reopened_r205_overclose",
      { load: n, from: "closed", to: "completed_docs_received", reason: "R-205 closed a funded load whose driver settlement is still open (ROUND 33.2 §1 requires both chains)", round: "R-210" }, "warning", "LEAD-R210");
    done.push(n);
  }
  await c.query("COMMIT");
  console.log(JSON.stringify({ result: "COMMITTED", reopened: done }));
} catch (err) {
  await c.query("ROLLBACK"); console.log(JSON.stringify({ result: "FAILED — rolled back: " + (err as Error).message })); process.exitCode = 1;
} finally { await c.end(); }
