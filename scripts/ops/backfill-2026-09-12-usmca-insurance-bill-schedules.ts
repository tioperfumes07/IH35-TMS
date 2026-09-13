#!/usr/bin/env tsx
/**
 * scripts/ops/backfill-2026-09-12-usmca-insurance-bill-schedules.ts — ROUND 20.9 ITEM 1, live proof
 * half. One-time backfill calling the now-fixed, already-existing createPolicyBillSchedule for the
 * 3 real USMCA insurance policies that were created via the CREATE route before this PR's fix
 * (Cimarron auto_liability, Lloyds physical_damage, Lloyds cargo -- $271,280.41/yr combined). Never
 * writes new GL math -- reuses createPolicyBillSchedule -> createBill -> postBillGlIfEnabled
 * verbatim, the exact same pipeline the renew route already uses in production.
 *
 * createPolicyBillSchedule is itself replay-safe (a no-op if the policy already has billed
 * schedule rows), so re-running this script is always safe.
 *
 * `--dry-run` (default): prints what WOULD be billed (calls the real function inside a
 * rolled-back transaction -- same code path, zero persisted writes).
 * `--apply`: runs for real, prints the created bill ids + amounts.
 *
 * Usage:
 *   DATABASE_URL=<neon prod> npx tsx scripts/ops/backfill-2026-09-12-usmca-insurance-bill-schedules.ts --dry-run
 *   DATABASE_URL=<neon prod> npx tsx scripts/ops/backfill-2026-09-12-usmca-insurance-bill-schedules.ts --apply
 */
import pg from "pg";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { createPolicyBillSchedule } from "../../apps/backend/src/insurance/policy-bill-schedule.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const POLICY_IDS = [
  "7041aaaf-dbc3-41bc-8425-9a679f3dbb57", // Cimarron auto_liability $206,372.39
  "e9110b0d-05d7-463e-91c1-3a00ffa632f7", // Lloyds Of London physical_damage $43,590.18
  "7dc0e94b-d631-4eb4-971e-f4330d42b1bc", // Lloyds Of London cargo $21,317.84
];

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = !apply || args.includes("--dry-run");
  if (apply && args.includes("--dry-run")) throw new Error("choose --dry-run or --apply, not both");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");

  for (const policyId of POLICY_IDS) {
    console.log(`\n--- policy ${policyId} (${dryRun ? "DRY RUN" : "APPLY"}) ---`);
    try {
      await withCurrentUser(OWNER_USER_ID, async (client) => {
        await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA_COMPANY_ID]);
        const result = await createPolicyBillSchedule(policyId, OWNER_USER_ID, client as never);
        console.log(`  scheduleIds=${result.scheduleIds.length} billUuids=${result.billUuids.length} skipped=${result.skipped}`);
        // withCurrentUser COMMITs on normal return / ROLLBACKs on any throw — for a dry run,
        // throwing after the (uncommitted, in-transaction) call is what discards it, same
        // "same code path, zero persisted writes" guarantee as the sibling backfill scripts.
        if (dryRun) throw new Error("__DRY_RUN_ROLLBACK__");
      });
    } catch (err) {
      if (dryRun && (err as Error).message === "__DRY_RUN_ROLLBACK__") {
        console.log("  (dry-run: rolled back, nothing persisted)");
        continue;
      }
      console.error(`  FAILED: ${(err as Error).message}`);
      throw err;
    }
  }
  console.log(`\nDone (${dryRun ? "dry-run, nothing persisted" : "applied"}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
