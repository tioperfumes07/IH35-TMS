#!/usr/bin/env node
/**
 * AUDIT-FIX-9 CI guard: page-load endpoints must not return >=400.
 * Static: route modules registered + resilience patterns present.
 * Runtime (optional): probe the five flaky endpoints when API_BASE_URL + session cookie are set.
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FLAKY_ENDPOINTS = [
  {
    path: "/api/v1/notifications",
    query: "limit=20",
    routeFile: "apps/backend/src/notifications/list.routes.ts",
    resilienceNeedles: ["notificationsTableReady", "notifications: []"],
  },
  {
    path: "/api/v1/notifications/unread-count",
    query: "",
    routeFile: "apps/backend/src/notifications/unread-count.routes.ts",
    resilienceNeedles: ["notificationsTableReady", "unread_count: 0"],
  },
  {
    path: "/api/v1/notifications/stream",
    query: "",
    routeFile: "apps/backend/src/notifications/stream.routes.ts",
    resilienceNeedles: ["applySseCorsHeaders", "text/event-stream", "setInterval"],
  },
  {
    path: "/api/v1/maintenance/dashboard/kpis",
    query: "operating_company_id=00000000-0000-0000-0000-000000000001",
    routeFile: "apps/backend/src/maintenance/dashboard-kpis.routes.ts",
    resilienceNeedles: ["columnExists", "EMPTY_KPI_PAYLOAD"],
  },
  {
    path: "/api/v1/catalogs/fleet/tire-positions",
    query: "is_active=true&limit=500",
    routeFile: "apps/backend/src/catalogs/fleet/tire-positions.routes.ts",
    resilienceNeedles: ["max(500)", "tirePositionsListQuerySchema"],
  },
];

const PAGE_ROUTES = ["/home", "/banking", "/maintenance", "/customers", "/vendors"];

/** Allowlisted >=400 responses that are expected during page load (none for AF-9 targets). */
const RUNTIME_ALLOWLIST = [];

function fail(message) {
  console.error(`verify:no-flaky-endpoints-on-page-load FAIL: ${message}`);
  process.exit(1);
}

function readText(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) fail(`missing file: ${relPath}`);
  return fs.readFileSync(abs, "utf8");
}

function staticChecks() {
  const notificationsRoutes = readText("apps/backend/src/notifications/notifications.routes.ts");
  const backendIndex = readText("apps/backend/src/index.ts");
  const fleetIndex = readText("apps/backend/src/catalogs/fleet/index.ts");
  const manifest = readText("apps/frontend/src/routes/manifest.tsx");

  if (!notificationsRoutes.includes("registerNotificationListRoutes")) {
    fail("notifications.routes.ts must wire registerNotificationListRoutes");
  }
  if (!notificationsRoutes.includes("registerNotificationUnreadCountRoutes")) {
    fail("notifications.routes.ts must wire registerNotificationUnreadCountRoutes");
  }
  if (!notificationsRoutes.includes("./stream.routes.js")) {
    fail("notifications.routes.ts must wire stream.routes.js (SSE CORS + interval poll)");
  }
  if (!backendIndex.includes("registerMaintenanceDashboardKpisRoutes")) {
    fail("apps/backend/src/index.ts must import and register registerMaintenanceDashboardKpisRoutes");
  }
  if (!fleetIndex.includes("registerTirePositionsCatalogRoutes")) {
    fail("catalogs/fleet/index.ts must wire registerTirePositionsCatalogRoutes");
  }

  for (const route of PAGE_ROUTES) {
    if (!manifest.includes(`path="${route}"`) && !manifest.includes(`path='${route}'`)) {
      fail(`frontend manifest missing page route ${route}`);
    }
  }

  for (const endpoint of FLAKY_ENDPOINTS) {
    const source = readText(endpoint.routeFile);
    if (!source.includes(endpoint.path)) {
      fail(`${endpoint.routeFile} must register ${endpoint.path}`);
    }
    for (const needle of endpoint.resilienceNeedles) {
      if (!source.includes(needle)) {
        fail(`${endpoint.routeFile} missing resilience marker "${needle}"`);
      }
    }
  }
}

async function runtimeProbe(baseUrl, cookie, companyId) {
  const failures = [];
  for (const endpoint of FLAKY_ENDPOINTS) {
    const query = endpoint.query.replace("00000000-0000-0000-0000-000000000001", companyId);
    const suffix = query ? `?${query}` : "";
    const url = `${baseUrl}${endpoint.path}${suffix}`;
    const allowKey = `${endpoint.path}${suffix}`;
    if (RUNTIME_ALLOWLIST.includes(allowKey)) continue;

    try {
      const res = await fetch(url, {
        headers: cookie ? { cookie } : {},
        redirect: "manual",
      });
      if (res.status >= 400 && !RUNTIME_ALLOWLIST.includes(allowKey)) {
        failures.push(`${endpoint.path} -> HTTP ${res.status}`);
      }
    } catch (error) {
      failures.push(`${endpoint.path} -> ${String(error?.message ?? error)}`);
    }
  }
  return failures;
}

async function main() {
  staticChecks();

  const baseUrl = process.env.API_BASE_URL?.replace(/\/$/, "") ?? process.env.FRONTEND_BASE_URL?.replace(/\/$/, "");
  const sessionCookie = process.env.VERIFY_FLAKY_ENDPOINTS_SESSION_COOKIE?.trim();
  const companyId = process.env.VERIFY_OPERATING_COMPANY_ID?.trim() ?? "00000000-0000-0000-0000-000000000001";

  if (!baseUrl || !sessionCookie) {
    console.log(
      `verify:no-flaky-endpoints-on-page-load PASS (static: ${FLAKY_ENDPOINTS.length} endpoints + ${PAGE_ROUTES.length} page routes; runtime skipped — no API_BASE_URL+VERIFY_FLAKY_ENDPOINTS_SESSION_COOKIE)`
    );
    return;
  }

  const runtimeFailures = await runtimeProbe(baseUrl, sessionCookie, companyId);
  if (runtimeFailures.length > 0) {
    for (const item of runtimeFailures) console.error(item);
    fail(`${runtimeFailures.length} flaky endpoint(s) returned >=400`);
  }

  console.log(`verify:no-flaky-endpoints-on-page-load PASS (static+runtime: ${FLAKY_ENDPOINTS.length} endpoints)`);
}

main().catch((error) => fail(String(error?.message ?? error)));
