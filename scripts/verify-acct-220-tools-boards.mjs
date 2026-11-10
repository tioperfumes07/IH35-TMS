#!/usr/bin/env node
/**
 * 443.293-C / pending row 220 — Accounting tools tabs (Reclassify · Batch · Escrow)
 * wrap registers in BoardSection (fill-not-shell; engines unchanged).
 *
 *   node scripts/verify-acct-220-tools-boards.mjs [--selftest]
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
    mustKeep: [
      "data-b5-reclassify",
      "reclassify-find",
      "applyReclassify",
      "ParityTable",
    ],
  },
  {
    id: "BatchExpensesPage",
    file: "apps/frontend/src/pages/accounting/batch/BatchExpensesPage.tsx",
    testIds: [
      "batch-expenses-type-board",
      "batch-expenses-toolbar-board",
      "batch-expenses-grid-board",
    ],
    mustKeep: [
      "data-b5-batch-transactions",
      "batch-expenses-save",
      "createExpense",
      "ParityTable",
    ],
  },
  {
    id: "EscrowPage",
    file: "apps/frontend/src/pages/accounting/EscrowPage.tsx",
    testIds: ["escrow-accounts-list-board", "escrow-postings-list-board"],
    mustKeep: [
      "V3KpiTile",
      "MoneyListToolbar",
      "ParityTable",
      "listEscrowAccounts",
    ],
  },
];

const FACTORING = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

function audit(read) {
  const fails = [];
  for (const s of SURFACES) {
    const src = read(s.file);
    if (!src.includes("components/v3/BoardSection")) {
      fails.push(
        `${s.id}: must import BoardSection from components/v3/BoardSection`,
      );
    }
    for (const testId of s.testIds) {
      const re = new RegExp(
        `<BoardSection[\\s\\S]{0,220}testId=["']${testId}["']`,
      );
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
  const factoring = read(FACTORING);
  if (!factoring.includes("FORM_INPUT_CLASS")) {
    fails.push("FactoringHome: must import/use FORM_INPUT_CLASS");
  }
  if (
    /className="mt-1 w-full rounded-sm border border-gray-300 px-2\.5 py-1\.5 text-xs"/.test(
      factoring,
    )
  ) {
    fails.push(
      "FactoringHome: profile edit inputs must use FORM_INPUT_CLASS (not raw py-1.5)",
    );
  }
  if (!factoring.includes('data-testid="factoring-profile-submission-email"')) {
    fails.push("FactoringHome: must keep factoring-profile-submission-email");
  }
  return fails;
}

/** Planted-defect selftest: each mutation is applied to the REAL source of one surface and must be caught. */
function selftest(mutations) {
  const clean = audit(readReal);
  if (clean.length) {
    console.error(
      `${LABEL} SELFTEST FAILED — real sources must pass before planting:\n  - ${clean.join("\n  - ")}`,
    );
    process.exit(1);
  }
  const missed = [];
  for (const m of mutations) {
    const original = readReal(m.file);
    const mutated = m.mutate(original);
    if (mutated === original) {
      missed.push(
        `${m.name}: mutation did not change ${m.file} (stale fixture)`,
      );
      continue;
    }
    const got = audit((rel) => (rel === m.file ? mutated : readReal(rel)));
    if (!got.some((f) => f.includes(m.expect)))
      missed.push(
        `${m.name}: NOT caught (got: ${got.join(" | ") || "no failures"})`,
      );
  }
  if (missed.length) {
    console.error(
      `${LABEL} SELFTEST FAILED — ${mutations.length - missed.length}/${mutations.length} planted defects caught:\n  - ${missed.join("\n  - ")}`,
    );
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects caught`,
  );
  process.exit(0);
}

const readReal = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
if (process.argv.includes("--selftest")) {
  const R = SURFACES[0].file;
  selftest([
    {
      name: "BoardSection import dropped",
      file: R,
      expect: "ReclassifyTransactionsPage: must import BoardSection",
      mutate: (src) =>
        src.split("components/v3/BoardSection").join("components/v3/Removed"),
    },
    {
      name: "board testId removed",
      file: R,
      expect: 'testId="reclassify-grid-board"',
      mutate: (src) =>
        src.split("reclassify-grid-board").join("reclassify-grid-gone"),
    },
    {
      name: "engine marker removed",
      file: SURFACES[1].file,
      expect: "must keep engine/marker createExpense",
      mutate: (src) => src.split("createExpense").join("makeExp"),
    },
    {
      name: "Factoring FORM_INPUT dropped",
      file: FACTORING,
      expect: "must import/use FORM_INPUT_CLASS",
      mutate: (src) => src.split("FORM_INPUT_CLASS").join("RAW_INPUT"),
    },
    {
      name: "Factoring raw py-1.5 input planted",
      file: FACTORING,
      expect: "not raw py-1.5",
      mutate: (src) =>
        src +
        '\n// <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs" />\n',
    },
  ]);
}

const fails = audit(readReal);

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — Reclassify/Batch/Escrow BoardSection + Factoring profile FORM_INPUT`,
);
