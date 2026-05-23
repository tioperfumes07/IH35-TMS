#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const servicePath = path.join(repoRoot, "apps/backend/src/accounting/bank-recon/match.service.ts");

function fail(messages) {
  console.error("verify:bank-recon-tolerance-from-q11 — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];
if (!fs.existsSync(servicePath)) {
  failures.push("missing apps/backend/src/accounting/bank-recon/match.service.ts");
} else {
  const source = fs.readFileSync(servicePath, "utf8");
  if (!/Q11 tolerance rule for auto-match/.test(source)) {
    failures.push("match.service must cite Q11 tolerance inline");
  }
  if (!/const Q11_FIXED_TOLERANCE_CENTS = 100;/.test(source)) {
    failures.push("Q11 fixed tolerance must be $1.00 (100 cents)");
  }
  if (!/const Q11_PERCENT_TOLERANCE = 0\.0001;/.test(source)) {
    failures.push("Q11 percent tolerance must be 0.01% (0.0001)");
  }
  if (!/Math\.max\(Q11_FIXED_TOLERANCE_CENTS,\s*Math\.round\(Math\.abs\(amountCents\) \* Q11_PERCENT_TOLERANCE\)\)/.test(source)) {
    failures.push("tolerance formula must be max($1, 0.01% of amount)");
  }
  if (!/AUTO_MATCH_MEMO_SIMILARITY_MIN = 0\.8/.test(source)) {
    failures.push("auto-match memo similarity threshold must be 0.8");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:bank-recon-tolerance-from-q11 — OK");
