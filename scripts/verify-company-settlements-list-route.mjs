#!/usr/bin/env node
// M.3 follow-up (docs/bus/OUTBOX-CC-3.md, PR #20605 REMAINING: "company-settlement list/detail
// vertical remains open"). The detail half already existed (company-settlement-report.routes.ts,
// GET .../:id/report). This guards the missing LIST half.
//
// Source check only (no reachable Postgres in static CI) — proves:
//   - GET /api/v1/accounting/company-settlements is registered
//   - it reads accounting.company_settlements directly (no re-derived header data)
//   - it reuses buildCompanySettlementReport() for the net-revenue figure (never a second,
//     competing waterfall calculation)
//   - a voided settlement never gets a fake $0.00 net revenue (dash/null, not zero — law §8)
//
// Run: node scripts/verify-company-settlements-list-route.mjs [--selftest]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-company-settlements-list-route";
const FILE = "apps/backend/src/accounting/company-settlement-list.routes.ts";

function loadSource(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectSourceFailures(source = loadSource(FILE)) {
  const failures = [];
  if (!/"\/api\/v1\/accounting\/company-settlements"/.test(source)) {
    failures.push("route path /api/v1/accounting/company-settlements not found");
  }
  if (!/FROM accounting\.company_settlements/.test(source)) {
    failures.push("does not read accounting.company_settlements directly");
  }
  if (!/buildCompanySettlementReport/.test(source)) {
    failures.push("does not reuse buildCompanySettlementReport() for net revenue — must never re-derive the waterfall");
  }
  if (!/if \(!header\.voided_at\)/.test(source) || !/netRevenueCents: number \| null = null/.test(source)) {
    failures.push("does not skip the waterfall / null out net revenue for a voided settlement (fake-zero risk)");
  }
  if (!/export default fp\(/.test(source)) {
    failures.push("no default fp(...) export — @fastify/autoload will silently skip this file (see index.ts's own accounting-autoload comment)");
  }
  return failures;
}

function selftest() {
  const good = loadSource(FILE);
  if (collectSourceFailures(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — good source rejected`);
    process.exit(1);
  }
  const noAutoload = good.replace("export default fp(", "const _unused = fp(");
  const noReuse = good.replace(/buildCompanySettlementReport/g, "reinventedReport");
  const fakeZero = good.replace("if (!header.voided_at) {", "if (true) {");
  for (const [name, plant] of [
    ["no default export", noAutoload],
    ["no report reuse", noReuse],
    ["fake zero on voided", fakeZero],
  ]) {
    if (collectSourceFailures(plant).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST OK — 3/3 plants rejected`);
}

if (process.argv.includes("--selftest")) selftest();

const failures = collectSourceFailures();
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — list route reads the canonical header table and reuses the existing waterfall service`);
