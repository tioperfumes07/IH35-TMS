// @ts-nocheck
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
const phoneSuffix = suffix.replace(/[^0-9]/g, "").padEnd(4, "7").slice(0, 4);
const port = Number(process.env.STATES_REHIRE_VERIFY_PORT || 3114);
const apiBase = `http://127.0.0.1:${port}`;

const createdUserIds: string[] = [];
const createdSessionIds: string[] = [];
const createdDriverIds: string[] = [];
const createdEventIds: string[] = [];
let serverProcess: any = null;

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
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/v1/_healthcheck`);
      if (res.ok) return;
    } catch {
      // wait
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
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
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

async function api(path, { method = "GET", body, sessionId }: { method?: string; body?: unknown; sessionId: string }) {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: `ih35_session=${sessionId}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, payload };
}

const client = await pool.connect();
const results: boolean[] = [];

let ownerId = "";
let managerId = "";
let driverRoleUserId = "";
let ownerSessionId = "";
let managerSessionId = "";
let terminationReasonId = "";
let terminationReasonSeverity: "info" | "warning" | "severe" = "warning";
let driverAId = "";
let driverBId = "";
let driverCId = "";
let nonTerminatedDriverId = "";

const cdlSeed = `RHR${suffix}`.toUpperCase();
const curpA = `AAA${suffix.toUpperCase().padEnd(15, "X")}`.slice(0, 18);
const curpB = `BBB${suffix.toUpperCase().padEnd(15, "Y")}`.slice(0, 18);
const curpC = `CCC${suffix.toUpperCase().padEnd(15, "Z")}`.slice(0, 18);
const curpNonTerminated = `DDD${suffix.toUpperCase().padEnd(15, "Q")}`.slice(0, 18);
const curpMismatch = `EEE${suffix.toUpperCase().padEnd(15, "W")}`.slice(0, 18);
const cdlNonTerminated = `ACT${suffix}`.toUpperCase();

try {
  await client.query("SET ROLE ih35_app");

  await runWithBypass(client, async () => {
    const ownerRes = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Owner') RETURNING id`, [
      `states-owner-${suffix}@example.com`,
      `states-owner-${suffix}`,
    ]);
    const managerRes = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Manager') RETURNING id`, [
      `states-manager-${suffix}@example.com`,
      `states-manager-${suffix}`,
    ]);
    const driverRoleRes = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Driver') RETURNING id`, [
      `states-driver-${suffix}@example.com`,
      `states-driver-${suffix}`,
    ]);

    ownerId = String(ownerRes.rows[0].id);
    managerId = String(managerRes.rows[0].id);
    driverRoleUserId = String(driverRoleRes.rows[0].id);
    createdUserIds.push(ownerId, managerId, driverRoleUserId);

    ownerSessionId = `states_owner_${suffix}`;
    managerSessionId = `states_manager_${suffix}`;
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1,$2,now()+interval '2 hours')`, [ownerSessionId, ownerId]);
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1,$2,now()+interval '2 hours')`, [managerSessionId, managerId]);
    createdSessionIds.push(ownerSessionId, managerSessionId);

    const reasonRes = await client.query(`SELECT id, severity FROM catalogs.driver_termination_reasons WHERE code = 'quit_voluntary' LIMIT 1`);
    terminationReasonId = String(reasonRes.rows[0]?.id);
    terminationReasonSeverity = (reasonRes.rows[0]?.severity as "info" | "warning" | "severe") ?? "warning";
    if (!terminationReasonId) throw new Error("missing quit_voluntary reason");
  });

  await startServer(process.cwd());

  results.push(
    await pass("1) catalogs.us_states has 56 rows", async () => {
      await runWithBypass(client, async () => {
        const res = await client.query(`SELECT count(*)::int AS cnt FROM catalogs.us_states`);
        if (Number(res.rows[0]?.cnt ?? 0) !== 56) throw new Error(`expected 56, got ${res.rows[0]?.cnt ?? 0}`);
      });
    })
  );

  results.push(
    await pass("2) catalogs.mexico_states has 32 rows", async () => {
      await runWithBypass(client, async () => {
        const res = await client.query(`SELECT count(*)::int AS cnt FROM catalogs.mexico_states`);
        if (Number(res.rows[0]?.cnt ?? 0) !== 32) throw new Error(`expected 32, got ${res.rows[0]?.cnt ?? 0}`);
      });
    })
  );

  results.push(
    await pass("3) GET /catalogs/us-states returns active states", async () => {
      const response = await api("/api/v1/catalogs/us-states", { sessionId: managerSessionId });
      if (response.status !== 200) throw new Error(`expected 200, got ${response.status}`);
      if (!Array.isArray(response.payload.states) || response.payload.states.length < 56) {
        throw new Error("expected active US states list");
      }
    })
  );

  results.push(
    await pass("4) GET /catalogs/mexico-states returns active states", async () => {
      const response = await api("/api/v1/catalogs/mexico-states", { sessionId: managerSessionId });
      if (response.status !== 200) throw new Error(`expected 200, got ${response.status}`);
      if (!Array.isArray(response.payload.states) || response.payload.states.length < 32) {
        throw new Error("expected active Mexico states list");
      }
    })
  );

  results.push(
    await pass("5) mdata.drivers has rehire columns", async () => {
      await runWithBypass(client, async () => {
        const cols = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='mdata' AND table_name='drivers'`
        );
        const found = new Set(cols.rows.map((row) => row.column_name));
        for (const required of ["prior_driver_id", "rehire_count", "is_rehire"]) {
          if (!found.has(required)) throw new Error(`missing ${required}`);
        }
      });
    })
  );

  results.push(
    await pass("6) rehire create sets flags and emits mdata.drivers.rehired", async () => {
      const createA = await api("/api/v1/mdata/drivers", {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          first_name: "Prior",
          last_name: "DriverA",
          phone: `+1956555${phoneSuffix}`,
          curp: curpA,
          cdl_number: cdlSeed,
          cdl_state: "TX",
          status: "Active",
        },
      });
      if (createA.status !== 201) throw new Error(`create A failed: ${createA.status}`);
      driverAId = String(createA.payload.id);
      createdDriverIds.push(driverAId);

      const terminateA = await api(`/api/v1/mdata/drivers/${driverAId}/safety-events`, {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          event_type: "termination",
          event_date: new Date().toISOString().slice(0, 10),
          severity: terminationReasonSeverity,
          summary: "Verification termination for rehire flow",
          termination_reason_id: terminationReasonId,
        },
      });
      if (terminateA.status !== 201) throw new Error(`terminate A failed: ${terminateA.status}`);
      createdEventIds.push(String(terminateA.payload.event?.id ?? ""));

      const createB = await api("/api/v1/mdata/drivers", {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          first_name: "Prior",
          last_name: "DriverB",
          phone: `+1214555${phoneSuffix}`,
          curp: curpB,
          cdl_number: cdlSeed,
          cdl_state: "TX",
          status: "Probation",
          override_returning_warning: true,
          is_rehire: true,
          prior_driver_id: driverAId,
        },
      });
      if (createB.status !== 201) throw new Error(`create B failed: ${createB.status}`);
      driverBId = String(createB.payload.id);
      createdDriverIds.push(driverBId);
      if (createB.payload.is_rehire !== true) throw new Error("driver B is_rehire expected true");
      if (createB.payload.prior_driver_id !== driverAId) throw new Error("driver B prior_driver_id mismatch");
      if (Number(createB.payload.rehire_count ?? -1) !== 1) throw new Error("driver B rehire_count expected 1");

      await client.query("RESET ROLE");
      await client.query("BEGIN");
      try {
        const auditRes = await client.query(
          `SELECT 1 FROM audit.audit_events WHERE event_class='mdata.drivers.rehired' AND payload->>'new_driver_id' = $1 LIMIT 1`,
          [driverBId]
        );
        if (auditRes.rows.length !== 1) throw new Error("rehired audit not found");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        await client.query("SET ROLE ih35_app");
      }
    })
  );

  results.push(
    await pass("7) rehire chain increments count", async () => {
      const terminateB = await api(`/api/v1/mdata/drivers/${driverBId}/safety-events`, {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          event_type: "termination",
          event_date: new Date().toISOString().slice(0, 10),
          severity: terminationReasonSeverity,
          summary: "Second stint terminated for chain test",
          termination_reason_id: terminationReasonId,
        },
      });
      if (terminateB.status !== 201) throw new Error(`terminate B failed: ${terminateB.status}`);
      createdEventIds.push(String(terminateB.payload.event?.id ?? ""));

      const createC = await api("/api/v1/mdata/drivers", {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          first_name: "Prior",
          last_name: "DriverC",
          phone: `+1713555${phoneSuffix}`,
          curp: curpC,
          cdl_number: cdlSeed,
          cdl_state: "TX",
          status: "Probation",
          override_returning_warning: true,
          is_rehire: true,
          prior_driver_id: driverBId,
        },
      });
      if (createC.status !== 201) throw new Error(`create C failed: ${createC.status}`);
      driverCId = String(createC.payload.id);
      createdDriverIds.push(driverCId);
      if (Number(createC.payload.rehire_count ?? -1) !== 2) throw new Error("driver C rehire_count expected 2");
    })
  );

  results.push(
    await pass("8) prior driver must be Terminated", async () => {
      const createNonTerminated = await api("/api/v1/mdata/drivers", {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          first_name: "Active",
          last_name: "Prior",
          phone: `+1832555${phoneSuffix}`,
          curp: curpNonTerminated,
          cdl_number: cdlNonTerminated,
          cdl_state: "TX",
          status: "Active",
        },
      });
      if (createNonTerminated.status !== 201) throw new Error("failed setup non terminated prior");
      nonTerminatedDriverId = String(createNonTerminated.payload.id);
      createdDriverIds.push(nonTerminatedDriverId);

      const response = await api("/api/v1/mdata/drivers", {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          first_name: "Bad",
          last_name: "Rehire",
          phone: `+1949555${phoneSuffix}`,
          cdl_number: cdlNonTerminated,
          cdl_state: "TX",
          status: "Probation",
          override_returning_warning: true,
          prior_driver_id: nonTerminatedDriverId,
        },
      });
      if (response.status !== 400 || response.payload.error !== "prior_driver_not_terminated") {
        throw new Error(`expected 400 prior_driver_not_terminated, got ${response.status} ${response.payload.error}`);
      }
    })
  );

  results.push(
    await pass("9) prior_driver_id requires override_returning_warning", async () => {
      const response = await api("/api/v1/mdata/drivers", {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          first_name: "No",
          last_name: "Override",
          phone: `+1619555${phoneSuffix}`,
          curp: `GGG${suffix.toUpperCase().padEnd(15, "R")}`.slice(0, 18),
          cdl_number: cdlSeed,
          cdl_state: "TX",
          prior_driver_id: driverAId,
        },
      });
      if (response.status !== 400 || response.payload.error !== "override_required_for_rehire") {
        throw new Error(`expected 400 override_required_for_rehire, got ${response.status} ${response.payload.error}`);
      }
    })
  );

  results.push(
    await pass("10) mismatched identity link is rejected", async () => {
      const response = await api("/api/v1/mdata/drivers", {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          first_name: "Mismatch",
          last_name: "Identity",
          phone: `+1407555${phoneSuffix}`,
          curp: curpMismatch,
          cdl_number: `ZZ${suffix}`.toUpperCase(),
          cdl_state: "CA",
          status: "Probation",
          override_returning_warning: true,
          prior_driver_id: driverAId,
        },
      });
      if (response.status !== 400 || response.payload.error !== "prior_driver_identity_mismatch") {
        throw new Error(`expected 400 prior_driver_identity_mismatch, got ${response.status} ${response.payload.error}`);
      }
    })
  );

  results.push(
    await pass("11) any authenticated user can SELECT us_states and mexico_states", async () => {
      await runAsUser(client, driverRoleUserId, async () => {
        const usRes = await client.query(`SELECT count(*)::int AS cnt FROM catalogs.us_states`);
        const mxRes = await client.query(`SELECT count(*)::int AS cnt FROM catalogs.mexico_states`);
        if (Number(usRes.rows[0]?.cnt ?? 0) < 56) throw new Error("driver cannot read us_states");
        if (Number(mxRes.rows[0]?.cnt ?? 0) < 32) throw new Error("driver cannot read mexico_states");
      });
    })
  );

  results.push(
    await pass("12) cleanup fixtures", async () => {
      // no-op here; validated in finally cleanup.
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
      const validEventIds = createdEventIds.filter(Boolean);
      if (validEventIds.length > 0) {
        await client.query(`DELETE FROM mdata.driver_safety_events WHERE id = ANY($1::uuid[])`, [validEventIds]);
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
      console.log("PASS: cleanup states and rehire fixtures");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(`FAIL: cleanup states and rehire fixtures -> ${String(error?.message || error)}`);
    results.push(false);
  }

  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: states and rehire verification complete.");
  process.exit(0);
}

console.error("FAIL: states and rehire verification failed.");
process.exit(1);
