#!/usr/bin/env node
/**
 * GAP-20 CI guard — Recurring Bills
 * Verifies migration, services, routes, worker, frontend, and deactivation-only pattern.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

function notContains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (pattern.test(content)) {
      fail(`${relativePath}: FORBIDDEN pattern found — ${check.label}`);
    }
  }
}

// ── Migration ────────────────────────────────────────────────────────────────
const migration = read("db/migrations/202606072351_recurring_bills.sql");
contains("db/migrations/202606072351_recurring_bills.sql", migration, [
  { pattern: /accounting\.recurring_bill_templates/, label: "recurring_bill_templates table" },
  { pattern: /accounting\.recurring_bill_generation_log/, label: "recurring_bill_generation_log table" },
  { pattern: /ih35_app/, label: "ih35_app role grant" },
  { pattern: /ROW LEVEL SECURITY/, label: "RLS enabled" },
  { pattern: /GRANT.*recurring_bill_templates.*TO ih35_app/, label: "grants on recurring_bill_templates" },
  { pattern: /GRANT.*recurring_bill_generation_log.*TO ih35_app/, label: "grants on recurring_bill_generation_log" },
  { pattern: /idx_rb_active/, label: "active index" },
]);
notContains("db/migrations/202606072351_recurring_bills.sql", migration, [
  { pattern: /app_user/, label: "app_user role (forbidden — use ih35_app)" },
]);

// ── Template service ─────────────────────────────────────────────────────────
const templateSvc = read("apps/backend/src/accounting/bills/recurring/template.service.ts");
contains("apps/backend/src/accounting/bills/recurring/template.service.ts", templateSvc, [
  { pattern: /export.*createTemplate/, label: "createTemplate export" },
  { pattern: /export.*updateTemplate/, label: "updateTemplate export" },
  { pattern: /export.*deactivateTemplate/, label: "deactivateTemplate export" },
  { pattern: /export.*listTemplates/, label: "listTemplates export" },
  { pattern: /export.*listActiveTemplatesDue/, label: "listActiveTemplatesDue export" },
  { pattern: /is_active = false/, label: "deactivation sets is_active=false" },
]);
notContains("apps/backend/src/accounting/bills/recurring/template.service.ts", templateSvc, [
  { pattern: /DELETE FROM accounting\.recurring_bill_templates/, label: "DELETE from templates (forbidden — additive only)" },
]);

// ── Generator service ────────────────────────────────────────────────────────
const generatorSvc = read("apps/backend/src/accounting/bills/recurring/generator.service.ts");
contains("apps/backend/src/accounting/bills/recurring/generator.service.ts", generatorSvc, [
  { pattern: /export.*generateFromTemplate/, label: "generateFromTemplate export" },
  { pattern: /export.*computeNextGenerationDate/, label: "computeNextGenerationDate export" },
  { pattern: /export.*runRecurringBillGeneratorTick/, label: "runRecurringBillGeneratorTick export" },
  { pattern: /recurring_bill_generation_log/, label: "writes to generation_log" },
  { pattern: /auto_post/, label: "auto_post logic" },
  { pattern: /postSourceTransaction/, label: "uses posting engine for auto_post" },
  { pattern: /createBill/, label: "uses createBill (no new financial code)" },
]);

// ── Routes ───────────────────────────────────────────────────────────────────
const routes = read("apps/backend/src/accounting/bills/recurring/routes.ts");
contains("apps/backend/src/accounting/bills/recurring/routes.ts", routes, [
  { pattern: /\/api\/accounting\/recurring-bills\/templates/, label: "templates endpoint" },
  { pattern: /\/api\/accounting\/recurring-bills\/generation-log/, label: "generation-log endpoint" },
  { pattern: /generate-now/, label: "generate-now manual trigger" },
  { pattern: /deactivate/, label: "deactivate endpoint" },
  { pattern: /Idempotency-Key/, label: "Idempotency-Key check on POST" },
]);

// ── Worker ───────────────────────────────────────────────────────────────────
const worker = read("apps/backend/src/jobs/recurring-bill-generator-worker.ts");
contains("apps/backend/src/jobs/recurring-bill-generator-worker.ts", worker, [
  { pattern: /export.*initializeRecurringBillGeneratorWorker/, label: "worker init export" },
  { pattern: /export.*stopRecurringBillGeneratorWorker/, label: "worker stop export" },
  { pattern: /06:00|6.*CT|America\/Chicago/, label: "06:00 CT schedule" },
  { pattern: /runRecurringBillGeneratorTick/, label: "calls generator tick" },
]);

// ── index.ts wired ───────────────────────────────────────────────────────────
const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /initializeRecurringBillGeneratorWorker/, label: "worker registered in index.ts" },
  { pattern: /recurring-bill-generator-worker/, label: "worker import in index.ts" },
]);

// ── Frontend ─────────────────────────────────────────────────────────────────
const recurringList = read("apps/frontend/src/pages/accounting/bills/RecurringBillList.tsx");
contains("apps/frontend/src/pages/accounting/bills/RecurringBillList.tsx", recurringList, [
  { pattern: /RecurringBillList/, label: "RecurringBillList component" },
  { pattern: /listRecurringBillTemplates/, label: "calls listRecurringBillTemplates" },
  { pattern: /deactivate/, label: "deactivate action" },
  { pattern: /generate.*now|generateRecurringBillNow/, label: "generate now action" },
]);

const recurringCreate = read("apps/frontend/src/pages/accounting/bills/RecurringBillCreate.tsx");
contains("apps/frontend/src/pages/accounting/bills/RecurringBillCreate.tsx", recurringCreate, [
  { pattern: /RecurringBillCreate/, label: "RecurringBillCreate component" },
  { pattern: /createRecurringBillTemplate/, label: "calls createRecurringBillTemplate" },
  { pattern: /frequency/, label: "frequency field" },
  { pattern: /auto_post|autoPost/, label: "auto_post field" },
]);

const billsPage = read("apps/frontend/src/pages/accounting/BillsPage.tsx");
contains("apps/frontend/src/pages/accounting/BillsPage.tsx", billsPage, [
  { pattern: /RecurringBillList/, label: "RecurringBillList imported in BillsPage" },
  { pattern: /recurring/, label: "Recurring tab in BillsPage" },
]);

// ── Additive-only enforcement ─────────────────────────────────────────────────
[
  "apps/backend/src/accounting/bills/recurring/template.service.ts",
  "apps/backend/src/accounting/bills/recurring/generator.service.ts",
  "apps/backend/src/accounting/bills/recurring/routes.ts",
].forEach((file) => {
  const content = read(file);
  notContains(file, content, [
    { pattern: /DELETE FROM accounting\.recurring_bill_templates/, label: "DELETE from templates table (additive-only)" },
  ]);
});

// ── Docs ─────────────────────────────────────────────────────────────────────
read("docs/specs/gap-20-recurring-bills.md");

// ── Result ───────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`\n[verify-recurring-bills] FAILED (${failures.length} issue(s)):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
} else {
  console.log("[verify-recurring-bills] All checks passed ✓");
  process.exit(0);
}
