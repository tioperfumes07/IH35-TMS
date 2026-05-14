/**
 * Block X — scheduled reports black-box E2E smoke (P7-VERIFY-1 / P7-SCHEDULED-REPORT-E2E-001).
 *
 * Local prerequisites (running API server):
 * - IH35_TEST_AUTH_BYPASS=1 (local/staging only — ignored when production cookie auth is used)
 * - ENABLE_SCHEDULED_REPORTS_WORKER=true (not "false")
 * - SCHEDULED_REPORTS_WORKER_INTERVAL_MS=5000 recommended (faster pickup)
 * - R2 + email configured so deliverScheduledReportToEmail succeeds
 *
 * Production prerequisites:
 * - BLOCK_X_PROD_COOKIE (full Cookie header value or raw ih35_session token)
 * - BLOCK_X_PROD_OPERATING_COMPANY_ID (recommended; falls back to BLOCK_X_SMOKE_OPERATING_COMPANY_ID)
 * - BLOCK_X_PROD_BASE_URL optional (defaults https://api.ih35dispatch.com)
 *
 * Env:
 * - BLOCK_X_SMOKE_BASE_URL (default http://localhost:3000 for local mode)
 * - BLOCK_X_SMOKE_OPERATING_COMPANY_ID (optional if DATABASE_* can resolve TRANSP)
 * - BLOCK_X_SMOKE_POLL_MS (poll cadence; prod defaults tighter)
 * - BLOCK_X_PROD_E2E_RUN_TIMEOUT_MS (default 90000 prod run wait)
 * - BLOCK_X_SMOKE_TIMEOUT_MS (default 150000 local run wait)
 * - BLOCK_X_SMOKE_EMAIL_WAIT_MS (extra window after run success to observe email_queue row; default 45000)
 */
import pg from "pg";

if (process.env.BLOCK_X_SMOKE_SKIP === "1") {
  console.log("[block-x scheduled-reports e2e] SKIP (BLOCK_X_SMOKE_SKIP=1)");
  process.exit(0);
}

const PROD_COOKIE_RAW = process.env.BLOCK_X_PROD_COOKIE?.trim();
const USE_PROD_AUTH = Boolean(PROD_COOKIE_RAW);

function smokeBaseUrl(): string {
  if (USE_PROD_AUTH) {
    return (process.env.BLOCK_X_PROD_BASE_URL ?? "https://api.ih35dispatch.com").replace(/\/$/, "");
  }
  return (process.env.BLOCK_X_SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

const BASE_URL = smokeBaseUrl();
const POLL_MS = Number(process.env.BLOCK_X_SMOKE_POLL_MS ?? (USE_PROD_AUTH ? "2000" : "3000"));
const RUN_WAIT_MS = USE_PROD_AUTH
  ? Number(process.env.BLOCK_X_PROD_E2E_RUN_TIMEOUT_MS ?? "90000")
  : Number(process.env.BLOCK_X_SMOKE_TIMEOUT_MS ?? "150000");
const EMAIL_WAIT_MS = Number(process.env.BLOCK_X_SMOKE_EMAIL_WAIT_MS ?? "45000");

const TEST_OWNER_USER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

const SMOKE_PREFIX = "smoke-e2e-DELETEME-";

function prodCookieHeader(): string {
  const raw = PROD_COOKIE_RAW!;
  return raw.toLowerCase().startsWith("ih35_session=") ? raw : `ih35_session=${raw}`;
}

function testAuthHeaders(userId: string = TEST_OWNER_USER_ID, role = "Owner") {
  const payload = Buffer.from(JSON.stringify({ id: userId, role, email: "block-x-smoke@test.invalid" }), "utf8").toString(
    "base64url"
  );
  return {
    "content-type": "application/json",
    "x-test-auth": payload,
  };
}

function authHeaders(): Record<string, string> {
  if (USE_PROD_AUTH) {
    return {
      cookie: prodCookieHeader(),
      accept: "application/json",
      "content-type": "application/json",
    };
  }
  return testAuthHeaders();
}

function mergeHeaders(extra?: HeadersInit): Record<string, string> {
  const base = authHeaders();
  if (!extra) return base;
  const out = { ...base };
  const maybe = extra as Record<string, string>;
  for (const [k, v] of Object.entries(maybe)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveOperatingCompanyId(): Promise<string> {
  const prodOc = process.env.BLOCK_X_PROD_OPERATING_COMPANY_ID?.trim();
  const smokeOc = process.env.BLOCK_X_SMOKE_OPERATING_COMPANY_ID?.trim();
  if (prodOc) return prodOc;
  if (smokeOc) return smokeOc;

  const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!cs) {
    throw new Error(
      "Set BLOCK_X_PROD_OPERATING_COMPANY_ID / BLOCK_X_SMOKE_OPERATING_COMPANY_ID or DATABASE_URL / DATABASE_DIRECT_URL to resolve TRANSP company."
    );
  }

  const client = new pg.Client({ connectionString: cs, ssl: cs.includes("localhost") ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`SET ROLE ih35_app`);
    await client.query(`BEGIN`);
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const res = await client.query<{ id: string }>(`SELECT id FROM org.companies WHERE code = 'TRANSP' LIMIT 1`);
    await client.query(`COMMIT`);
    const id = res.rows[0]?.id;
    if (!id) throw new Error("Could not resolve operating company id (missing org.companies code=TRANSP).");
    return String(id);
  } catch (err) {
    await client.query(`ROLLBACK`).catch(() => {});
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

type DetailResponse = {
  record?: Record<string, unknown>;
  runs?: Array<Record<string, unknown>>;
};

async function assertNoStaleSmokeSchedules(operatingCompanyId: string) {
  const listUrl = `${BASE_URL}/api/v1/scheduled-reports?operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
  const listRes = await fetch(listUrl, { headers: mergeHeaders() });
  if (!listRes.ok) {
    const body = await listRes.text();
    throw new Error(`Stale-schedule preflight failed: HTTP ${listRes.status} ${body}`);
  }
  const payload = (await listRes.json()) as { rows?: Array<{ id?: string; name?: string }> };
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const fiveMs = 5 * 60 * 1000;
  for (const row of rows) {
    const name = String(row.name ?? "");
    const match = name.match(/^smoke-e2e-DELETEME-(\d+)$/);
    if (!match) continue;
    const ts = Number(match[1]);
    if (!Number.isFinite(ts)) continue;
    if (Date.now() - ts > fiveMs) {
      throw new Error(
        `Stale smoke schedule detected from a crashed prior run (>5m old): schedule_id=${String(row.id ?? "")} name=${name}. Delete it manually in prod/local DB/UI and retry.`
      );
    }
  }
}

async function pollEmailQueueUntilSent(operatingCompanyId: string, emailQueueId: string): Promise<void> {
  const deadline = Date.now() + EMAIL_WAIT_MS;
  const url = `${BASE_URL}/api/v1/email/queue?operating_company_id=${encodeURIComponent(operatingCompanyId)}&limit=100`;

  while (Date.now() < deadline) {
    const res = await fetch(url, { headers: mergeHeaders() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Email queue poll failed: HTTP ${res.status} ${body}`);
    }
    const payload = (await res.json()) as { items?: Array<{ id?: string; status?: string }> };
    const hit = (payload.items ?? []).find((item) => String(item.id ?? "") === emailQueueId && String(item.status ?? "") === "sent");
    if (hit) return;
    await sleep(POLL_MS);
  }

  throw new Error(`Timed out after ${EMAIL_WAIT_MS}ms waiting for email_queue id=${emailQueueId} to reach status=sent.`);
}

async function main() {
  console.log(`\n[block-x scheduled-reports e2e] BASE_URL=${BASE_URL}`);
  if (USE_PROD_AUTH) {
    console.log("[block-x scheduled-reports e2e] PRODUCTION MODE — authenticating with BLOCK_X_PROD_COOKIE.");
  } else {
    console.log("[block-x scheduled-reports e2e] LOCAL MODE — expect IH35_TEST_AUTH_BYPASS=1 on server for x-test-auth.");
  }

  const ping = await fetch(`${BASE_URL}/api/v1/_healthcheck`).catch(() => null);
  if (!ping || !ping.ok) {
    console.error(
      `[block-x scheduled-reports e2e] FAIL: backend not reachable at ${BASE_URL}. Start the API with worker settings enabled (ENABLE_SCHEDULED_REPORTS_WORKER=true, R2 + email configured).`
    );
    process.exit(1);
  }

  let scheduleId: string | null = null;
  let operatingCompanyId: string | null = null;
  let failed = false;

  try {
    operatingCompanyId = await resolveOperatingCompanyId();
    console.log(`[block-x scheduled-reports e2e] operating_company_id=${operatingCompanyId}`);

    await assertNoStaleSmokeSchedules(operatingCompanyId);

    const suffix = Date.now();
    const smokeName = `${SMOKE_PREFIX}${suffix}`;
    const recipients = USE_PROD_AUTH ? ["test@ih35dispatch.com"] : ["block-x-smoke@test.invalid"];

    const createPayload = {
      operating_company_id: operatingCompanyId,
      report_id: "profit-per-truck",
      name: smokeName,
      parameters: { smoke: smokeName },
      frequency: { kind: "cron", time_local: "06:00", cron: "*/1 * * * *" },
      recipients,
      format: "pdf",
      subject_template: `Smoke E2E ${smokeName} ({period})`,
      timezone: "America/Chicago",
    };

    const createRes = await fetch(`${BASE_URL}/api/v1/scheduled-reports`, {
      method: "POST",
      headers: mergeHeaders(),
      body: JSON.stringify(createPayload),
    });

    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`Create schedule failed: HTTP ${createRes.status} ${body}`);
    }

    const created = (await createRes.json()) as { id?: string };
    scheduleId = created.id ?? null;
    if (!scheduleId) throw new Error("Create schedule response missing id.");

    console.log(`[block-x scheduled-reports e2e] Created schedule id=${scheduleId} name=${smokeName}`);

    const runDeadline = Date.now() + RUN_WAIT_MS;
    let successRun: Record<string, unknown> | null = null;

    while (Date.now() < runDeadline) {
      const detailRes = await fetch(
        `${BASE_URL}/api/v1/scheduled-reports/${scheduleId}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
        { headers: mergeHeaders() }
      );
      if (!detailRes.ok) {
        const body = await detailRes.text();
        throw new Error(`Detail fetch failed: HTTP ${detailRes.status} ${body}`);
      }

      const detail = (await detailRes.json()) as DetailResponse;
      const runs = Array.isArray(detail.runs) ? detail.runs : [];
      successRun = runs.find((r) => String(r.status ?? "") === "success") ?? null;

      const record = detail.record ?? {};
      const lastRunAt = record.last_run_at ? String(record.last_run_at) : null;

      if (successRun && lastRunAt) {
        const r2 = successRun.generated_file_r2_path != null ? String(successRun.generated_file_r2_path) : "";
        const emailId = successRun.email_queue_id != null ? String(successRun.email_queue_id) : "";

        if (!r2.trim()) throw new Error("Run succeeded but generated_file_r2_path is empty.");
        if (!emailId.trim()) throw new Error("Run succeeded but email_queue_id is empty.");

        console.log("\n[block-x scheduled-reports e2e] Run SUCCESS — verifying email_queue delivery row…");
        await pollEmailQueueUntilSent(operatingCompanyId, emailId);

        console.log("\n[block-x scheduled-reports e2e] PASS");
        console.log(`  schedule_id=${scheduleId}`);
        console.log(`  last_run_at=${lastRunAt}`);
        console.log(`  generated_file_r2_path=${r2}`);
        console.log(`  email_queue_id=${emailId}`);
        return;
      }

      await sleep(POLL_MS);
    }

    throw new Error(`Timed out after ${RUN_WAIT_MS}ms waiting for a successful worker run.`);
  } catch (err) {
    failed = true;
    console.error("\n[block-x scheduled-reports e2e] FAIL");
    console.error(err);
  } finally {
    if (scheduleId && operatingCompanyId) {
      try {
        const del = await fetch(
          `${BASE_URL}/api/v1/scheduled-reports/${scheduleId}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
          { method: "DELETE", headers: mergeHeaders() }
        );
        if (!del.ok) {
          console.error(`[block-x scheduled-reports e2e] Cleanup DELETE failed: HTTP ${del.status}`);
        } else {
          console.log(`[block-x scheduled-reports e2e] Deleted schedule id=${scheduleId}`);
        }
      } catch (cleanupErr) {
        console.error("[block-x scheduled-reports e2e] Cleanup error:", cleanupErr);
      }
    }
    if (failed) process.exitCode = 1;
  }
}

await main();
