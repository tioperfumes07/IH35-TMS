#!/usr/bin/env node
/**
 * FAIL-DD2 — pending cash-advance recovery / settlement deductions must be readable
 * on BOTH USMCA surfaces: Deductions (list API + panel) and Cash advances (debt KPI).
 *
 * Cascade evidence: driver_settlement_deductions b4a09ab6 ($100 pending) existed while
 * /drivers/deductions showed only auto-deduction policies and Cash advances printed
 * Total outstanding -$0.00 because debtAlertRows skipped type=loan|advance.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = "apps/backend/src/driver-finance/deductions.routes.ts";
const DRIVERS = "apps/frontend/src/pages/Drivers.tsx";
const PANEL = "apps/frontend/src/pages/drivers/PendingSettlementDeductionsPanel.tsx";
const API = "apps/frontend/src/api/driverFinance.ts";
const PATH = "/api/v1/driver-finance/deductions";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(--|\/\/).*$/gm, "");

function check(routesSrc, driversSrc, panelSrc, apiSrc) {
  const failures = [];
  const routes = strip(routesSrc);
  const drivers = strip(driversSrc);
  const panel = strip(panelSrc);
  const api = strip(apiSrc);

  const at = routes.indexOf(`"${PATH}"`);
  if (at === -1) {
    failures.push(`${ROUTES}: GET ${PATH} missing — pending deductions unservable (FAIL-DD2)`);
  } else {
    const body = routes.slice(at, at + 4200);
    if (!/rateLimit\s*:\s*\{/.test(body)) {
      failures.push(`${ROUTES}: ${PATH} missing rateLimit (FAIL-DD2)`);
    }
    if (!/withCompany\s*\(/.test(body)) {
      failures.push(`${ROUTES}: ${PATH} not wrapped in withCompany (FAIL-DD2)`);
    }
    if (!/d\.operating_company_id\s*=\s*\$1/.test(body)) {
      failures.push(
        `${ROUTES}: ${PATH} lacks explicit d.operating_company_id predicate — Owner sessions would blend entities (FAIL-DD2)`
      );
    }
    const joins = [...body.matchAll(/\b(LEFT\s+JOIN|JOIN)\s+([a-z_]+\.[a-z_]+)\s+(\w+)/gi)];
    for (const [, kind, table, alias] of joins) {
      if (!/^LEFT/i.test(kind)) {
        failures.push(`${ROUTES}: ${PATH} INNER-joins ${table} — silently drops money rows (FAIL-DD2)`);
      }
      if (!new RegExp(`${alias}\\.operating_company_id\\s*=\\s*d\\.operating_company_id`).test(body)) {
        failures.push(`${ROUTES}: ${PATH} join ${table} AS ${alias} not entity-pinned (FAIL-DD2)`);
      }
    }
  }

  if (!/listSettlementDeductions\s*\(/.test(api)) {
    failures.push(`${API}: listSettlementDeductions client missing (FAIL-DD2)`);
  }
  if (!api.includes(PATH)) {
    failures.push(`${API}: client does not call ${PATH} (FAIL-DD2)`);
  }

  if (!/PendingSettlementDeductionsPanel/.test(drivers)) {
    failures.push(`${DRIVERS}: deductions tab does not mount PendingSettlementDeductionsPanel (FAIL-DD2)`);
  }
  if (!/listSettlementDeductions\s*\(/.test(panel)) {
    failures.push(`${PANEL}: panel does not call listSettlementDeductions (FAIL-DD2)`);
  }
  if (!/status:\s*["']pending["']/.test(panel) && !/status:\s*"pending"/.test(panel)) {
    failures.push(`${PANEL}: panel must request status=pending (FAIL-DD2)`);
  }

  // Cash advances / Drivers Owe KPI must include advance + loan liabilities.
  if (!/type\s*===\s*["']advance["']/.test(drivers) || !/type\s*===\s*["']loan["']/.test(drivers)) {
    failures.push(
      `${DRIVERS}: debtAlertRows must include type===\"advance\" and type===\"loan\" (FAIL-DD2 Cash advances -$0.00)`
    );
  }

  return failures;
}

function selftest() {
  const routes = readFileSync(join(ROOT, ROUTES), "utf8");
  const drivers = readFileSync(join(ROOT, DRIVERS), "utf8");
  const panel = readFileSync(join(ROOT, PANEL), "utf8");
  const api = readFileSync(join(ROOT, API), "utf8");
  let probes = 0;
  const mutations = [
    {
      name: "list endpoint path removed",
      apply: () => [
        routes.replace(`"${PATH}"`, '"/api/v1/driver-finance/deductions-GONE"'),
        drivers,
        panel,
        api,
      ],
    },
    {
      name: "explicit opco predicate removed",
      apply: () => [
        routes.replace('const where = ["d.operating_company_id = $1"];', 'const where = ["1=1"];'),
        drivers,
        panel,
        api,
      ],
    },
    {
      name: "advance/loan debt alert removed",
      apply: () => [
        routes,
        drivers
          .replace(/type === "advance" \|\|\s*/g, "")
          .replace(/type === "loan" \|\|\s*/g, ""),
        panel,
        api,
      ],
    },
    {
      name: "pending deductions panel unmounted",
      apply: () => [routes, drivers.replaceAll("PendingSettlementDeductionsPanel", "GonePanel"), panel, api],
    },
  ];
  for (const m of mutations) {
    const [r, d, p, a] = m.apply();
    if (r === routes && d === drivers && p === panel && a === api) {
      console.error(`SELFTEST INERT: mutation "${m.name}" did not apply`);
      process.exit(1);
    }
    if (check(r, d, p, a).length === 0) {
      console.error(`SELFTEST FAILED: guard stayed green with ${m.name}`);
      process.exit(1);
    }
    probes++;
  }
  return probes;
}

const probes = selftest();
const failures = check(
  readFileSync(join(ROOT, ROUTES), "utf8"),
  readFileSync(join(ROOT, DRIVERS), "utf8"),
  readFileSync(join(ROOT, PANEL), "utf8"),
  readFileSync(join(ROOT, API), "utf8")
);

if (failures.length > 0) {
  console.error("FAIL-DD2 FAIL — pending deduction surfaces still broken:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `FAIL-DD2 PASS — GET ${PATH} entity-scoped both ways; FE listSettlementDeductions + PendingSettlementDeductionsPanel mounted; debtAlertRows includes advance/loan. Mutation probes: ${probes}.`
);
