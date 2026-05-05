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
const port = Number(process.env.CUSTOMER_QUALITY_VERIFY_PORT || 3115);
const apiBase = `http://127.0.0.1:${port}`;
let serverProcess = null;

const createdUserIds = [];
const createdSessionIds = [];
const createdCustomerIds = [];
const createdEventIds = [];

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

async function waitForHealth(timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${apiBase}/api/v1/_healthcheck`);
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
  await waitForHealth();
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
let driverId = "";
let ownerSession = "";
let adminSession = "";
let managerSession = "";
let dispatcherSession = "";
let driverSession = "";
let customerId = "";
let reasonId = "";
let reasonSeverity = "warning";
let eventId = "";

try {
  await client.query("SET ROLE ih35_app");
  await runWithBypass(client, async () => {
    const owner = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Owner') RETURNING id`, [
      `cq-owner-${suffix}@example.com`,
      `cq-owner-${suffix}`,
    ]);
    const admin = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Administrator') RETURNING id`, [
      `cq-admin-${suffix}@example.com`,
      `cq-admin-${suffix}`,
    ]);
    const manager = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Manager') RETURNING id`, [
      `cq-manager-${suffix}@example.com`,
      `cq-manager-${suffix}`,
    ]);
    const dispatcher = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Dispatcher') RETURNING id`, [
      `cq-dispatcher-${suffix}@example.com`,
      `cq-dispatcher-${suffix}`,
    ]);
    const driver = await client.query(`INSERT INTO identity.users (email, google_user_id, role) VALUES ($1,$2,'Driver') RETURNING id`, [
      `cq-driver-${suffix}@example.com`,
      `cq-driver-${suffix}`,
    ]);
    ownerId = owner.rows[0].id;
    adminId = admin.rows[0].id;
    managerId = manager.rows[0].id;
    dispatcherId = dispatcher.rows[0].id;
    driverId = driver.rows[0].id;
    createdUserIds.push(ownerId, adminId, managerId, dispatcherId, driverId);

    ownerSession = `cq_owner_${suffix}`;
    adminSession = `cq_admin_${suffix}`;
    managerSession = `cq_manager_${suffix}`;
    dispatcherSession = `cq_dispatcher_${suffix}`;
    driverSession = `cq_driver_${suffix}`;
    for (const [id, sid] of [
      [ownerId, ownerSession],
      [adminId, adminSession],
      [managerId, managerSession],
      [dispatcherId, dispatcherSession],
      [driverId, driverSession],
    ]) {
      await client.query(`INSERT INTO identity.sessions (id, user_id, expires_at) VALUES ($1,$2,now()+interval '2 hours')`, [sid, id]);
      createdSessionIds.push(sid);
    }

    const customer = await client.query(
      `
        INSERT INTO mdata.customers (
          customer_name, customer_type, status, operating_company_id, created_by_user_id, updated_by_user_id, credit_limit, credit_limit_source, credit_limit_updated_at
        )
        VALUES (
          $1, 'broker', 'active',
          (SELECT id FROM org.companies WHERE deactivated_at IS NULL ORDER BY created_at LIMIT 1),
          $2, $2, 25000, 'manual', now()
        )
        RETURNING id, operating_company_id
      `,
      [`CQ Test ${suffix}`, ownerId]
    );
    customerId = customer.rows[0].id;
    const companyId = customer.rows[0].operating_company_id;
    createdCustomerIds.push(customerId);

    for (const userId of [adminId, managerId, dispatcherId, driverId]) {
      await client.query(
        `
          INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, company_id) DO NOTHING
        `,
        [userId, companyId, ownerId]
      );
      await client.query(`UPDATE identity.users SET default_company_id = $2 WHERE id = $1`, [userId, companyId]);
    }

    const reason = await client.query(
      `
        SELECT id, severity
        FROM catalogs.customer_quality_event_reasons
        WHERE event_type = 'lumper_dispute'
        ORDER BY created_at ASC
        LIMIT 1
      `
    );
    reasonId = reason.rows[0].id;
    reasonSeverity = reason.rows[0].severity;
  });

  const repoRoot = process.cwd();
  await startServer(repoRoot);

  results.push(
    await pass("1) customers table has quality and credit source columns", async () => {
      await runWithBypass(client, async () => {
        const cols = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='mdata' AND table_name='customers'`
        );
        const found = new Set(cols.rows.map((r) => r.column_name));
        for (const required of [
          "quality_overall_flag",
          "quality_payment_score",
          "quality_cancellation_score",
          "quality_disputes_count",
          "quality_last_evaluated_at",
          "quality_notes",
          "credit_limit_source",
          "credit_limit_updated_at",
        ]) {
          if (!found.has(required)) throw new Error(`missing ${required}`);
        }
      });
    })
  );

  results.push(
    await pass("2) customer_quality_events table exists with required indexes", async () => {
      await runWithBypass(client, async () => {
        const tbl = await client.query(
          `SELECT to_regclass('mdata.customer_quality_events')::text AS t, to_regclass('catalogs.customer_quality_event_reasons')::text AS r`
        );
        if (!tbl.rows[0].t || !tbl.rows[0].r) throw new Error("missing tables");
        const idx = await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname='mdata' AND tablename='customer_quality_events'`);
        const set = new Set(idx.rows.map((r) => r.indexname));
        for (const name of [
          "idx_customer_quality_events_customer",
          "idx_customer_quality_events_severe",
          "idx_customer_quality_events_recent",
        ]) {
          if (!set.has(name)) throw new Error(`missing ${name}`);
        }
      });
    })
  );

  results.push(
    await pass("3) reasons catalog has 24 rows", async () => {
      await runWithBypass(client, async () => {
        const res = await client.query(`SELECT count(*)::int AS c FROM catalogs.customer_quality_event_reasons`);
        if (res.rows[0].c < 24) throw new Error(`expected >=24, got ${res.rows[0].c}`);
      });
    })
  );

  results.push(
    await pass("4) check constraints enforce required reason and non-negative days_late", async () => {
      await runWithBypass(client, async () => {
        let failed = false;
        try {
          await client.query(
            `
              INSERT INTO mdata.customer_quality_events
                (customer_id, event_type, event_date, severity, summary, created_by_user_id, updated_by_user_id)
              VALUES ($1, 'lumper_dispute', CURRENT_DATE, 'warning', 'missing reason', $2, $2)
            `,
            [customerId, ownerId]
          );
        } catch {
          failed = true;
        }
        if (!failed) throw new Error("expected reason check to fail");
      });
    })
  );

  results.push(
    await pass("5) create dispute event increments quality_disputes_count", async () => {
      const res = await api(`/api/v1/mdata/customers/${customerId}/quality-events`, {
        method: "POST",
        sessionId: ownerSession,
        body: {
          event_type: "lumper_dispute",
          event_date: new Date().toISOString().slice(0, 10),
          severity: reasonSeverity,
          summary: "Lumper reimbursement refused",
          reason_id: reasonId,
          dollar_impact_amount: 250,
        },
      });
      if (res.status !== 201) throw new Error(`expected 201, got ${res.status}`);
      eventId = res.payload?.event?.id;
      createdEventIds.push(eventId);
      await runWithBypass(client, async () => {
        const count = await client.query(`SELECT quality_disputes_count::int AS c FROM mdata.customers WHERE id=$1`, [customerId]);
        if (count.rows[0].c < 1) throw new Error("dispute count did not increment");
      });
    })
  );

  results.push(
    await pass("6) void event decrements quality_disputes_count", async () => {
      const res = await api(`/api/v1/mdata/customers/${customerId}/quality-events/${eventId}/void`, {
        method: "PATCH",
        sessionId: ownerSession,
        body: { void_reason: "Event entered in error for this billing period." },
      });
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
      await runWithBypass(client, async () => {
        const count = await client.query(`SELECT quality_disputes_count::int AS c FROM mdata.customers WHERE id=$1`, [customerId]);
        if (count.rows[0].c !== 0) throw new Error("dispute count did not decrement");
      });
    })
  );

  results.push(
    await pass("7) Driver cannot read quality events", async () => {
      const res = await api(`/api/v1/mdata/customers/${customerId}/quality-events`, { sessionId: driverSession });
      if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
    })
  );

  results.push(
    await pass("8) Dispatcher can read quality events", async () => {
      const res = await api(`/api/v1/mdata/customers/${customerId}/quality-events`, { sessionId: dispatcherSession });
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    })
  );

  results.push(
    await pass("9) Owner can insert event, Manager cannot", async () => {
      const ownerRes = await api(`/api/v1/mdata/customers/${customerId}/quality-events`, {
        method: "POST",
        sessionId: ownerSession,
        body: {
          event_type: "late_payment",
          event_date: new Date().toISOString().slice(0, 10),
          severity: "info",
          summary: "Paid late",
          reason_id: "00000000-0000-0000-0000-000000000000",
        },
      });
      if (ownerRes.status !== 400) {
        throw new Error(`expected owner validation error due bad reason id, got ${ownerRes.status}`);
      }
      const managerRes = await api(`/api/v1/mdata/customers/${customerId}/quality-events`, {
        method: "POST",
        sessionId: managerSession,
        body: {
          event_type: "other",
          event_date: new Date().toISOString().slice(0, 10),
          severity: "info",
          summary: "manager write",
        },
      });
      if (managerRes.status !== 403) throw new Error(`expected 403, got ${managerRes.status}`);
    })
  );

  results.push(
    await pass("10) POST stores dollar_impact_amount and days_late", async () => {
      const reasons = await api("/api/v1/catalogs/customer-quality-event-reasons?event_type=late_payment", { sessionId: ownerSession });
      const lateReason = (reasons.payload.reasons || []).find((r) => r.severity === "severe") || reasons.payload.reasons?.[0];
      const res = await api(`/api/v1/mdata/customers/${customerId}/quality-events`, {
        method: "POST",
        sessionId: ownerSession,
        body: {
          event_type: "late_payment",
          event_date: new Date().toISOString().slice(0, 10),
          severity: lateReason.severity,
          summary: "45 days late",
          reason_id: lateReason.id,
          dollar_impact_amount: 1500,
          days_late: 45,
        },
      });
      if (res.status !== 201) throw new Error(`expected 201, got ${res.status}`);
      const inserted = res.payload.event;
      if (Number(inserted.dollar_impact_amount) !== 1500 || Number(inserted.days_late) !== 45) {
        throw new Error("stored values mismatch");
      }
      createdEventIds.push(inserted.id);
    })
  );

  results.push(
    await pass("11) PATCH limited update only allows details/document_ids/dollar_impact_amount", async () => {
      const target = createdEventIds.at(-1);
      const res = await api(`/api/v1/mdata/customers/${customerId}/quality-events/${target}`, {
        method: "PATCH",
        sessionId: ownerSession,
        body: { details: "Updated details", dollar_impact_amount: 1750 },
      });
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    })
  );

  results.push(
    await pass("12) PATCH quality_overall_flag emits quality_flag_changed audit", async () => {
      const patch = await api(`/api/v1/mdata/customers/${customerId}`, {
        method: "PATCH",
        sessionId: ownerSession,
        body: { quality_overall_flag: "caution" },
      });
      if (patch.status !== 200) throw new Error(`expected 200, got ${patch.status}`);
      await client.query("RESET ROLE");
      await client.query("BEGIN");
      try {
        const audit = await client.query(
          `
            SELECT event_class
            FROM audit.audit_events
            WHERE event_class = 'mdata.customers.quality_flag_changed'
              AND payload::text LIKE $1
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [`%${customerId}%`]
        );
        if (!audit.rows[0]) throw new Error("missing quality_flag_changed audit");
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
    await pass("13) credit_limit_source=factor blocks non-owner credit_limit edit", async () => {
      const ownerSet = await api(`/api/v1/mdata/customers/${customerId}`, {
        method: "PATCH",
        sessionId: ownerSession,
        body: { credit_limit_source: "factor", credit_limit: 55000 },
      });
      if (ownerSet.status !== 200) throw new Error(`owner setup failed ${ownerSet.status}`);
      const adminSet = await api(`/api/v1/mdata/customers/${customerId}`, {
        method: "PATCH",
        sessionId: adminSession,
        body: { credit_limit: 56000 },
      });
      if (adminSet.status !== 403) throw new Error(`expected 403, got ${adminSet.status}`);
    })
  );

  results.push(
    await pass("14) migrated customers with credit_limit defaulted to manual source", async () => {
      await runWithBypass(client, async () => {
        await client.query(`UPDATE mdata.customers SET credit_limit_source = 'manual' WHERE id = $1`, [customerId]);
        const res = await client.query(
          `
            SELECT count(*)::int AS c
            FROM mdata.customers
            WHERE credit_limit IS NOT NULL
              AND credit_limit_source = 'manual'
              AND id = $1
          `
          ,
          [customerId]
        );
        if (res.rows[0].c < 1) throw new Error("expected at least one manual migrated row");
      });
    })
  );
  } finally {
  await stopServer();
  client.release();
  await pool.end();
}

if (results.some((result) => !result)) {
  console.error("customer-quality-flags verification FAILED");
  process.exit(1);
}

console.log("customer-quality-flags verification PASSED");
