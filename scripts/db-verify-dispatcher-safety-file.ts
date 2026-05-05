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
const port = Number(process.env.DISPATCHER_SAFETY_VERIFY_PORT || 3114);
const apiBase = `http://127.0.0.1:${port}`;

const createdUserIds = [];
const createdSessionIds = [];
const createdDriverIds = [];
const createdEventIds = [];
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
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/v1/_healthcheck`);
      if (res.ok) return;
    } catch {}
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

async function api(path, { method = "GET", body, sessionId }) {
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
const results = [];

let ownerId = "";
let adminId = "";
let managerId = "";
let dispatcherId = "";
let ownerSessionId = "";
let adminSessionId = "";
let managerSessionId = "";
let insertedEventId = "";
let insertedCostEventId = "";
let reasonId = "";
let reasonSeverity = "warning";
let reasonEventType = "customer_complaint";
let historicalEmail = `dispatch-rehire-${suffix}@example.com`;
let driverUserId = "";

try {
  await client.query("SET ROLE ih35_app");
  await runWithBypass(client, async () => {
    const ownerRes = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Owner') RETURNING id`, [
      `dispatcher-owner-${suffix}@example.com`,
      `dispatcher-owner-${suffix}`,
    ]);
    const adminRes = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Administrator') RETURNING id`, [
      `dispatcher-admin-${suffix}@example.com`,
      `dispatcher-admin-${suffix}`,
    ]);
    const managerRes = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Manager') RETURNING id`, [
      `dispatcher-manager-${suffix}@example.com`,
      `dispatcher-manager-${suffix}`,
    ]);
    const dispatcherRes = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Dispatcher') RETURNING id`, [
      `dispatcher-current-${suffix}@example.com`,
      `dispatcher-worker-${suffix}`,
    ]);
    const driverUserRes = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Dispatcher') RETURNING id`, [
      `driver-linked-${suffix}@example.com`,
      `driver-linked-${suffix}`,
    ]);

    ownerId = String(ownerRes.rows[0].id);
    adminId = String(adminRes.rows[0].id);
    managerId = String(managerRes.rows[0].id);
    dispatcherId = String(dispatcherRes.rows[0].id);
    driverUserId = String(driverUserRes.rows[0].id);
    createdUserIds.push(ownerId, adminId, managerId, dispatcherId, driverUserId);

    ownerSessionId = `dispatcher_owner_${suffix}`;
    adminSessionId = `dispatcher_admin_${suffix}`;
    managerSessionId = `dispatcher_manager_${suffix}`;
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1,$2,now()+interval '2 hours')`, [ownerSessionId, ownerId]);
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1,$2,now()+interval '2 hours')`, [adminSessionId, adminId]);
    await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1,$2,now()+interval '2 hours')`, [managerSessionId, managerId]);
    createdSessionIds.push(ownerSessionId, adminSessionId, managerSessionId);

    const linkedDriverRes = await client.query(
      `
        INSERT INTO mdata.drivers (identity_user_id, first_name, last_name, phone, status, created_by_user_id, updated_by_user_id)
        VALUES ($1,'Linked','Driver',$2,'Active',$3,$3)
        RETURNING id
      `,
      [driverUserId, `+1713555${suffix.replace(/[^0-9]/g, "").padEnd(4, "7").slice(0, 4)}`, ownerId]
    );
    createdDriverIds.push(String(linkedDriverRes.rows[0].id));

    const reasonRes = await client.query(
      `
        SELECT id, severity, event_type
        FROM catalogs.dispatcher_error_reasons
        WHERE event_type NOT IN ('commendation', 'other')
        ORDER BY created_at ASC
        LIMIT 1
      `
    );
    reasonId = String(reasonRes.rows[0].id);
    reasonSeverity = String(reasonRes.rows[0].severity);
    reasonEventType = String(reasonRes.rows[0].event_type);
  });

  results.push(
    await pass("1) catalogs.dispatcher_error_reasons has 25 starter rows", async () => {
      await runWithBypass(client, async () => {
        const res = await client.query(`SELECT count(*)::int AS cnt FROM catalogs.dispatcher_error_reasons`);
        if (Number(res.rows[0].cnt) < 25) throw new Error(`expected at least 25 rows, got ${res.rows[0].cnt}`);
      });
    })
  );

  results.push(
    await pass("2) mdata.dispatcher_safety_events has required columns + 4 indexes", async () => {
      await runWithBypass(client, async () => {
        const cols = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='mdata' AND table_name='dispatcher_safety_events'`
        );
        const requiredCols = [
          "dispatcher_user_id",
          "event_type",
          "event_date",
          "severity",
          "summary",
          "error_reason_id",
          "cost_amount",
          "cost_currency",
          "cost_recovered_amount",
          "cost_recovery_status",
          "dispatcher_email_snapshot",
          "void_reason",
        ];
        const found = new Set(cols.rows.map((row) => row.column_name));
        for (const col of requiredCols) {
          if (!found.has(col)) throw new Error(`missing column ${col}`);
        }
        const indexes = await client.query(
          `SELECT indexname FROM pg_indexes WHERE schemaname='mdata' AND tablename='dispatcher_safety_events'`
        );
        const indexSet = new Set(indexes.rows.map((row) => row.indexname));
        for (const idx of [
          "idx_dispatcher_safety_events_user",
          "idx_dispatcher_safety_events_email",
          "idx_dispatcher_safety_events_severe",
          "idx_dispatcher_safety_events_cost_pending",
        ]) {
          if (!indexSet.has(idx)) throw new Error(`missing index ${idx}`);
        }
      });
    })
  );

  results.push(
    await pass("3) CHECK enforces error_reason_id for non-commendation/other", async () => {
      await runWithBypass(client, async () => {
        let failed = false;
        try {
          await client.query(
            `
              INSERT INTO mdata.dispatcher_safety_events (
                dispatcher_user_id, event_type, event_date, severity, summary, created_by_user_id, updated_by_user_id
              ) VALUES ($1,$2,CURRENT_DATE,'warning','missing reason',$3,$3)
            `,
            [dispatcherId, reasonEventType, ownerId]
          );
        } catch (error) {
          failed = String(error.code) === "23514";
        }
        if (!failed) throw new Error("expected CHECK violation for missing error_reason_id");
      });
    })
  );

  results.push(
    await pass("4) CHECK enforces cost_recovery_consistency", async () => {
      await runWithBypass(client, async () => {
        let failed = false;
        try {
          await client.query(
            `
              INSERT INTO mdata.dispatcher_safety_events (
                dispatcher_user_id, event_type, event_date, severity, summary, error_reason_id, cost_recovery_status, created_by_user_id, updated_by_user_id
              ) VALUES ($1,$2,CURRENT_DATE,$3,'bad cost consistency',$4,'pending',$5,$5)
            `,
            [dispatcherId, reasonEventType, reasonSeverity, reasonId, ownerId]
          );
        } catch (error) {
          failed = String(error.code) === "23514";
        }
        if (!failed) throw new Error("expected CHECK violation for cost_recovery_consistency");
      });
    })
  );

  results.push(
    await pass("5) CHECK enforces void consistency", async () => {
      await runWithBypass(client, async () => {
        let failed = false;
        try {
          await client.query(
            `
              INSERT INTO mdata.dispatcher_safety_events (
                dispatcher_user_id, event_type, event_date, severity, summary, error_reason_id, voided_at, created_by_user_id, updated_by_user_id
              ) VALUES ($1,$2,CURRENT_DATE,$3,'bad void consistency',$4,now(),$5,$5)
            `,
            [dispatcherId, reasonEventType, reasonSeverity, reasonId, ownerId]
          );
        } catch (error) {
          failed = String(error.code) === "23514";
        }
        if (!failed) throw new Error("expected CHECK violation for void consistency");
      });
    })
  );

  results.push(
    await pass("6) RLS blocks Manager from selecting dispatcher safety events", async () => {
      await runAsUser(client, managerId, async () => {
        const res = await client.query(`SELECT id FROM mdata.dispatcher_safety_events`);
        if (res.rows.length > 0) throw new Error("manager unexpectedly can read dispatcher safety events");
      });
    })
  );

  results.push(
    await pass("7) RLS allows Owner insert and blocks Administrator insert", async () => {
      await runAsUser(client, ownerId, async () => {
        const res = await client.query(
          `
            INSERT INTO mdata.dispatcher_safety_events (
              dispatcher_user_id, event_type, event_date, severity, summary, error_reason_id, dispatcher_email_snapshot, created_by_user_id, updated_by_user_id
            ) VALUES ($1,$2,CURRENT_DATE,$3,'owner seed event',$4,$5,$6,$6)
            RETURNING id
          `,
          [dispatcherId, reasonEventType, reasonSeverity, reasonId, historicalEmail.toLowerCase(), ownerId]
        );
        insertedEventId = String(res.rows[0].id);
        createdEventIds.push(insertedEventId);
      });

      await runAsUser(client, adminId, async () => {
        let denied = false;
        try {
          await client.query(
            `
              INSERT INTO mdata.dispatcher_safety_events (
                dispatcher_user_id, event_type, event_date, severity, summary, error_reason_id, created_by_user_id, updated_by_user_id
              ) VALUES ($1,$2,CURRENT_DATE,$3,'admin should fail',$4,$5,$5)
            `,
            [dispatcherId, reasonEventType, reasonSeverity, reasonId, adminId]
          );
        } catch {
          denied = true;
        }
        if (!denied) throw new Error("administrator insert unexpectedly succeeded");
      });
    })
  );

  await startServer(process.cwd());

  results.push(
    await pass("8) POST event for Dispatcher user succeeds", async () => {
      const res = await api(`/api/v1/identity/users/${dispatcherId}/safety-events`, {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          event_type: reasonEventType,
          event_date: new Date().toISOString().slice(0, 10),
          severity: reasonSeverity,
          summary: "Dispatcher event verify create",
          error_reason_id: reasonId,
        },
      });
      if (res.status !== 201) throw new Error(`expected 201, got ${res.status}`);
      createdEventIds.push(String(res.payload.event.id));
    })
  );

  results.push(
    await pass("9) POST with cost_amount + pending recovery stores fields", async () => {
      const res = await api(`/api/v1/identity/users/${dispatcherId}/safety-events`, {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          event_type: reasonEventType,
          event_date: new Date().toISOString().slice(0, 10),
          severity: reasonSeverity,
          summary: "Dispatcher event with cost",
          error_reason_id: reasonId,
          cost_amount: 500,
          cost_currency: "USD",
          cost_recovery_status: "pending",
        },
      });
      if (res.status !== 201) throw new Error(`expected 201, got ${res.status}`);
      insertedCostEventId = String(res.payload.event.id);
      createdEventIds.push(insertedCostEventId);
      if (Number(res.payload.event.cost_amount) !== 500) throw new Error("cost_amount not persisted");
      if (res.payload.event.cost_recovery_status !== "pending") throw new Error("cost_recovery_status not persisted");
    })
  );

  results.push(
    await pass("10) POST with cost_amount but no recovery_status fails", async () => {
      const res = await api(`/api/v1/identity/users/${dispatcherId}/safety-events`, {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          event_type: reasonEventType,
          event_date: new Date().toISOString().slice(0, 10),
          severity: reasonSeverity,
          summary: "Bad cost event",
          error_reason_id: reasonId,
          cost_amount: 100,
        },
      });
      if (res.status !== 500) throw new Error(`expected DB CHECK fail 500, got ${res.status}`);
    })
  );

  results.push(
    await pass("11) returning-dispatcher check detects prior events case-insensitively", async () => {
      const res = await api("/api/v1/identity/users/check-returning-dispatcher", {
        method: "POST",
        sessionId: adminSessionId,
        body: { email: historicalEmail.toUpperCase() },
      });
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
      if (!res.payload.returning_dispatcher) throw new Error("expected returning_dispatcher=true");
      if ((res.payload.matched_events ?? []).length < 1) throw new Error("expected matched events");
    })
  );

  let createdWithoutOverrideId = "";
  results.push(
    await pass("12) creating user with matching email and no override returns 409", async () => {
      const res = await api("/api/v1/identity/users", {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          email: historicalEmail,
          role: "Dispatcher",
        },
      });
      if (res.status !== 409) throw new Error(`expected 409, got ${res.status}`);
      if (res.payload.error !== "returning_dispatcher_detected") throw new Error("expected returning_dispatcher_detected");
      createdWithoutOverrideId = String(res.payload.id || "");
    })
  );

  let overrideUserId = "";
  results.push(
    await pass("13) creating user with override succeeds and emits override audit", async () => {
      const res = await api("/api/v1/identity/users", {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          email: historicalEmail,
          role: "Dispatcher",
          override_returning_warning: true,
        },
      });
      if (res.status !== 201) throw new Error(`expected 201, got ${res.status}`);
      overrideUserId = String(res.payload.id);
      createdUserIds.push(overrideUserId);

      await client.query("RESET ROLE");
      await client.query("BEGIN");
      try {
        const auditRes = await client.query(
          `SELECT 1 FROM audit.audit_events WHERE event_class='mdata.dispatcher_safety_events.returning_dispatcher_override' AND payload->>'resource_id' = $1 LIMIT 1`,
          [overrideUserId]
        );
        if (auditRes.rows.length !== 1) throw new Error("missing returning_dispatcher_override audit event");
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
    await pass("14) PATCH /void sets void fields and emits audit", async () => {
      const res = await api(`/api/v1/identity/users/${dispatcherId}/safety-events/${insertedCostEventId}/void`, {
        method: "PATCH",
        sessionId: ownerSessionId,
        body: { void_reason: "Void for verify script reason text" },
      });
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);

      await client.query("RESET ROLE");
      await client.query("BEGIN");
      try {
        const rowRes = await client.query(`SELECT voided_at, void_reason FROM mdata.dispatcher_safety_events WHERE id = $1`, [insertedCostEventId]);
        if (!rowRes.rows[0]?.voided_at) throw new Error("voided_at not set");
        const auditRes = await client.query(
          `SELECT 1 FROM audit.audit_events WHERE event_class='mdata.dispatcher_safety_events.voided' AND payload->>'resource_id' = $1 LIMIT 1`,
          [insertedCostEventId]
        );
        if (auditRes.rows.length !== 1) throw new Error("missing voided audit event");
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
    await pass("15) PATCH limited update accepts allowed fields and rejects immutable fields", async () => {
      const ok = await api(`/api/v1/identity/users/${dispatcherId}/safety-events/${insertedEventId}`, {
        method: "PATCH",
        sessionId: ownerSessionId,
        body: {
          details: "Updated detail for verification",
          document_ids: [],
        },
      });
      if (ok.status !== 200) throw new Error(`expected 200, got ${ok.status}`);

      const bad = await api(`/api/v1/identity/users/${dispatcherId}/safety-events/${insertedEventId}`, {
        method: "PATCH",
        sessionId: ownerSessionId,
        body: {
          event_type: "other",
        },
      });
      if (bad.status !== 400) throw new Error(`expected 400 on immutable update, got ${bad.status}`);
    })
  );

  results.push(
    await pass("16) cannot create event for Owner role user", async () => {
      const res = await api(`/api/v1/identity/users/${ownerId}/safety-events`, {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          event_type: reasonEventType,
          event_date: new Date().toISOString().slice(0, 10),
          severity: reasonSeverity,
          summary: "owner should not be trackable",
          error_reason_id: reasonId,
        },
      });
      if (res.status !== 400 || res.payload.error !== "cannot_track_owner") {
        throw new Error(`expected 400 cannot_track_owner, got ${res.status} ${res.payload.error}`);
      }
    })
  );

  results.push(
    await pass("17) cannot create event for user linked to mdata.drivers", async () => {
      const res = await api(`/api/v1/identity/users/${driverUserId}/safety-events`, {
        method: "POST",
        sessionId: ownerSessionId,
        body: {
          event_type: reasonEventType,
          event_date: new Date().toISOString().slice(0, 10),
          severity: reasonSeverity,
          summary: "driver-linked user should fail",
          error_reason_id: reasonId,
        },
      });
      if (res.status !== 400 || res.payload.error !== "user_is_driver_use_driver_safety") {
        throw new Error(`expected 400 user_is_driver_use_driver_safety, got ${res.status} ${res.payload.error}`);
      }
    })
  );

  results.push(
    await pass("18) cleanup fixtures marker", async () => {
      if (!ownerId || !dispatcherId) throw new Error("fixture IDs missing");
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
        await client.query(`DELETE FROM mdata.dispatcher_safety_events WHERE id = ANY($1::uuid[])`, [createdEventIds]);
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
    console.log("PASS: cleanup dispatcher safety fixtures");
  } catch (error) {
    console.error(`FAIL: cleanup dispatcher safety fixtures -> ${String(error?.message || error)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: dispatcher safety file verification complete.");
  process.exit(0);
}

console.error("FAIL: dispatcher safety file verification failed.");
process.exit(1);
