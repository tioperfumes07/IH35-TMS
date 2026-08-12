#!/usr/bin/env node
/**
 * WAVE-B accounting connectivity leftovers — hub redirects + audit trail drills.
 *
 * @matrix-built {"modules":["accounting"],"cols":["connectivity"],"leafRe":"^(vendors|customers|reports|coa|audit_trail)$","task":"WAVE-B-acct-conn-hub-audit","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-b-acct-conn-hub-audit.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-b-acct-conn-hub-audit";

const CHECKS = [
  {
    name: "accounting/vendors → /vendors",
    file: "apps/frontend/src/routes/manifest.tsx",
    pattern: /path="\/accounting\/vendors"[\s\S]*?<Navigate to="\/vendors" replace/,
  },
  {
    name: "accounting/customers → /customers",
    file: "apps/frontend/src/routes/manifest.tsx",
    pattern: /path="\/accounting\/customers"[\s\S]*?<Navigate to="\/customers" replace/,
  },
  {
    name: "accounting/reports → /reports",
    file: "apps/frontend/src/routes/manifest.tsx",
    pattern: /path="\/accounting\/reports"[\s\S]*?<Navigate to="\/reports" replace/,
  },
  {
    name: "accounting CoA subnav → lists CoA",
    file: "apps/frontend/src/pages/accounting/subnav-manifest.ts",
    pattern: /label:\s*"Chart of Accounts",\s*path:\s*"\/lists\/accounting\/chart-of-accounts"/,
  },
  {
    name: "CoA register route mounted",
    file: "apps/frontend/src/routes/manifest.tsx",
    pattern: /path="\/accounting\/chart-of-accounts\/register\/:accountId"/,
  },
  {
    name: "CoA list View register href",
    file: "apps/frontend/src/pages/lists/accounting/ChartOfAccountsListPage.tsx",
    pattern: /to=\{`\/accounting\/chart-of-accounts\/register\/\$\{row\.id\}`\}/,
  },
  {
    name: "Audit trail JE drill",
    file: "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx",
    pattern: /kind="journal_entry"/,
  },
  {
    name: "Audit trail posting entity drill helper",
    file: "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx",
    pattern: /function PostingEntityLink/,
  },
];

function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src == null) {
      failures.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    if (!c.pattern.test(src)) failures.push(`${c.name}: shape missing in ${c.file}`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const fail = checkAll(() => "POISON");
  if (!fail.length) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (poison trips ${fail.length})`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
});
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — accounting vendors/customers/reports/coa redirects + audit_trail drills ratcheted`,
);
