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
const port = Number(process.env.DRIVER_SAFETY_VERIFY_PORT || 3113);
const apiBase = `http://127.0.0.1:${port}`;
const verifySource = "BT-1-DRIVER-SAFETY-FILE";
const phoneSuffix = suffix.replace(/[^0-9]/g, "").padEnd(4, "7").slice(0, 4);
const historicalCdlNumber = `CDL${suffix}`.toUpperCase();

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
let safetyId = "";
let driverRoleUserId = "";
let ownerSessionId = "";
let managerSessionId = "";
let safetySessionId = "";
let historicalDriverId = "";
let activeDriverId = "";
let sampleTerminationReasonId = "";
let insertedEventId = "";

try {
  await client.query("SET ROLE ih35_app");

  await runWithBypass(client, async () => {
    const ownerRes = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Owner') RETURNING id`, [
      `safety-owner-${suffix}@example.com`,
      `safety-owner-${suffix}`,
    ]);
    const managerRes = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Manager') RETURNING id`, [
      `safety-manager-${suffix}@example.com`,
      `safety-manager-${suffix}`,
    ]);
    const safetyRes = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Safety') RETURNING id`, [
      `safety-role-${suffix}@example.com`,
      `safety-role-${suffix}`,
    ]);
    const driverRoleRes = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Driver') RETURNING id`, [
      `safety-driver-role-${suffix}@example.com`,
      `safety-driver-role-${suffix}`,
    ]);

    ownerId = String(ownerRes.rows[0].id);
    managerId = String(managerRes.rows[0].id);
    safetyId = String(safetyRes.rows[0].id);
    driverRoleUserId = String(driverRoleRes.rows[0].id);
    createdUserIds.push(ownerId, managerId, safetyId, driverRoleUserId);

    ownerSessionId = `safety_owner_${suffix}`;
    managerSessionId = `safety_manager_${suffix}`;
    safetySessionId = `safety_safety_${suffix}`;
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1,$2,now()+interval '2 hours')`, [ownerSessionId, ownerId]);
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1,$2,now()+interval '2 hours')`, [managerSessionId, managerId]);
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1,$2,now()+interval '2 hours')`, [safetySessionId, safetyId]);
    createdSessionIds.push(ownerSessionId, managerSessionId, safetySessionId);

    const histRes = await client.query(
      `
      INSERT INTO mdata.drivers (
        first_name, last_name, phone, status, curp, cdl_number, cdl_state, created_by_user_id, updated_by_user_id
      ) VALUES ($1,$2,$3,'Inactive',$4,$5,$6,$7,$7)
      RETURNING id
      `,
      [`Hist${suffix}`, "Driver", `+1520555${suffix.slice(0, 4)}`, `HISTCURP${suffix.toUpperCase().padEnd(10, "X")}`.slice(0, 18), historicalCdlNumber, "TX", ownerId]
    );
    historicalDriverId = String(histRes.rows[0].id);

    const activeRes = await client.query(
      `
      INSERT INTO mdata.drivers (
        first_name, last_name, phone, status, curp, cdl_number, cdl_state, created_by_user_id, updated_by_user_id
      ) VALUES ($1,$2,$3,'Active',$4,$5,$6,$7,$7)
      RETURNING id
      `,
      [`Active${suffix}`, "Driver", `+1956555${suffix.slice(0, 4)}`, `ACTVCURP${suffix.toUpperCase().padEnd(10, "Y")}`.slice(0, 18), `ACT${suffix}`.toUpperCase(), "CA", ownerId]
    );
    activeDriverId = String(activeRes.rows[0].id);
    createdDriverIds.push(historicalDriverId, activeDriverId);

    const reasonRes = await client.query(
      `SELECT id FROM catalogs.driver_termination_reasons WHERE code = 'fired_accident_at_fault' LIMIT 1`
    );
    sampleTerminationReasonId = String(reasonRes.rows[0].id);
  });

  results.push(
    await pass("1) termination reasons catalog has 16 starter rows", async () => {
      await runWithBypass(client, async () => {
        const res = await client.query(`SELECT count(*)::int AS cnt FROM catalogs.driver_termination_reasons`);
        if (Number(res.rows[0].cnt) < 16) throw new Error(`expected at least 16 rows, got ${res.rows[0].cnt}`);
      });
    })
  );

  results.push(
    await pass("2) driver_safety_events table columns + indexes exist", async () => {
      await runWithBypass(client, async () => {
        const cols = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='mdata' AND table_name='driver_safety_events'`
        );
        const needed = [
          "driver_id",
          "event_type",
          "event_date",
          "severity",
          "summary",
          "termination_reason_id",
          "document_ids",
          "curp_snapshot",
          "cdl_number_snapshot",
          "cdl_state_snapshot",
          "voided_at",
          "void_reason",
        ];
        const found = new Set(cols.rows.map((r) => r.column_name));
        for (const col of needed) {
          if (!found.has(col)) throw new Error(`missing column ${col}`);
        }
        const indexes = await client.query(
          `SELECT indexname FROM pg_indexes WHERE schemaname='mdata' AND tablename='driver_safety_events'`
        );
        const names = new Set(indexes.rows.map((r) => r.indexname));
        for (const idx of [
          "idx_driver_safety_events_driver",
          "idx_driver_safety_events_curp",
          "idx_driver_safety_events_cdl",
          "idx_driver_safety_events_severe",
        ]) {
          if (!names.has(idx)) throw new Error(`missing index ${idx}`);
        }
      });
    })
  );

  results.push(
    await pass("3) termination check requires reason_id", async () => {
      await runWithBypass(client, async () => {
        let failed = false;
        try {
          await client.query(
            `
              INSERT INTO mdata.driver_safety_events (
                driver_id, event_type, event_date, severity, summary, created_by_user_id, updated_by_user_id
              ) VALUES ($1,'termination',CURRENT_DATE,'severe','no reason',$2,$2)
            `,
            [historicalDriverId, ownerId]
          );
        } catch (error) {
          failed = String(error.code) === "23514";
        }
        if (!failed) throw new Error("termination check did not fail");
      });
    })
  );

  results.push(
    await pass("4) void consistency check enforced", async () => {
      await runWithBypass(client, async () => {
        let failed = false;
        try {
          await client.query(
            `
              INSERT INTO mdata.driver_safety_events (
                driver_id, event_type, event_date, severity, summary, voided_at, created_by_user_id, updated_by_user_id
              ) VALUES ($1,'incident',CURRENT_DATE,'warning','bad void',now(),$2,$2)
            `,
            [historicalDriverId, ownerId]
          );
        } catch (error) {
          failed = String(error.code) === "23514";
        }
        if (!failed) throw new Error("void consistency check did not fail");
      });
    })
  );

  results.push(
    await pass("5) RLS blocks Driver role from selecting safety events", async () => {
      await runAsUser(client, driverRoleUserId, async () => {
        const res = await client.query(`SELECT id FROM mdata.driver_safety_events`);
        if (res.rows.length > 0) throw new Error("driver role unexpectedly can see safety events");
      });
    })
  );

  results.push(
    await pass("6) RLS allows Owner insert and blocks Manager insert", async () => {
      await runAsUser(client, ownerId, async () => {
        const inserted = await client.query(
          `
            INSERT INTO mdata.driver_safety_events (
              driver_id, event_type, event_date, severity, summary, curp_snapshot, cdl_number_snapshot, cdl_state_snapshot, created_by_user_id, updated_by_user_id
            ) VALUES ($1,'incident',CURRENT_DATE,'warning',$2,$3,$4,$5,$6,$6)
            RETURNING id
          `,
          [historicalDriverId, `seed-${suffix}`, `HISTCURP${suffix.toUpperCase().padEnd(10, "X")}`.slice(0, 18), historicalCdlNumber, "TX", ownerId]
        );
        insertedEventId = String(inserted.rows[0].id);
        createdEventIds.push(insertedEventId);
      });
      await runAsUser(client, managerId, async () => {
        let denied = false;
        try {
          await client.query(
            `
              INSERT INTO mdata.driver_safety_events (
                driver_id, event_type, event_date, severity, summary, created_by_user_id, updated_by_user_id
              ) VALUES ($1,'incident',CURRENT_DATE,'warning','manager should fail',$2,$2)
            `,
            [historicalDriverId, managerId]
          );
        } catch {
          denied = true;
        }
        if (!denied) throw new Error("manager insert unexpectedly succeeded");
      });
    })
  );

  results.push(
    await pass("7) inserted event is visible by CURP snapshot query", async () => {
      await runWithBypass(client, async () => {
        const res = await client.query(`SELECT id FROM mdata.driver_safety_events WHERE curp_snapshot = $1`, [
          `HISTCURP${suffix.toUpperCase().padEnd(10, "X")}`.slice(0, 18),
        ]);
        if (res.rows.length < 1) throw new Error("no event found by CURP snapshot");
      });
    })
  );

  await startServer(process.cwd());

  results.push(
    await pass("8) check-returning by CURP returns matched events", async () => {
      const response = await api("/api/v1/mdata/drivers/check-returning", {
        method: "POST",
        body: { curp: `HISTCURP${suffix.toUpperCase().padEnd(10, "X")}`.slice(0, 18) },
        sessionId: safetySessionId,
      });
      if (response.status !== 200) throw new Error(`expected 200, got ${response.status}`);
      if (!response.payload.returning_driver) throw new Error("expected returning_driver=true");
      if ((response.payload.matched_events ?? []).length < 1) throw new Error("expected matched events");
    })
  );

  results.push(
    await pass("9) check-returning by CDL+state returns matched events", async () => {
      const response = await api("/api/v1/mdata/drivers/check-returning", {
        method: "POST",
        body: { cdl_number: historicalCdlNumber, cdl_state: "TX" },
        sessionId: managerSessionId,
      });
      if (response.status !== 200 || !response.payload.returning_driver) throw new Error("expected returning match by CDL");
    })
  );

  results.push(
    await pass("10) check-returning no match returns false", async () => {
      const response = await api("/api/v1/mdata/drivers/check-returning", {
        method: "POST",
        body: { curp: "NOMATCHCURP1234567" },
        sessionId: managerSessionId,
      });
      if (response.status !== 200) throw new Error(`expected 200, got ${response.status}`);
      if (response.payload.returning_driver) throw new Error("expected returning_driver=false");
    })
  );

  results.push(
    await pass("11) termination event without reason returns 400", async () => {
      const response = await api(`/api/v1/mdata/drivers/${activeDriverId}/safety-events`, {
        method: "POST",
        body: {
          event_type: "termination",
          event_date: new Date().toISOString().slice(0, 10),
          severity: "severe",
          summary: "termination without reason",
        },
        sessionId: ownerSessionId,
      });
      if (response.status !== 400) throw new Error(`expected 400, got ${response.status}`);
    })
  );

  let terminationEventId = "";
  results.push(
    await pass("12) termination event updates driver status to Terminated", async () => {
      const response = await api(`/api/v1/mdata/drivers/${activeDriverId}/safety-events`, {
        method: "POST",
        body: {
          event_type: "termination",
          event_date: new Date().toISOString().slice(0, 10),
          severity: "severe",
          summary: "terminated for test",
          termination_reason_id: sampleTerminationReasonId,
        },
        sessionId: ownerSessionId,
      });
      if (response.status !== 201) throw new Error(`expected 201, got ${response.status}`);
      terminationEventId = String(response.payload.event.id);
      createdEventIds.push(terminationEventId);

      const statusRes = await runWithBypass(client, () => client.query(`SELECT status FROM mdata.drivers WHERE id = $1`, [activeDriverId]));
      if (String(statusRes.rows[0].status) !== "Terminated") throw new Error("driver status not updated to Terminated");
    })
  );

  results.push(
    await pass("13) void endpoint sets fields and emits audit", async () => {
      const response = await api(`/api/v1/mdata/drivers/${activeDriverId}/safety-events/${terminationEventId}/void`, {
        method: "PATCH",
        body: { void_reason: "Entered wrong event during verification run" },
        sessionId: ownerSessionId,
      });
      if (response.status !== 200) throw new Error(`expected 200, got ${response.status}`);
      await runWithBypass(client, async () => {
        const row = await client.query(`SELECT voided_at, void_reason FROM mdata.driver_safety_events WHERE id = $1`, [terminationEventId]);
        if (!row.rows[0]?.voided_at) throw new Error("voided_at missing");
      });

      await client.query("RESET ROLE");
      await client.query("BEGIN");
      try {
        const auditRes = await client.query(
          `SELECT 1 FROM audit.audit_events WHERE event_class='mdata.driver_safety_events.voided' AND payload->>'resource_id' = $1 LIMIT 1`,
          [terminationEventId]
        );
        if (auditRes.rows.length !== 1) throw new Error("voided audit event missing");
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
    await pass("14) cannot void already voided event", async () => {
      const response = await api(`/api/v1/mdata/drivers/${activeDriverId}/safety-events/${terminationEventId}/void`, {
        method: "PATCH",
        body: { void_reason: "Second void should fail cleanly" },
        sessionId: ownerSessionId,
      });
      if (response.status !== 400) throw new Error(`expected 400, got ${response.status}`);
    })
  );

  results.push(
    await pass("15) create driver with matching CURP and no override returns 409", async () => {
      const response = await api("/api/v1/mdata/drivers", {
        method: "POST",
        body: {
          first_name: "Return",
          last_name: "NoOverride",
          phone: `+1214555${phoneSuffix}`,
          cdl_number: historicalCdlNumber,
          cdl_state: "TX",
          status: "Probation",
        },
        sessionId: ownerSessionId,
      });
      if (response.status !== 409) throw new Error(`expected 409, got ${response.status}`);
    })
  );

  let overrideCreatedDriverId = "";
  results.push(
    await pass("16) create driver with override succeeds and emits override audit", async () => {
      const response = await api("/api/v1/mdata/drivers", {
        method: "POST",
        body: {
          first_name: "Return",
          last_name: "Override",
          phone: `+1310555${phoneSuffix}`,
          cdl_number: historicalCdlNumber,
          cdl_state: "TX",
          status: "Probation",
          override_returning_warning: true,
        },
        sessionId: ownerSessionId,
      });
      if (response.status !== 201) throw new Error(`expected 201, got ${response.status}`);
      overrideCreatedDriverId = String(response.payload.id);
      createdDriverIds.push(overrideCreatedDriverId);
      await client.query("RESET ROLE");
      await client.query("BEGIN");
      try {
        const auditRes = await client.query(
          `SELECT 1 FROM audit.audit_events WHERE event_class='mdata.drivers.returning_driver_override' AND payload->>'resource_id' = $1 LIMIT 1`,
          [overrideCreatedDriverId]
        );
        if (auditRes.rows.length !== 1) throw new Error("override audit event missing");
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
    await pass("17) safety event patch only allows details/document_ids", async () => {
      const okResponse = await api(`/api/v1/mdata/drivers/${historicalDriverId}/safety-events/${insertedEventId}`, {
        method: "PATCH",
        body: { details: "Updated details from verification", document_ids: [] },
        sessionId: ownerSessionId,
      });
      if (okResponse.status !== 200) throw new Error(`expected 200 for allowed patch, got ${okResponse.status}`);

      const badResponse = await api(`/api/v1/mdata/drivers/${historicalDriverId}/safety-events/${insertedEventId}`, {
        method: "PATCH",
        body: { event_type: "termination" },
        sessionId: ownerSessionId,
      });
      if (badResponse.status !== 400) throw new Error(`expected 400 for immutable field patch, got ${badResponse.status}`);
    })
  );

  results.push(
    await pass("18) voided events still appear in returning-driver detection", async () => {
      const response = await api("/api/v1/mdata/drivers/check-returning", {
        method: "POST",
        body: { curp: `ACTVCURP${suffix.toUpperCase().padEnd(10, "Y")}`.slice(0, 18) },
        sessionId: ownerSessionId,
      });
      if (response.status !== 200) throw new Error(`expected 200, got ${response.status}`);
      const matched = response.payload.matched_events ?? [];
      if (!matched.some((event) => event.event_id === terminationEventId && event.voided === true)) {
        throw new Error("voided event not returned by detection endpoint");
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
      if (createdEventIds.length > 0) {
        await client.query(`DELETE FROM mdata.driver_safety_events WHERE id = ANY($1::uuid[])`, [createdEventIds]);
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
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    console.log("PASS: cleanup driver safety verification fixtures");
  } catch (error) {
    console.error(`FAIL: cleanup driver safety verification fixtures -> ${String(error?.message || error)}`);
    results.push(false);
  }

  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: driver safety file verification complete.");
  process.exit(0);
}

console.error("FAIL: driver safety file verification failed.");
process.exit(1);
