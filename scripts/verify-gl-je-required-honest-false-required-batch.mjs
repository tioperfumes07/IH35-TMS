#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","reports","finance","system"],"cols":["gl_je"],"leafRe":"^(accounting\\.panel\\.class_cost_center_variance|report\\.cash_flow|report\\.cash_flow_overview|nav\\.loan_wizard|law\\.no_tms_qbo_writeback)$","task":"LINK-F5186-GL-JE-COLUMN-HONESTY-FALSE-REQUIRED-BATCH"} */
/**
 * LINK-F5186 — gl_je Required-column honesty audit, false-required batch (accounting/reports/
 * finance/system). Same pattern as verify-fleet-gl-je-required-honest.mjs and
 * verify-gl-je-required-honest-cluster3.mjs.
 *
 * DROPPED (5 leaves, 4 files) — each verified live to contain zero EntityLink kind="journal_entry":
 *   accounting: accounting.panel.class_cost_center_variance (PeriodComparisonPage.tsx — aggregate
 *     class/cost-center variance rollup, no per-row owned record; same reasoning already used to
 *     drop reverse_link from this exact leaf).
 *   reports: report.cash_flow (CashFlowReport.tsx — two scalar KPIs, no per-record rows at all),
 *     report.cash_flow_overview (CashFlowOverviewPage.tsx — a computed 30-day projection chart, not
 *     real posted records).
 *   finance: nav.loan_wizard (LoanWizardPage.tsx — backend routes are preview-only, Tier 3; the
 *     opening_journal_entry table is a computed draft, never posted; no EntityLink usage at all).
 *   system: law.no_tms_qbo_writeback (SystemModulePage.tsx — a static policy Row/Pill documenting a
 *     system rule, not a financial record).
 *
 * KEPT (regression net, 3 leaves) — real EntityLink kind="journal_entry" confirmed live:
 *   accounting: bills.detail, expenses.detail.
 *   reports: report.ar_aging (via its aging drill chain into InvoiceDetailPage.tsx).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-gl-je-required-honest-false-required-batch";
const SELFTEST = process.argv.includes("--selftest");

const REQUIRED_FILES = {
  accounting: "docs/specs/scoreboard/modules/accounting.required.json",
  reports: "docs/specs/scoreboard/modules/reports.required.json",
  finance: "docs/specs/scoreboard/modules/finance.required.json",
  system: "docs/specs/scoreboard/modules/system.required.json",
};

const DROPPED = [
  ["accounting", "accounting.panel.class_cost_center_variance"],
  ["reports", "report.cash_flow"],
  ["reports", "report.cash_flow_overview"],
  ["finance", "nav.loan_wizard"],
  ["system", "law.no_tms_qbo_writeback"],
];

const KEEP_SOURCES = {
  billDetail: "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
  expenseDetail: "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx",
  invoiceDetail: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
};

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}
function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function auditGlJeFalseRequiredBatch(docs, sources) {
  const failures = [];
  for (const [mod, id] of DROPPED) {
    const doc = docs[mod];
    const leaf = (doc.leaves || []).find((l) => l.id === id);
    if (!leaf) {
      failures.push(`${mod}:${id} missing from required.json`);
      continue;
    }
    if ((leaf.required || []).includes("gl_je")) {
      failures.push(`${mod}:${id} must not require gl_je`);
    }
  }
  if (!/kind="journal_entry"/.test(sources.billDetail)) {
    failures.push("bill detail page must keep its journal_entry EntityLink");
  }
  if (!/kind="journal_entry"/.test(sources.expenseDetail)) {
    failures.push("expense detail page must keep its journal_entry EntityLink");
  }
  if (!/kind="journal_entry"/.test(sources.invoiceDetail)) {
    failures.push("invoice detail page must keep its journal_entry chain (AR aging drill target)");
  }
  return failures;
}

const docs = {};
for (const [mod, rel] of Object.entries(REQUIRED_FILES)) docs[mod] = readJson(rel);
const sources = {};
for (const [key, rel] of Object.entries(KEEP_SOURCES)) sources[key] = readSrc(rel);

if (SELFTEST) {
  const goodFailures = auditGlJeFalseRequiredBatch(docs, sources);
  if (goodFailures.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodFailures.join("; ")}`);
    process.exit(1);
  }

  let mutationCount = 0;
  for (const [mod, id] of DROPPED) {
    mutationCount++;
    const mutatedDocs = structuredClone(docs);
    const leaf = mutatedDocs[mod].leaves.find((l) => l.id === id);
    leaf.required = [...new Set([...(leaf.required || []), "gl_je"])];
    if (auditGlJeFalseRequiredBatch(mutatedDocs, sources).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: re-add gl_je to ${mod}:${id}`);
      process.exit(1);
    }
  }
  for (const key of Object.keys(KEEP_SOURCES)) {
    mutationCount++;
    const mutatedSources = { ...sources, [key]: sources[key].replace(/kind="journal_entry"/g, 'kind="expense"') };
    if (auditGlJeFalseRequiredBatch(docs, mutatedSources).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: strip journal_entry from ${key}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutationCount} mutations all detected`);
  process.exit(0);
}

const failures = auditGlJeFalseRequiredBatch(docs, sources);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — gl_je Required drops are honest and real JE reverse leaves remain mandatory`);
