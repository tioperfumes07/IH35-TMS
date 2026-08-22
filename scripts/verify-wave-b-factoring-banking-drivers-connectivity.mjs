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
const mountedRoute = (route, component) => new RegExp(
  `path="${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]{0,220}<${component}\\b`
);

const CHECKS = [
  // factoring
  { name: "factoring submit route", file: MANIFEST, pattern: mountedRoute("/factoring/submit", "SubmissionQueue") },
  { name: "factoring batches/new route", file: MANIFEST, pattern: mountedRoute("/factoring/batches/new", "BatchWizard") },
  { name: "factoring factors route", file: MANIFEST, pattern: mountedRoute("/factoring/factors", "FactorAdmin") },
  { name: "factoring reserves route", file: MANIFEST, pattern: mountedRoute("/factoring/reserves", "ReserveDashboard") },
  { name: "faro import route", file: MANIFEST, pattern: mountedRoute("/factoring/faro-import", "FaroImportPage") },
  { name: "accounting factoring list route", file: MANIFEST, pattern: mountedRoute("/accounting/factoring", "FactoringListPage") },
  { name: "factor recon route", file: MANIFEST, pattern: mountedRoute("/accounting/factor-reconciliation", "FactorReconciliationPage") },
  { name: "banking factoring entry route", file: MANIFEST, pattern: /path="\/banking\/factoring"[\s\S]{0,220}<BankingHomePage initialTab="factoring"/ },
  { name: "submission queue invoice+customer drills", file: "apps/frontend/src/pages/factoring/SubmissionQueue.tsx", pattern: /kind="invoice"[\s\S]{0,100}id=\{item\.invoice_id\}[\s\S]{0,500}kind="customer"[\s\S]{0,100}id=\{item\.customer_id\}/ },
  { name: "batch wizard invoice+customer drills", file: "apps/frontend/src/pages/factoring/BatchWizard.tsx", pattern: /kind="invoice" id=\{invoice\.id\}[\s\S]{0,500}kind="customer"[\s\S]{0,100}id=\{invoice\.customer_id\}/ },
  { name: "faro import invoice+customer drills", file: "apps/frontend/src/pages/factoring/FaroImportPage.tsx", pattern: /kind="invoice"[\s\S]{0,100}id=\{row\.invoice_id\}[\s\S]{0,500}kind="customer"[\s\S]{0,100}id=\{row\.customer_id\}/ },
  // banking
  { name: "banking reconciliation route", file: MANIFEST, pattern: mountedRoute("/banking/reconciliation", "BankReconciliationPage") },
  { name: "banking driver escrow route", file: MANIFEST, pattern: /path="\/banking\/driver-escrow"[\s\S]{0,220}<BankingHomePage initialTab="driver_escrow"/ },
  { name: "banking relay route", file: MANIFEST, pattern: /path="\/banking\/relay"[\s\S]{0,220}<BankingHomePage initialTab="relay_card"/ },
  { name: "banking reports route", file: MANIFEST, pattern: /path="\/banking\/reports"[\s\S]{0,220}<BankingHomePage initialTab="reports"/ },
  { name: "statement import route", file: MANIFEST, pattern: /path="\/banking\/statement-import"[\s\S]{0,220}<BankingHomePage initialTab="statement_import"/ },
  { name: "plaid connections route", file: MANIFEST, pattern: /path="\/banking\/plaid-connections"[\s\S]{0,220}<BankingHomePage initialTab="plaid_connections"/ },
  { name: "banking settings route", file: MANIFEST, pattern: /path="\/banking\/settings"[\s\S]{0,220}<BankingHomePage initialTab="settings"/ },
  { name: "bank recon workspace exact reverse drills", file: "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx", pattern: /kind="load"[\s\S]{0,100}id=\{tx\.matched_load_id\}[\s\S]{0,2500}kind="journal_entry" id=\{tx\.matched_journal_entry_id\}/ },
  { name: "banking home factoring advance drill", file: "apps/frontend/src/pages/banking/BankingHome.tsx", pattern: /kind="factoring_advance"[\s\S]{0,100}id=\{row\.id\}/ },
  // drivers
  { name: "drivers home route", file: MANIFEST, pattern: mountedRoute("/drivers", "DriversPage") },
  { name: "drivers cash advances route", file: MANIFEST, pattern: /path="\/drivers\/cash-advances"[\s\S]{0,220}<DriversSubtabRoute subnav="cash_advances"/ },
  { name: "drivers permits route", file: MANIFEST, pattern: /path="\/drivers\/permits"[\s\S]{0,220}<DriversSubtabRoute subnav="permits"/ },
  { name: "pay rate templates route", file: MANIFEST, pattern: /path="\/drivers\/pay-rate-templates"[\s\S]{0,220}<DriversSubtabRoute subnav="pay_rate_templates"/ },
  { name: "drivers deductions route", file: MANIFEST, pattern: /path="\/drivers\/deductions"[\s\S]{0,220}<DriversSubtabRoute subnav="deductions"/ },
  { name: "team splits route", file: MANIFEST, pattern: /path="\/drivers\/team-splits"[\s\S]{0,220}<DriversSubtabRoute subnav="team_splits"/ },
  { name: "drivers disputes route", file: MANIFEST, pattern: /path="\/drivers\/disputes"[\s\S]{0,220}<DriversSubtabRoute subnav="disputes"/ },
  { name: "drivers leave route", file: MANIFEST, pattern: /path="\/drivers\/leave"[\s\S]{0,220}<DriversSubtabRoute subnav="leave"/ },
  { name: "settlement dispute driver+settlement drills", file: "apps/frontend/src/pages/drivers/SettlementDisputeList.tsx", pattern: /kind="driver"[\s\S]{0,100}id=\{row\.driver_id\}[\s\S]{0,500}kind="settlement"[\s\S]{0,100}id=\{row\.settlement_id\}/ },
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
  const sources = new Map([...new Set(CHECKS.map((check) => check.file))].map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]));
  const failures = [];
  for (const check of CHECKS) {
    const original = sources.get(check.file);
    const planted = original.replace(check.pattern, "/* planted exact connectivity defect */");
    if (planted === original) {
      failures.push(`${check.name}: plant did not match live source`);
      continue;
    }
    const found = checkAll((file) => file === check.file ? planted : sources.get(file));
    if (!found.some((failure) => failure.startsWith(`${check.name}:`))) {
      failures.push(`${check.name}: independent plant escaped`);
    }
  }
  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${CHECKS.length}/${CHECKS.length} exact plants rejected)`);
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
