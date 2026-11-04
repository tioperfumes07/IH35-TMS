#!/usr/bin/env node
/**
 * 443.293-C / pending row 220 — Accounting tools tabs (Reclassify · Batch · Escrow)
 * wrap registers in BoardSection (fill-not-shell; engines unchanged).
 *
 *   node scripts/verify-acct-220-tools-boards.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-220-tools-boards";

const SURFACES = [
  {
    id: "ReclassifyTransactionsPage",
    file: "apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx",
    testIds: [
      "reclassify-account-tree-board",
      "reclassify-filters-board",
      "reclassify-grid-board",
      "reclassify-batches-board",
    ],
    mustKeep: ["data-b5-reclassify", "reclassify-find", "applyReclassify", "ParityTable"],
  },
  {
    id: "BatchExpensesPage",
    file: "apps/frontend/src/pages/accounting/batch/BatchExpensesPage.tsx",
    testIds: [
      "batch-expenses-type-board",
      "batch-expenses-toolbar-board",
      "batch-expenses-grid-board",
    ],
    mustKeep: ["data-b5-batch-transactions", "batch-expenses-save", "createExpense", "ParityTable"],
  },
  {
    id: "EscrowPage",
    file: "apps/frontend/src/pages/accounting/EscrowPage.tsx",
    testIds: ["escrow-accounts-list-board", "escrow-postings-list-board"],
    mustKeep: ["V3KpiTile", "MoneyListToolbar", "ParityTable", "listEscrowAccounts"],
  },
];

// --selftest (ACCT-F11105, verify-guard-selftests-are-real): the same check on the real tree must PASS, and on
// planted sources (BoardSection import removed; surfaces emptied) must FAIL.
function check(read) {
  const fails = [];
  for (const s of SURFACES) {
    const src = read(s.file);
    if (!src.includes("components/v3/BoardSection")) {
      fails.push(`${s.id}: must import BoardSection from components/v3/BoardSection`);
    }
    for (const testId of s.testIds) {
      const re = new RegExp(`<BoardSection[\\s\\S]{0,220}testId=["']${testId}["']`);
      if (!re.test(src)) {
        fails.push(`${s.id}: must wrap in <BoardSection … testId="${testId}">`);
      }
    }
    for (const keep of s.mustKeep) {
      if (!src.includes(keep)) {
        fails.push(`${s.id}: must keep engine/marker ${keep}`);
      }
    }
  }

  // Factoring Home profile edit — FORM_INPUT_CLASS (not ad-hoc py-1.5 raw inputs).
  const factoring = read("apps/frontend/src/pages/factoring/FactoringHome.tsx");
  if (!factoring.includes("FORM_INPUT_CLASS")) {
    fails.push("FactoringHome: must import/use FORM_INPUT_CLASS");
  }
  if (/className="mt-1 w-full rounded-sm border border-gray-300 px-2\.5 py-1\.5 text-xs"/.test(factoring)) {
    fails.push("FactoringHome: profile edit inputs must use FORM_INPUT_CLASS (not raw py-1.5)");
  }
  if (!factoring.includes('data-testid="factoring-profile-submission-email"')) {
    fails.push("FactoringHome: must keep factoring-profile-submission-email");
  }
  return fails;
}
const realRead = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (process.argv.includes("--selftest")) {
  const cases = [
    ["the real tree passes", realRead, false],
    ["planted: BoardSection import removed fails", (rel) => realRead(rel).replaceAll("components/v3/BoardSection", "components/v3/Removed"), true],
    ["planted: surfaces emptied fails", () => "", true],
  ];
  let bad = 0;
  for (const [name, read, wantFail] of cases) {
    const got = check(read).length > 0;
    console.log(`${got === wantFail ? "ok  " : "FAIL"} ${name}`);
    if (got !== wantFail) bad++;
  }
  console.log(`${LABEL} selftest: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

const fails = check(realRead);
if (fails.length) {
  console.error(`${LABEL}: FAIL\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Reclassify/Batch/Escrow BoardSection + Factoring profile FORM_INPUT`,);
