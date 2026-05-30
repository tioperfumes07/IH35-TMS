#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const routesPath = path.join(process.cwd(), "apps/backend/src/integrity/anomaly-status.routes.ts");

function fail(message) {
  console.error(`verify:integrity-anomaly-tenant-scope FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(routesPath)) {
  fail(`missing routes file: ${routesPath}`);
}

const source = fs.readFileSync(routesPath, "utf8");

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

console.log("verify:integrity-anomaly-tenant-scope OK");
