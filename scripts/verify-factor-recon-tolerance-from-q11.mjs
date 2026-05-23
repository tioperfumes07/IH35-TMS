#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const servicePath = path.join(repoRoot, "apps/backend/src/accounting/factor-reconciliation/recon.service.ts");

function fail(message) {
  console.error("verify:factor-recon-tolerance-from-q11 — FAILED");
  console.error(`- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(servicePath)) {
  fail("missing apps/backend/src/accounting/factor-reconciliation/recon.service.ts");
}

const source = fs.readFileSync(servicePath, "utf8");
if (!/Q11 tolerance rule/.test(source)) {
  fail("service must cite Q11 tolerance decision inline");
}
if (!/Q11_FIXED_TOLERANCE_CENTS\s*=\s*100/.test(source)) {
  fail("fixed tolerance must remain $1.00 (100 cents)");
}
if (!/Q11_PERCENT_TOLERANCE\s*=\s*0\.0001/.test(source)) {
  fail("percent tolerance must remain 0.01% (0.0001)");
}
if (!/Math\.max\(Q11_FIXED_TOLERANCE_CENTS,\s*Math\.round\(Math\.abs\(amountCents\)\s*\*\s*Q11_PERCENT_TOLERANCE\)\)/.test(source)) {
  fail("tolerance function must use Q11 max($1, 0.01%) formula");
}

console.log("verify:factor-recon-tolerance-from-q11 — OK");
