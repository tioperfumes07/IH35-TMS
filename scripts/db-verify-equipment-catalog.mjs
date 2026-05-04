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
const createdUserIds = [];
const createdSessionIds = [];
const createdEquipmentTypeIds = [];
const createdLineItemIds = [];
const port = Number(process.env.EQUIPMENT_CATALOG_VERIFY_PORT || 3103);
const apiBase = `http://127.0.0.1:${port}`;

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

  results.push(
    await pass("4 pre-populated equipment types exist and are active", async () => {
      await runWithBypass(client, async () => {
        const res = await client.query(
          `
            SELECT code, is_active
            FROM catalogs.equipment_types
            WHERE code IN ('DRY_VAN', 'FLATBED', 'REEFER', 'OVERSIZED')
          `
        );
        if (res.rows.length !== 4) throw new Error(`expected 4 starter types, got ${res.rows.length}`);
        for (const row of res.rows) {
          if (row.is_active !== true) throw new Error(`expected ${row.code} to be active`);
        }
      });
    })
  );

  results.push(
    await pass("Template codes and units per type match spec", async () => {
      await runWithBypass(client, async () => {
        const res = await client.query(
          `
            SELECT
              et.code AS equipment_type_code,
              lit.code AS line_item_code,
              lit.unit,
              lit.is_required
            FROM catalogs.equipment_types et
            JOIN catalogs.equipment_line_item_templates lit ON lit.equipment_type_id = et.id
            WHERE et.code IN ('DRY_VAN', 'FLATBED', 'REEFER', 'OVERSIZED')
              AND lit.deactivated_at IS NULL
            ORDER BY et.code, lit.sort_order
          `
        );
        const byType = new Map();
        for (const row of res.rows) {
          const list = byType.get(row.equipment_type_code) ?? [];
          list.push(row);
          byType.set(row.equipment_type_code, list);
        }

        const expectedByType = {
          DRY_VAN: ["LOADED_MILE", "EMPTY_MILE", "EXTRA_DROP_PAYMENT"],
          FLATBED: ["LOADED_MILE", "EMPTY_MILE", "TARP", "EXTRA_DROP_PAYMENT"],
          REEFER: ["LOADED_MILE", "EMPTY_MILE", "EXTRA_DROP_PAYMENT"],
          OVERSIZED: ["LOADED_MILE", "EMPTY_MILE", "PERMIT_FEE", "EXTRA_DROP_PAYMENT"],
        };
        for (const [typeCode, expectedCodes] of Object.entries(expectedByType)) {
          const got = (byType.get(typeCode) ?? []).map((row) => row.line_item_code);
          if (got.length !== expectedCodes.length) {
            throw new Error(`${typeCode} expected ${expectedCodes.length} line items, got ${got.length}`);
          }
          for (const code of expectedCodes) {
            if (!got.includes(code)) throw new Error(`${typeCode} missing ${code}`);
          }
        }

        const loadedRows = res.rows.filter((row) => row.line_item_code === "LOADED_MILE");
        if (loadedRows.length !== 4) throw new Error("expected LOADED_MILE on all 4 equipment types");
        for (const row of loadedRows) {
          if (row.unit !== "per_loaded_mile" || row.is_required !== true) {
            throw new Error(`LOADED_MILE invalid on ${row.equipment_type_code}`);
          }
        }

        const emptyRows = res.rows.filter((row) => row.line_item_code === "EMPTY_MILE");
        if (emptyRows.length !== 4) throw new Error("expected EMPTY_MILE on all 4 equipment types");
        for (const row of emptyRows) {
          if (row.unit !== "per_empty_mile" || row.is_required !== true) {
            throw new Error(`EMPTY_MILE invalid on ${row.equipment_type_code}`);
          }
        }

        for (const code of ["TARP", "EXTRA_DROP_PAYMENT", "PERMIT_FEE"]) {
          for (const row of res.rows.filter((item) => item.line_item_code === code)) {
            if (row.unit !== "flat_per_occurrence" || row.is_required !== false) {
              throw new Error(`${code} invalid on ${row.equipment_type_code}`);
            }
          }
        }
      });
    })
  );

  const refs = await runWithBypass(client, async () => {
    const owner = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Owner') RETURNING id`,
      [`eq-owner-${suffix}@example.com`, `eq-owner-${suffix}`]
    );
    const driver = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Driver') RETURNING id`,
      [`eq-driver-${suffix}@example.com`, `eq-driver-${suffix}`]
    );
    const ownerId = String(owner.rows[0].id);
    const driverId = String(driver.rows[0].id);
    createdUserIds.push(ownerId, driverId);

    const ownerSessionId = `eq_owner_${suffix}`;
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '2 hours')`, [
      ownerSessionId,
      ownerId,
    ]);
    createdSessionIds.push(ownerSessionId);

    return { ownerId, driverId, ownerSessionId };
  });

  await startServer(process.cwd());

  results.push(
    await pass("Owner can INSERT a new equipment type via API", async () => {
      const response = await fetch(`${apiBase}/api/v1/catalogs/equipment-types`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `ih35_session=${refs.ownerSessionId}`,
        },
        body: JSON.stringify({
          code: `VERIFY_EQ_${suffix.toUpperCase()}`,
          name: "Verify Equipment Type",
          description: "Fixture for API insert verification",
          sort_order: 999,
          line_items: [
            {
              code: "LOADED_MILE",
              name: "Loaded mile rate",
              unit: "per_loaded_mile",
              sort_order: 10,
              is_required: true,
            },
          ],
        }),
      });
      if (response.status !== 201) {
        const body = await response.text();
        throw new Error(`Expected 201, got ${response.status} body=${body}`);
      }
      const payload = await response.json();
      if (!payload?.id) throw new Error("Missing id in create response");
      const eqTypeId = String(payload.id);
      createdEquipmentTypeIds.push(eqTypeId);
      await runWithBypass(client, async () => {
        const lineItemRes = await client.query(
          `SELECT id FROM catalogs.equipment_line_item_templates WHERE equipment_type_id = $1`,
          [eqTypeId]
        );
        for (const row of lineItemRes.rows) createdLineItemIds.push(String(row.id));
      });
    })
  );

  results.push(
    await pass("Driver role cannot INSERT equipment type (RLS rejects)", async () => {
      await runAsUser(client, refs.driverId, async () => {
        try {
          await client.query(
            `
              INSERT INTO catalogs.equipment_types (code, name, description, sort_order, created_by_user_id, updated_by_user_id)
              VALUES ($1, $2, $3, $4, $5, $5)
            `,
            [`DRV_DENY_${suffix.toUpperCase()}`, "Driver Denied", "should fail", 1000, refs.driverId]
          );
          throw new Error("driver insert unexpectedly succeeded");
        } catch (error) {
          if (!isDeniedError(error)) throw error;
        }
      });
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
      if (createdLineItemIds.length > 0) {
        await client.query(`DELETE FROM catalogs.equipment_line_item_templates WHERE id = ANY($1::uuid[])`, [createdLineItemIds]);
      }
      if (createdEquipmentTypeIds.length > 0) {
        await client.query(`DELETE FROM catalogs.equipment_types WHERE id = ANY($1::uuid[])`, [createdEquipmentTypeIds]);
      }
      if (createdSessionIds.length > 0) {
        await client.query(`DELETE FROM identity.sessions WHERE id = ANY($1::text[])`, [createdSessionIds]);
      }
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      await client.query("COMMIT");
      console.log("PASS: cleanup equipment catalog fixtures");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(`FAIL: cleanup equipment catalog fixtures -> ${String(error?.message || error)}`);
    results.push(false);
  }

  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: equipment catalog verification complete.");
  process.exit(0);
}

console.error("FAIL: equipment catalog verification failed.");
process.exit(1);
