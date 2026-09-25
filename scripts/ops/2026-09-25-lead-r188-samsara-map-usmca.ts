// R-188 (Lead, 09-25) — mdata.driver_samsara_accounts (Devin-B R-181.1 step 0) backfilled 56 of its 95 rows onto
// TRANSPORTATION (91e0bf0a…) driver records — a frozen entity — because the same human exists in both companies
// with the same Samsara id and the UNIQUE(samsara_driver_id) let the TRANSP row win. Measured 22:55Z: each of the
// 56 has exactly ONE USMCA twin driver carrying that Samsara id; 0 USMCA drivers are left unmapped by Samsara id.
// Fix: repoint each of the 56 map rows to its USMCA twin (no delete, no TRANSP row remains). Audit per row.
// DRY_RUN=1 rolls back.
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DRY = process.env.DRY_RUN === "1";
if (!DRY) { const a = process.env.OWNER_AUTH_ID; if (!a) { console.error("OWNER_AUTH_ID required"); process.exit(1); } execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), a], { stdio: "inherit" }); }
class Rollback extends Error {}
const st: Record<string, any> = {};
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
let ok = false;
try {
  const rows = (await c.query(`SELECT m.id::text, m.samsara_driver_id sid, m.driver_id::text old,
       (SELECT array_agg(u.id::text) FROM mdata.drivers u WHERE u.operating_company_id=$1 AND u.samsara_driver_id=m.samsara_driver_id) twins
     FROM mdata.driver_samsara_accounts m JOIN mdata.drivers d ON d.id=m.driver_id WHERE d.operating_company_id<>$1`, [USMCA])).rows;
  st.non_usmca_rows = rows.length;
  let n = 0;
  for (const r of rows) {
    if (!r.twins || r.twins.length !== 1) throw new Error(`samsara ${r.sid}: ${r.twins?.length ?? 0} USMCA twins`);
    await c.query(`UPDATE mdata.driver_samsara_accounts SET driver_id=$2::uuid, updated_at=now() WHERE id=$1::uuid`, [r.id, r.twins[0]]);
    await appendCrudAudit(c as never, OWNER, "driver_samsara_account.repointed_to_usmca", { map_id: r.id, samsara_driver_id: r.sid, from_driver: r.old, to_driver: r.twins[0], round: "R-188" }, "info", "LEAD-R188");
    n++;
  }
  st.repointed = n;
  st.after = (await c.query(`SELECT left(d.operating_company_id::text,8) co, count(*)::int n FROM mdata.driver_samsara_accounts m JOIN mdata.drivers d ON d.id=m.driver_id GROUP BY 1`)).rows;
  st.usmca_legacy_unmapped = Number((await c.query(`SELECT count(*) n FROM mdata.drivers u WHERE u.operating_company_id=$1 AND u.samsara_driver_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mdata.driver_samsara_accounts m WHERE m.driver_id=u.id AND m.samsara_driver_id=u.samsara_driver_id)`, [USMCA])).rows[0].n);
  if (st.usmca_legacy_unmapped !== 0) throw new Error(`${st.usmca_legacy_unmapped} USMCA drivers still unmapped`);
  if (DRY) throw new Rollback("dry");
  await c.query("COMMIT"); ok = true; st.result = "COMMITTED";
} catch (err) {
  st.result = err instanceof Rollback ? "DRY_RUN rolled back" : "FAILED — rolled back: " + (err as Error).message;
} finally { if (!ok) await c.query("ROLLBACK").catch(() => {}); await c.end(); }
console.log(JSON.stringify(st));
process.exit(String(st.result).startsWith("FAILED") ? 1 : 0);
