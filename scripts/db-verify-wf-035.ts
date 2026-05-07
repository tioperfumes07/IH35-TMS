// @ts-nocheck
import crypto from "node:crypto";
import dotenv from "dotenv";
import Fastify from "fastify";
import pg from "pg";

dotenv.config();
if (!process.env.DATABASE_URL && process.env.DATABASE_DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL;
}
process.env.OAUTH_GOOGLE_CLIENT_ID = process.env.OAUTH_GOOGLE_CLIENT_ID || "verify-client-id";
process.env.OAUTH_GOOGLE_CLIENT_SECRET = process.env.OAUTH_GOOGLE_CLIENT_SECRET || "verify-client-secret";
process.env.OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || "http://localhost/verify-callback";

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const suffix = crypto.randomUUID().slice(0, 8);

const createdUsers: string[] = [];
const createdDrivers: string[] = [];
const createdFines: string[] = [];
const createdLiabilities: string[] = [];
const userById = new Map<string, { uuid: string; email: string | null; role: string }>();

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
let driverId = "";
let fineId = "";
let liabilityId = "";

const app = Fastify();
app.decorateRequest("user", null);
app.decorateRequest("session", null);
app.addHook("preHandler", async (req) => {
  const userId = String(req.headers["x-test-user-id"] ?? "");
  const user = userById.get(userId) ?? null;
  req.user = user;
  req.session = user ? { id: `wf035-session-${user.uuid}` } : null;
});
const { registerSafetyFinesRoutes } = await import("../apps/backend/src/safety/fines.routes.js");
await registerSafetyFinesRoutes(app);

try {
  await client.query("SET ROLE ih35_app");
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const companyRes = await client.query(`SELECT id FROM org.companies ORDER BY created_at LIMIT 1`);
  companyId = String(companyRes.rows[0]?.id ?? "");
  const ownerRes = await client.query(
    `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Owner',$3) RETURNING id`,
    [`verify-wf035-owner-${suffix}@example.com`, `verify-wf035-owner-${suffix}`, companyId]
  );
  ownerId = String(ownerRes.rows[0].id);
  createdUsers.push(ownerId);

  const driverRes = await client.query(
    `
      INSERT INTO mdata.drivers (
        first_name, last_name, phone, status, created_by_user_id, updated_by_user_id
      ) VALUES ($1,$2,$3,'Active',$4,$4)
      RETURNING id
    `,
    [`WF${suffix}`, "Driver", `+1956${Math.floor(1000000 + Math.random() * 9000000)}`, ownerId]
  );
  driverId = String(driverRes.rows[0].id);
  createdDrivers.push(driverId);

  const fineRes = await client.query(
    `
      INSERT INTO safety.fines (
        operating_company_id, subject_type, subject_driver_id, issued_by_authority, violation_description, issued_date,
        amount_cents, created_by_user_id, updated_by_user_id
      ) VALUES ($1,'driver',$2,'DOT',$3,CURRENT_DATE,42000,$4,$4)
      RETURNING id
    `,
    [companyId, driverId, `WF-035 fine ${suffix}`, ownerId]
  );
  fineId = String(fineRes.rows[0].id);
  createdFines.push(fineId);
  await client.query("COMMIT");

  userById.set(ownerId, { uuid: ownerId, email: null, role: "Owner" });

  results.push(
    await pass("call /convert-to-liability endpoint", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/safety/fines/${fineId}/convert-to-liability?operating_company_id=${companyId}`,
        headers: { "x-test-user-id": ownerId },
      });
      if (response.statusCode !== 200) throw new Error(`Expected 200, got ${response.statusCode}: ${response.body}`);
      const payload = response.json();
      liabilityId = String(payload?.liability?.id ?? "");
      if (!liabilityId) throw new Error("Missing liability.id in response");
      createdLiabilities.push(liabilityId);
      console.log("WF-035 sample response:", JSON.stringify(payload));
    })
  );

  results.push(
    await pass("assert liability provenance + fine lock", async () => {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");
      const liabRes = await client.query(
        `SELECT origin, origin_id, current_balance, status FROM driver_finance.driver_liabilities WHERE id = $1`,
        [liabilityId]
      );
      const liab = liabRes.rows[0];
      if (!liab) throw new Error("Liability not found");
      if (String(liab.origin) !== "safety_fine") throw new Error("origin mismatch");
      if (String(liab.origin_id) !== fineId) throw new Error("origin_id mismatch");

      let lockFailed = false;
      try {
        await client.query(`UPDATE safety.fines SET amount_cents = 99999 WHERE id = $1`, [fineId]);
      } catch (error: any) {
        lockFailed = String(error.message).includes("E_FINE_LOCKED_AFTER_CONVERSION");
      }
      if (!lockFailed) throw new Error("Fine lock not enforced after conversion");

      const pendingRes = await client.query(
        `
          SELECT id
          FROM driver_finance.driver_liabilities
          WHERE driver_id = $1
            AND origin = 'safety_fine'
            AND current_balance > 0
        `,
        [driverId]
      );
      if (pendingRes.rows.length < 1) throw new Error("Liability not visible in pending deductions query");

      await client.query(
        `
          UPDATE driver_finance.driver_liabilities
          SET current_balance = 0,
              paid_to_date = original_amount,
              status = 'recovered'
          WHERE id = $1
        `,
        [liabilityId]
      );
      const fineRes = await client.query(`SELECT status FROM safety.fines WHERE id = $1`, [fineId]);
      if (String(fineRes.rows[0]?.status) === "recovered") {
        throw new Error("Fine status should not change when liability recovered");
      }
      await client.query("COMMIT");
    })
  );
} catch (error) {
  console.error(`FAIL: setup/flow failed -> ${String((error as Error).message || error)}`);
  results.push(false);
} finally {
  try {
    await app.close();
  } catch {
    // ignore
  }
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    if (createdFines.length > 0) await client.query(`DELETE FROM safety.fines WHERE id = ANY($1::uuid[])`, [createdFines]);
    if (createdLiabilities.length > 0) await client.query(`DELETE FROM driver_finance.driver_liabilities WHERE id = ANY($1::uuid[])`, [createdLiabilities]);
    if (createdDrivers.length > 0) await client.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [createdDrivers]);
    if (createdUsers.length > 0) await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUsers]);
    await client.query("COMMIT");
    console.log("PASS: cleanup db-verify-wf-035 fixtures");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`FAIL: cleanup -> ${String((error as Error).message || error)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: db-verify-wf-035 complete.");
  process.exit(0);
}
console.error("FAIL: db-verify-wf-035 failed.");
process.exit(1);
