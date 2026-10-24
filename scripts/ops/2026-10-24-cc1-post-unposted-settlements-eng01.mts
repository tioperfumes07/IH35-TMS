/**
 * ENG-01 (443.322) — Post the 3 USMCA load-bookended settlements that were closed
 * without GL via settlement-payrun-close.routes.ts (close-trip route, missing
 * postLoadBookendedSettlementGlAfterClose call, now fixed in this PR).
 *
 * Settlements to post (verified prod bypass_rls=lucia 2026-10-24, ROUND 443.322):
 *   P-0113  — Jose Vicente  (loads 13687+13696)
 *   P-0117  — Carlos Pena   (load 13691)
 *   P-0119  — Angel Sosa    (load 13697)
 *
 * All three: status=closed, approval_status=needs_review, posted_at=NULL, 0 JE postings.
 * The CODE fix (close-trip route + DB trigger) ships in this same PR.
 *
 * Usage:
 *   DATABASE_URL=<prod> node --loader ts-node/esm scripts/ops/2026-10-24-cc1-post-unposted-settlements-eng01.mts
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-NNN node --loader ts-node/esm scripts/ops/2026-10-24-cc1-post-unposted-settlements-eng01.mts --apply
 *
 * Note: runs postLoadBookendedSettlementGlAfterClose via the service layer — same path the
 * close-trip route now uses, so no code bypassed.
 */
import { postLoadBookendedSettlementGlAfterClose } from "../../apps/backend/src/driver-finance/settlement-payrun-close.service.js";

const USMCA_CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const COMMIT = process.argv.includes("--apply");

const SETTLEMENTS = [
  { displayId: "P-0113", id: "" as string },
  { displayId: "P-0117", id: "" as string },
  { displayId: "P-0119", id: "" as string },
];

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (COMMIT && !process.env.OWNER_AUTH_ID?.match(/^AUTH-[0-9]+$/)) {
  throw new Error("--apply requires OWNER_AUTH_ID=AUTH-NNN");
}

// Resolve settlement ids from display_ids via a direct DB query
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

try {
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const res = await c.query(
    `SELECT id::text, display_id, status, posted_at
       FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid
        AND display_id = ANY($2::text[])
        AND voided_at IS NULL`,
    [USMCA_CO, SETTLEMENTS.map((s) => s.displayId)]
  );

  for (const row of res.rows) {
    const s = SETTLEMENTS.find((s) => s.displayId === row.display_id);
    if (s) s.id = row.id;
    console.log(
      `  ${row.display_id} id=${row.id} status=${row.status} posted_at=${row.posted_at ?? "NULL"}`
    );
  }

  const missing = SETTLEMENTS.filter((s) => !s.id);
  if (missing.length) {
    throw new Error(`Could not resolve settlement ids for: ${missing.map((s) => s.displayId).join(", ")}`);
  }

  if (!COMMIT) {
    console.log("\nDRY RUN — pass --apply + OWNER_AUTH_ID=AUTH-NNN to commit. No GL posted.");
    process.exit(0);
  }

  console.log("\n--apply mode: posting GL for each settlement...");
  for (const s of SETTLEMENTS) {
    const result = await postLoadBookendedSettlementGlAfterClose({
      operatingCompanyId: USMCA_CO,
      settlementId: s.id,
      actorUserId: OWNER_USER_ID,
    });
    if (result.posted) {
      console.log(`  ✓ ${s.displayId} (${s.id}) posted — JE ${result.journal_entry_id}`);
    } else {
      console.error(`  ✗ ${s.displayId} (${s.id}) FAILED: ${result.error}`);
      process.exitCode = 1;
    }
  }

  console.log("\nComplete. Re-run verify-settlement-close-must-post-gl.mjs to confirm.");
} finally {
  await c.end();
}
