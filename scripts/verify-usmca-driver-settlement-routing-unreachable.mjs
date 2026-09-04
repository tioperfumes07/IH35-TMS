#!/usr/bin/env node
/**
 * verify-usmca-driver-settlement-routing-unreachable.mjs
 *
 * LOAD-COSTS-COMPLETE item (3) (owner ruling 2026-09-04, verbatim): "we never send fuel advance
 * to a driver... the fuel advance from us to the driver is a company expense. he is a company
 * driver, not an owner operator." driver_settlement routing books the owner-operator liability/
 * repayment/amortization machinery -- that model can never legitimately apply to a USMCA driver.
 * "For USMCA, economic_routing must resolve to 'load_expense'. Make 'driver_settlement'
 * UNREACHABLE for a company driver at the SERVICE boundary, not in React."
 *
 * Source-level regression lock (CI has no reachable Postgres).
 */
import { readFileSync } from "node:fs";

const PATH = "apps/backend/src/cash-advances/cash-advance-create.ts";
const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

function loadSource() {
  return readFileSync(PATH, "utf8");
}

export function collectFailures(src = loadSource()) {
  const failures = [];

  if (!src.includes(`const USMCA_COMPANY_ID = "${USMCA_ID}"`)) {
    failures.push("USMCA_COMPANY_ID constant missing or does not match the real USMCA operating_company_id");
  }
  if (!/if \(operatingCompanyId === USMCA_COMPANY_ID\) return "load_expense";/.test(src)) {
    failures.push("resolveEconomicRouting no longer force-returns load_expense for USMCA before any purpose/explicit check");
  }
  // The USMCA check must be the FIRST statement in the function body -- before the explicit
  // override and before the purpose switch -- so neither can ever route a USMCA driver to
  // driver_settlement.
  const fnMatch = src.match(/export function resolveEconomicRouting\([\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push("could not find resolveEconomicRouting's function body -- source shape drifted");
  } else {
    const body = fnMatch[0];
    const usmcaLine = body.indexOf("USMCA_COMPANY_ID) return");
    const explicitLine = body.indexOf("if (explicit) return explicit;");
    if (usmcaLine === -1 || explicitLine === -1 || usmcaLine > explicitLine) {
      failures.push("the USMCA force-check is not the first check in resolveEconomicRouting -- an explicit override or purpose switch could still reach driver_settlement for a USMCA driver");
    }
  }
  if (!/resolveEconomicRouting\(body\.purpose, body\.economic_routing, companyId\)/.test(src)) {
    failures.push("the create flow's call to resolveEconomicRouting no longer passes companyId -- the USMCA force-check would never fire");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const src = loadSource();
  const baseline = collectFailures(src);
  if (baseline.length) {
    console.error(`verify-usmca-driver-settlement-routing-unreachable SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }

  const escaped = [];

  const badCheckRemoved = src.replace(
    `if (operatingCompanyId === USMCA_COMPANY_ID) return "load_expense";\n  if (explicit) return explicit;`,
    `if (explicit) return explicit;`
  );
  if (badCheckRemoved === src || collectFailures(badCheckRemoved).length === 0) {
    escaped.push("USMCA force-check removed from resolveEconomicRouting");
  }

  const badOrder = src.replace(
    `if (operatingCompanyId === USMCA_COMPANY_ID) return "load_expense";\n  if (explicit) return explicit;`,
    `if (explicit) return explicit;\n  if (operatingCompanyId === USMCA_COMPANY_ID) return "load_expense";`
  );
  if (badOrder === src || collectFailures(badOrder).length === 0) {
    escaped.push("USMCA force-check reordered after the explicit override -- an explicit driver_settlement request would win again");
  }

  const badCallSite = src.replace(
    "resolveEconomicRouting(body.purpose, body.economic_routing, companyId)",
    "resolveEconomicRouting(body.purpose, body.economic_routing)"
  );
  if (badCallSite === src || collectFailures(badCallSite).length === 0) {
    escaped.push("call site stopped passing companyId");
  }

  if (escaped.length) {
    console.error(`verify-usmca-driver-settlement-routing-unreachable SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log("verify-usmca-driver-settlement-routing-unreachable SELFTEST PASS — 3/3 plants rejected");
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-usmca-driver-settlement-routing-unreachable: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "verify-usmca-driver-settlement-routing-unreachable: OK — driver_settlement routing is unreachable for USMCA at the service boundary, for any purpose or explicit override"
);
