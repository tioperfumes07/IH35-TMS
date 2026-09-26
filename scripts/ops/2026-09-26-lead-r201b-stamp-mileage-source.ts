// R-201b (Lead, AUTH-050) — stamp mileage_source = 'History' on the 40 USMCA loads whose miles R-201 (AUTH-045) filled
// from their signed AlwaysTrack Driver Settlement PDFs. R-201 left mileage_source NULL, so verify-mileage-g1-g5-live G4
// ("mileage_source NOT NULL wherever miles_practical IS NOT NULL") went red. 'History' is the value every other fed load
// carries (85 of 85, same AlwaysTrack source). Only rows in the R-201 plan AND with mileage_source NULL are touched.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const auth = process.env.OWNER_AUTH_ID;
if (!auth) { console.error("OWNER_AUTH_ID required"); process.exit(1); }
execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
const PLAN: Array<{ load: string; doc: string }> =
  JSON.parse(fs.readFileSync(`${process.env.HOME}/ih35-worktrees/.miles-plan.json`, "utf8"));
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
try {
  let n = 0;
  for (const p of PLAN) {
    const r = await c.query(`UPDATE mdata.loads SET mileage_source = 'History', updated_at = now()
       WHERE operating_company_id=$1 AND load_number=$2 AND voided_at IS NULL AND mileage_source IS NULL AND miles_practical IS NOT NULL
       RETURNING load_number`, [USMCA, p.load]);
    if (r.rowCount !== 1) throw new Error(`${p.load}: ${r.rowCount} rows`);
    await appendCrudAudit(c as never, OWNER, "load.mileage_source_stamped", { load: p.load, doc: p.doc, mileage_source: "History", round: "R-201b" }, "info", "LEAD-R201B");
    n += 1;
  }
  const left = Number((await c.query(`SELECT count(*) n FROM mdata.loads WHERE operating_company_id=$1 AND voided_at IS NULL AND miles_practical IS NOT NULL AND mileage_source IS NULL`, [USMCA])).rows[0].n);
  if (left !== 0) throw new Error(`${left} loads still with miles and no mileage_source`);
  await c.query("COMMIT");
  console.log(JSON.stringify({ result: "COMMITTED", stamped: n, left }));
} catch (err) {
  await c.query("ROLLBACK"); console.log(JSON.stringify({ result: "FAILED — rolled back: " + (err as Error).message })); process.exitCode = 1;
} finally { await c.end(); }
