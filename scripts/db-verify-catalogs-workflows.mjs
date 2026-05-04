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
const createdAccountIds = [];
const createdBindingIds = [];
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
let accountantId;
let oldAccountId;
let newAccountId;
let bindingId;
let workflowId;

try {
  await client.query("SET ROLE ih35_app");

  await runWithBypass(client, async () => {
    const ownerRes = await client.query(
      `
        INSERT INTO identity.users (email, google_user_id, role)
        VALUES ($1, $2, 'Owner')
        RETURNING id
      `,
      [`catalwf-owner-${suffix}@example.com`, `catalwf-owner-${suffix}`]
    );
    const accountantRes = await client.query(
      `
        INSERT INTO identity.users (email, google_user_id, role)
        VALUES ($1, $2, 'Accountant')
        RETURNING id
      `,
      [`catalwf-accountant-${suffix}@example.com`, `catalwf-accountant-${suffix}`]
    );
    ownerId = asId(ownerRes.rows[0].id);
    accountantId = asId(accountantRes.rows[0].id);
    createdUserIds.push(ownerId, accountantId);

    const oldAccountRes = await client.query(
      `
        INSERT INTO catalogs.accounts (
          account_number, account_name, account_type, created_by_user_id, updated_by_user_id
        )
        VALUES ($1, $2, 'Asset', $3, $3)
        RETURNING id
      `,
      [`101-${suffix}`, `Old Cash Dip ${suffix}`, ownerId]
    );
    const newAccountRes = await client.query(
      `
        INSERT INTO catalogs.accounts (
          account_number, account_name, account_type, created_by_user_id, updated_by_user_id
        )
        VALUES ($1, $2, 'Asset', $3, $3)
        RETURNING id
      `,
      [`102-${suffix}`, `New Cash Dip ${suffix}`, ownerId]
    );
    oldAccountId = asId(oldAccountRes.rows[0].id);
    newAccountId = asId(newAccountRes.rows[0].id);
    createdAccountIds.push(oldAccountId, newAccountId);

    const bindingRes = await client.query(
      `
        INSERT INTO catalogs.account_role_bindings (
          role_key, account_id, created_by_user_id, updated_by_user_id
        )
        VALUES ('cash_dip', $1, $2, $2)
        RETURNING id
      `,
      [oldAccountId, ownerId]
    );
    bindingId = asId(bindingRes.rows[0].id);
    createdBindingIds.push(bindingId);
  });

  results.push(
    await pass("Accountant creates WF-064-CATAL-001 request", async () => {
      workflowId = await runAsUser(client, accountantId, async () => {
        const payload = {
          role_key: "cash_dip",
          new_account_id: newAccountId,
        };
        const insertRes = await client.query(
          `
            INSERT INTO catalogs.workflow_requests (
              action_code, status, requested_by, target_resource_type, target_resource_id, payload
            )
            VALUES ('WF-064-CATAL-001', 'Pending', $1, 'account_role_binding', $2, $3::jsonb)
            RETURNING id, status
          `,
          [accountantId, bindingId, JSON.stringify(payload)]
        );
        if (String(insertRes.rows[0]?.status) !== "Pending") {
          throw new Error("workflow did not create in Pending status");
        }
        const requestId = asId(insertRes.rows[0].id);
        createdWorkflowIds.push(requestId);
        await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,$4::uuid,$5)`, [
          "workflow.requested",
          "info",
          JSON.stringify({
            workflow_id: requestId,
            action_code: "WF-064-CATAL-001",
            target_resource_type: "account_role_binding",
            target_resource_id: bindingId,
            requested_by: accountantId,
          }),
          accountantId,
          "BT-1-CATAL-03",
        ]);
        return requestId;
      });
    })
  );

  results.push(
    await pass("Accountant cannot approve own request", async () => {
      await runAsUser(client, accountantId, async () => {
        try {
          const res = await client.query(
            `
              UPDATE catalogs.workflow_requests
              SET status = 'Approved', decided_by = $2, decided_at = now()
              WHERE id = $1
            `,
            [workflowId, accountantId]
          );
          if ((res.rowCount ?? 0) > 0) {
            throw new Error("accountant approval unexpectedly succeeded");
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
    await pass("Owner sees pending request", async () => {
      await runAsUser(client, ownerId, async () => {
        const res = await client.query(
          `
            SELECT id
            FROM catalogs.workflow_requests
            WHERE status = 'Pending' AND id = $1
          `,
          [workflowId]
        );
        if (res.rows.length !== 1) {
          throw new Error("owner did not see pending workflow request");
        }
      });
    })
  );

  results.push(
    await pass("Owner approves request and role binding account is updated", async () => {
      await runAsUser(client, ownerId, async () => {
        const reqRes = await client.query(
          `
            SELECT id, payload
            FROM catalogs.workflow_requests
            WHERE id = $1
            FOR UPDATE
          `,
          [workflowId]
        );
        if (reqRes.rows.length !== 1) throw new Error("workflow request missing for approval");

        const payload = reqRes.rows[0].payload ?? {};
        const roleKey = String(payload.role_key ?? "");
        const requestedAccountId = String(payload.new_account_id ?? "");
        if (roleKey !== "cash_dip") throw new Error("workflow payload role_key mismatch");
        if (requestedAccountId !== newAccountId) throw new Error("workflow payload new_account_id mismatch");

        await client.query(
          `
            UPDATE catalogs.account_role_bindings
            SET account_id = $2, updated_by_user_id = $3
            WHERE role_key = $1
          `,
          [roleKey, requestedAccountId, ownerId]
        );
        await client.query(
          `
            UPDATE catalogs.workflow_requests
            SET status = 'Approved', decided_by = $2, decided_at = now(), decision_reason = 'test approval'
            WHERE id = $1
          `,
          [workflowId, ownerId]
        );
        await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,$4::uuid,$5)`, [
          "workflow.approved",
          "info",
          JSON.stringify({
            workflow_id: workflowId,
            action_code: "WF-064-CATAL-001",
            target_resource_type: "account_role_binding",
            target_resource_id: bindingId,
            requested_by: accountantId,
            decided_by: ownerId,
            reason: "test approval",
          }),
          ownerId,
          "BT-1-CATAL-03",
        ]);
      });

      await runAsUser(client, ownerId, async () => {
        const bindingRes = await client.query(`SELECT account_id FROM catalogs.account_role_bindings WHERE id = $1`, [bindingId]);
        if (bindingRes.rows.length !== 1) throw new Error("binding not found after approval");
        if (asId(bindingRes.rows[0].account_id) !== newAccountId) {
          throw new Error("account_role_binding account_id was not updated");
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
          [workflowId, verificationStart]
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
        await client.query(`DELETE FROM catalogs.workflow_requests WHERE id = ANY($1::uuid[])`, [createdWorkflowIds]);
      }
      if (createdBindingIds.length > 0) {
        await client.query(`DELETE FROM catalogs.account_role_bindings WHERE id = ANY($1::uuid[])`, [createdBindingIds]);
      }
      if (createdAccountIds.length > 0) {
        await client.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [createdAccountIds]);
      }
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    console.log("PASS: cleanup catalogs workflow fixtures");
  } catch (err) {
    console.error(`FAIL: cleanup catalogs workflow fixtures -> ${String(err?.message || err)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: catalogs workflows verification complete.");
  process.exit(0);
}

console.error("FAIL: catalogs workflows verification failed.");
process.exit(1);
