// AUTH-105 (Lead ruling, docs/bus/00-LEAD-AUTH-105-STALE-LOAD-STATUS-SYNC.md) — walk EXACTLY 4 named
// USMCA loads (13503, 13504, 13509, 13539) forward through the app's own LOAD-CLOSE-LIFECYCLE
// decision (syncLoadStatusToBillingInClientTx: forward-only, allowed transitions only, refuses a
// close without a priced driver bill, audits every step). Root cause investigated and fixed in the
// SAME PR (see the commit message / GUARD-WORKORDERS.md finding); this is the one-shot for the 4
// loads already stuck before that fix landed, same sanctioned pattern
// scripts/ops/2026-09-26-lead-r205-close-funded-loads.ts already used for the identical defect
// class two days ago.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { syncLoadStatusToBillingInClientTx } from "../../apps/backend/src/dispatch/load-billing-lifecycle.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD_NUMBERS = ["13503", "13504", "13509", "13539"];

const auth = process.env.OWNER_AUTH_ID;
if (!auth) {
  console.error("OWNER_AUTH_ID required (ROUND 133 P0)");
  process.exit(1);
}
execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });

const APPLY = process.argv.includes("--apply");

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
try {
  const before = (
    await c.query(
      `SELECT l.id::text, l.load_number, l.status::text
         FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[])
        ORDER BY l.load_number`,
      [USMCA, LOAD_NUMBERS]
    )
  ).rows;
  if (before.length !== LOAD_NUMBERS.length) {
    throw new Error(`expected ${LOAD_NUMBERS.length} loads, found ${before.length} — refusing (AUTH-105 names exactly these 4)`);
  }

  const outcomes: Record<string, string> = {};
  for (const l of before) {
    const r = await syncLoadStatusToBillingInClientTx(c as never, { operatingCompanyId: USMCA, loadId: l.id, actorUserId: OWNER });
    outcomes[l.load_number] = r.changed ? `${r.from}->${r.to}${r.reason ? " (" + r.reason + ")" : ""}` : `unchanged: ${r.reason}`;
  }

  const after = (
    await c.query(
      `SELECT l.load_number, l.status::text
         FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[])
        ORDER BY l.load_number`,
      [USMCA, LOAD_NUMBERS]
    )
  ).rows;

  if (APPLY) {
    await c.query("COMMIT");
    console.log(JSON.stringify({ result: "COMMITTED", before, outcomes, after }, null, 1));
  } else {
    await c.query("ROLLBACK");
    console.log(JSON.stringify({ result: "DRY-RUN (rolled back)", before, outcomes, after }, null, 1));
  }
} catch (err) {
  await c.query("ROLLBACK");
  console.log(JSON.stringify({ result: "FAILED — rolled back: " + (err as Error).message }));
  process.exitCode = 1;
} finally {
  await c.end();
}
