import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");

const POLL_INTERVAL_MS = 15_000;
const configuredTimeoutMs = Number(process.env.E2E_FORENSIC_TIMEOUT_MS ?? 0);
const TIMEOUT_MS = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runTsxEval(script, extraEnv = {}, timeoutMs = 120_000) {
  const out = spawnSync("npx", ["tsx", "--eval", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    timeout: timeoutMs,
  });
  return out;
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function parseLastJsonLineObject(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const v = safeJsonParse(lines[i], null);
    if (v && typeof v === "object") return v;
  }
  return null;
}

function assertOk(condition, message, context = {}) {
  if (!condition) {
    const err = new Error(message);
    err.context = context;
    throw err;
  }
}

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL;
assertOk(connectionString, "DATABASE_URL or DATABASE_DIRECT_URL is required");

const client = new pg.Client(buildPgClientConfig(connectionString));

async function resolveCompanyAndActor() {
  const explicitCompany = process.env.TRK_UUID || process.env.OPERATING_COMPANY_ID || null;
  let connRows = [];

  if (explicitCompany) {
    const explicitRes = await client.query(
      `
        SELECT
          operating_company_id::text AS operating_company_id,
          realm_id,
          authorized_by_user_id::text AS authorized_by_user_id,
          authorized_at,
          last_refreshed_at
        FROM integrations.qbo_connections
        WHERE operating_company_id = $1::uuid
          AND revoked_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [explicitCompany]
    );
    connRows = explicitRes.rows;
  } else {
    const anyRes = await client.query(
      `
        SELECT
          operating_company_id::text AS operating_company_id,
          realm_id,
          authorized_by_user_id::text AS authorized_by_user_id,
          authorized_at,
          last_refreshed_at
        FROM integrations.qbo_connections
        WHERE revoked_at IS NULL
        ORDER BY COALESCE(last_used_at, updated_at, created_at) DESC
      `
    );
    connRows = anyRes.rows;
  }

  assertOk(connRows.length > 0, "No active QBO connection row found. STOP: QBO not connected.");

  const preflightFailures = [];
  for (const connRow of connRows) {
    let actorUserId = connRow.authorized_by_user_id ?? null;
    if (!actorUserId) {
      const ownerRes = await client.query(
        `
          SELECT u.id::text AS user_id
          FROM identity.users u
          JOIN org.user_company_access uca ON uca.user_id = u.id
          WHERE uca.company_id = $1::uuid
            AND u.role = 'Owner'
          ORDER BY u.created_at ASC NULLS LAST, u.id ASC
          LIMIT 1
        `,
        [connRow.operating_company_id]
      );
      actorUserId = ownerRes.rows[0]?.user_id ?? null;
    }

    if (!actorUserId) continue;

    const preflightScript = `
import dotenv from "dotenv";
dotenv.config();
if (!process.env.DATABASE_URL && process.env.DATABASE_DIRECT_URL) process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL;
(async () => {
  const { qboCompanyContext, qboQuery } = await import("./apps/backend/src/integrations/qbo/qbo-client.ts");
  const ctx = await qboCompanyContext("${connRow.operating_company_id}");
  await qboQuery(ctx, "SELECT * FROM CompanyInfo");
  console.log(JSON.stringify({ ok: true, realmId: ctx.realmId }));
})();
`;
    const preflight = runTsxEval(preflightScript);
    if (preflight.status === 0) {
      return {
        operatingCompanyId: connRow.operating_company_id,
        realmId: connRow.realm_id,
        actorUserId,
        qboConnectionEvidence: connRow,
      };
    }
    preflightFailures.push({
      operating_company_id: connRow.operating_company_id,
      realm_id: connRow.realm_id,
      status: preflight.status,
      stdout_tail: String(preflight.stdout ?? "").slice(-1000),
      stderr_tail: String(preflight.stderr ?? "").slice(-2000),
    });
  }

  const err = new Error("No active QBO connection passed CompanyInfo preflight. STOP: QBO not connected/authorized.");
  err.context = { preflight_failures: preflightFailures };
  throw err;
}

function buildRunnerScript() {
  return `
import dotenv from "dotenv";
dotenv.config();
if (!process.env.DATABASE_URL && process.env.DATABASE_DIRECT_URL) process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL;
(async () => {
  const { runForensicImport } = await import("./apps/backend/src/integrations/qbo/forensic-import.service.ts");
  const actor = process.env.E2E_ACTOR_USER_ID;
  const batchId = process.env.E2E_BATCH_ID;
  const operatingCompanyId = process.env.E2E_OPERATING_COMPANY_ID;
  const sinceDate = process.env.E2E_SINCE_DATE || "2015-01-01";
  const attachmentsSinceDate = process.env.E2E_ATTACHMENTS_SINCE_DATE || "2021-01-01";
  try {
    const result = await runForensicImport(actor, { batchId, operatingCompanyId, sinceDate, attachmentsSinceDate });
    console.log(JSON.stringify({ ok: true, result }));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }));
    process.exit(1);
  }
})();
`;
}

function buildStartBatchScript() {
  return `
import dotenv from "dotenv";
dotenv.config();
if (!process.env.DATABASE_URL && process.env.DATABASE_DIRECT_URL) process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL;
(async () => {
  const { qboCompanyContext, qboQuery } = await import("./apps/backend/src/integrations/qbo/qbo-client.ts");
  const { startImportBatch } = await import("./apps/backend/src/integrations/qbo/forensic-import.service.ts");
  const actor = process.env.E2E_ACTOR_USER_ID;
  const company = process.env.E2E_OPERATING_COMPANY_ID;
  const sinceDate = process.env.E2E_SINCE_DATE || "2015-01-01";
  const ctx = await qboCompanyContext(company);
  await qboQuery(ctx, "SELECT * FROM CompanyInfo");
  const batch = await startImportBatch(actor, company, sinceDate);
  console.log(JSON.stringify({ ok: true, batchId: batch.batchId, realmId: ctx.realmId }));
})();
`;
}

async function getBatchRow(batchId) {
  const res = await client.query(
    `
      SELECT
        id::text,
        status,
        started_at,
        completed_at,
        entities_imported,
        transactions_imported,
        attachments_imported,
        errors_count,
        last_error_message
      FROM qbo_archive.import_batches
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [batchId]
  );
  return res.rows[0] ?? null;
}

async function getAuditEvents(batchId) {
  const res = await client.query(
    `
      SELECT event_type, occurred_at
      FROM qbo_archive.import_batch_audit_log
      WHERE batch_id = $1::uuid
      ORDER BY occurred_at ASC
    `,
    [batchId]
  );
  return res.rows;
}

async function getAnomalySummary(batchId) {
  const checkQueue = await client.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'qbo_archive'
        AND table_name = 'anomaly_review_queue'
      LIMIT 1
    `
  );

  if (checkQueue.rows.length > 0) {
    const byType = await client.query(
      `
        SELECT anomaly_type, COUNT(*)::int AS count
        FROM qbo_archive.anomaly_review_queue
        WHERE batch_id = $1::uuid
        GROUP BY anomaly_type
        ORDER BY count DESC, anomaly_type ASC
      `,
      [batchId]
    );
    return byType.rows;
  }

  const byType = await client.query(
    `
      SELECT anomaly_type, COUNT(*)::int AS count
      FROM qbo_archive.forensic_anomalies
      WHERE snapshot_batch_id = $1::uuid
      GROUP BY anomaly_type
      ORDER BY count DESC, anomaly_type ASC
    `,
    [batchId]
  );
  return byType.rows;
}

function derivePhaseStatus(events, anomalyCount, completed) {
  const eventSet = new Set(events.map((row) => String(row.event_type)));
  if (completed) return "completed";
  if (eventSet.has("transactions_phase_started") && anomalyCount > 0) return "detecting_anomalies";
  if (eventSet.has("transactions_phase_completed")) return "transactions_complete";
  if (eventSet.has("transactions_phase_started")) return "fetching_transactions";
  if (eventSet.has("preflight_qbo_check_passed")) return "company_info_complete";
  if (eventSet.has("batch_started") || eventSet.has("preflight_qbo_check_started")) return "fetching_company_info";
  return "pending";
}

async function main() {
  const startedAtMs = Date.now();
  await client.connect();

  const summary = {
    operating_company_id: null,
    batch_id: null,
    phase_progression: [],
    qbo_connection: null,
    verification: {},
    pass: false,
  };

  let runnerStdout = "";
  let runnerStderr = "";

  try {
    const resolved = await resolveCompanyAndActor();
    summary.operating_company_id = resolved.operatingCompanyId;
    summary.qbo_connection = resolved.qboConnectionEvidence;

    console.log("[STEP 1] QBO connection found:");
    console.log(JSON.stringify(resolved.qboConnectionEvidence, null, 2));

    const sinceDate = process.env.E2E_SINCE_DATE || "2015-01-01";
    const preflightStart = runTsxEval(buildStartBatchScript(), {
      E2E_ACTOR_USER_ID: resolved.actorUserId,
      E2E_OPERATING_COMPANY_ID: resolved.operatingCompanyId,
      E2E_SINCE_DATE: sinceDate,
    });

    assertOk(preflightStart.status === 0, "Failed to preflight/start import batch", {
      status: preflightStart.status,
      stdout: preflightStart.stdout,
      stderr: preflightStart.stderr,
    });

    const startPayload = parseLastJsonLineObject(preflightStart.stdout);
    assertOk(startPayload?.ok && startPayload?.batchId, "startImportBatch returned invalid payload", {
      stdout: preflightStart.stdout,
      stderr: preflightStart.stderr,
    });
    summary.batch_id = startPayload.batchId;

    console.log(`[STEP 2] Batch started: ${startPayload.batchId}`);

    const runner = spawn("npx", ["tsx", "--eval", buildRunnerScript()], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        E2E_ACTOR_USER_ID: resolved.actorUserId,
        E2E_BATCH_ID: startPayload.batchId,
        E2E_OPERATING_COMPANY_ID: resolved.operatingCompanyId,
        E2E_SINCE_DATE: sinceDate,
        E2E_ATTACHMENTS_SINCE_DATE: process.env.E2E_ATTACHMENTS_SINCE_DATE || "2021-01-01",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    runner.stdout.on("data", (chunk) => {
      runnerStdout += String(chunk);
    });
    runner.stderr.on("data", (chunk) => {
      runnerStderr += String(chunk);
    });

    const timeoutAt = TIMEOUT_MS > 0 ? Date.now() + TIMEOUT_MS : Number.POSITIVE_INFINITY;
    let finalBatch = null;
    let timedOut = false;

    while (Date.now() < timeoutAt) {
      const batch = await getBatchRow(startPayload.batchId);
      assertOk(batch, "Batch not found while polling", { batchId: startPayload.batchId });

      const events = await getAuditEvents(startPayload.batchId);
      const anomalies = await getAnomalySummary(startPayload.batchId);
      const anomalyCount = anomalies.reduce((acc, row) => acc + Number(row.count || 0), 0);
      const completed = Boolean(batch.completed_at) && ["completed", "partial", "failed"].includes(String(batch.status));
      const phase = derivePhaseStatus(events, anomalyCount, completed);

      summary.phase_progression.push({
        polled_at: new Date().toISOString(),
        batch_status: batch.status,
        derived_phase: phase,
        entities_imported: Number(batch.entities_imported || 0),
        transactions_imported: Number(batch.transactions_imported || 0),
        attachments_imported: Number(batch.attachments_imported || 0),
        errors_count: Number(batch.errors_count || 0),
      });

      console.log(
        `[POLL] status=${batch.status} phase=${phase} entities=${batch.entities_imported ?? 0} tx=${batch.transactions_imported ?? 0} attach=${batch.attachments_imported ?? 0} errors=${batch.errors_count ?? 0}`
      );

      if (completed) {
        finalBatch = batch;
        break;
      }
      await sleep(POLL_INTERVAL_MS);
    }

    if (!finalBatch) {
      timedOut = true;
      finalBatch = await getBatchRow(startPayload.batchId);
    }

    if (runner.exitCode === null && timedOut) {
      runner.kill("SIGTERM");
    }

    const runnerExitCode = await new Promise((resolve) => {
      if (runner.exitCode !== null) return resolve(runner.exitCode);
      runner.on("exit", (code) => resolve(code ?? 0));
    });

    const auditCountRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM qbo_archive.import_batch_audit_log WHERE batch_id = $1::uuid`,
      [startPayload.batchId]
    );
    const auditCount = Number(auditCountRes.rows[0]?.count ?? 0);
    const anomalies = await getAnomalySummary(startPayload.batchId);
    const anomalyTotal = anomalies.reduce((acc, row) => acc + Number(row.count || 0), 0);

    const totalRecords =
      Number(finalBatch?.entities_imported || 0) +
      Number(finalBatch?.transactions_imported || 0) +
      Number(finalBatch?.attachments_imported || 0);

    const durationSec = Math.round((Date.now() - startedAtMs) / 1000);

    summary.verification = {
      duration_sec: durationSec,
      batch_row: finalBatch,
      total_records_imported: totalRecords,
      audit_events: auditCount,
      anomalies_by_type: anomalies,
      anomalies_total: anomalyTotal,
      runner_exit_code: runnerExitCode,
      runner_stdout_tail: runnerStdout.slice(-5000),
      runner_stderr_tail: runnerStderr.slice(-5000),
      timed_out: timedOut,
    };

    assertOk(!timedOut, "Timed out waiting for forensic batch completion", {
      batch_id: startPayload.batchId,
      last_batch: finalBatch,
    });
    assertOk(["completed", "partial"].includes(String(finalBatch?.status)), "Batch did not finish in completed/partial status", {
      status: finalBatch?.status,
      last_error_message: finalBatch?.last_error_message,
    });
    assertOk(Boolean(finalBatch?.completed_at), "completed_at is null");
    assertOk(totalRecords > 0, "total_records_imported must be > 0", { totalRecords });
    assertOk(auditCount > 0, "import_batch_audit_log has no entries");
    assertOk(anomalyTotal > 0, "No anomalies detected for completed batch");

    summary.pass = true;
    console.log("\n[E2E FORENSIC IMPORT RESULT]");
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    summary.pass = false;
    summary.error = {
      message: String(error?.message ?? error),
      context: error?.context ?? null,
    };
    if (runnerStdout) summary.runner_stdout_tail = runnerStdout.slice(-5000);
    if (runnerStderr) summary.runner_stderr_tail = runnerStderr.slice(-5000);
    console.error("\n[E2E FORENSIC IMPORT RESULT]");
    console.error(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

await main();
