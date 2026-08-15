#!/usr/bin/env node
/** @matrix-built {"modules":["cash-flow","form_425","fuel","insurance"],"cols":["gl_je"],"leafRe":"^(home|tab\\.daily_prediction|tab\\.actual_vs_projected|tab\\.form|tab\\.history|law\\.virtual_banks_excluded|expense_mapping|fuel\\.modal\\.create_fuel_transaction|claims\\.create)$","task":"LINK-F5186-GL-JE-COLUMN-HONESTY-CLUSTER-3"} */
/**
 * LINK-F5186 — gl_je Required-column honesty audit, cluster 3 (banking/cash-flow/form_425/fuel/
 * insurance/safety/settlements/factoring). Same pattern as the precedent
 * verify-fleet-gl-je-required-honest.mjs: DROP leaves that structurally cannot carry a real
 * journal_entry link (forecast/aggregate/config/create-form surfaces), KEEP leaves where a real
 * EntityLink kind="journal_entry" already exists (regression guard against a future silent drop).
 *
 * DROPPED (10 leaves, 4 files) — each verified live to contain zero EntityLink/journal_entry ref:
 *   cash-flow: home (pure tab shell), tab.daily_prediction (forward-looking forecast, no posted JE
 *     yet), tab.actual_vs_projected (per-DATE aggregate rows, no per-record id to drill).
 *   form_425: home/tab.form/tab.history (chrome/form/history list, same reasoning already used for
 *     the sibling liability/qbo_chrome/reverse_link drops on these exact leaves),
 *     law.virtual_banks_excluded (documents a computation rule, not a distinct rendered surface).
 *   fuel: expense_mapping (category->account mapping COVERAGE checker, does no posting itself —
 *     "This screen does NO GL posting" per its own code comment), fuel.modal.create_fuel_transaction
 *     (pure create-form, no record exists yet).
 *   insurance: claims.create (pure create-form, no record exists yet).
 *
 * KEPT (6 leaves, regression-protected) — real EntityLink kind="journal_entry" confirmed live:
 *   banking: transactions.list, transactions.categorize, reconciliation, driver_escrow.
 *   factoring: accounting.detail.
 *   safety: safety.drawer.fine_detail, safety.parity.fine_detail (share one component).
 *   (settlements:settlements.detail is intentionally NOT re-asserted here — already owned by
 *   verify-settlements-gl-ap-honest.mjs; duplicating ownership across two guards is unnecessary.)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-gl-je-required-honest-cluster3";
const SELFTEST = process.argv.includes("--selftest");

const REQUIRED_FILES = {
  "cash-flow": "docs/specs/scoreboard/modules/cash-flow.required.json",
  form_425: "docs/specs/scoreboard/modules/form_425.required.json",
  fuel: "docs/specs/scoreboard/modules/fuel.required.json",
  insurance: "docs/specs/scoreboard/modules/insurance.required.json",
};

const DROPPED = [
  ["cash-flow", "home"],
  ["cash-flow", "tab.daily_prediction"],
  ["cash-flow", "tab.actual_vs_projected"],
  ["form_425", "home"],
  ["form_425", "tab.form"],
  ["form_425", "tab.history"],
  ["form_425", "law.virtual_banks_excluded"],
  ["fuel", "expense_mapping"],
  ["fuel", "fuel.modal.create_fuel_transaction"],
  ["insurance", "claims.create"],
];

const KEEP_SOURCES = {
  bankingTransactions: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  matchDrawer: "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
  bankReconciliation: "apps/frontend/src/pages/banking/BankReconciliationPage.tsx",
  driverEscrow: "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx",
  factoringDetail: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
  fineDetail: "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx",
};

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}
function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function auditGlJeCluster3(docs, sources) {
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

  if (!/kind="journal_entry"/.test(sources.bankingTransactions)) {
    failures.push("banking transactions surface must keep its journal_entry EntityLink");
  }
  if (!/journal_entry/.test(sources.matchDrawer)) {
    failures.push("banking match drawer must keep its journal_entry candidate kind");
  }
  if (!/kind="journal_entry"/.test(sources.bankReconciliation)) {
    failures.push("bank reconciliation must keep its journal_entry EntityLink");
  }
  if (!/kind="journal_entry"/.test(sources.driverEscrow)) {
    failures.push("driver escrow tab must keep its journal_entry EntityLink");
  }
  if (!/kind="journal_entry"/.test(sources.factoringDetail)) {
    failures.push("factoring detail page must keep its journal_entry EntityLink");
  }
  if (!/kind="journal_entry"/.test(sources.fineDetail)) {
    failures.push("fine detail drawer must keep its journal_entry EntityLink");
  }

  return failures;
}

const docs = {};
for (const [mod, rel] of Object.entries(REQUIRED_FILES)) docs[mod] = readJson(rel);
const sources = {};
for (const [key, rel] of Object.entries(KEEP_SOURCES)) sources[key] = readSrc(rel);

if (SELFTEST) {
  const goodFailures = auditGlJeCluster3(docs, sources);
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
    if (auditGlJeCluster3(mutatedDocs, sources).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: re-add gl_je to ${mod}:${id}`);
      process.exit(1);
    }
  }
  for (const key of Object.keys(KEEP_SOURCES)) {
    mutationCount++;
    const mutatedSources = { ...sources, [key]: sources[key].replace(/kind="journal_entry"|journal_entry/g, "kind=\"expense\"") };
    if (auditGlJeCluster3(docs, mutatedSources).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: strip journal_entry from ${key}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutationCount} mutations all detected`);
  process.exit(0);
}

const failures = auditGlJeCluster3(docs, sources);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — gl_je Required drops are honest and real JE reverse leaves remain mandatory`);
