#!/usr/bin/env node
// M.3 follow-up (docs/bus/OUTBOX-CC-3.md, PR #20605 REMAINING: "company-settlement list/detail
// vertical remains open"). The detail half already existed (company-settlement-report.routes.ts,
// GET .../:id/report). This guards the missing LIST half.
//
// Source check only (no reachable Postgres in static CI) — proves:
//   - GET /api/v1/accounting/company-settlements is registered
//   - it reads accounting.company_settlements directly (no re-derived header data)
//   - it reads net revenue from the report engine's own computeCompanySettlementNetRevenueCents()
//     (LEAD 443.320: one set-based query instead of a full report per row) and touches no money
//     table itself — never a second, competing waterfall; the engine's section 6 and that function
//     read the SAME NET_REVENUE_SALARY / NET_REVENUE_DEDUCTION line-type lists
//   - a voided settlement never gets a fake $0.00 net revenue (dash/null, not zero — law §8)
//
// Run: node scripts/verify-company-settlements-list-route.mjs [--selftest]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-company-settlements-list-route";
const FILE = "apps/backend/src/accounting/company-settlement-list.routes.ts";
const ENGINE = "apps/backend/src/accounting/company-settlement-report.service.ts";

function loadSource(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectEngineFailures(engine = loadSource(ENGINE)) {
  const failures = [];
  if (!/export async function computeCompanySettlementNetRevenueCents\(/.test(engine)) {
    failures.push("report engine has no computeCompanySettlementNetRevenueCents()");
  }
  if (!/new Set<string>\(NET_REVENUE_DEDUCTION_LINE_TYPES\)/.test(engine) || !/new Set<string>\(NET_REVENUE_SALARY_LINE_TYPES\)/.test(engine)) {
    failures.push("report section 6 does not read the shared NET_REVENUE_* line-type lists — the list and the report can drift");
  }
  if (!/\[\.\.\.NET_REVENUE_SALARY_LINE_TYPES, \.\.\.NET_REVENUE_DEDUCTION_LINE_TYPES\]/.test(engine)) {
    failures.push("computeCompanySettlementNetRevenueCents does not bind the shared NET_REVENUE_* line-type lists");
  }
  return failures;
}

export function collectSourceFailures(source = loadSource(FILE)) {
  const failures = [];
  if (!/"\/api\/v1\/accounting\/company-settlements"/.test(source)) {
    failures.push("route path /api/v1/accounting/company-settlements not found");
  }
  if (!/FROM accounting\.company_settlements/.test(source)) {
    failures.push("does not read accounting.company_settlements directly");
  }
  if (!/import \{ computeCompanySettlementNetRevenueCents \} from "\.\/company-settlement-report\.service\.js"/.test(source)) {
    failures.push("does not read net revenue from the report engine's computeCompanySettlementNetRevenueCents() — must never re-derive the waterfall");
  }
  if (/load_charge_lines|settlement_lines|fuel_transactions|accounting\.expenses/.test(source)) {
    failures.push("queries a money table itself — net revenue must come from the report engine only");
  }
  if (!/header\.voided_at \? null :/.test(source) || !/filter\(\(h\) => !h\.voided_at\)/.test(source)) {
    failures.push("does not skip the waterfall / null out net revenue for a voided settlement (fake-zero risk)");
  }
  if (!/export default fp\(/.test(source)) {
    failures.push("no default fp(...) export — @fastify/autoload will silently skip this file (see index.ts's own accounting-autoload comment)");
  }
  return failures;
}

function selftest() {
  const good = loadSource(FILE);
  const goodEngine = loadSource(ENGINE);
  if (collectSourceFailures(good).length || collectEngineFailures(goodEngine).length) {
    console.error(`${LABEL} SELFTEST FAIL — good source rejected`);
    process.exit(1);
  }
  const noAutoload = good.replace("export default fp(", "const _unused = fp(");
  const noReuse = good.replace(/computeCompanySettlementNetRevenueCents/g, "reinventedNet");
  const fakeZero = good.replace("header.voided_at ? null :", "");
  const ownSql = good.replace("FROM accounting.company_settlements cs", "FROM accounting.company_settlements cs /* JOIN dispatch.load_charge_lines */");
  for (const [name, plant] of [
    ["no default export", noAutoload],
    ["no engine reuse", noReuse],
    ["fake zero on voided", fakeZero],
    ["own money SQL in the list", ownSql],
  ]) {
    if (collectSourceFailures(plant).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} was not caught`);
      process.exit(1);
    }
  }
  const driftedReport = goodEngine.replace("new Set<string>(NET_REVENUE_DEDUCTION_LINE_TYPES)", "new Set<string>([\"extra_pay\"])");
  if (collectEngineFailures(driftedReport).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — report section 6 with its own line-type list was not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 5/5 plants rejected`);
}

if (process.argv.includes("--selftest")) selftest();

const failures = [...collectSourceFailures(), ...collectEngineFailures()];
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — list route reads the canonical header table and reads net revenue from the report engine's one shared section-6 calculation`);
