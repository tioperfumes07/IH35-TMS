/**
 * ROUND 181.2 step 5 — Driver Settlements Payable children, one per SURVIVOR (after merges).
 *
 * Parent: 2200 "Driver Settlements Payable" (exists, 0 children today).
 * One child per surviving real driver (after the 4 merges deactivate the 4 losers).
 * Account numbers: NULL (owner law — no auto-numbering without written owner approval).
 * Names: based on the final full driver names.
 *
 * DRY_RUN=1 for dry run. OWNER_AUTH_ID required for --apply.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";
const LABEL = "settlements-payable-children";

const DRY = process.env.DRY_RUN === "1";
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;

if (!DRY && !REQUIRED_AUTH_ID) {
  console.error(`${LABEL}: OWNER_AUTH_ID env var is required for --apply (DRY_RUN=1 for dry run)`);
  process.exit(1);
}
if (!DRY) {
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID!], { stdio: "inherit" });
  } catch {
    console.error(`${LABEL}: AUTH ${REQUIRED_AUTH_ID} rejected — see docs/bus/OWNER-AUTHORIZATIONS.md`);
    process.exit(1);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(`${LABEL}: DATABASE_URL is required`);
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [SYSTEM_ACTOR_USER_ID]);

    // Get parent 2200
    const parentRes = await client.query(
      `SELECT id::text, account_number, account_name FROM catalogs.accounts
       WHERE account_number = '2200' AND operating_company_id = $1::uuid LIMIT 1`,
      [USMCA],
    );
    if (parentRes.rows.length === 0) {
      console.error(`${LABEL}: parent 2200 not found`);
      process.exit(1);
    }
    const parent = parentRes.rows[0];
    console.log(`${LABEL}: ${DRY ? "DRY RUN" : "APPLY"} — parent ${parent.account_number} "${parent.account_name}" (${parent.id})`);

    // Get surviving real drivers (active, not deactivated, not sample data, USMCA only)
    // Exclude the 4 losers (they will be deactivated by the merge)
    const LOSERS = [
      "52037e93-484a-4659-ab60-cf2a78f4c647",
      "5dd518ff-db91-429f-b651-a71b5f0db672",
      "61727a46-af2e-4d33-8236-e2d99b737708",
      "6e908ee1-c626-4aae-83c0-4b1e4e0f683b",
    ];

    const driversRes = await client.query(
      `SELECT id::text, first_name, last_name, status
       FROM mdata.drivers
       WHERE operating_company_id = $1::uuid
         AND is_sample_data IS NOT TRUE
         AND deactivated_at IS NULL
         AND id NOT IN (${LOSERS.map((_, i) => `$${i + 2}::uuid`).join(",")})
       ORDER BY first_name, last_name`,
      [USMCA, ...LOSERS],
    );

    console.log(`  Found ${driversRes.rows.length} surviving real drivers`);
    console.log("");

    // Check existing children
    const existingRes = await client.query(
      `SELECT account_name FROM catalogs.accounts
       WHERE parent_account_id = $1::uuid AND operating_company_id = $2::uuid`,
      [parent.id, USMCA],
    );
    console.log(`  Existing children: ${existingRes.rows.length}`);
    console.log("");

    let created = 0;
    let skipped = 0;
    for (const driver of driversRes.rows) {
      const childName = `${driver.first_name} ${driver.last_name}`.trim();

      // Check if child already exists
      const childExists = existingRes.rows.some((r: any) => r.account_name === childName);
      if (childExists) {
        console.log(`  SKIP — "${childName}" already exists`);
        skipped++;
        continue;
      }

      if (!DRY) {
        await client.query(
          `INSERT INTO catalogs.accounts
           (operating_company_id, account_number, account_name, account_type, parent_account_id, is_sample_data, created_at, updated_at)
           VALUES ($1::uuid, NULL, $2, 'Liability', $3::uuid, false, now(), now())`,
          [USMCA, childName, parent.id],
        );
      }
      console.log(`  ${DRY ? "[DRY RUN] " : ""}CREATED — "${childName}" (NULL account_number, Liability, parent 2200)`);
      created++;
    }

    console.log("");
    console.log(`  Total: ${created} created, ${skipped} skipped, ${driversRes.rows.length} drivers`);

    if (DRY) {
      console.log("  DRY RUN — rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("  COMMITTED.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAILED — ${(err as Error).message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
