import crypto from "node:crypto";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL in environment.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const suffix = crypto.randomUUID().slice(0, 8);
const port = Number(process.env.CUST_DRIVER_VERIFY_PORT || 3105);
const apiBase = `http://127.0.0.1:${port}`;

const createdUserIds = [];
const createdSessionIds = [];
const createdDriverIds = [];
const createdCustomerIds = [];
const createdQualificationIds = [];
const createdStatusIds = [];

let serverProcess = null;

async function runWithBypass(client, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function runAsUser(client, userId, fn) {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function isDeniedError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("row-level security") || msg.includes("permission denied") || msg.includes("violates row-level security policy");
}

async function pass(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL: ${name} -> ${String(error?.message || error)}`);
    return false;
  }
}

async function waitForHealth(baseUrl, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/v1/_healthcheck`);
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("backend healthcheck did not become ready");
}

async function startServer(cwd) {
  serverProcess = spawn("npx", ["tsx", "apps/backend/src/index.ts"], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL,
      DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL,
      OAUTH_GOOGLE_CLIENT_ID: process.env.OAUTH_GOOGLE_CLIENT_ID || "verify-client-id",
      OAUTH_GOOGLE_CLIENT_SECRET: process.env.OAUTH_GOOGLE_CLIENT_SECRET || "verify-client-secret",
      OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI || "http://localhost:3000/api/v1/auth/google/callback",
    },
    stdio: "pipe",
  });

  serverProcess.stdout?.on("data", (data) => {
    const text = String(data);
    if (text.trim()) console.log(`[server] ${text.trim()}`);
  });
  serverProcess.stderr?.on("data", (data) => {
    const text = String(data);
    if (text.trim()) console.error(`[server-err] ${text.trim()}`);
  });

  await waitForHealth(apiBase);
}

async function stopServer() {
  if (!serverProcess) return;
  serverProcess.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (!serverProcess.killed) serverProcess.kill("SIGKILL");
}

const client = await pool.connect();
const results = [];

try {
  await client.query("SET ROLE ih35_app");

  const refs = await runWithBypass(client, async () => {
    const ownerRes = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Owner') RETURNING id`,
      [`cust-driver-owner-${suffix}@example.com`, `cust-driver-owner-${suffix}`]
    );
    const managerRes = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Manager') RETURNING id`,
      [`cust-driver-manager-${suffix}@example.com`, `cust-driver-manager-${suffix}`]
    );
    const ownerId = String(ownerRes.rows[0].id);
    const managerId = String(managerRes.rows[0].id);
    createdUserIds.push(ownerId, managerId);

    const ownerSessionId = `cust_driver_owner_${suffix}`;
    const managerSessionId = `cust_driver_manager_${suffix}`;
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '2 hours')`, [
      ownerSessionId,
      ownerId,
    ]);
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '2 hours')`, [
      managerSessionId,
      managerId,
    ]);
    createdSessionIds.push(ownerSessionId, managerSessionId);

    const equipmentTypeRes = await client.query(
      `SELECT id FROM catalogs.equipment_types WHERE code = 'FLATBED' AND deactivated_at IS NULL LIMIT 1`
    );
    const equipmentTypeId = String(equipmentTypeRes.rows[0]?.id ?? "");
    if (!equipmentTypeId) throw new Error("FLATBED equipment type not found");

    const lineItemRes = await client.query(
      `
        SELECT id
        FROM catalogs.equipment_line_item_templates
        WHERE equipment_type_id = $1
          AND code = 'LOADED_MILE'
          AND deactivated_at IS NULL
        LIMIT 1
      `,
      [equipmentTypeId]
    );
    const lineItemTemplateId = String(lineItemRes.rows[0]?.id ?? "");
    if (!lineItemTemplateId) throw new Error("LOADED_MILE line item not found");

    const driverRes = await client.query(
      `
        INSERT INTO mdata.drivers (
          first_name, last_name, phone, status, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, 'Active', $4, $4)
        RETURNING id
      `,
      [`CustDriver-${suffix}`, "Fixture", `+1555${suffix.slice(0, 6)}`, ownerId]
    );
    const driverId = String(driverRes.rows[0].id);
    createdDriverIds.push(driverId);

    return { ownerId, managerId, ownerSessionId, managerSessionId, driverId, equipmentTypeId, lineItemTemplateId };
  });

  results.push(
    await pass("Schema has new customer fields", async () => {
      await runWithBypass(client, async () => {
        const res = await client.query(
          `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'mdata'
              AND table_name = 'customers'
              AND column_name = ANY($1::text[])
          `,
          [["customer_type", "default_billing_miles_basis", "default_free_time_hours", "default_detention_rate"]]
        );
        if (res.rows.length !== 4) throw new Error(`expected 4 columns, found ${res.rows.length}`);
      });
    })
  );

  results.push(
    await pass("Schema has pay_basis on drivers", async () => {
      await runWithBypass(client, async () => {
        const res = await client.query(
          `
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'mdata'
              AND table_name = 'drivers'
              AND column_name = 'pay_basis'
            LIMIT 1
          `
        );
        if (res.rows.length !== 1) throw new Error("missing mdata.drivers.pay_basis");
      });
    })
  );

  results.push(
    await pass("Enum mdata.pay_rate_change_reason includes initial_hire", async () => {
      await runWithBypass(client, async () => {
        const res = await client.query(
          `
            SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'mdata'
              AND t.typname = 'pay_rate_change_reason'
              AND e.enumlabel = 'initial_hire'
            LIMIT 1
          `
        );
        if (res.rows.length !== 1) throw new Error("initial_hire enum label not found");
      });
    })
  );

  results.push(
    await pass("Driver load statuses table exists with 13 starter rows", async () => {
      await runWithBypass(client, async () => {
        const tableRes = await client.query(
          `
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'catalogs'
              AND table_name = 'driver_load_statuses'
            LIMIT 1
          `
        );
        if (tableRes.rows.length !== 1) throw new Error("catalogs.driver_load_statuses table not found");

        const countRes = await client.query(`SELECT count(*)::int AS cnt FROM catalogs.driver_load_statuses`);
        const count = Number(countRes.rows[0]?.cnt ?? 0);
        if (count < 13) throw new Error(`expected at least 13 statuses, found ${count}`);
      });
    })
  );

  await startServer(process.cwd());

  let qualificationId = "";
  let correctedRateCount = 0;
  results.push(
    await pass("Rate history endpoint includes same-day corrected rows", async () => {
      const createQualResponse = await fetch(`${apiBase}/api/v1/mdata/drivers/${refs.driverId}/qualifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `ih35_session=${refs.ownerSessionId}`,
        },
        body: JSON.stringify({
          equipment_type_id: refs.equipmentTypeId,
          qualified_at: "2026-05-04",
          initial_rates: [
            {
              line_item_template_id: refs.lineItemTemplateId,
              amount: 0.55,
            },
          ],
        }),
      });
      if (createQualResponse.status !== 201) {
        const body = await createQualResponse.text();
        throw new Error(`create qualification failed ${createQualResponse.status} body=${body}`);
      }
      const createPayload = await createQualResponse.json();
      qualificationId = String(createPayload?.qualification?.id ?? "");
      if (!qualificationId) throw new Error("missing qualification id");
      createdQualificationIds.push(qualificationId);

      const firstChange = await fetch(`${apiBase}/api/v1/mdata/drivers/${refs.driverId}/qualifications/${qualificationId}/rates/change`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `ih35_session=${refs.ownerSessionId}`,
        },
        body: JSON.stringify({
          line_item_template_id: refs.lineItemTemplateId,
          amount: 0.60,
          effective_from: "2026-05-04",
          change_reason: "correction",
          change_notes: "fix amount",
        }),
      });
      if (!firstChange.ok) throw new Error(`first same-day change failed ${firstChange.status}`);

      const secondChange = await fetch(`${apiBase}/api/v1/mdata/drivers/${refs.driverId}/qualifications/${qualificationId}/rates/change`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `ih35_session=${refs.ownerSessionId}`,
        },
        body: JSON.stringify({
          line_item_template_id: refs.lineItemTemplateId,
          amount: 0.62,
          effective_from: "2026-05-04",
          change_reason: "correction",
          change_notes: "correct again",
        }),
      });
      if (!secondChange.ok) throw new Error(`second same-day change failed ${secondChange.status}`);

      const historyResponse = await fetch(
        `${apiBase}/api/v1/mdata/drivers/${refs.driverId}/qualifications/${qualificationId}/rate-history`,
        {
          headers: { Cookie: `ih35_session=${refs.ownerSessionId}` },
        }
      );
      if (!historyResponse.ok) throw new Error(`history endpoint failed ${historyResponse.status}`);
      const historyPayload = await historyResponse.json();
      const line = (historyPayload?.line_items ?? []).find((item) => item.line_item_template_id === refs.lineItemTemplateId);
      const historyRows = line?.history ?? [];
      if (historyRows.length < 2) throw new Error(`expected at least 2 history rows, got ${historyRows.length}`);
      correctedRateCount = historyRows.filter((row) => row.was_corrected === true).length;
      if (correctedRateCount < 1) throw new Error("expected at least one row with was_corrected=true");
    })
  );

  results.push(
    await pass("Initial qualification rate defaults to change_reason=initial_hire", async () => {
      if (!qualificationId) throw new Error("missing qualification fixture");
      const historyResponse = await fetch(
        `${apiBase}/api/v1/mdata/drivers/${refs.driverId}/qualifications/${qualificationId}/rate-history`,
        {
          headers: { Cookie: `ih35_session=${refs.ownerSessionId}` },
        }
      );
      if (!historyResponse.ok) throw new Error(`history endpoint failed ${historyResponse.status}`);
      const payload = await historyResponse.json();
      const line = (payload?.line_items ?? []).find((item) => item.line_item_template_id === refs.lineItemTemplateId);
      const hasInitialHire = (line?.history ?? []).some((row) => row.change_reason === "initial_hire");
      if (!hasInitialHire) throw new Error("no initial_hire row found in rate history");
    })
  );

  results.push(
    await pass("Customer insert accepts customer_type=broker", async () => {
      const response = await fetch(`${apiBase}/api/v1/mdata/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `ih35_session=${refs.ownerSessionId}`,
        },
        body: JSON.stringify({
          name: `Broker ${suffix}`,
          customer_type: "broker",
          default_billing_miles_basis: "practical_miles",
          default_free_time_hours: 4,
          default_detention_rate: 50,
        }),
      });
      if (response.status !== 201) {
        const body = await response.text();
        throw new Error(`broker customer create failed ${response.status} body=${body}`);
      }
      const payload = await response.json();
      createdCustomerIds.push(String(payload.id));
    })
  );

  results.push(
    await pass("Customer insert accepts customer_type=direct_shipper", async () => {
      const response = await fetch(`${apiBase}/api/v1/mdata/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `ih35_session=${refs.ownerSessionId}`,
        },
        body: JSON.stringify({
          name: `Direct ${suffix}`,
          customer_type: "direct_shipper",
          default_billing_miles_basis: "short_miles",
          default_free_time_hours: 6,
          default_detention_rate: 75.5,
        }),
      });
      if (response.status !== 201) {
        const body = await response.text();
        throw new Error(`direct shipper customer create failed ${response.status} body=${body}`);
      }
      const payload = await response.json();
      createdCustomerIds.push(String(payload.id));
    })
  );

  results.push(
    await pass("Invalid customer_type is rejected", async () => {
      const response = await fetch(`${apiBase}/api/v1/mdata/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `ih35_session=${refs.ownerSessionId}`,
        },
        body: JSON.stringify({
          name: `Invalid ${suffix}`,
          customer_type: "invalid_customer_type",
        }),
      });
      if (response.status !== 400) {
        const body = await response.text();
        throw new Error(`expected 400, got ${response.status} body=${body}`);
      }
    })
  );

  results.push(
    await pass("Driver pay_basis defaults to short_miles", async () => {
      await runWithBypass(client, async () => {
        const res = await client.query(
          `
            INSERT INTO mdata.drivers (
              first_name, last_name, phone, status, created_by_user_id, updated_by_user_id
            ) VALUES ($1, $2, $3, 'Active', $4, $4)
            RETURNING id, pay_basis
          `,
          [`DefaultPay-${suffix}`, "Driver", `+1556${suffix.slice(0, 6)}`, refs.ownerId]
        );
        const row = res.rows[0];
        createdDriverIds.push(String(row.id));
        if (String(row.pay_basis) !== "short_miles") {
          throw new Error(`expected short_miles default, got ${String(row.pay_basis)}`);
        }
      });
    })
  );

  results.push(
    await pass("Driver load statuses RLS allows Owner insert and blocks Manager insert", async () => {
      await runAsUser(client, refs.ownerId, async () => {
        const ownerInsert = await client.query(
          `
            INSERT INTO catalogs.driver_load_statuses (
              code, name, phase, sort_order, created_by_user_id, updated_by_user_id
            ) VALUES ($1, $2, 'other', 9999, $3, $3)
            RETURNING id
          `,
          [`VERIFY_OWNER_${suffix.toUpperCase()}`, `Owner Insert ${suffix}`, refs.ownerId]
        );
        createdStatusIds.push(String(ownerInsert.rows[0].id));
      });

      await runAsUser(client, refs.managerId, async () => {
        try {
          await client.query(
            `
              INSERT INTO catalogs.driver_load_statuses (
                code, name, phase, sort_order, created_by_user_id, updated_by_user_id
              ) VALUES ($1, $2, 'other', 9998, $3, $3)
            `,
            [`VERIFY_MANAGER_${suffix.toUpperCase()}`, `Manager Insert ${suffix}`, refs.managerId]
          );
          throw new Error("manager insert unexpectedly succeeded");
        } catch (error) {
          if (!isDeniedError(error)) throw error;
        }
      });
    })
  );

  results.push(
    await pass("Fixture checks produced expected correction evidence", async () => {
      if (correctedRateCount < 1) throw new Error("correction evidence missing");
    })
  );
} catch (error) {
  console.error(`FAIL: setup/flow failed -> ${String(error?.message || error)}`);
  results.push(false);
} finally {
  await stopServer();
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    try {
      if (createdStatusIds.length > 0) {
        await client.query(`DELETE FROM catalogs.driver_load_statuses WHERE id = ANY($1::uuid[])`, [createdStatusIds]);
      }
      if (createdQualificationIds.length > 0) {
        await client.query(`DELETE FROM mdata.driver_equipment_qualifications WHERE id = ANY($1::uuid[])`, [createdQualificationIds]);
      }
      if (createdCustomerIds.length > 0) {
        await client.query(`DELETE FROM mdata.customers WHERE id = ANY($1::uuid[])`, [createdCustomerIds]);
      }
      if (createdDriverIds.length > 0) {
        await client.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [createdDriverIds]);
      }
      if (createdSessionIds.length > 0) {
        await client.query(`DELETE FROM identity.sessions WHERE id = ANY($1::text[])`, [createdSessionIds]);
      }
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      await client.query("COMMIT");
      console.log("PASS: cleanup cust-driver-fields fixtures");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(`FAIL: cleanup cust-driver-fields fixtures -> ${String(error?.message || error)}`);
    results.push(false);
  }

  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: cust-driver-fields verification complete.");
  process.exit(0);
}

console.error("FAIL: cust-driver-fields verification failed.");
process.exit(1);
