/**
 * ENG-14 (443.323 G9) — fill the 1 settled driver bill with no unit_id.
 *
 * Owner order 2026-10-12 (443.137 #1): "Fill them through the engine from each bill's load ...
 * metadata only, no money moves, no repost". The function backStampSettledDriverBillUnitAndTrailer
 * does exactly this: COALESCE(b.unit_id, l.assigned_unit_id) — fills only if NULL, never overwrites
 * an existing value, does not touch amount/status/settlement.
 *
 * Run:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-25-cc2-eng14-driver-bill-backfill-unit.ts
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=ENG-14 npx tsx scripts/ops/2026-10-25-cc2-eng14-driver-bill-backfill-unit.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";
import { backStampSettledDriverBillUnitAndTrailer } from "../../apps/backend/src/driver-finance/driver-bill-unit-trailer.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const AUTH_ID = "ENG-14";

const APPLY = process.argv.includes("--apply");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");

  if (APPLY) {
    const auth = process.env.OWNER_AUTH_ID;
    if (auth !== AUTH_ID) {
      console.error(`FAIL: --apply requires OWNER_AUTH_ID=${AUTH_ID} (got ${JSON.stringify(auth ?? null)}).`);
      process.exit(1);
    }
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await assertIsIntendedProduction(client as never, { label: "eng14-driver-bill-backfill-unit" });

    // Pre-flight: count settled driver bills with no unit_id
    const before = await client.query<{ count: string }>(
      `SELECT count(*) FROM driver_finance.driver_bills
        WHERE operating_company_id = $1::uuid
          AND voided_at IS NULL
          AND settled_in_settlement_id IS NOT NULL
          AND unit_id IS NULL`,
      [USMCA]
    );
    const missingCount = parseInt(before.rows[0].count, 10);
    console.log(`Pre-flight: ${missingCount} settled driver bill(s) with no unit_id`);

    if (missingCount === 0) {
      console.log("Nothing to do — no settled driver bills missing unit_id.");
      await client.query("ROLLBACK");
      return;
    }

    if (!APPLY) {
      console.log(`DRY RUN: would backfill unit_id on ${missingCount} settled driver bill(s). Re-run with OWNER_AUTH_ID=${AUTH_ID} --apply.`);
      await client.query("ROLLBACK");
      return;
    }

    const filled = await backStampSettledDriverBillUnitAndTrailer(client as never, {
      operatingCompanyId: USMCA,
      actorUserId: OWNER_USER_ID,
      authorization: "443.137-1 / ENG-14",
    });

    await client.query("COMMIT");
    console.log(`APPLIED: filled ${filled.length} row(s):`);
    for (const r of filled) {
      console.log(`  bill ${r.id} load ${r.load_id} unit_id=${r.unit_id} trailer_id=${r.trailer_id} non_owned_trailer_id=${r.non_owned_trailer_id}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
