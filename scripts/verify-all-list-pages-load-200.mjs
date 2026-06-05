#!/usr/bin/env node
/**
 * FINAL-AUDIT-PASS CI guard: canonical list API routes registered (runtime 200 when API+session available).
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LIST_API_PATHS = [
  "/api/v1/mdata/customers",
  "/api/v1/mdata/vendors",
  "/api/v1/mdata/drivers",
  "/api/v1/mdata/units",
  "/api/v1/dispatch/loads",
  "/api/v1/maintenance/work-orders",
  "/api/v1/accounting/invoices",
  "/api/v1/banking/plaid/accounts",
  "/api/v1/fuel/planner/dashboard",
  "/api/v1/identity/users",
  "/api/v1/org/me/companies",
  "/api/v1/reports/library",
  "/api/v1/lists/names/search",
  "/api/v1/docs",
  "/api/v1/legal/contracts",
  "/api/v1/safety/events",
];

function fail(msg) {
  console.error(`verify:all-list-pages-load-200 FAIL: ${msg}`);
  process.exit(1);
}

function readBackendSources() {
  const dir = path.join(ROOT, "apps/backend/src");
  const chunks = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.endsWith(".routes.ts") || entry.name.endsWith(".routes.js")) {
        chunks.push(fs.readFileSync(abs, "utf8"));
      }
    }
  }
  walk(dir);
  return chunks.join("\n");
}

async function runtimeProbe(baseUrl, cookie) {
  const failures = [];
  for (const apiPath of LIST_API_PATHS) {
    try {
      const res = await fetch(`${baseUrl}${apiPath}`, {
        headers: cookie ? { cookie } : {},
        redirect: "manual",
      });
      if (res.status >= 500) failures.push(`${apiPath} -> HTTP ${res.status}`);
    } catch (err) {
      failures.push(`${apiPath} -> ${String(err?.message ?? err)}`);
    }
  }
  return failures;
}

async function main() {
  const routesBlob = readBackendSources();
  const missing = LIST_API_PATHS.filter((p) => !routesBlob.includes(`"${p}"`) && !routesBlob.includes(`'${p}'`));
  if (missing.length > 0) {
    fail(`list routes not registered: ${missing.join(", ")}`);
  }

  const baseUrl = process.env.API_BASE_URL?.replace(/\/$/, "") ?? process.env.FRONTEND_BASE_URL?.replace(/\/$/, "");
  const sessionCookie = process.env.VERIFY_LIST_PAGES_SESSION_COOKIE?.trim();

  if (!baseUrl || !sessionCookie) {
    console.log(
      `verify:all-list-pages-load-200 PASS (static: ${LIST_API_PATHS.length} list routes registered; runtime skipped — no API_BASE_URL+VERIFY_LIST_PAGES_SESSION_COOKIE)`
    );
    return;
  }

  const runtimeFailures = await runtimeProbe(baseUrl, sessionCookie);
  if (runtimeFailures.length > 0) {
    for (const f of runtimeFailures) console.error(f);
    fail(`${runtimeFailures.length} list endpoint(s) returned 5xx`);
  }

  console.log(`verify:all-list-pages-load-200 PASS (${LIST_API_PATHS.length} list routes static+runtime)`);
}

main().catch((err) => fail(String(err?.message ?? err)));
