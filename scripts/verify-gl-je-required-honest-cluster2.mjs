#!/usr/bin/env node
/** @matrix-built {"modules":["reports","maintenance","system"],"cols":["gl_je"],"leafRe":"^(report\\.management|report\\.cash_flow_statement|parts_inventory\\.record_purchase|tab\\.qbo_recon|tab\\.qbo_sync)$","task":"LINK-F5186-GL-JE-COLUMN-HONESTY-CLUSTER-2"} */
/**
 * LINK-F5186 — gl_je Required-column honesty audit, cluster 2 (reports/maintenance/finance/system).
 * Two genuinely-buildable gaps fixed, three leaves reclassified as false-required.
 *
 * BUILT (2 leaves, real fixes):
 *   report.management (ManagementReportPackagePage.tsx): the P&L and Balance Sheet sections
 *     already carried a real account_id per line (same API shape ProfitLossPage.tsx/
 *     BalanceSheetPage.tsx already use) but rendered it as plain text -- now wraps each account
 *     name in the same registerHref() -> /accounting/chart-of-accounts/register/:id pattern those
 *     standalone pages already use, which carries a real journal_entry EntityLink.
 *   parts_inventory.record_purchase (PartsInventoryTable.tsx): the backend's
 *     POST /parts-inventory/purchases already returns gl_posting.journal_entry_id when
 *     PARTS_PURCHASE_GL_POSTING_ENABLED and the posting succeeds -- the frontend discarded the
 *     entire response. Now typed and surfaced as a banner with EntityLink kind="journal_entry"
 *     when posted, an honest "not posted (<reason>)" message otherwise.
 *
 * RECLASSIFIED to false-required (3 leaves, dropped from Required rather than force-built) --
 * each is a genuine categorical rollup across many accounts/records with no single owning JE:
 *   report.cash_flow_statement: cash-flow.service.ts's toLines() groups every posting by
 *     "${account_type}:${account_subtype}", no account_id on the line type at all.
 *   tab.qbo_recon / tab.qbo_sync: SystemModulePage.tsx's recon.objects rows are aggregate
 *     tms_count/qbo_count/count_in_sync tie-outs per reconciliation object type, not single events.
 *
 * NOT built here -- filed OPEN in docs/audit/GUARD-WORKORDERS.md
 * (AUDIT-REPORT-JE-SUBJECT-TYPE-MISCATEGORIZED): audit.financial_change_log/deduction_trail/
 * void_reversal/period_close_history. These ARE real per-row events with a genuinely correct
 * gl_je requirement, but events.event_log's valid_subject_type CHECK constraint doesn't include
 * invoice/bill/journal_entry, so JE-related events emit as subject_type='task' -- wiring an
 * EntityLink today would link to the wrong entity kind. Needs a migration, out of scope here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-gl-je-required-honest-cluster2";
const SELFTEST = process.argv.includes("--selftest");

const REQUIRED_FILES = {
  reports: "docs/specs/scoreboard/modules/reports.required.json",
  maintenance: "docs/specs/scoreboard/modules/maintenance.required.json",
  system: "docs/specs/scoreboard/modules/system.required.json",
};

const DROPPED = [
  ["reports", "report.cash_flow_statement"],
  ["system", "tab.qbo_recon"],
  ["system", "tab.qbo_sync"],
];

const KEEP_REQUIRED = [
  ["maintenance", "parts_inventory.record_purchase"],
];

const SOURCES = {
  managementReport: "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx",
  partsInventoryTable: "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx",
  maintenanceApi: "apps/frontend/src/api/maintenance.ts",
};

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}
function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function auditGlJeCluster2(docs, sources) {
  const failures = [];
  for (const [mod, id] of DROPPED) {
    const leaf = (docs[mod].leaves || []).find((l) => l.id === id);
    if (!leaf) { failures.push(`${mod}:${id} missing from required.json`); continue; }
    if ((leaf.required || []).includes("gl_je")) failures.push(`${mod}:${id} must not require gl_je`);
  }
  for (const [mod, id] of KEEP_REQUIRED) {
    const leaf = (docs[mod].leaves || []).find((l) => l.id === id);
    if (!leaf) { failures.push(`${mod}:${id} missing from required.json`); continue; }
    if (!(leaf.required || []).includes("gl_je")) failures.push(`${mod}:${id} must keep gl_je (real fix built)`);
  }

  const mgmt = sources.managementReport;
  if (!/plRegisterHref\(line\.account_id/.test(mgmt)) failures.push(`${SOURCES.managementReport}: P&L lines must drill via plRegisterHref(line.account_id, ...)`);
  if (!/bsRegisterHref\(line\.account_id/.test(mgmt)) failures.push(`${SOURCES.managementReport}: Balance Sheet lines must drill via bsRegisterHref(line.account_id, ...)`);

  const table = sources.partsInventoryTable;
  if (!/setLastGlPosting\(created\.gl_posting/.test(table)) failures.push(`${SOURCES.partsInventoryTable}: purchase mutation must capture gl_posting from the create response`);
  if (!/kind="journal_entry"/.test(table)) failures.push(`${SOURCES.partsInventoryTable}: must EntityLink kind=journal_entry when gl_posting.journal_entry_id is present`);

  if (!/PartsPurchaseGlPosting/.test(sources.maintenanceApi) || !/journal_entry_id/.test(sources.maintenanceApi)) {
    failures.push(`${SOURCES.maintenanceApi}: must type PartsPurchaseGlPosting with journal_entry_id`);
  }
  return failures;
}

const docs = {};
for (const [mod, rel] of Object.entries(REQUIRED_FILES)) docs[mod] = readJson(rel);
const sources = {};
for (const [key, rel] of Object.entries(SOURCES)) sources[key] = readSrc(rel);

if (SELFTEST) {
  const goodFailures = auditGlJeCluster2(docs, sources);
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
    if (auditGlJeCluster2(mutatedDocs, sources).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: re-add gl_je to ${mod}:${id}`);
      process.exit(1);
    }
  }
  for (const [mod, id] of KEEP_REQUIRED) {
    mutationCount++;
    const mutatedDocs = structuredClone(docs);
    const leaf = mutatedDocs[mod].leaves.find((l) => l.id === id);
    leaf.required = (leaf.required || []).filter((c) => c !== "gl_je");
    if (auditGlJeCluster2(mutatedDocs, sources).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: drop gl_je from ${mod}:${id}`);
      process.exit(1);
    }
  }
  const sourceMutations = [
    ["managementReport", (s) => s.replace(/plRegisterHref\(line\.account_id/g, "xx(line.account_id")],
    ["managementReport", (s) => s.replace(/bsRegisterHref\(line\.account_id/g, "xx(line.account_id")],
    ["partsInventoryTable", (s) => s.replace("setLastGlPosting(created.gl_posting", "setLastGlPosting(null")],
    ["partsInventoryTable", (s) => s.replace(/kind="journal_entry"/g, 'kind="expense"')],
    ["maintenanceApi", (s) => s.replace(/PartsPurchaseGlPosting/g, "Xxx")],
  ];
  for (const [key, mutate] of sourceMutations) {
    mutationCount++;
    const mutatedSources = { ...sources, [key]: mutate(sources[key]) };
    if (auditGlJeCluster2(docs, mutatedSources).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: ${key}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutationCount} mutations all detected`);
  process.exit(0);
}

const failures = auditGlJeCluster2(docs, sources);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — gl_je Required drops are honest and the two real fixes remain wired`);
