#!/usr/bin/env node
/**
 * Boot compiled API and assert GET /api/v1/mdata/units/:id returns the Block 11/12 aggregate envelope.
 * Catches "frontend deployed, backend stuck on pre-aggregate flat row" regressions.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.BOOT_AGGREGATE_SMOKE_PORT ?? process.env.BOOT_SMOKE_PORT ?? "3998";
const baseUrl = process.env.IH35_SMOKE_BASE_URL?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
const spawnServer = !process.env.IH35_SMOKE_BASE_URL;
const testOwnerUserId = process.env.IH35_SMOKE_USER_ID ?? "f47ac10b-58cc-4372-a567-0e02b2c3d479";

function buildTestAuthHeader(userId = testOwnerUserId, role = "Owner") {
  return Buffer.from(JSON.stringify({ id: userId, role, email: "aggregate-smoke@test.invalid" }), "utf8").toString(
    "base64url"
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealthy(deadlineMs, exitCodeRef) {
  const url = `${baseUrl}/api/v1/health`;
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (spawnServer && exitCodeRef.value !== null && exitCodeRef.value !== 0) {
      return { ok: false, reason: `process exited early with code ${exitCodeRef.value}` };
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return { ok: true };
    } catch {
      /* not up yet */
    }
    await sleep(400);
  }
  return { ok: false, reason: "timeout waiting for /api/v1/health" };
}

async function withPg(url, fn) {
  const Client = require("pg").Client;
  const c = new Client(buildPgClientConfig(url));
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function ensureTranspCompany(client) {
  await client.query("SET ROLE ih35_app");
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const existing = await client.query("SELECT id::text AS id FROM org.companies WHERE code = 'TRANSP' LIMIT 1");
  if (existing.rows[0]?.id) {
    await client.query("COMMIT");
    return String(existing.rows[0].id);
  }
  const inserted = await client.query(
    `
      INSERT INTO org.companies (code, legal_name, short_name, company_type, country, is_active)
      VALUES ('TRANSP', 'IH 35 Transportation LLC', 'IH 35 Transportation', 'operating_carrier', 'US', true)
      RETURNING id::text AS id
    `
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error("aggregate_smoke_setup: TRANSP company insert returned no id");
  await client.query("COMMIT");
  return String(id);
}

async function ensureSmokeUnit(client, companyId) {
  const existing = await client.query(
    `
      SELECT u.id::text AS unit_id,
             COALESCE(u.currently_leased_to_company_id, u.owner_company_id)::text AS company_id
      FROM mdata.units u
      WHERE u.deactivated_at IS NULL
      ORDER BY u.updated_at DESC NULLS LAST
      LIMIT 1
    `
  );
  if (existing.rows[0]?.unit_id && existing.rows[0]?.company_id) {
    return { unitId: String(existing.rows[0].unit_id), companyId: String(existing.rows[0].company_id) };
  }
  const suf = Date.now().toString(36).slice(-6);
  const vin = (`AGG${suf}000000000`).slice(0, 17);
  const inserted = await client.query(
    `
      INSERT INTO mdata.units (unit_number, vin, owner_company_id, currently_leased_to_company_id, status)
      VALUES ($1, $2, $3::uuid, $3::uuid, 'InService')
      RETURNING id::text AS unit_id
    `,
    [`AGG-SMOKE-${suf}`, vin, companyId]
  );
  const unitId = inserted.rows[0]?.unit_id;
  if (!unitId) throw new Error("aggregate_smoke_setup: unit insert returned no id");
  return { unitId: String(unitId), companyId };
}

async function resolveUnitAndCompany() {
  const unitId = process.env.IH35_SMOKE_UNIT_ID?.trim();
  const companyId = process.env.IH35_SMOKE_OPERATING_COMPANY_ID?.trim();
  if (unitId && companyId) return { unitId, companyId };

  const url = process.env.DATABASE_URL?.trim() ?? process.env.DATABASE_DIRECT_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL required to resolve unit/company when IH35_SMOKE_UNIT_ID not fully set");
  }

  return withPg(url, async (client) => {
    if (unitId && !companyId) {
      const res = await client.query(
        `
          SELECT COALESCE(currently_leased_to_company_id, owner_company_id)::text AS company_id
          FROM mdata.units WHERE id = $1::uuid LIMIT 1
        `,
        [unitId]
      );
      const cid = res.rows[0]?.company_id;
      if (!cid) throw new Error(`unit not found: ${unitId}`);
      return { unitId, companyId: String(cid) };
    }
    const transpId = await ensureTranspCompany(client);
    return ensureSmokeUnit(client, transpId);
  });
}

function assertObjectKey(obj, key, pathLabel) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error(`${pathLabel}: expected object, got ${Array.isArray(obj) ? "array" : typeof obj}`);
  }
  if (!(key in obj)) {
    throw new Error(`${pathLabel}: missing key "${key}"`);
  }
}

function assertAggregateEnvelope(body) {
  const keys = Object.keys(body);
  if ("unit_number" in body && !("unit" in body)) {
    throw new Error(
      `legacy_flat_unit_row: top-level keys look like flat mdata.units (${keys.slice(0, 12).join(", ")}…); expected aggregate envelope with "unit" object`
    );
  }

  const requiredTop = ["unit", "compliance", "open_wo_count", "plates", "samsara", "reefer", "maintenance_alerts"];
  const missingTop = requiredTop.filter((k) => !(k in body));
  if (missingTop.length > 0) {
    throw new Error(`missing_top_level_keys: ${missingTop.join(", ")} (actual: ${keys.join(", ")})`);
  }

  assertObjectKey(body, "unit", "aggregate");
  assertObjectKey(body.unit, "id", "aggregate.unit");

  assertObjectKey(body, "compliance", "aggregate");
  for (const sub of ["us_insurance", "mx_insurance"]) {
    assertObjectKey(body.compliance, sub, `aggregate.compliance`);
  }
  if (!("registration_plates" in body.compliance) && !("registration_us" in body.compliance)) {
    throw new Error('aggregate.compliance: missing "registration_plates" (or legacy registration_us)');
  }

  assertObjectKey(body, "open_wo_count", "aggregate");
  for (const sub of ["in_house", "external", "roadside"]) {
    assertObjectKey(body.open_wo_count, sub, "aggregate.open_wo_count");
  }

  if (!Array.isArray(body.plates)) {
    throw new Error("aggregate.plates: expected array");
  }
}

async function fetchAggregate(unitId, companyId, testAuthHeader) {
  const url = new URL(`${baseUrl}/api/v1/mdata/units/${unitId}`);
  url.searchParams.set("operating_company_id", companyId);
  const res = await fetch(url.toString(), {
    headers: { "x-test-auth": testAuthHeader },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`invalid_json status=${res.status} body=${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`GET ${url.pathname} status=${res.status} body=${text.slice(0, 300)}`);
  }
  return body;
}

const exitCodeRef = { value: /** @type {number | null} */ (null) };
let child = null;

if (spawnServer) {
  child = spawn(process.execPath, ["dist/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: port,
      ENABLE_OUTBOX_PROCESSOR: "false",
      NODE_ENV: process.env.NODE_ENV ?? "test",
      IH35_BOOT_API_SMOKE: "true",
      IH35_TEST_AUTH_BYPASS: "1",
      DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL,
      OAUTH_GOOGLE_CLIENT_ID: process.env.OAUTH_GOOGLE_CLIENT_ID ?? "boot-smoke-google-client-id",
      OAUTH_GOOGLE_CLIENT_SECRET: process.env.OAUTH_GOOGLE_CLIENT_SECRET ?? "boot-smoke-google-client-secret",
      OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI ?? "http://localhost:5173/api/v1/auth/google/callback",
      DRIVER_JWT_SECRET: process.env.DRIVER_JWT_SECRET ?? "boot-smoke-driver-jwt-secret",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("exit", (code) => {
    exitCodeRef.value = code;
  });
}

try {
  const health = await waitHealthy(60_000, exitCodeRef);
  if (!health.ok) {
    console.error(`[ci-boot-aggregate-smoke] FAILED: ${health.reason}`);
    process.exit(1);
  }

  const { unitId, companyId } = await resolveUnitAndCompany();
  const testAuth = buildTestAuthHeader();
  const body = await fetchAggregate(unitId, companyId, testAuth);
  assertAggregateEnvelope(body);

  console.log(
    `[BOOT-AGGREGATE] OK — aggregate envelope contains all expected keys (unit=${unitId.slice(0, 8)}… company=${companyId.slice(0, 8)}…)`
  );
} catch (err) {
  console.error(`[ci-boot-aggregate-smoke] FAILED: ${(err && err.message) || err}`);
  process.exit(1);
} finally {
  if (child) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    await sleep(1500);
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
}

process.exit(0);
