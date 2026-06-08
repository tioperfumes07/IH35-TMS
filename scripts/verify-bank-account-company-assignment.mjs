#!/usr/bin/env node
/** GAP-53 CI guard — truth table + routes wired. */
import { readFileSync } from "fs";

const svc = readFileSync("apps/backend/src/banking/integrity/account-company-audit.service.ts", "utf8");
for (const suffix of ["6103", "6129", "6137"]) {
  if (!svc.includes(`"${suffix}": "TRANSP"`)) {
    console.error(`FAIL: truth table missing ${suffix} → TRANSP`);
    process.exit(1);
  }
}

const indexTs = readFileSync("apps/backend/src/index.ts", "utf8");
if (!indexTs.includes("registerBankAccountCompanyAuditRoutes")) {
  console.error("FAIL: registerBankAccountCompanyAuditRoutes not in index.ts");
  process.exit(1);
}

console.log("GAP-53 bank account company assignment guard: PASS");
