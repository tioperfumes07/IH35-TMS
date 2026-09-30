/**
 * AUTH-167 — A-02 (ROUND 293 NEXT-15-JOBS): close the G5 gap, driver 51 vs company 48.
 *
 * ROOT CAUSE, confirmed live: 3 driver_finance.driver_settlements rows (P-0015, P-0016, P-0017,
 * all created 2026-09-28, all covering loads in the 13609-13619 DEFECT-ITEM-4/LOVES-reclass
 * remediation population from earlier this session) are status='closed' but have NO row in
 * accounting.company_settlement_driver_settlements at all -- the normal close path
 * (closeCompanySettlementAlongsideDriverSettlement, called from driver-pwa/tour-close.service.ts's
 * closeTourForDriver in the SAME transaction as the driver settlement's own close) never ran for
 * these 3 because they were created via an ops-script remediation path, not the normal tour-close
 * flow. Confirmed: for every driver_settlement <-> company_settlement pair that IS linked, the two
 * statuses always agree (0 mismatches either direction) -- the entire 51-vs-48 gap is these 3
 * orphans, nothing else.
 *
 * PER OWNER RULING R-200 (2026-09-25, cited in company-settlement-close.service.ts's own header):
 * company settlements are ONE PER DRIVER SETTLEMENT, numbered by that driver settlement's own
 * number (P-0015 -> company settlement "P-0015", not a merge-by-period). NEVER link an orphan
 * driver settlement into an existing company settlement by shared period dates -- that is exactly
 * the merge behavior the owner rejected. The correct, sanctioned fix is to call
 * closeCompanySettlementAlongsideDriverSettlement for each of the 3, which creates (or reuses, by
 * NUMBER, idempotently) each one's own dedicated company_settlements header, links it via the
 * junction table, and flips it to 'closed' -- exactly the same call the normal tour-close path
 * would have made, just run now instead of at tour-close time.
 *
 * NO NEW MONEY DATA (per that file's own "CANONICAL-CHECK" comment) -- this creates a header row
 * and a junction-table link, never a dollar amount, never a GL posting. Trial balance is not
 * touched by this script.
 *
 * USAGE
 *   DRY_RUN=1 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-auth167-g5-close-3-orphan-company-settlements.ts
 *   OWNER_AUTH_ID=AUTH-167 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-auth167-g5-close-3-orphan-company-settlements.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertNotProduction, assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!DRY_RUN) {
  if (!REQUIRED_AUTH_ID) {
    console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required for a real write; refusing a production financial write without an OPEN authorization on main.");
    process.exit(1);
  }
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
  } catch {
    console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
    process.exit(1);
  }
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";

const ORPHAN_DRIVER_SETTLEMENT_IDS = [
  "2983941f-7396-48da-bdb9-8415243789ce", // P-0015
  "ae0db193-3328-4934-b62b-f89a12a4df1c", // P-0016
  "55306f73-4ec7-47b9-ba7b-3a2a14746256", // P-0017
];

async function main() {
  const { closeCompanySettlementAlongsideDriverSettlement } = await import(
    "../../apps/backend/src/accounting/company-settlement-close.service.js"
  );

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];

  for (const driverSettlementId of ORPHAN_DRIVER_SETTLEMENT_IDS) {
    const plan: Record<string, unknown> = { driverSettlementId };
    if (DRY_RUN) {
      plan.status = "DRY_RUN -- would call closeCompanySettlementAlongsideDriverSettlement";
      console.log(JSON.stringify(plan));
      results.push(plan);
      continue;
    }

    const client = await pool.connect();
  await (process.env.OWNER_AUTH_ID ? assertIsIntendedProduction : assertNotProduction)(client, { label: "scripts/ops/2026-09-30-cc1-auth167-g5-close-3-orphan-company-settlements.ts" });
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

      const result = await closeCompanySettlementAlongsideDriverSettlement(client, {
        operatingCompanyId: USMCA_ID,
        driverSettlementId,
        actorUserId: SYSTEM_ACTOR_USER_ID,
      });

      await client.query("COMMIT");
      plan.status = "DONE";
      plan.result = result;
      console.log(`  -> ${driverSettlementId}: company_settlement=${result.display_id} status=${result.status} already_closed=${result.already_closed}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      plan.status = `FAILED -- ${err instanceof Error ? err.message : String(err)}`;
      console.error(`  -> ${plan.status}`);
    } finally {
      client.release();
    }
    results.push(plan);
  }

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
