import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("../lib/pg-connection-options.cjs");

// Endpoint paths verified against apps/backend/src/accounting/ at commit 973b863073fa498e68fa088896548dffbfee0e51
//   trial-balance.routes.ts
//   profit-loss.routes.ts
//   balance-sheet.routes.ts
//   cash-flow.routes.ts
//   ar-aging.routes.ts
//   ap-aging.routes.ts
//   statement-export.routes.ts

type EndpointSpec = {
  name: string;
  path: string;
  query: Record<string, string>;
  expectStatus: 200;
  expectContentType: string;
  assertion: (body: Buffer, headers: Headers) => void;
};

type EndpointFailure = {
  name: string;
  method: "GET";
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyPreview: string;
  error?: string;
};

const PORT = process.env.ACCOUNTING_SMOKE_PORT ?? "4000";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TEST_OWNER_USER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

function buildTestAuthHeader(userId: string = TEST_OWNER_USER_ID, role = "Owner") {
  const payload = Buffer.from(JSON.stringify({ id: userId, role, email: "accounting-smoke@test.invalid" }), "utf8").toString("base64url");
  return payload;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function yearStartIsoDate() {
  return `${new Date().getUTCFullYear()}-01-01`;
}

function assertJsonHasShape(body: Buffer, requiredKey: string, typeCheck?: (parsed: Record<string, unknown>) => boolean) {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`invalid_json: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_json_shape: top-level object required");
  }
  if (!(requiredKey in parsed)) {
    throw new Error(`missing_required_key:${requiredKey}`);
  }
  if (typeCheck && !typeCheck(parsed)) {
    throw new Error(`invalid_required_shape:${requiredKey}`);
  }
}

function assertXlsxShape(body: Buffer, headers: Headers) {
  if (body.length <= 1024) {
    throw new Error(`xlsx_too_small:${body.length}`);
  }
  const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  if (!body.subarray(0, 4).equals(zipMagic)) {
    throw new Error(`xlsx_magic_mismatch:${body.subarray(0, 4).toString("hex")}`);
  }
  const contentDisposition = headers.get("content-disposition") ?? "";
  if (!contentDisposition.includes("attachment")) {
    throw new Error(`content_disposition_missing_attachment:${contentDisposition}`);
  }
}

function decodeBodyPreview(body: Buffer, maxBytes = 500) {
  return body.subarray(0, maxBytes).toString("utf8");
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of headers.entries()) out[k] = v;
  return out;
}

function buildEndpointSpecs(operatingCompanyId: string): EndpointSpec[] {
  const asOfDate = todayIsoDate();
  const fromDate = yearStartIsoDate();
  const toDate = asOfDate;

  return [
    {
      name: "trial-balance-json",
      path: "/api/v1/accounting/trial-balance",
      query: { operating_company_id: operatingCompanyId, from_date: fromDate, to_date: toDate },
      expectStatus: 200,
      expectContentType: "application/json",
      assertion: (body) => assertJsonHasShape(body, "summary", (p) => typeof p.summary === "object" && !Array.isArray(p.summary)),
    },
    {
      name: "profit-loss-json",
      path: "/api/v1/accounting/profit-loss",
      query: { operating_company_id: operatingCompanyId, from_date: fromDate, to_date: toDate },
      expectStatus: 200,
      expectContentType: "application/json",
      assertion: (body) => assertJsonHasShape(body, "net_income"),
    },
    {
      name: "balance-sheet-json",
      path: "/api/v1/accounting/balance-sheet",
      query: { operating_company_id: operatingCompanyId, as_of_date: asOfDate },
      expectStatus: 200,
      expectContentType: "application/json",
      assertion: (body) => assertJsonHasShape(body, "balanced"),
    },
    {
      name: "cash-flow-json",
      path: "/api/v1/accounting/cash-flow",
      query: { operating_company_id: operatingCompanyId, from_date: fromDate, to_date: toDate },
      expectStatus: 200,
      expectContentType: "application/json",
      assertion: (body) => assertJsonHasShape(body, "reconciled"),
    },
    {
      name: "ar-aging-json",
      path: "/api/v1/accounting/ar-aging",
      query: { operating_company_id: operatingCompanyId, as_of_date: asOfDate },
      expectStatus: 200,
      expectContentType: "application/json",
      assertion: (body) => assertJsonHasShape(body, "customers", (p) => Array.isArray(p.customers)),
    },
    {
      name: "ap-aging-json",
      path: "/api/v1/accounting/ap-aging",
      query: { operating_company_id: operatingCompanyId, as_of_date: asOfDate },
      expectStatus: 200,
      expectContentType: "application/json",
      assertion: (body) => assertJsonHasShape(body, "vendors", (p) => Array.isArray(p.vendors)),
    },
    {
      name: "trial-balance-xlsx",
      path: "/api/v1/accounting/trial-balance/export/xlsx",
      query: { operating_company_id: operatingCompanyId, as_of_date: asOfDate },
      expectStatus: 200,
      expectContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      assertion: assertXlsxShape,
    },
    {
      name: "profit-loss-xlsx",
      path: "/api/v1/accounting/profit-loss/export/xlsx",
      query: { operating_company_id: operatingCompanyId, from_date: fromDate, to_date: toDate },
      expectStatus: 200,
      expectContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      assertion: assertXlsxShape,
    },
    {
      name: "balance-sheet-xlsx",
      path: "/api/v1/accounting/balance-sheet/export/xlsx",
      query: { operating_company_id: operatingCompanyId, as_of_date: asOfDate },
      expectStatus: 200,
      expectContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      assertion: assertXlsxShape,
    },
    {
      name: "cash-flow-xlsx",
      path: "/api/v1/accounting/cash-flow/export/xlsx",
      query: { operating_company_id: operatingCompanyId, from_date: fromDate, to_date: toDate },
      expectStatus: 200,
      expectContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      assertion: assertXlsxShape,
    },
    {
      name: "ar-aging-xlsx",
      path: "/api/v1/accounting/ar-aging/export/xlsx",
      query: { operating_company_id: operatingCompanyId, as_of_date: asOfDate },
      expectStatus: 200,
      expectContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      assertion: assertXlsxShape,
    },
    {
      name: "ap-aging-xlsx",
      path: "/api/v1/accounting/ap-aging/export/xlsx",
      query: { operating_company_id: operatingCompanyId, as_of_date: asOfDate },
      expectStatus: 200,
      expectContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      assertion: assertXlsxShape,
    },
  ];
}

async function runOne(spec: EndpointSpec, testAuthHeader: string): Promise<{ ok: true } | { ok: false; failure: EndpointFailure }> {
  const url = new URL(`${BASE_URL}${spec.path}`);
  for (const [k, v] of Object.entries(spec.query)) url.searchParams.set(k, v);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-test-auth": testAuthHeader,
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    return {
      ok: false,
      failure: {
        name: spec.name,
        method: "GET",
        url: url.toString(),
        status: 0,
        statusText: "network_error",
        headers: {},
        bodyPreview: "",
        error: `network_error:${(error as Error).message}`,
      },
    };
  }

  const bodyBuffer = Buffer.from(await response.arrayBuffer());
  const headers = response.headers;
  const contentType = headers.get("content-type") ?? "";

  try {
    if (response.status !== spec.expectStatus) {
      throw new Error(`unexpected_status:${response.status}`);
    }
    if (!contentType.startsWith(spec.expectContentType)) {
      throw new Error(`content_type_mismatch:${contentType}`);
    }
    spec.assertion(bodyBuffer, headers);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      failure: {
        name: spec.name,
        method: "GET",
        url: url.toString(),
        status: response.status,
        statusText: response.statusText,
        headers: headersToObject(headers),
        bodyPreview: decodeBodyPreview(bodyBuffer),
        error: (error as Error).message,
      },
    };
  }
}

async function waitHealthy(exitCodeRef: { value: number | null }, deadlineMs: number) {
  const url = `${BASE_URL}/api/v1/health`;
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (exitCodeRef.value !== null && exitCodeRef.value !== 0) {
      return { ok: false as const, reason: `process exited early with code ${exitCodeRef.value}` };
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return { ok: true as const };
    } catch {
      // server not up yet
    }
    await sleep(400);
  }
  return { ok: false as const, reason: "timeout waiting for /api/v1/health" };
}

function logSetupFailure(error: unknown, sql: string, values: unknown[]) {
  const err = error as { message?: string; code?: string; detail?: string; constraint?: string };
  console.error("[SETUP_FAILURE] org.companies insert failed");
  console.error(
    JSON.stringify(
      {
        message: err?.message ?? String(error),
        code: err?.code ?? null,
        detail: err?.detail ?? null,
        constraint: err?.constraint ?? null,
        sql,
        values,
      },
      null,
      2
    )
  );
}

async function resolveOrCreateOperatingCompanyId(): Promise<string> {
  const client = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL));
  await client.connect();
  try {
    await client.query("SET ROLE ih35_app");
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const existing = await client.query<{ id: string }>("SELECT id FROM org.companies WHERE code = 'TRANSP' LIMIT 1");
    if (existing.rows[0]?.id) {
      await client.query("COMMIT");
      return String(existing.rows[0].id);
    }

    const insertSql =
      "INSERT INTO org.companies (code, legal_name, short_name, company_type, country, is_active) VALUES ($1, $2, $3, $4::org.company_type, $5, $6) RETURNING id";
    const insertValues = ["TRANSP", "IH 35 Transportation LLC", "IH 35 Transportation", "operating_carrier", "US", true] as const;
    try {
      const inserted = await client.query<{ id: string }>(insertSql, insertValues as unknown as unknown[]);
      const insertedId = inserted.rows[0]?.id;
      if (!insertedId) throw new Error("inserted_company_missing_id");
      await client.query("COMMIT");
      return String(insertedId);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      logSetupFailure(error, insertSql, [...insertValues]);
      throw error;
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

async function teardown(child: ChildProcessWithoutNullStreams | null) {
  if (!child) return;
  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
  await sleep(1500);
  try {
    child.kill("SIGKILL");
  } catch {
    // ignore
  }
}

async function main() {
  if (!process.env.DATABASE_URL || !process.env.DATABASE_DIRECT_URL) {
    console.error("[accounting-endpoints-e2e] FAILED: DATABASE_URL and DATABASE_DIRECT_URL are required");
    process.exit(1);
  }

  const child = spawn(process.execPath, ["dist/index.js"], {
    env: {
      ...process.env,
      PORT,
      ENABLE_OUTBOX_PROCESSOR: "false",
      NODE_ENV: "test",
      IH35_BOOT_API_SMOKE: "true",
      IH35_TEST_AUTH_BYPASS: "1",
      OAUTH_GOOGLE_CLIENT_ID: process.env.OAUTH_GOOGLE_CLIENT_ID ?? "boot-smoke-google-client-id",
      OAUTH_GOOGLE_CLIENT_SECRET: process.env.OAUTH_GOOGLE_CLIENT_SECRET ?? "boot-smoke-google-client-secret",
      OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI ?? "http://localhost:5173/api/v1/auth/google/callback",
      DRIVER_JWT_SECRET: process.env.DRIVER_JWT_SECRET ?? "boot-smoke-driver-jwt-secret",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  const exitCodeRef: { value: number | null } = { value: null };
  child.on("exit", (code) => {
    exitCodeRef.value = code;
  });

  let success = false;
  try {
    const healthy = await waitHealthy(exitCodeRef, 90_000);
    if (!healthy.ok) {
      console.error(`[accounting-endpoints-e2e] FAILED: ${healthy.reason}`);
      process.exitCode = 1;
      return;
    }

    const operatingCompanyId = await resolveOrCreateOperatingCompanyId();
    const endpoints = buildEndpointSpecs(operatingCompanyId);
    const testAuth = buildTestAuthHeader();
    const failures: EndpointFailure[] = [];

    for (const spec of endpoints) {
      const result = await runOne(spec, testAuth);
      if (!result.ok) failures.push(result.failure);
    }

    if (failures.length > 0) {
      console.error("[accounting-endpoints-e2e] FAILED");
      for (const failure of failures) {
        console.error(
          JSON.stringify(
            {
              endpoint: failure.name,
              method: failure.method,
              url: failure.url,
              status: failure.status,
              statusText: failure.statusText,
              headers: failure.headers,
              bodyPreview: failure.bodyPreview,
              error: failure.error ?? null,
            },
            null,
            2
          )
        );
      }
      process.exitCode = 1;
      return;
    }

    console.log("[accounting-endpoints-e2e] OK — 12 endpoints (6 JSON + 6 XLSX) all returned expected contracts");
    success = true;
  } catch (error) {
    console.error("[accounting-endpoints-e2e] FAILED");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await teardown(child);
    if (success) process.exitCode = 0;
  }
}

await main();
