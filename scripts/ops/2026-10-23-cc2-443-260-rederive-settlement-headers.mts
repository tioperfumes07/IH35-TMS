// LEAD 443.260.2 / 443.260.4 (CC-2, AUTH-454) — the settlement headers whose load boundaries contradict their own lines.
// OWNER, verbatim 10-22 8:25 PM CT: "REMEMBER FIND THE ROOTCAUSES AND CREATE PERMANENT SOLUTION AND FIX. ALWAYS FIX ENGINES,
// NEVER DEFER." and 9:55 PM CT: "fix".
// Target (measured on prod 10-23, exactly 5): a live USMCA settlement whose first_load_id = last_load_id while its active
// lines name 2+ loads — the stale header three incremental writers left behind (see settlement-boundaries.service.ts).
// Thin wrapper over THE service the owner-only route also calls (settlement-header-repair.service.ts). Each one is
// re-derived by THE engine, rederiveSettlementBoundariesInClientTx (ids + numbers together, from the
// settlement's own lines, by stop time), one audit row each. METADATA ONLY: no amount, status, line, posting or GL row.
// Refuses unless exactly EXPECT (default 5) settlements match, and unless TB and the posting count are unchanged.
//   default: dry run (ROLLBACK) · --fork-commit (assertNotProduction) · --apply with OWNER_AUTH_ID=AUTH-454
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { repairStaleSettlementHeadersInClientTx } from "../../apps/backend/src/driver-finance/settlement-header-repair.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
const EXPECT = Number(process.env.EXPECT ?? 5);
if (APPLY) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  // verify-owner-authorization: LEAD 443.260.4 — owner 10-22 8:25 PM CT "ALWAYS FIX ENGINES, NEVER DEFER." / 9:55 PM CT "fix".
  if (auth !== "AUTH-454") throw new Error("--apply requires OWNER_AUTH_ID=AUTH-454");
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
if (APPLY) await assertIsIntendedProduction(c as never, { label: "443.260.4 settlement header boundaries" });
else if (FORK) await assertNotProduction(c as never, { label: "443.260.4 settlement header boundaries (fork)" });
await c.query("BEGIN");
try {
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  await c.query("SET LOCAL lock_timeout = '5s'");
  await c.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
  await c.query("SELECT set_config('app.current_user_id', $1, true)", [OWNER_USER]);
  const r = await repairStaleSettlementHeadersInClientTx(c as never, { companyId: USMCA, actorUserId: OWNER_USER, dryRun: !(APPLY || FORK), expect: EXPECT });
  await c.query("COMMIT");
  for (const o of r.rows) console.log(JSON.stringify(o));
  console.log(JSON.stringify({ result: r.dry_run ? "DRY RUN — ROLLED BACK" : "COMMITTED", settlements: r.settlements, tb_before: r.tb_before, tb_after: r.tb_after, stale_headers_left: r.stale_headers_left }, null, 1));
} catch (e) {
  await c.query("ROLLBACK");
  throw new Error(`REFUSED: rolled back — ${(e as Error).message}`);
} finally {
  await c.end();
}
