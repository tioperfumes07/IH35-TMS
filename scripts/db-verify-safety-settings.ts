// @ts-nocheck
import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const suffix = crypto.randomUUID().slice(0, 8);

async function pass(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL: ${name} -> ${String((error as Error).message || error)}`);
    return false;
  }
}

const results: boolean[] = [];
const client = await pool.connect();
let companyId = "";
let ownerId = "";

try {
  await client.query("SET ROLE ih35_app");
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const ownerRes = await client.query(
    `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Owner') RETURNING id`,
    [`verify-safety-settings-owner-${suffix}@example.com`, `verify-safety-settings-owner-${suffix}`]
  );
  ownerId = String(ownerRes.rows[0].id);
  const companyRes = await client.query(
    `
      INSERT INTO org.companies (code, legal_name, usdot_number, mc_number)
      VALUES ($1,$2,$3,$4)
      RETURNING id
    `,
    [`SS${suffix.slice(0, 4).toUpperCase()}`, `Safety Settings ${suffix}`, `USDOT-${suffix}`, `MC-${suffix}`]
  );
  companyId = String(companyRes.rows[0].id);
  await client.query("COMMIT");

  results.push(
    await pass("auto-backfill trigger creates singleton settings row", async () => {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");
      const rows = await client.query(`SELECT id FROM safety.safety_settings WHERE operating_company_id = $1`, [companyId]);
      if (rows.rows.length !== 1) throw new Error(`Expected 1 safety_settings row, got ${rows.rows.length}`);
      await client.query("COMMIT");
    })
  );

  results.push(
    await pass("singleton unique constraint blocks second settings row", async () => {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");
      let failed = false;
      try {
        await client.query(`INSERT INTO safety.safety_settings (operating_company_id) VALUES ($1)`, [companyId]);
      } catch (error: any) {
        failed = String(error.code) === "23505";
      }
      await client.query("ROLLBACK");
      if (!failed) throw new Error("Expected unique violation for second safety_settings row");
    })
  );
} catch (error) {
  console.error(`FAIL: setup/flow failed -> ${String((error as Error).message || error)}`);
  results.push(false);
} finally {
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    if (companyId) await client.query(`DELETE FROM org.companies WHERE id = $1`, [companyId]);
    if (ownerId) await client.query(`DELETE FROM identity.users WHERE id = $1`, [ownerId]);
    await client.query("COMMIT");
    console.log("PASS: cleanup db-verify-safety-settings fixtures");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`FAIL: cleanup -> ${String((error as Error).message || error)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: db-verify-safety-settings complete.");
  process.exit(0);
}
console.error("FAIL: db-verify-safety-settings failed.");
process.exit(1);
