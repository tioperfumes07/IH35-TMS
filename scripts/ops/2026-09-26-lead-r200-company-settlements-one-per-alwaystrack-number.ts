// R-200 (Lead, AUTH-053) — company settlements to AlwaysTrack's own numbering: ONE company settlement per driver
// settlement, numbered by that driver settlement's AlwaysTrack number (Company_Settlement_NNNN.pdf = Driver_Settlement_NNNN.pdf,
// verified: every one of the 19 bundled driver settlements has its own Company Settlement PDF in the owner's Downloads).
// Owner 2026-09-25: "always is the source of truth", "deactivate it from creating numbers".
//
// LIVE BEFORE: 37 headers numbered CS-2026-0001..0037 (minted by accounting.next_company_settlement_display_id); 8 of them
// bundle 2-4 driver settlements by shared dates (19 driver settlements).
// CHANGE (headers carry no money: id, number, period, status, close stamps only; no JE references them):
//   - each header takes the number of its FIRST linked driver settlement (+ that settlement's period);
//   - every other linked driver settlement gets its OWN new header (its number, its period, the same status/closed stamps),
//     and its junction row is re-pointed to it.
// READ-BACK: every live linked driver settlement sits under a header whose display_id = COALESCE(source_document_ref,
// display_id) of that driver settlement; no live header numbered 'CS-%'; header count = linked driver-settlement count.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";

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
  const rows = (await c.query(
    `SELECT cs.id::text cs_id, cs.display_id cs_num, cs.status, cs.closed_at, cs.closed_by_user_id::text closed_by,
            j.id::text junction_id, ds.id::text ds_id, COALESCE(ds.source_document_ref, ds.display_id) ds_num,
            ds.period_start::text ps, ds.period_end::text pe
       FROM accounting.company_settlements cs
       JOIN accounting.company_settlement_driver_settlements j ON j.company_settlement_id = cs.id
       JOIN driver_finance.driver_settlements ds ON ds.id = j.driver_settlement_id AND ds.voided_at IS NULL
      WHERE cs.operating_company_id = $1 AND cs.voided_at IS NULL
      ORDER BY cs.display_id, ds_num`, [USMCA])).rows;
  const byCs = new Map<string, typeof rows>();
  for (const r of rows) { if (!byCs.has(r.cs_id)) byCs.set(r.cs_id, []); byCs.get(r.cs_id)!.push(r); }
  let renamed = 0, created = 0;
  const log: string[] = [];
  for (const [csId, list] of byCs) {
    const [first, ...rest] = list;
    if (!first.ds_num) throw new Error(`driver settlement ${first.ds_id} has no number`);
    await c.query(`UPDATE accounting.company_settlements SET display_id=$3, period_start=$4::date, period_end=$5::date, updated_at=now() WHERE id=$1 AND operating_company_id=$2`,
      [csId, USMCA, first.ds_num, first.ps, first.pe]);
    renamed += 1;
    await appendCrudAudit(c as never, OWNER, "company_settlement.renumbered_to_alwaystrack", { company_settlement_id: csId, from: first.cs_num, to: first.ds_num, round: "R-200" }, "info", "LEAD-R200");
    for (const r of rest) {
      if (!r.ds_num) throw new Error(`driver settlement ${r.ds_id} has no number`);
      const ins = await c.query(
        `INSERT INTO accounting.company_settlements (operating_company_id, display_id, period_start, period_end, status, closed_at, closed_by_user_id, created_by_user_id)
         VALUES ($1, $2, $3::date, $4::date, $5, $6, $7::uuid, $8::uuid) RETURNING id::text`,
        [USMCA, r.ds_num, r.ps, r.pe, r.status, r.closed_at, r.closed_by, OWNER]);
      await c.query(`UPDATE accounting.company_settlement_driver_settlements SET company_settlement_id=$2 WHERE id=$1`, [r.junction_id, ins.rows[0].id]);
      created += 1;
      await appendCrudAudit(c as never, OWNER, "company_settlement.split_to_alwaystrack_number", { from_company_settlement_id: csId, from_number: r.cs_num, new_company_settlement_id: ins.rows[0].id, number: r.ds_num, driver_settlement_id: r.ds_id, round: "R-200" }, "info", "LEAD-R200");
      log.push(`${r.cs_num} -> ${r.ds_num}`);
    }
  }
  const check = (await c.query(
    `SELECT count(*)::int linked,
            count(*) FILTER (WHERE cs.display_id = COALESCE(ds.source_document_ref, ds.display_id))::int numbered_right,
            count(DISTINCT cs.id)::int headers,
            (SELECT count(*)::int FROM accounting.company_settlements x WHERE x.operating_company_id=$1 AND x.voided_at IS NULL AND x.display_id LIKE 'CS-%') minted_left
       FROM accounting.company_settlement_driver_settlements j
       JOIN accounting.company_settlements cs ON cs.id = j.company_settlement_id AND cs.voided_at IS NULL
       JOIN driver_finance.driver_settlements ds ON ds.id = j.driver_settlement_id AND ds.voided_at IS NULL
      WHERE cs.operating_company_id = $1`, [USMCA])).rows[0];
  if (check.linked !== check.numbered_right || check.headers !== check.linked || check.minted_left !== 0) throw new Error(`read-back failed ${JSON.stringify(check)}`);
  await c.query("COMMIT");
  console.log(JSON.stringify({ result: "COMMITTED", renamed, created, split: log, check }, null, 1));
} catch (err) {
  await c.query("ROLLBACK"); console.log(JSON.stringify({ result: "FAILED — rolled back: " + (err as Error).message })); process.exitCode = 1;
} finally { await c.end(); }
