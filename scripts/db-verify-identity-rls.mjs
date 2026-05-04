import dotenv from "dotenv";
import pg from "pg";
import crypto from "node:crypto";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL;

if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL in environment.");
  process.exit(1);
}

const dbPool = new Pool({ connectionString });

const createdIds = [];
const suffix = crypto.randomUUID().slice(0, 8);
const ownerEmail = `rls-owner-${suffix}@example.com`;
const driverEmail = `rls-driver-${suffix}@example.com`;
const ownerGoogleId = `rls-owner-${suffix}`;
const driverGoogleId = `rls-driver-${suffix}`;

function isDeniedError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("violates row-level security policy") ||
    msg.includes("new row violates row-level security")
  );
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (err) {
    console.error(`FAIL: ${name} -> ${String(err?.message || err)}`);
    return false;
  }
}

async function createFixtureUsers(client) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const ownerRes = await client.query(
      `
        INSERT INTO identity.users (email, google_user_id, role)
        VALUES ($1, $2, 'Owner')
        RETURNING id
      `,
      [ownerEmail, ownerGoogleId]
    );
    const driverRes = await client.query(
      `
        INSERT INTO identity.users (email, google_user_id, role)
        VALUES ($1, $2, 'Driver')
        RETURNING id
      `,
      [driverEmail, driverGoogleId]
    );
    await client.query("COMMIT");
    const ownerId = String(ownerRes.rows[0].id);
    const driverId = String(driverRes.rows[0].id);
    createdIds.push(ownerId, driverId);
    return { ownerId, driverId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function cleanupFixtureUsers(client) {
  if (createdIds.length === 0) {
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdIds]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function asUser(client, userId, fn) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error(`Invalid UUID for app.current_user_id: ${userId}`);
  }
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

const client = await dbPool.connect();
const testResults = [];

try {
  await client.query("SET ROLE ih35_app");
  const { ownerId, driverId } = await createFixtureUsers(client);

  testResults.push(
    await runTest("Driver can SELECT only own row", async () => {
      const rows = await asUser(client, driverId, async () => {
        const res = await client.query(
          `SELECT id FROM identity.users WHERE id = ANY($1::uuid[]) ORDER BY id`,
          [[driverId, ownerId]]
        );
        return res.rows.map((r) => String(r.id));
      });
      if (rows.length !== 1 || rows[0] !== driverId) {
        throw new Error(`Expected only driver row, got [${rows.join(", ")}]`);
      }
    })
  );

  testResults.push(
    await runTest("Owner can SELECT both rows", async () => {
      const rows = await asUser(client, ownerId, async () => {
        const res = await client.query(
          `SELECT id FROM identity.users WHERE id = ANY($1::uuid[]) ORDER BY id`,
          [[driverId, ownerId]]
        );
        return res.rows.map((r) => String(r.id)).sort();
      });
      const expected = [driverId, ownerId].sort();
      if (rows.length !== 2 || rows[0] !== expected[0] || rows[1] !== expected[1]) {
        throw new Error(`Expected owner to read both rows, got [${rows.join(", ")}]`);
      }
    })
  );

  testResults.push(
    await runTest("Driver INSERT is rejected", async () => {
      await asUser(client, driverId, async () => {
        try {
          await client.query(
            `
              INSERT INTO identity.users (email, google_user_id, role)
              VALUES ($1, $2, 'Driver')
            `,
            [`rls-denied-${suffix}@example.com`, `rls-denied-${suffix}`]
          );
          throw new Error("Driver insert unexpectedly succeeded");
        } catch (err) {
          if (!isDeniedError(err)) {
            throw err;
          }
        }
      });
    })
  );

  testResults.push(
    await runTest("Driver cannot UPDATE owner row", async () => {
      await asUser(client, driverId, async () => {
        try {
          const res = await client.query(
            `
              UPDATE identity.users
              SET role = role
              WHERE id = $1
            `,
            [ownerId]
          );
          if (res.rowCount !== 0) {
            throw new Error(`Expected 0 updated rows, got ${res.rowCount}`);
          }
        } catch (err) {
          if (!isDeniedError(err)) {
            throw err;
          }
        }
      });
    })
  );
} catch (err) {
  console.error(`FAIL: setup/test execution -> ${String(err?.message || err)}`);
  testResults.push(false);
} finally {
  try {
    await client.query("RESET ROLE");
    await cleanupFixtureUsers(client);
    console.log("PASS: cleanup fixture users");
  } catch (err) {
    console.error(`FAIL: cleanup fixture users -> ${String(err?.message || err)}`);
    testResults.push(false);
  }
  client.release();
  await dbPool.end();
}

if (testResults.every(Boolean)) {
  console.log("PASS: identity RLS verification complete.");
  process.exit(0);
}

console.error("FAIL: identity RLS verification failed.");
process.exit(1);
