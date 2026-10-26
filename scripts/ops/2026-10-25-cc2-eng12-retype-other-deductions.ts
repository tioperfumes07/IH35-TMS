/**
 * ENG-12 (443.323 G14) — retype the 2 clearly-misclassified APPLIED deductions.
 *
 * Of the 81 applied 'other' deductions in USMCA, exactly 2 are clearly wrong type:
 *   - f8c4aebd: "Driver Deduction-I-94 Permit" (should be 'toll', posted to wrong 7200 account)
 *   - 73ece3ed: "Driver Fine-For Late Delivery" (should be 'fine', posted to wrong 7200 account)
 *
 * The other 79 applied 'other' deductions were historical backfill admin-fee / misc lines that
 * are correctly 'other'. The 24 pending (unapplied) 'other' rows are all historical backfill
 * (admin fee, miles correction, standard deduction, escrow) — legitimately 'other'.
 *
 * Note: these deductions are already APPLIED to closed settlements. Updating deduction_type here
 * does NOT retroactively repost the GL (those settlements already credited 7200). The update
 * ensures that IF settlements are ever rematerialized, the correct posting account will be used.
 * A full GL fix requires owner re-settlement; that is out of scope for this script.
 *
 * Run:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-25-cc2-eng12-retype-other-deductions.ts
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=ENG-12 npx tsx scripts/ops/2026-10-25-cc2-eng12-retype-other-deductions.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const AUTH_ID = "ENG-12";

// Hardcoded IDs from live pre-flight (2026-10-25, confirmed via Neon)
const REPAIRS: Array<{ id: string; reason: string; correct_type: string }> = [
  {
    id: "f8c4aebd-0f97-4b6a-a852-a36dbb1edc27",
    reason: "Driver Deduction-I-94 Permit - Driver Deduction-I-94 Permit",
    correct_type: "toll",
  },
  {
    id: "73ece3ed-cb0f-411c-9719-2135db58320b",
    reason: "Driver Fine-For Late Delivery - Driver Fine-For Late Delivery",
    correct_type: "fine",
  },
];

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
    await assertIsIntendedProduction(client as never, { label: "eng12-retype-other-deductions" });

    // Pre-flight: verify each target row matches expected reason + is still 'other'
    for (const r of REPAIRS) {
      const row = await client.query<{ id: string; reason: string; deduction_type: string; operating_company_id: string }>(
        `SELECT id::text, reason, deduction_type, operating_company_id::text
           FROM driver_finance.driver_settlement_deductions
          WHERE id = $1::uuid`,
        [r.id]
      );
      if (!row.rows[0]) {
        console.error(`FAIL pre-flight: row ${r.id} not found`);
        await client.query("ROLLBACK");
        process.exit(1);
      }
      const live = row.rows[0];
      if (live.operating_company_id !== USMCA) {
        console.error(`FAIL pre-flight: row ${r.id} belongs to company ${live.operating_company_id}, not USMCA`);
        await client.query("ROLLBACK");
        process.exit(1);
      }
      if (live.deduction_type !== "other") {
        console.log(`SKIP: row ${r.id} deduction_type is already '${live.deduction_type}' (not 'other') -- idempotent`);
        continue;
      }
      if (live.reason !== r.reason) {
        console.error(`FAIL pre-flight: row ${r.id} reason mismatch. Expected:\n  "${r.reason}"\n  Got: "${live.reason}"`);
        await client.query("ROLLBACK");
        process.exit(1);
      }
      console.log(`OK pre-flight: ${r.id} reason matches, deduction_type='other' -> '${r.correct_type}'`);
    }

    if (!APPLY) {
      console.log(`DRY RUN: would retype ${REPAIRS.length} deduction(s). Re-run with OWNER_AUTH_ID=${AUTH_ID} --apply.`);
      console.log("NOTE: these are applied (closed-settlement) rows — retype updates future rematerialization only; GL already posted.");
      await client.query("ROLLBACK");
      return;
    }

    let updated = 0;
    for (const r of REPAIRS) {
      const res = await client.query(
        `UPDATE driver_finance.driver_settlement_deductions
            SET deduction_type = $1, updated_at = now()
          WHERE id = $2::uuid AND deduction_type = 'other' AND operating_company_id = $3::uuid`,
        [r.correct_type, r.id, USMCA]
      );
      if ((res.rowCount ?? 0) > 0) {
        console.log(`UPDATED: ${r.id} -> deduction_type='${r.correct_type}' (${r.reason})`);
        updated++;
      } else {
        console.log(`SKIP: ${r.id} not updated (already retyped or not 'other')`);
      }
    }

    await client.query("COMMIT");
    console.log(`APPLIED: ${updated} of ${REPAIRS.length} deduction(s) retyped.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
