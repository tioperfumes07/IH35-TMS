// ROUND 443.292-B re-derive — fix period_start / period_end for the 12 open load-bookended
// settlements whose dates are wrong (UTC midnight → shows one day early in Central).
// Uses THE engine: refreshOpenTourPeriodDates (settlements-load-bookended.service.ts).
// Metadata only — no amount, status, posting, or line change. TB 0 before/after.
//   default: dry run (ROLLBACK) · --fork-commit (assertNotProduction) · --apply with OWNER_AUTH_ID=AUTH-460
// verify-owner-authorization: scripts/verify-owner-authorization.mjs AUTH-460
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { refreshOpenTourPeriodDates } from "../../apps/backend/src/driver-finance/settlements-load-bookended.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");

if (APPLY) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  // verify-owner-authorization: OWNER AUTH-460 (443.292-B rederive tour period dates)
  if (auth !== "AUTH-460") throw new Error("--apply requires OWNER_AUTH_ID=AUTH-460");
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
}

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL required"); process.exit(1); }

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
if (APPLY) await assertIsIntendedProduction(c as never, { label: "443.292-B rederive tour period dates" });
else if (FORK) await assertNotProduction(c as never, { label: "443.292-B rederive tour period dates (fork)" });

await c.query("BEGIN");
try {
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  await c.query("SET LOCAL lock_timeout = '5s'");
  await c.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
  await c.query("SELECT set_config('app.current_user_id', $1, true)", [OWNER_USER]);

  // Find all open load-bookended settlements for USMCA
  const openRes = await c.query<{ id: string; display_id: string | null; period_start: string | null; period_end: string | null }>(
    `SELECT id::text, display_id, period_start::text, period_end::text
       FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid
        AND status = 'open'
        AND settlement_model = 'load_bookended'
      ORDER BY created_at ASC`,
    [USMCA]
  );

  console.log(`Found ${openRes.rows.length} open load-bookended settlements`);

  const results = [];
  for (const row of openRes.rows) {
    const r = await refreshOpenTourPeriodDates(c as never, {
      settlementId: row.id,
      operatingCompanyId: USMCA,
      actorUserId: OWNER_USER,
    });
    results.push({
      settlement: row.display_id,
      id: row.id,
      before: { period_start: row.period_start, period_end: row.period_end },
      after: { period_start: r.period_start, period_end: r.period_end },
      changed: r.changed,
    });
  }

  const changed = results.filter((r) => r.changed).length;
  if (!APPLY && !FORK) {
    await c.query("ROLLBACK");
    console.log(JSON.stringify({ result: "DRY RUN — ROLLED BACK", total: openRes.rows.length, changed, rows: results }, null, 2));
  } else {
    await c.query("COMMIT");
    console.log(JSON.stringify({ result: "COMMITTED", total: openRes.rows.length, changed, rows: results }, null, 2));
  }
} catch (e) {
  await c.query("ROLLBACK");
  throw new Error(`REFUSED: rolled back — ${(e as Error).message}`);
} finally {
  await c.end();
}
