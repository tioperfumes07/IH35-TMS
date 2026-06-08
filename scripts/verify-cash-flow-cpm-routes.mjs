#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(msg) {
  failures.push(msg);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    fail(`MISSING: ${rel}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

function must(rel, content, checks) {
  if (!content) return;
  for (const { pattern, label } of checks) {
    const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    if (!re.test(content)) fail(`${rel}: missing ${label}`);
  }
}

must("apps/backend/src/reports/cash-flow/route-fix.ts", read("apps/backend/src/reports/cash-flow/route-fix.ts"), [
  { pattern: /\/api\/v1\/reports\/cash-flow/, label: "cash-flow route" },
  { pattern: /operating_company_id/, label: "OCI scoping" },
  { pattern: /registerCashFlowReportRouteFix/, label: "register export" },
]);

must("apps/backend/src/reports/per-truck-cpm/route.ts", read("apps/backend/src/reports/per-truck-cpm/route.ts"), [
  { pattern: /\/api\/v1\/reports\/per-truck-cpm/, label: "per-truck-cpm route" },
  { pattern: /registerPerTruckCpmRoutes/, label: "register export" },
]);

must("apps/backend/src/reports/per-truck-cpm/cpm-calculator.service.ts", read("apps/backend/src/reports/per-truck-cpm/cpm-calculator.service.ts"), [
  { pattern: /calculatePerTruckCpm/, label: "calculator export" },
  { pattern: /operating_company_id = \$1::uuid/, label: "RLS tenant filter" },
]);

read("apps/backend/src/reports/per-truck-cpm/__tests__/cpm-calculator.test.ts");

const index = read("apps/backend/src/reports/index.ts");
must("apps/backend/src/reports/index.ts", index, [
  { pattern: /registerCashFlowReportRouteFix/, label: "cash-flow route-fix wired" },
  { pattern: /registerPerTruckCpmRoutes/, label: "cpm routes wired" },
]);

const manifest = read("apps/frontend/src/routes/manifest.tsx");
must("apps/frontend/src/routes/manifest.tsx", manifest, [
  { pattern: /\/reports\/cash-flow"/, label: "cash-flow frontend route" },
  { pattern: /\/reports\/per-truck-cpm"/, label: "per-truck-cpm frontend route" },
  { pattern: /CashFlowReport/, label: "CashFlowReport import" },
  { pattern: /PerTruckCpmReport/, label: "PerTruckCpmReport import" },
]);

read("docs/specs/gap-45-cash-flow-cpm-routes.md");

if (failures.length) {
  console.error("verify-cash-flow-cpm-routes FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-cash-flow-cpm-routes OK");
