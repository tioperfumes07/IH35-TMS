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
const createdDriverIds = [];
const createdWorkflowIds = [];
const suffix = crypto.randomUUID().slice(0, 8);
const verificationStart = new Date().toISOString();

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
let managerId;
let driverFixtureId;
let createdRequestId;

try {
  await client.query("SET ROLE ih35_app");

  await runWithBypass(client, async () => {
    const ownerRes = await client.query(
      `
        INSERT INTO identity.users (email, google_user_id, role)
        VALUES ($1, $2, 'Owner')
        RETURNING id
      `,
      [`mdatawf-owner-${suffix}@example.com`, `mdatawf-owner-${suffix}`]
    );
    const managerRes = await client.query(
      `
        INSERT INTO identity.users (email, google_user_id, role)
        VALUES ($1, $2, 'Manager')
        RETURNING id
      `,
      [`mdatawf-manager-${suffix}@example.com`, `mdatawf-manager-${suffix}`]
    );

    ownerId = asId(ownerRes.rows[0].id);
    managerId = asId(managerRes.rows[0].id);
    createdUserIds.push(ownerId, managerId);

    const driverRes = await client.query(
      `
        INSERT INTO mdata.drivers (
          first_name, last_name, phone, status, created_by_user_id, updated_by_user_id
        )
        VALUES ($1, $2, $3, 'Probation', $4, $4)
        RETURNING id
      `,
      [`WF-${suffix}`, "Driver", `555-${suffix.slice(0, 4)}`, ownerId]
    );
    driverFixtureId = asId(driverRes.rows[0].id);
    createdDriverIds.push(driverFixtureId);
  });

  results.push(
    await pass("Manager creates WF-064-MDATA-001 request", async () => {
      createdRequestId = await runAsUser(client, managerId, async () => {
        const insertRes = await client.query(
          `
            INSERT INTO mdata.workflow_requests (
              action_code, status, requested_by, target_resource_type, target_resource_id, payload
            )
            VALUES ('WF-064-MDATA-001', 'Pending', $1, 'driver', $2, '{}'::jsonb)
            RETURNING id, status
          `,
          [managerId, driverFixtureId]
        );
        if (String(insertRes.rows[0]?.status) !== "Pending") {
          throw new Error("workflow did not create in Pending status");
        }
        const requestId = asId(insertRes.rows[0].id);
        createdWorkflowIds.push(requestId);
        await client.query(
          `SELECT audit.append_event($1,$2,$3::jsonb,$4::uuid,$5)`,
          [
            "workflow.requested",
            "info",
            JSON.stringify({
              workflow_id: requestId,
              action_code: "WF-064-MDATA-001",
              target_resource_type: "driver",
              target_resource_id: driverFixtureId,
              requested_by: managerId,
            }),
            managerId,
            "BT-1-MDATA-03",
          ]
        );
        return requestId;
      });
    })
  );

  results.push(
    await pass("Manager can GET own request", async () => {
      await runAsUser(client, managerId, async () => {
        const res = await client.query(
          `SELECT id FROM mdata.workflow_requests WHERE id = $1`,
          [createdRequestId]
        );
        if (res.rows.length !== 1) {
          throw new Error("manager cannot read own request");
        }
      });
    })
  );

  results.push(
    await pass("Manager cannot approve own request", async () => {
      await runAsUser(client, managerId, async () => {
        try {
          const res = await client.query(
            `
              UPDATE mdata.workflow_requests
              SET status = 'Approved', decided_by = $2, decided_at = now()
              WHERE id = $1
            `,
            [createdRequestId, managerId]
          );
          if ((res.rowCount ?? 0) > 0) {
            throw new Error("manager approval unexpectedly succeeded");
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
    await pass("Owner sees pending requests", async () => {
      await runAsUser(client, ownerId, async () => {
        const res = await client.query(
          `
            SELECT id
            FROM mdata.workflow_requests
            WHERE status = 'Pending' AND id = $1
          `,
          [createdRequestId]
        );
        if (res.rows.length !== 1) {
          throw new Error("owner did not see pending request");
        }
      });
    })
  );

  results.push(
    await pass("Owner approves request and driver updates to Active", async () => {
      await runAsUser(client, ownerId, async () => {
        const reqRes = await client.query(
          `
            SELECT id, action_code, target_resource_id
            FROM mdata.workflow_requests
            WHERE id = $1
            FOR UPDATE
          `,
          [createdRequestId]
        );
        if (reqRes.rows.length !== 1) {
          throw new Error("workflow request missing for approval");
        }
        await client.query(
          `
            UPDATE mdata.drivers
            SET status = 'Active', updated_by_user_id = $2
            WHERE id = $1
          `,
          [driverFixtureId, ownerId]
        );
        await client.query(
          `
            UPDATE mdata.workflow_requests
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
              action_code: "WF-064-MDATA-001",
              target_resource_type: "driver",
              target_resource_id: driverFixtureId,
              requested_by: managerId,
              decided_by: ownerId,
              reason: "test approval",
            }),
            ownerId,
            "BT-1-MDATA-03",
          ]
        );
      });

      await runAsUser(client, ownerId, async () => {
        const statusRes = await client.query(
          `SELECT status FROM mdata.drivers WHERE id = $1`,
          [driverFixtureId]
        );
        if (String(statusRes.rows[0]?.status) !== "Active") {
          throw new Error("driver status was not updated to Active");
        }
      });
    })
  );

  results.push(
    await pass("Audit has workflow.requested + workflow.approved events", async () => {
      await client.query("RESET ROLE");
      await client.query("BEGIN");
      try {
        const auditRes = await client.query(
          `
            SELECT count(*)::int AS cnt
            FROM audit.audit_events
            WHERE event_class IN ('workflow.requested', 'workflow.approved')
              AND payload ->> 'workflow_id' = $1
              AND created_at >= $2::timestamptz
          `,
          [createdRequestId, verificationStart]
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
      if (createdWorkflowIds.length > 0) {
        await client.query(`DELETE FROM mdata.workflow_requests WHERE id = ANY($1::uuid[])`, [createdWorkflowIds]);
      }
      if (createdDriverIds.length > 0) {
        await client.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [createdDriverIds]);
      }
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    console.log("PASS: cleanup mdata workflow fixtures");
  } catch (err) {
    console.error(`FAIL: cleanup mdata workflow fixtures -> ${String(err?.message || err)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: mdata workflows verification complete.");
  process.exit(0);
}

console.error("FAIL: mdata workflows verification failed.");
process.exit(1);
