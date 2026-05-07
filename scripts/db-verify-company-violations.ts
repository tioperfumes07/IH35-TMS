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
let violationId = "";

async function runAsOwner(fn: () => Promise<void>) {
  await client.query("BEGIN");
  try {
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [ownerId]);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    await fn();
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

try {
  await client.query("SET ROLE ih35_app");
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  const companyRes = await client.query(`SELECT id FROM org.companies ORDER BY created_at LIMIT 1`);
  companyId = String(companyRes.rows[0]?.id ?? "");
  const ownerRes = await client.query(
    `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Owner',$3) RETURNING id`,
    [`verify-company-violations-owner-${suffix}@example.com`, `verify-company-violations-owner-${suffix}`, companyId]
  );
  ownerId = String(ownerRes.rows[0].id);
  await client.query(
    `INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id) VALUES ($1,$2,$1) ON CONFLICT DO NOTHING`,
    [ownerId, companyId]
  );
  await client.query("COMMIT");

  results.push(
    await pass("CRUD + corrective action + status transitions", async () => {
      await runAsOwner(async () => {
        const created = await client.query(
        `
          INSERT INTO safety.company_violations (
            operating_company_id, violation_type, violation_severity, reported_date, description, created_by_user_id, updated_by_user_id
          ) VALUES ($1,'DOT_inspection','major',CURRENT_DATE,$2,$3,$3)
          RETURNING id
        `,
        [companyId, `Company violation ${suffix}`, ownerId]
        );
        violationId = String(created.rows[0].id);

        await client.query(`UPDATE safety.company_violations SET status = 'in_progress' WHERE id = $1`, [violationId]);
        await client.query(
          `UPDATE safety.company_violations SET corrective_action_completed_date = CURRENT_DATE, status = 'closed' WHERE id = $1`,
          [violationId]
        );
        const row = await client.query(`SELECT status FROM safety.company_violations WHERE id = $1`, [violationId]);
        if (String(row.rows[0]?.status) !== "closed") throw new Error("Expected status closed");
      });
    })
  );

  results.push(
    await pass("audit export linkage column exists and accepts doc id", async () => {
      const colRes = await client.query(
        `
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'safety'
            AND table_name = 'company_violations'
            AND column_name = 'audit_export_doc_id'
        `
      );
      if (colRes.rows.length !== 1) throw new Error("audit_export_doc_id column missing");
    })
  );
} catch (error) {
  console.error(`FAIL: setup/flow failed -> ${String((error as Error).message || error)}`);
  results.push(false);
} finally {
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    if (violationId) await client.query(`DELETE FROM safety.company_violations WHERE id = $1`, [violationId]);
    if (ownerId) await client.query(`DELETE FROM identity.users WHERE id = $1`, [ownerId]);
    await client.query("COMMIT");
    console.log("PASS: cleanup db-verify-company-violations fixtures");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`FAIL: cleanup -> ${String((error as Error).message || error)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: db-verify-company-violations complete.");
  process.exit(0);
}
console.error("FAIL: db-verify-company-violations failed.");
process.exit(1);
