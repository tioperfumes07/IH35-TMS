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

try {
  await client.query("SET ROLE ih35_app");
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const companyRes = await client.query(`SELECT id FROM org.companies ORDER BY created_at LIMIT 1`);
  companyId = String(companyRes.rows[0]?.id ?? "");
  const ownerRes = await client.query(
    `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Owner',$3) RETURNING id`,
    [`verify-company-violations-owner-${suffix}@example.com`, `verify-company-violations-owner-${suffix}`, companyId]
  );
  ownerId = String(ownerRes.rows[0].id);
  await client.query("COMMIT");

  results.push(
    await pass("CRUD + corrective action + status transitions", async () => {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");
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
      await client.query("COMMIT");
    })
  );

  results.push(
    await pass("audit export linkage column exists and accepts doc id", async () => {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");
      const docRes = await client.query<{ id: string }>(`SELECT gen_random_uuid()::text AS id`);
      const docId = String(docRes.rows[0].id);
      await client.query(`UPDATE safety.company_violations SET audit_export_doc_id = $2 WHERE id = $1`, [violationId, docId]);
      const check = await client.query(`SELECT audit_export_doc_id FROM safety.company_violations WHERE id = $1`, [violationId]);
      if (String(check.rows[0]?.audit_export_doc_id ?? "") !== docId) throw new Error("audit_export_doc_id not saved");
      await client.query("COMMIT");
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
