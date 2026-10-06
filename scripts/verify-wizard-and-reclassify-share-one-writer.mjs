#!/usr/bin/env node
// ROUND 363-CC2-D (CC-2) — the Settlement Creator and Accounting › Reclassify share ONE engine, ONE writer, ONE audit
// record. "If a second implementation exists, that is the defect." Static.
//
// Pins:
//   1. one reclassify writer: only reclassify.service.ts INSERTs accounting.reclassify_batches / _batch_lines, and only
//      api/reclassify.ts calls /accounting/reclassify/apply
//   2. the wizard reaches it: the drawer renders WizardReclassifyPanel, which uses findReclassifyLines + applyReclassify
//      and the register's shared drill map (lib/reclassifyDrill) — no wizard-local reclassify, no local drill copy
//   3. the wizard codes each line at creation: item / account / load ids are SENT (not stripped), and the post and the
//      preview both resolve the account through accounting/line-item-account.ts — one resolver, so a preview cannot
//      show one account and the post use another; the hard-coded 6100 lookup lives only inside that fallback
//   4. the driver reimbursement line carries its picked account, and the close engine reads it first
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one that
// MUST fail (a bare fixture cwd — a guard that reports green with none of its inputs present is a
// vacuous proof). Never writes to tracked source.
if (process.argv.includes("--selftest")) { await selftest_verify_wizard_and_reclassify_share_one_writer(); }
async function selftest_verify_wizard_and_reclassify_share_one_writer() {
  const { runGuard, runGuardInFixture, reportSelftest, statusOf, outputOf } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const live = runGuard(me);
  const empty = runGuardInFixture(me);
  reportSelftest("verify_wizard_and_reclassify_share_one_writer", [
    { name: "real tree green", pass: statusOf(live) === 0, detail: statusOf(live) === 0 ? undefined : outputOf(live).slice(-300) },
    { name: "bare fixture fails closed", pass: statusOf(empty) !== 0, detail: statusOf(empty) !== 0 ? undefined : outputOf(empty).slice(-200) },
  ]);
}

const LABEL = "verify-wizard-and-reclassify-share-one-writer";
const fails = [];
const read = (p) => readFileSync(p, "utf8");
function walk(dir, re, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!["__tests__", "node_modules", "dist"].includes(name)) walk(p, re, acc);
    } else if (re.test(name) && !/\.test\.tsx?$/.test(name)) acc.push(p);
  }
  return acc;
}

// 1 — one writer
const ENGINE = "apps/backend/src/accounting/reclassify/reclassify.service.ts";
const backendWriters = walk("apps/backend/src", /\.(ts|mts)$/).filter((f) => /INSERT INTO accounting\.reclassify_batch(es|_lines)\b/.test(read(f)));
if (backendWriters.length === 0) fails.push("found 0 writers of accounting.reclassify_batches — the scan is broken, not clean");
for (const f of backendWriters) if (f !== ENGINE) fails.push(`${f}: a second reclassify writer — the engine is ${ENGINE}`);
const API = "apps/frontend/src/api/reclassify.ts";
const feCallers = walk("apps/frontend/src", /\.(ts|tsx)$/).filter((f) => read(f).includes("/accounting/reclassify/apply"));
for (const f of feCallers) if (f !== API) fails.push(`${f}: posts to /accounting/reclassify/apply directly — use applyReclassify from ${API}`);
if (!feCallers.includes(API)) fails.push(`${API}: no longer calls /accounting/reclassify/apply`);

// 2 — reachable from inside the wizard, through the same engine
const DRAWER = "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx";
const PANEL = "apps/frontend/src/pages/settlements/WizardReclassifyPanel.tsx";
const drawer = read(DRAWER);
const panel = read(PANEL);
if (!/<WizardReclassifyPanel\b/.test(drawer)) fails.push(`${DRAWER}: does not render WizardReclassifyPanel — reclassify is not reachable inside the wizard`);
for (const n of ["applyReclassify", "findReclassifyLines", "source_transaction_ids", "../../lib/reclassifyDrill"]) {
  if (!panel.includes(n)) fails.push(`${PANEL}: lost "${n}"`);
}
// U17 (owner) — "Expenses is read-only; reclassify must work from it": the Expenses list reaches the same panel.
const EXPENSES = "apps/frontend/src/pages/accounting/ExpensesListPage.tsx";
if (!/<WizardReclassifyPanel\b/.test(read(EXPENSES))) fails.push(`${EXPENSES}: reclassify is not reachable from the Expenses list`);
const register = read("apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx");
if (!register.includes("lib/reclassifyDrill")) fails.push("ReclassifyTransactionsPage.tsx: no longer uses the shared drill map (lib/reclassifyDrill)");
for (const [f, src] of [[DRAWER, drawer], [PANEL, panel], ["ReclassifyTransactionsPage.tsx", register]]) {
  if (/function (docKind|docTarget|notReclassifiable)\b/.test(src)) fails.push(`${f}: a local copy of the reclassify drill/selection rule`);
}
if (/onPost[\s\S]{0,600}pushToast\([^)]*posted[^)]*\);\s*onClose\(\);/.test(drawer)) fails.push(`${DRAWER}: Post closes the drawer — the posted lines are never offered for reclassify`);

// 3 — item / account / load at creation, one resolver for preview and post
if (/item_id:\s*_iid/.test(drawer)) fails.push(`${DRAWER}: strips item_id before the API again`);
for (const n of ["<LineCoding", "kind=\"load\"", "getReclassifyAccountTree"]) if (!drawer.includes(n)) fails.push(`${DRAWER}: lost "${n}"`);
const SVC = "apps/backend/src/driver-finance/settlement-creator.service.ts";
const svc = read(SVC);
for (const n of ["resolveLineItemAndAccount", "resolveFuelLineAccount(", "resolveExpenseLineAccount(", "previewExpenseLineAccount(", "resolveLineLoadId("]) {
  if (!svc.includes(n)) fails.push(`${SVC}: lost "${n}"`);
}
const hard6100 = (svc.match(/accountByNumber\(client, [^,]+, "6100"\)/g) ?? []).length;
// one in the shared fallback, one in the separate draft.reimbursements (no picker) pair
if (hard6100 > 2) fails.push(`${SVC}: ${hard6100} hard-coded 6100 lookups — a line account must come from resolveExpenseLineAccount`);
const fuelDoc = read("apps/backend/src/fuel/fuel-expense-document.service.ts");
if (!/resolveLineItemAndAccount\(client, input\.operating_company_id, \{ item_id: input\.item_id, account_id: input\.account_id \}\)/.test(fuelDoc)) {
  fails.push("fuel-expense-document.service.ts: createExpenseFromFuelTransaction no longer honours the picked item / account");
}

// 4 — the reimbursement line's account reaches the close
if (!/load_id, posting_account_id\s*\)\s*VALUES \(\$1::uuid, \$2::uuid, 'reimbursement'/.test(svc)) fails.push(`${SVC}: reimbursement settlement_lines no longer carry posting_account_id`);
const close = read("apps/backend/src/driver-finance/settlement-payrun-close.service.ts");
if (!/r\.posting_account_id \?\? \(await accounts\.reimbursementByType/.test(close)) fails.push("settlement-payrun-close.service.ts: close ignores the reimbursement line's own account");

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — one reclassify writer (${ENGINE}); the wizard reaches it in-drawer; item / account / load coded at creation through one resolver for preview and post`);
