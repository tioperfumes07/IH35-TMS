#!/usr/bin/env node
/**
 * 0441-mod10 — Cash Flow statement, Cash Forecast, and Finance Hub routes must be
 * explicitly registered in apps/backend/src/index.ts (not rely on autoload alone).
 */
import { readFileSync } from "node:fs";

const failures = [];
const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    failures.push(`${p}: missing`);
    return "";
  }
};

const index = read("apps/backend/src/index.ts");
const accountingIndex = read("apps/backend/src/accounting/index.ts");

const mounts = [
  {
    fn: "registerCashFlowRoutes",
    routeFile: "apps/backend/src/accounting/cash-flow.routes.ts",
    endpoint: 'app.get("/api/v1/accounting/cash-flow"',
  },
  {
    fn: "registerCashForecastRoutes",
    routeFile: "apps/backend/src/accounting/cash-forecast.routes.ts",
    endpoint: 'app.get("/api/v1/accounting/cash-forecast"',
  },
  {
    fn: "registerFinanceHubRoutes",
    routeFile: "apps/backend/src/accounting/finance-hub.routes.ts",
    endpoint: 'app.get("/api/v1/finance/hub/overview"',
  },
];

for (const { fn, routeFile, endpoint } of mounts) {
  const routeSrc = read(routeFile);
  if (routeSrc && !routeSrc.includes(endpoint)) {
    failures.push(`${routeFile}: must expose ${endpoint}`);
  }
  if (index && !new RegExp(`import\\s*\\{\\s*${fn}\\s*\\}`).test(index)) {
    failures.push(`index.ts: missing import { ${fn} }`);
  }
  if (index && !new RegExp(`await\\s+${fn}\\s*\\(\\s*app\\s*\\)`).test(index)) {
    failures.push(`index.ts: must call await ${fn}(app)`);
  }
}

// @fastify/autoload top-level entryRelPath is basename (e.g. cash-flow.routes.ts) — no leading /.
// Require (^|/) so ignore actually matches; \/ alone misses and double-registers with explicit mount.
// In source the regex literal is written as (^|\/) — assert that escaped form.
const ignoreNeedles = [
  ["cash-flow", /\(\^\|\\\/\)cash-flow\\\.routes\\\./],
  ["cash-forecast", /\(\^\|\\\/\)cash-forecast\\\.routes\\\./],
  ["finance-hub", /\(\^\|\\\/\)finance-hub\\\.routes\\\./],
];
for (const [name, re] of ignoreNeedles) {
  if (accountingIndex && !re.test(accountingIndex)) {
    failures.push(
      `accounting/index.ts: ignorePattern must use (^|/)${name}.routes. (not leading-/ only)`,
    );
  }
}

const reportsApi = read("apps/frontend/src/api/reports.ts");
if (reportsApi && !/\/api\/v1\/accounting\/cash-flow/.test(reportsApi)) {
  failures.push("frontend api/reports.ts must call /api/v1/accounting/cash-flow");
}
const accountingApi = read("apps/frontend/src/api/accounting.ts");
if (accountingApi && !/\/api\/v1\/accounting\/cash-forecast/.test(accountingApi)) {
  failures.push("frontend api/accounting.ts must call /api/v1/accounting/cash-forecast");
}
const financeHubApi = read("apps/frontend/src/api/financeHub.ts");
if (financeHubApi && !/\/api\/v1\/finance\/hub\/overview/.test(financeHubApi)) {
  failures.push("frontend api/financeHub.ts must call /api/v1/finance/hub/overview");
}

if (failures.length) {
  console.error("verify:cashflow-routes-mounted — FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify:cashflow-routes-mounted — OK (cash-flow, cash-forecast, finance-hub mounted in index.ts)");
