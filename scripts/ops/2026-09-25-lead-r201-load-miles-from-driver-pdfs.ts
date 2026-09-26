// R-201 (Lead, AUTH-045) — fill miles_practical / miles_deadhead on the 40 USMCA loads fed without them, from the signed
// AlwaysTrack Driver Settlement PDF of each load (Loaded Miles + Empty Miles). Convention measured on the 52 loads that
// already carry miles: practical = loaded + empty, deadhead = empty, 48 of 52 exact. Only NULL columns are filled; a load
// that already has a value is never overwritten. No money row is touched (mdata.loads triggers: audit + updated_at only).
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
const PLAN: Array<{ load: string; practical: number; deadhead: number; doc: string }> =
  JSON.parse(fs.readFileSync(`${process.env.HOME}/ih35-worktrees/.miles-plan.json`, "utf8"));
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
const done: string[] = [];
try {
  for (const p of PLAN) {
    const r = await c.query(`UPDATE mdata.loads SET miles_practical = COALESCE(miles_practical, $3), miles_deadhead = COALESCE(miles_deadhead, $4), updated_at = now()
       WHERE operating_company_id=$1 AND load_number=$2 AND voided_at IS NULL AND (miles_practical IS NULL OR miles_deadhead IS NULL) RETURNING miles_practical::text mp, miles_deadhead::text md`, [USMCA, p.load, p.practical, p.deadhead]);
    if (r.rowCount !== 1) throw new Error(`${p.load}: ${r.rowCount} rows`);
    await appendCrudAudit(c as never, OWNER, "load.miles_from_alwaystrack_driver_settlement", { load: p.load, doc: p.doc, miles_practical: p.practical, miles_deadhead: p.deadhead, round: "R-201" }, "info", "LEAD-R201");
    done.push(`${p.load} ${r.rows[0].mp}/${r.rows[0].md} (${p.doc})`);
  }
  const left = Number((await c.query(`SELECT count(*) n FROM mdata.loads WHERE operating_company_id=$1 AND voided_at IS NULL AND soft_deleted_at IS NULL AND (miles_practical IS NULL OR miles_deadhead IS NULL)`, [USMCA])).rows[0].n);
  if (left !== 0) throw new Error(`${left} loads still without miles`);
  await c.query("COMMIT");
  console.log(JSON.stringify({ result: "COMMITTED", filled: done.length, left, sample: done.slice(0, 5) }, null, 1));
} catch (err) {
  await c.query("ROLLBACK"); console.log(JSON.stringify({ result: "FAILED — rolled back: " + (err as Error).message })); process.exitCode = 1;
} finally { await c.end(); }
