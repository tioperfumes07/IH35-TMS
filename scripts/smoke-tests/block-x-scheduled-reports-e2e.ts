/**
 * Block X — scheduled reports black-box E2E smoke (P7-VERIFY-1).
 *
 * Prerequisites (running API server):
 * - IH35_TEST_AUTH_BYPASS=1 (local/staging only)
 * - ENABLE_SCHEDULED_REPORTS_WORKER=true (not "false")
 * - SCHEDULED_REPORTS_WORKER_INTERVAL_MS=5000 recommended (faster pickup)
 * - R2 + email configured so deliverScheduledReportToEmail succeeds
 *
 * Env:
 * - BLOCK_X_SMOKE_BASE_URL (default http://localhost:3000)
 * - BLOCK_X_SMOKE_OPERATING_COMPANY_ID (optional if DATABASE_* can resolve TRANSP)
 */
import pg from "pg";

if (process.env.BLOCK_X_SMOKE_SKIP === "1") {
  console.log("[block-x scheduled-reports e2e] SKIP (BLOCK_X_SMOKE_SKIP=1)");
  process.exit(0);
}

const BASE_URL = (process.env.BLOCK_X_SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const POLL_MS = Number(process.env.BLOCK_X_SMOKE_POLL_MS ?? "3000");
const TIMEOUT_MS = Number(process.env.BLOCK_X_SMOKE_TIMEOUT_MS ?? "150000");

const TEST_OWNER_USER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

function testAuthHeaders(userId: string = TEST_OWNER_USER_ID, role = "Owner") {
  const payload = Buffer.from(JSON.stringify({ id: userId, role, email: "block-x-smoke@test.invalid" }), "utf8").toString(
    "base64url"
  );
  return {
    "content-type": "application/json",
    "x-test-auth": payload,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveOperatingCompanyId(): Promise<string> {
  const fromEnv = process.env.BLOCK_X_SMOKE_OPERATING_COMPANY_ID?.trim();
  if (fromEnv) return fromEnv;

  const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!cs) {
    throw new Error("Set BLOCK_X_SMOKE_OPERATING_COMPANY_ID or DATABASE_URL / DATABASE_DIRECT_URL to resolve TRANSP company.");
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

async function main() {
  console.log(`\n[block-x scheduled-reports e2e] BASE_URL=${BASE_URL}`);
  console.log("[block-x scheduled-reports e2e] Expect IH35_TEST_AUTH_BYPASS=1 on server for x-test-auth.");

  const ping = await fetch(`${BASE_URL}/api/v1/_healthcheck`).catch(() => null);
  if (!ping || !ping.ok) {
    console.error(
      `[block-x scheduled-reports e2e] FAIL: backend not reachable at ${BASE_URL}. Start the API (PORT defaults to 3000) with IH35_TEST_AUTH_BYPASS=1, ENABLE_SCHEDULED_REPORTS_WORKER=true, R2 configured, and SCHEDULED_REPORTS_WORKER_INTERVAL_MS=5000 recommended.`
    );
    process.exit(1);
  }

  let scheduleId: string | null = null;
  let operatingCompanyId: string | null = null;
  let failed = false;

  try {
    operatingCompanyId = await resolveOperatingCompanyId();
    console.log(`[block-x scheduled-reports e2e] operating_company_id=${operatingCompanyId}`);

    const createPayload = {
      operating_company_id: operatingCompanyId,
      report_id: "profit-per-truck",
      name: "block-x-e2e-smoke",
      parameters: { smoke: "block-x-e2e" },
      frequency: { kind: "cron", time_local: "06:00", cron: "*/1 * * * *" },
      recipients: ["block-x-smoke@test.invalid"],
      format: "pdf",
      subject_template: "Block X smoke {report_name} ({period})",
      timezone: "America/Chicago",
    };

    const createRes = await fetch(`${BASE_URL}/api/v1/scheduled-reports`, {
      method: "POST",
      headers: testAuthHeaders(),
      body: JSON.stringify(createPayload),
    });

    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`Create schedule failed: HTTP ${createRes.status} ${body}`);
    }

    const created = (await createRes.json()) as { id?: string };
    scheduleId = created.id ?? null;
    if (!scheduleId) throw new Error("Create schedule response missing id.");

    console.log(`[block-x scheduled-reports e2e] Created schedule id=${scheduleId}`);

    const deadline = Date.now() + TIMEOUT_MS;
    let successRun: Record<string, unknown> | null = null;

    while (Date.now() < deadline) {
      const detailRes = await fetch(
        `${BASE_URL}/api/v1/scheduled-reports/${scheduleId}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
        { headers: testAuthHeaders() }
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

        console.log("\n[block-x scheduled-reports e2e] PASS");
        console.log(`  schedule_id=${scheduleId}`);
        console.log(`  last_run_at=${lastRunAt}`);
        console.log(`  generated_file_r2_path=${r2}`);
        console.log(`  email_queue_id=${emailId}`);
        return;
      }

      await sleep(POLL_MS);
    }

    throw new Error(`Timed out after ${TIMEOUT_MS}ms waiting for a successful worker run.`);
  } catch (err) {
    failed = true;
    console.error("\n[block-x scheduled-reports e2e] FAIL");
    console.error(err);
  } finally {
    if (scheduleId && operatingCompanyId) {
      try {
        const del = await fetch(
          `${BASE_URL}/api/v1/scheduled-reports/${scheduleId}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
          { method: "DELETE", headers: testAuthHeaders() }
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
