#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const routesPath = path.join(process.cwd(), "apps/backend/src/integrity/anomaly-status.routes.ts");
const grantsPath = path.join(process.cwd(), "db/migrations/202608190630_integrity_anomalies_runtime_grants.sql");

function fail(message) {
  console.error(`verify:integrity-anomaly-tenant-scope FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(routesPath)) {
  fail(`missing routes file: ${routesPath}`);
}
if (!fs.existsSync(grantsPath)) {
  fail(`missing runtime grants migration: ${grantsPath}`);
}

const source = fs.readFileSync(routesPath, "utf8");
const grants = fs.readFileSync(grantsPath, "utf8");

if (!source.includes("function requireTenant(")) {
  fail("routes must define requireTenant()");
}

const routeChecks = [
  {
    label: "list",
    routeMarker: 'app.get("/api/v1/integrity/anomalies"',
    tenantMarker: "const tenantId = requireTenant(req.query, reply);",
  },
  {
    label: "detail",
    routeMarker: 'app.get("/api/v1/integrity/anomalies/:id"',
    tenantMarker: "const tenantId = requireTenant(req.query, reply);",
  },
  {
    label: "acknowledge",
    routeMarker: 'app.post("/api/v1/integrity/anomalies/:id/acknowledge"',
    tenantMarker: "const tenantId = requireTenant(req.body, reply);",
  },
  {
    label: "resolve",
    routeMarker: 'app.post("/api/v1/integrity/anomalies/:id/resolve"',
    tenantMarker: "const tenantId = requireTenant(req.body, reply);",
  },
  {
    label: "dismiss",
    routeMarker: 'app.post("/api/v1/integrity/anomalies/:id/dismiss"',
    tenantMarker: "const tenantId = requireTenant(req.body, reply);",
  },
];

for (const check of routeChecks) {
  const routeIndex = source.indexOf(check.routeMarker);
  if (routeIndex < 0) {
    fail(`missing route declaration for ${check.label}`);
  }
  const tenantIndex = source.indexOf(check.tenantMarker, routeIndex);
  if (tenantIndex < 0) {
    fail(`missing tenant requirement for ${check.label}`);
  }
  const dbIndex = source.indexOf("withTenantScope(", routeIndex);
  if (dbIndex < 0) {
    fail(`missing tenant scoped DB access for ${check.label}`);
  }
  if (tenantIndex > dbIndex) {
    fail(`requireTenant() must execute before DB query in ${check.label}`);
  }
}

function runtimeGrantErrors(sql) {
  const errors = [];
  if (!/GRANT\s+USAGE\s+ON\s+SCHEMA\s+integrity\s+TO\s+ih35_app\s*;/i.test(sql)) {
    errors.push("ih35_app must retain USAGE on integrity schema");
  }
  if (!/GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s+ON\s+integrity\.anomalies\s+TO\s+ih35_app\s*;/i.test(sql)) {
    errors.push("ih35_app must retain SELECT, INSERT, UPDATE on integrity.anomalies");
  }
  if (/GRANT[^;]*DELETE[^;]*integrity\.anomalies/i.test(sql)) {
    errors.push("integrity.anomalies must not grant DELETE");
  }
  return errors;
}

const grantErrors = runtimeGrantErrors(grants);
if (grantErrors.length > 0) fail(grantErrors.join("\n- "));

if (process.argv.includes("--selftest")) {
  const planted = grants.replace("SELECT, INSERT, UPDATE", "SELECT, UPDATE");
  if (runtimeGrantErrors(planted).length === 0) {
    fail("selftest failed: planted missing INSERT grant was not detected");
  }
  console.log("verify:integrity-anomaly-tenant-scope SELFTEST PASS — planted missing INSERT grant rejected");
}

console.log("verify:integrity-anomaly-tenant-scope OK");
