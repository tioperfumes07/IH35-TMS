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

const pool = new Pool({ connectionString });
const createdUserIds = [];
let createdRequestId = null;
const suffix = crypto.randomUUID().slice(0, 8);

function roleOrThrow(role) {
  const allowed = new Set([
    "Owner",
    "Administrator",
    "Manager",
    "Accountant",
    "Dispatcher",
    "Safety",
    "Driver",
    "Mechanic",
  ]);
  if (!allowed.has(role)) {
    throw new Error(`invalid role ${role}`);
  }
  return role;
}

function asId(value) {
  return String(value);
}

async function runAsUser(client, userId, fn) {
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

async function runWithBypass(client, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function pass(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (err) {
    console.error(`FAIL: ${name} -> ${String(err?.message || err)}`);
    return false;
  }
}

const client = await pool.connect();
const results = [];

let ownerId;
let driverId;

try {
  await client.query("SET ROLE ih35_app");

  await runWithBypass(client, async () => {
    const ownerRes = await client.query(
      `
        INSERT INTO identity.users (email, google_user_id, role)
        VALUES ($1, $2, 'Owner')
        RETURNING id
      `,
      [`wf-owner-${suffix}@example.com`, `wf-owner-${suffix}`]
    );
    const driverRes = await client.query(
      `
        INSERT INTO identity.users (email, google_user_id, role)
        VALUES ($1, $2, 'Driver')
        RETURNING id
      `,
      [`wf-driver-${suffix}@example.com`, `wf-driver-${suffix}`]
    );
    ownerId = asId(ownerRes.rows[0].id);
    driverId = asId(driverRes.rows[0].id);
    createdUserIds.push(ownerId, driverId);
  });

  results.push(
    await pass("Driver creates role-change workflow request", async () => {
      createdRequestId = await runAsUser(client, driverId, async () => {
        const insertRes = await client.query(
          `
            INSERT INTO identity.workflow_requests (
              action_code, status, requested_by, target_user, payload
            )
            VALUES ('WF-064-IDENT-002', 'Pending', $1, $1, $2::jsonb)
            RETURNING id
          `,
          [driverId, JSON.stringify({ to_role: roleOrThrow("Dispatcher") })]
        );
        const requestId = asId(insertRes.rows[0].id);
        await client.query(
          `SELECT audit.append_event($1,$2,$3::jsonb,$4::uuid,$5)`,
          [
            "workflow.requested",
            "info",
            JSON.stringify({
              workflow_id: requestId,
              action_code: "WF-064-IDENT-002",
              target_user: driverId,
              requested_by: driverId,
            }),
            driverId,
            "BT-1-IDENT-03",
          ]
        );
        return requestId;
      });
    })
  );

  results.push(
    await pass("Driver can select own workflow request", async () => {
      await runAsUser(client, driverId, async () => {
        const res = await client.query(
          `SELECT id FROM identity.workflow_requests WHERE id = $1`,
          [createdRequestId]
        );
        if (res.rowCount !== 1) {
          throw new Error("driver cannot read own workflow request");
        }
      });
    })
  );

  results.push(
    await pass("Driver cannot approve own workflow request", async () => {
      await runAsUser(client, driverId, async () => {
        try {
          const res = await client.query(
            `
              UPDATE identity.workflow_requests
              SET status = 'Approved'
              WHERE id = $1
            `,
            [createdRequestId]
          );
          if (res.rowCount !== 0) {
            throw new Error("driver approval unexpectedly succeeded");
          }
        } catch (err) {
          const msg = String(err?.message || "").toLowerCase();
          if (!msg.includes("row-level security") && !msg.includes("permission denied")) {
            throw err;
          }
        }
      });
    })
  );

  results.push(
    await pass("Owner sees pending workflow request", async () => {
      await runAsUser(client, ownerId, async () => {
        const res = await client.query(
          `
            SELECT id
            FROM identity.workflow_requests
            WHERE status = 'Pending' AND id = $1
          `,
          [createdRequestId]
        );
        if (res.rowCount !== 1) {
          throw new Error("owner did not see pending request");
        }
      });
    })
  );

  results.push(
    await pass("Owner approves request and role updates", async () => {
      await runAsUser(client, ownerId, async () => {
        const reqRes = await client.query(
          `
            SELECT payload
            FROM identity.workflow_requests
            WHERE id = $1
            FOR UPDATE
          `,
          [createdRequestId]
        );
        if (reqRes.rowCount !== 1) {
          throw new Error("request not found for approval");
        }
        const toRole = roleOrThrow(String(reqRes.rows[0].payload?.to_role || ""));
        await client.query(
          `
            UPDATE identity.users
            SET role = $1
            WHERE id = $2
          `,
          [toRole, driverId]
        );
        await client.query(
          `
            UPDATE identity.workflow_requests
            SET status = 'Approved', decided_by = $2, decided_at = now(), decision_reason = 'test approval'
            WHERE id = $1
          `,
          [createdRequestId, ownerId]
        );
        await client.query(
          `SELECT audit.append_event($1,$2,$3::jsonb,$4::uuid,$5)`,
          [
            "workflow.approved",
            "info",
            JSON.stringify({
              workflow_id: createdRequestId,
              action_code: "WF-064-IDENT-002",
              target_user: driverId,
              requested_by: driverId,
              decided_by: ownerId,
              reason: "test approval",
            }),
            ownerId,
            "BT-1-IDENT-03",
          ]
        );
      });

      await runAsUser(client, ownerId, async () => {
        const roleRes = await client.query(`SELECT role FROM identity.users WHERE id = $1`, [driverId]);
        if (String(roleRes.rows[0]?.role) !== "Dispatcher") {
          throw new Error("driver role was not updated to Dispatcher");
        }
      });
    })
  );

  results.push(
    await pass("Audit has requested + approved entries", async () => {
      await client.query("RESET ROLE");
      await client.query("BEGIN");
      try {
        const auditRes = await client.query(
          `
            SELECT count(*)::int AS cnt
            FROM audit.audit_events
            WHERE event_class IN ('workflow.requested', 'workflow.approved')
              AND payload ->> 'workflow_id' = $1
          `,
          [createdRequestId]
        );
        const count = Number(auditRes.rows[0]?.cnt ?? 0);
        if (count < 2) {
          throw new Error(`expected at least 2 audit events, got ${count}`);
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        await client.query("SET ROLE ih35_app");
      }
    })
  );
} catch (err) {
  console.error(`FAIL: setup/flow failed -> ${String(err?.message || err)}`);
  results.push(false);
} finally {
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    try {
      if (createdRequestId) {
        await client.query(`DELETE FROM identity.workflow_requests WHERE id = $1`, [createdRequestId]);
      }
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    console.log("PASS: cleanup workflow fixtures");
  } catch (err) {
    console.error(`FAIL: cleanup workflow fixtures -> ${String(err?.message || err)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: workflow verification complete.");
  process.exit(0);
}

console.error("FAIL: workflow verification failed.");
process.exit(1);
