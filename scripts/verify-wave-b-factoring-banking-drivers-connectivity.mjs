#!/usr/bin/env node
/**
 * WAVE-B connectivity closeout — factoring + banking + drivers remaining leaves.
 *
 * @matrix-built {"modules":["factoring"],"cols":["connectivity"],"leafRe":"^(submit\\.queue|batches\\.create|factors\\.admin|reserves\\.dashboard|faro\\.import|accounting\\.(list|submit|detail|factor_recon)|banking\\.entry)$","task":"WAVE-B-factoring-connectivity-remainder","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["connectivity"],"leafRe":"^(reconciliation|factoring|driver_escrow|relay_card|reports|statement_import|plaid|settings)$","task":"WAVE-B-banking-connectivity-remainder","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["connectivity"],"leafRe":"^(home|cash_advances|permits|pay_rate_templates|deductions|team_splits|disputes|leave)$","task":"WAVE-B-drivers-connectivity-remainder","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-b-factoring-banking-drivers-connectivity.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-b-factoring-banking-drivers-connectivity";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

const CHECKS = [
  // factoring
  { name: "factoring submit route", file: MANIFEST, pattern: /path="\/factoring\/submit"/ },
  { name: "factoring batches/new route", file: MANIFEST, pattern: /path="\/factoring\/batches\/new"/ },
  { name: "factoring factors route", file: MANIFEST, pattern: /path="\/factoring\/factors"/ },
  { name: "factoring reserves route", file: MANIFEST, pattern: /path="\/factoring\/reserves"/ },
  { name: "faro import route", file: MANIFEST, pattern: /path="\/factoring\/faro-import"/ },
  { name: "accounting factoring list route", file: MANIFEST, pattern: /path="\/accounting\/factoring"/ },
  { name: "factor recon route", file: MANIFEST, pattern: /path="\/accounting\/factor-reconciliation"/ },
  { name: "banking factoring entry route", file: MANIFEST, pattern: /path="\/banking\/factoring"/ },
  { name: "submission queue drills", file: "apps/frontend/src/pages/factoring/SubmissionQueue.tsx", pattern: /EntityLink/ },
  { name: "batch wizard drills", file: "apps/frontend/src/pages/factoring/BatchWizard.tsx", pattern: /EntityLink/ },
  { name: "faro import drills", file: "apps/frontend/src/pages/factoring/FaroImportPage.tsx", pattern: /EntityLink/ },
  // banking
  { name: "banking reconciliation route", file: MANIFEST, pattern: /path="\/banking\/reconciliation"/ },
  { name: "banking driver escrow route", file: MANIFEST, pattern: /path="\/banking\/driver-escrow"/ },
  { name: "banking relay route", file: MANIFEST, pattern: /path="\/banking\/relay"/ },
  { name: "banking reports route", file: MANIFEST, pattern: /path="\/banking\/reports"/ },
  { name: "statement import route", file: MANIFEST, pattern: /path="\/banking\/statement-import"/ },
  { name: "plaid connections route", file: MANIFEST, pattern: /path="\/banking\/plaid-connections"/ },
  { name: "banking settings route", file: MANIFEST, pattern: /path="\/banking\/settings"/ },
  { name: "bank recon workspace drills", file: "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx", pattern: /EntityLink/ },
  { name: "banking home drills", file: "apps/frontend/src/pages/banking/BankingHome.tsx", pattern: /EntityLink/ },
  // drivers
  { name: "drivers home route", file: MANIFEST, pattern: /path="\/drivers"/ },
  { name: "drivers cash advances route", file: MANIFEST, pattern: /path="\/drivers\/cash-advances"/ },
  { name: "drivers permits route", file: MANIFEST, pattern: /path="\/drivers\/permits"/ },
  { name: "pay rate templates route", file: MANIFEST, pattern: /path="\/drivers\/pay-rate-templates"/ },
  { name: "drivers deductions route", file: MANIFEST, pattern: /path="\/drivers\/deductions"/ },
  { name: "team splits route", file: MANIFEST, pattern: /path="\/drivers\/team-splits"/ },
  { name: "drivers disputes route", file: MANIFEST, pattern: /path="\/drivers\/disputes"/ },
  { name: "drivers leave route", file: MANIFEST, pattern: /path="\/drivers\/leave"/ },
  { name: "settlement dispute list drills", file: "apps/frontend/src/pages/drivers/SettlementDisputeList.tsx", pattern: /EntityLink/ },
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
console.log(`${LABEL} PASS — factoring+banking+drivers connectivity remainder drained`);
