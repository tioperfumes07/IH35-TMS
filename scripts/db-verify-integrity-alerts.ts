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
let alertId = "";

try {
  await client.query("SET ROLE ih35_app");
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const companyRes = await client.query(`SELECT id FROM org.companies ORDER BY created_at LIMIT 1`);
  companyId = String(companyRes.rows[0]?.id ?? "");
  const ownerRes = await client.query(
    `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Owner',$3) RETURNING id`,
    [`verify-integrity-alerts-owner-${suffix}@example.com`, `verify-integrity-alerts-owner-${suffix}`, companyId]
  );
  ownerId = String(ownerRes.rows[0].id);
  await client.query("COMMIT");

  results.push(
    await pass("create + acknowledge + resolve", async () => {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");
      const created = await client.query(
        `
          INSERT INTO safety.integrity_alerts (
            operating_company_id, alert_category, severity, subject_type, detection_summary, detection_metric, source_view, created_by_user_id
          ) VALUES ($1,'unit_cost_anomaly','warning','unit',$2,$3::jsonb,'views.maintenance_unit_history',$4)
          RETURNING id
        `,
        [companyId, `Integrity alert ${suffix}`, JSON.stringify({ z: 2.8 }), ownerId]
      );
      alertId = String(created.rows[0].id);

      await client.query(
        `
          UPDATE safety.integrity_alerts
          SET acknowledged_by_user_id = $2,
              acknowledged_at = now(),
              acknowledgment_note = 'verified'
          WHERE id = $1
        `,
        [alertId, ownerId]
      );
      await client.query(
        `
          UPDATE safety.integrity_alerts
          SET resolution_status = 'confirmed_action_taken',
              resolution_action = 'test resolution'
          WHERE id = $1
        `,
        [alertId]
      );
      const check = await client.query(`SELECT resolution_status FROM safety.integrity_alerts WHERE id = $1`, [alertId]);
      if (String(check.rows[0]?.resolution_status) !== "confirmed_action_taken") {
        throw new Error("resolution_status not updated");
      }
      await client.query("COMMIT");
    })
  );

  results.push(
    await pass("append-only enforcement: DELETE must fail under app role", async () => {
      let failed = false;
      await client.query("BEGIN");
      try {
        await client.query(`SET LOCAL app.current_user_id = '${ownerId}'`);
        await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
        await client.query(`DELETE FROM safety.integrity_alerts WHERE id = $1`, [alertId]);
      } catch {
        failed = true;
      } finally {
        await client.query("ROLLBACK");
      }
      if (!failed) throw new Error("DELETE unexpectedly succeeded for integrity alerts");
    })
  );
} catch (error) {
  console.error(`FAIL: setup/flow failed -> ${String((error as Error).message || error)}`);
  results.push(false);
} finally {
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    if (alertId) await client.query(`DELETE FROM safety.integrity_alerts WHERE id = $1`, [alertId]);
    if (ownerId) await client.query(`DELETE FROM identity.users WHERE id = $1`, [ownerId]);
    await client.query("COMMIT");
    console.log("PASS: cleanup db-verify-integrity-alerts fixtures");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`FAIL: cleanup -> ${String((error as Error).message || error)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: db-verify-integrity-alerts complete.");
  process.exit(0);
}
console.error("FAIL: db-verify-integrity-alerts failed.");
process.exit(1);
