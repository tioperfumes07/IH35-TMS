#!/usr/bin/env node
/**
 * Phase 7 cutover smoke: exercises Block K/J/I/M endpoints against a running API.
 *
 * Env:
 *   CUTOVER_SMOKE_API_BASE_URL   — e.g. https://api.example.com (no trailing slash)
 *   TEST_OPERATING_COMPANY_ID    — UUID for office-scoped query params (must match test driver company for chained flows)
 *   CUTOVER_SMOKE_DRIVER_COOKIE  — optional; full Cookie header for a Driver session (ih35_session=...)
 *   CUTOVER_SMOKE_OFFICE_COOKIE  — optional; full Cookie header for non-Driver office session
 *   SAMSARA_WEBHOOK_SECRET       — optional; must match server secret for webhook signature test
 *   CUTOVER_SMOKE_CASH_ADVANCE_CENTS — optional; default 600000 ($6000). Raise if escalate returns 409 `not_above_policy`.
 *
 * Usage:
 *   node scripts/cutover-smoke-test.mjs
 */

import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

const baseUrl = (process.env.CUTOVER_SMOKE_API_BASE_URL || "").replace(/\/+$/, "");
const operatingCompanyId = process.env.TEST_OPERATING_COMPANY_ID?.trim();
const driverCookie = process.env.CUTOVER_SMOKE_DRIVER_COOKIE?.trim();
const officeCookie = process.env.CUTOVER_SMOKE_OFFICE_COOKIE?.trim();
const webhookSecret = process.env.SAMSARA_WEBHOOK_SECRET?.trim();
const cashAdvanceCents = Number(process.env.CUTOVER_SMOKE_CASH_ADVANCE_CENTS || "600000");

/** @type {{ name: string; ok: boolean; detail: string }[]} */
const results = [];

function log(line) {
  console.log(line);
}

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  log(`${tag}: ${name}${detail ? ` — ${detail}` : ""}`);
}

function cookieHeader(cookie) {
  return cookie && cookie.length > 0 ? { Cookie: cookie } : {};
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { _non_json: text.slice(0, 500) };
  }
}

function hasKeys(obj, keys) {
  return obj && typeof obj === "object" && keys.every((k) => k in obj);
}

async function request(method, path, { query, body, headers = {}, rawBody } = {}) {
  const url = new URL(path.startsWith("http") ? path : `${baseUrl}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const init = {
    method,
    headers: { ...headers },
  };
  if (rawBody !== undefined) {
    init.body = rawBody;
    if (!init.headers["Content-Type"] && !init.headers["content-type"]) {
      init.headers["Content-Type"] = "application/json";
    }
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, init);
  const json = await readJson(res);
  return { res, json };
}

async function main() {
  if (!baseUrl) {
    console.error("FAIL: Set CUTOVER_SMOKE_API_BASE_URL to the API origin (no trailing slash).");
    process.exit(1);
  }

  // --- Public owner approval (invalid token → 404 + stable error key)
  {
    const token = "a".repeat(32);
    const { res, json } = await request("GET", `/api/v1/owner-approval/${token}`);
    const ok = res.status === 404 && json && json.error === "owner_approval_token_invalid_or_expired";
    record(
      "GET /api/v1/owner-approval/:token",
      ok,
      `status=${res.status} bodyKeys=${json && typeof json === "object" ? Object.keys(json).join(",") : typeof json}`
    );
  }

  // --- Legal matters (read-only list)
  if (!officeCookie) {
    record("GET /api/v1/legal/matters", false, "skipped — set CUTOVER_SMOKE_OFFICE_COOKIE");
  } else if (!operatingCompanyId) {
    record("GET /api/v1/legal/matters", false, "skipped — set TEST_OPERATING_COMPANY_ID");
  } else {
    const { res, json } = await request("GET", "/api/v1/legal/matters", {
      query: { operating_company_id: operatingCompanyId },
      headers: cookieHeader(officeCookie),
    });
    const ok = res.status === 200 && hasKeys(json, ["matters"]) && Array.isArray(json.matters);
    record("GET /api/v1/legal/matters", ok, `status=${res.status}`);
  }

  // --- Samsara health
  if (!officeCookie) {
    record("GET /api/v1/integrations/samsara/health", false, "skipped — set CUTOVER_SMOKE_OFFICE_COOKIE");
  } else if (!operatingCompanyId) {
    record("GET /api/v1/integrations/samsara/health", false, "skipped — set TEST_OPERATING_COMPANY_ID");
  } else {
    const { res, json } = await request("GET", "/api/v1/integrations/samsara/health", {
      query: { operating_company_id: operatingCompanyId },
      headers: cookieHeader(officeCookie),
    });
    const ok =
      res.status === 200 &&
      hasKeys(json, ["is_configured", "is_enabled", "last_health_status", "last_health_check_at", "last_error"]);
    record("GET /api/v1/integrations/samsara/health", ok, `status=${res.status}`);
  }

  // --- Driver scheduler request (write)
  if (!driverCookie) {
    record("POST /api/v1/driver/scheduler/request", false, "skipped — set CUTOVER_SMOKE_DRIVER_COOKIE");
  } else {
    const body = {
      leave_type: "wfh",
      start_date: "2030-06-02",
      end_date: "2030-06-03",
      reason: "Cutover smoke test — remote work block validation (safe future dates).",
    };
    const { res, json } = await request("POST", "/api/v1/driver/scheduler/request", {
      body,
      headers: cookieHeader(driverCookie),
    });
    const ok =
      res.status === 201 &&
      json &&
      typeof json === "object" &&
      typeof json.id === "string" &&
      typeof json.request_number !== "undefined";
    record(
      "POST /api/v1/driver/scheduler/request",
      ok,
      `status=${res.status} keys=${json && typeof json === "object" ? Object.keys(json).slice(0, 8).join(",") : ""}`
    );
  }

  let cashAdvanceId = null;

  // --- Driver cash advance create (write)
  if (!driverCookie) {
    record("POST /api/v1/driver/cash-advance-requests", false, "skipped — set CUTOVER_SMOKE_DRIVER_COOKIE");
  } else {
    const body = {
      requested_amount_cents: Number.isFinite(cashAdvanceCents) ? cashAdvanceCents : 600000,
      reason: "Cutover smoke test — cash advance path validation (scoped test driver).",
      submitted_via: "pwa",
    };
    const { res, json } = await request("POST", "/api/v1/driver/cash-advance-requests", {
      body,
      headers: cookieHeader(driverCookie),
    });
    const reqObj = json?.request;
    cashAdvanceId = reqObj && typeof reqObj.id === "string" ? reqObj.id : null;
    const ok = res.status === 201 && reqObj && typeof reqObj.id === "string" && typeof reqObj.display_id !== "undefined";
    record(
      "POST /api/v1/driver/cash-advance-requests",
      ok,
      `status=${res.status} requestId=${cashAdvanceId ?? "n/a"} is_above_policy=${reqObj?.is_above_policy}`
    );
  }

  // --- Escalate to owner (write; depends on above-policy pending request)
  if (!officeCookie) {
    record("POST /api/v1/driver-finance/cash-advance-requests/:id/escalate", false, "skipped — set CUTOVER_SMOKE_OFFICE_COOKIE");
  } else if (!operatingCompanyId) {
    record(
      "POST /api/v1/driver-finance/cash-advance-requests/:id/escalate",
      false,
      "skipped — set TEST_OPERATING_COMPANY_ID"
    );
  } else if (!cashAdvanceId) {
    record(
      "POST /api/v1/driver-finance/cash-advance-requests/:id/escalate",
      false,
      "skipped — cash advance create did not return request.id"
    );
  } else {
    const path = `/api/v1/driver-finance/cash-advance-requests/${cashAdvanceId}/escalate`;
    const { res, json } = await request("POST", path, {
      query: { operating_company_id: operatingCompanyId },
      headers: cookieHeader(officeCookie),
      body: {},
    });
    const ok =
      res.status === 200 &&
      typeof json?.owner_approval_url === "string" &&
      json.owner_approval_url.length > 10 &&
      json.request &&
      typeof json.request === "object";
    record(
      "POST /api/v1/driver-finance/cash-advance-requests/:id/escalate",
      ok,
      `status=${res.status} has_url=${Boolean(json?.owner_approval_url)}`
    );
  }

  // --- Samsara webhook (HMAC matches apps/backend/src/integrations/samsara/samsara-webhook-verify.ts)
  if (!webhookSecret) {
    record("POST /api/v1/integrations/samsara/webhook", false, "skipped — set SAMSARA_WEBHOOK_SECRET");
  } else if (!operatingCompanyId) {
    record("POST /api/v1/integrations/samsara/webhook", false, "skipped — set TEST_OPERATING_COMPANY_ID");
  } else {
    const payload = {
      eventType: "cutover_smoke_test",
      id: `evt_cutover_${Date.now()}`,
      data: { source: "scripts/cutover-smoke-test.mjs" },
    };
    const rawBody = Buffer.from(JSON.stringify(payload), "utf8");
    const sigHex = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    const { res, json } = await request("POST", "/api/v1/integrations/samsara/webhook", {
      query: { operating_company_id: operatingCompanyId },
      rawBody,
      headers: {
        "Content-Type": "application/json",
        "x-samsara-signature": sigHex,
      },
    });
    const ok = res.status === 200 && json?.ok === true;
    record("POST /api/v1/integrations/samsara/webhook", ok, `status=${res.status}`);
  }

  const failed = results.filter((r) => !r.ok);
  log("");
  log(`Summary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    for (const f of failed) log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
}

await main();
