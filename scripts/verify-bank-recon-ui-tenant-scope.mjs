#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const servicePath = path.join(repoRoot, "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts");

function fail(messages) {
  console.error("verify:bank-recon-ui-tenant-scope — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];
if (!fs.existsSync(servicePath)) {
  failures.push("missing apps/backend/src/accounting/bank-recon/recon-worklist.service.ts");
} else {
  const source = fs.readFileSync(servicePath, "utf8");
  if (!/set_config\('app\.operating_company_id'/.test(source)) {
    failures.push("bank recon worklist service must set tenant config in DB scope");
  }
  if (!/operating_company_id\s*=\s*\$1::uuid/.test(source)) {
    failures.push("bank recon queries must filter by operating_company_id");
  }
  if (!/bank_account_id\s*=\s*\$2::uuid/.test(source)) {
    failures.push("bank recon worklist should scope period scans to selected account");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:bank-recon-ui-tenant-scope — OK");
