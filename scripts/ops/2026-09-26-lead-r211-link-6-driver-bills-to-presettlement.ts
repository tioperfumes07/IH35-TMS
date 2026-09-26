// R-211 (Lead, AUTH-071) — the 6 ROUND 189 loads' driver bills carry no settled_in_settlement_id although each load's
// settlement lines sit in exactly one open pre-settlement; verify-driver-bill-settlement-link fails for every seat.
// Links each bill to the ONE settlement its own load's live lines are in (refuses 0 or 2+), audited.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOADS = ["13609", "13616", "13617", "13618", "13620", "13621"];
const auth = process.env.OWNER_AUTH_ID;
if (!auth) { console.error("OWNER_AUTH_ID required"); process.exit(1); }
execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
try {
  const out: string[] = [];
  for (const n of LOADS) {
    const s = (await c.query(
      `SELECT DISTINCT sl.settlement_id::text AS id, s.display_id FROM mdata.loads l
         JOIN driver_finance.settlement_lines sl ON sl.load_id=l.id AND sl.voided_at IS NULL
         JOIN driver_finance.driver_settlements s ON s.id=sl.settlement_id AND s.voided_at IS NULL
        WHERE l.operating_company_id=$1 AND l.load_number=$2`, [USMCA, n])).rows;
    if (s.length !== 1) throw new Error(`${n}: lines in ${s.length} settlements`);
    const u = await c.query(`UPDATE driver_finance.driver_bills b SET settled_in_settlement_id=$3::uuid, updated_at=now()
        FROM mdata.loads l WHERE l.id=b.load_id AND l.operating_company_id=$1 AND l.load_number=$2
          AND b.voided_at IS NULL AND b.settled_in_settlement_id IS NULL RETURNING b.bill_number`, [USMCA, n, s[0].id]);
    if (u.rowCount !== 1) throw new Error(`${n}: ${u.rowCount} bills updated`);
    await appendCrudAudit(c as never, OWNER, "driver_bill.linked_to_presettlement", { load: n, settlement: s[0].display_id, round: "R-211" }, "info", "LEAD-R211");
    out.push(`${n} -> ${s[0].display_id}`);
  }
  await c.query("COMMIT");
  console.log(JSON.stringify({ result: "COMMITTED", linked: out }));
} catch (err) {
  await c.query("ROLLBACK"); console.log(JSON.stringify({ result: "FAILED — rolled back: " + (err as Error).message })); process.exitCode = 1;
} finally { await c.end(); }
