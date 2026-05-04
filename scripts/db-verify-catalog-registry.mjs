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
const port = Number(process.env.CATALOG_REGISTRY_VERIFY_PORT || 3106);
const apiBase = `http://127.0.0.1:${port}`;

const createdUserIds = [];
const createdSessionIds = [];
const createdRegistryIds = [];
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

async function waitForHealth(baseUrl, timeoutMs = 45000) {
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
const verifySource = "BT-1-LISTS-CATALOGS-HUB-AND-UX";

try {
  await client.query("SET ROLE ih35_app");

  const refs = await runWithBypass(client, async () => {
    const ownerRes = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Owner') RETURNING id`,
      [`catalog-registry-owner-${suffix}@example.com`, `catalog-registry-owner-${suffix}`]
    );
    const managerRes = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Manager') RETURNING id`,
      [`catalog-registry-manager-${suffix}@example.com`, `catalog-registry-manager-${suffix}`]
    );
    const ownerId = String(ownerRes.rows[0].id);
    const managerId = String(managerRes.rows[0].id);
    createdUserIds.push(ownerId, managerId);

    const ownerSessionId = `catalog_registry_owner_${suffix}`;
    const managerSessionId = `catalog_registry_manager_${suffix}`;
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '2 hours')`, [
      ownerSessionId,
      ownerId,
    ]);
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '2 hours')`, [
      managerSessionId,
      managerId,
    ]);
    createdSessionIds.push(ownerSessionId, managerSessionId);

    return { ownerId, managerId, ownerSessionId, managerSessionId };
  });

  results.push(
    await pass("catalog_registry table exists with 8 starter rows", async () => {
      await runWithBypass(client, async () => {
        const tableRes = await client.query(
          `
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'catalogs'
              AND table_name = 'catalog_registry'
            LIMIT 1
          `
        );
        if (tableRes.rows.length === 0) throw new Error("catalog_registry table missing");

        const rowsRes = await client.query(
          `
            SELECT count(*)::int AS cnt
            FROM catalogs.catalog_registry
            WHERE deactivated_at IS NULL
              AND is_active = true
          `
        );
        if (Number(rowsRes.rows[0]?.cnt ?? 0) < 8) {
          throw new Error(`expected at least 8 starter rows, found ${String(rowsRes.rows[0]?.cnt ?? 0)}`);
        }
      });
    })
  );

  results.push(
    await pass("RLS allows Owner INSERT and blocks Manager INSERT", async () => {
      await runAsUser(client, refs.ownerId, async () => {
        const ownerInsertRes = await client.query(
          `
            INSERT INTO catalogs.catalog_registry (code, name, department, route_path, icon_label, sort_order)
            VALUES ($1, $2, 'operations', '/catalogs/owner-fixture', 'OF', 900)
            RETURNING id
          `,
          [`OWNER_FIXTURE_${suffix.toUpperCase()}`, "Owner fixture"]
        );
        createdRegistryIds.push(String(ownerInsertRes.rows[0].id));
      });

      await runAsUser(client, refs.managerId, async () => {
        try {
          await client.query(
            `
              INSERT INTO catalogs.catalog_registry (code, name, department, route_path, icon_label, sort_order)
              VALUES ($1, $2, 'operations', '/catalogs/manager-fixture', 'MF', 901)
            `,
            [`MANAGER_FIXTURE_${suffix.toUpperCase()}`, "Manager fixture"]
          );
          throw new Error("manager insert unexpectedly succeeded");
        } catch (error) {
          const msg = String(error?.message || "").toLowerCase();
          if (!msg.includes("row-level security") && !msg.includes("permission denied")) throw error;
        }
      });
    })
  );

  await startServer(process.cwd());

  let apiEntryId = "";
  results.push(
    await pass("GET /catalogs/registry returns grouped departments with counts", async () => {
      const res = await fetch(`${apiBase}/api/v1/catalogs/registry`, {
        headers: { Cookie: `ih35_session=${refs.ownerSessionId}` },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`registry list failed ${res.status} body=${body}`);
      }
      const payload = await res.json();
      const departments = payload?.departments ?? [];
      if (departments.length < 2) throw new Error("expected multiple catalog departments");
      const dispatchCatalog = departments
        .flatMap((department) => department.catalogs ?? [])
        .find((catalog) => catalog.code === "EQUIPMENT_TYPES");
      if (!dispatchCatalog) throw new Error("EQUIPMENT_TYPES missing from registry list");
      if (typeof dispatchCatalog.item_count !== "number") throw new Error("missing item_count in registry payload");
    })
  );

  results.push(
    await pass("GET preview for EQUIPMENT_TYPES returns equipment entries", async () => {
      const res = await fetch(`${apiBase}/api/v1/catalogs/registry/EQUIPMENT_TYPES/preview`, {
        headers: { Cookie: `ih35_session=${refs.ownerSessionId}` },
      });
      if (!res.ok) throw new Error(`equipment preview failed ${res.status}`);
      const payload = await res.json();
      if ((payload?.items ?? []).length < 4) throw new Error("expected at least 4 equipment preview rows");
      if (payload?.truncated !== false) throw new Error("equipment preview should not be truncated");
    })
  );

  results.push(
    await pass("GET preview for DRIVER_LOAD_STATUSES returns status entries", async () => {
      const res = await fetch(`${apiBase}/api/v1/catalogs/registry/DRIVER_LOAD_STATUSES/preview`, {
        headers: { Cookie: `ih35_session=${refs.ownerSessionId}` },
      });
      if (!res.ok) throw new Error(`driver statuses preview failed ${res.status}`);
      const payload = await res.json();
      if ((payload?.items ?? []).length < 13) throw new Error("expected at least 13 status preview rows");
      if (payload?.truncated !== false) throw new Error("driver statuses preview should not be truncated");
    })
  );

  results.push(
    await pass("POST/PATCH catalog registry emit audit events", async () => {
      const createRes = await fetch(`${apiBase}/api/v1/catalogs/registry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `ih35_session=${refs.ownerSessionId}`,
        },
        body: JSON.stringify({
          code: `VERIFY_CAT_${suffix.toUpperCase()}`,
          name: "Verify Catalog Entry",
          description: "fixture for verify",
          department: "operations",
          route_path: "/catalogs/verify-entry",
          icon_label: "VC",
          sort_order: 910,
        }),
      });
      if (createRes.status !== 201) {
        const body = await createRes.text();
        throw new Error(`registry create failed ${createRes.status} body=${body}`);
      }
      const createdPayload = await createRes.json();
      apiEntryId = String(createdPayload?.entry?.id ?? "");
      if (!apiEntryId) throw new Error("missing created registry id");
      createdRegistryIds.push(apiEntryId);

      const updateRes = await fetch(`${apiBase}/api/v1/catalogs/registry/${apiEntryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `ih35_session=${refs.ownerSessionId}`,
        },
        body: JSON.stringify({
          name: "Verify Catalog Entry Updated",
          sort_order: 911,
          is_active: true,
        }),
      });
      if (!updateRes.ok) {
        const body = await updateRes.text();
        throw new Error(`registry update failed ${updateRes.status} body=${body}`);
      }

      const managerInsertRes = await fetch(`${apiBase}/api/v1/catalogs/registry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `ih35_session=${refs.managerSessionId}`,
        },
        body: JSON.stringify({
          code: `MANAGER_API_${suffix.toUpperCase()}`,
          name: "Manager should fail",
          department: "operations",
          route_path: "/catalogs/manager-should-fail",
          icon_label: "MF",
          sort_order: 915,
        }),
      });
      if (managerInsertRes.status !== 403) {
        throw new Error(`manager registry insert expected 403, got ${managerInsertRes.status}`);
      }

      await client.query("RESET ROLE");
      await client.query("BEGIN");
      try {
        const auditRes = await client.query(
          `
            SELECT event_class, count(*)::int AS cnt
            FROM audit.audit_events
            WHERE source = $1
              AND payload ->> 'resource_id' = $2
              AND event_class = ANY($3::text[])
            GROUP BY event_class
          `,
          [verifySource, apiEntryId, ["catalogs.catalog_registry.created", "catalogs.catalog_registry.updated"]]
        );
        const byClass = new Map(auditRes.rows.map((row) => [row.event_class, Number(row.cnt)]));
        if ((byClass.get("catalogs.catalog_registry.created") ?? 0) < 1) {
          throw new Error("missing catalogs.catalog_registry.created audit event");
        }
        if ((byClass.get("catalogs.catalog_registry.updated") ?? 0) < 1) {
          throw new Error("missing catalogs.catalog_registry.updated audit event");
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        await client.query("SET ROLE ih35_app");
      }
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
      if (createdRegistryIds.length > 0) {
        await client.query(`DELETE FROM catalogs.catalog_registry WHERE id = ANY($1::uuid[])`, [createdRegistryIds]);
      }
      if (createdSessionIds.length > 0) {
        await client.query(`DELETE FROM identity.sessions WHERE id = ANY($1::text[])`, [createdSessionIds]);
      }
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      await client.query("COMMIT");
      console.log("PASS: cleanup catalog registry fixtures");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(`FAIL: cleanup catalog registry fixtures -> ${String(error?.message || error)}`);
    results.push(false);
  }

  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: catalog registry verification complete.");
  process.exit(0);
}

console.error("FAIL: catalog registry verification failed.");
process.exit(1);
