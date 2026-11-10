#!/usr/bin/env node
/**
 * Horizontal fill-not-shell batch — Settlements detail sections + Accounting
 * remaining registers wrap in BoardSection (engines/actions preserved).
 *
 *   node scripts/verify-fill-remaining-boards-batch.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fill-remaining-boards-batch";

const SURFACES = [
  [
    "EarningsSection",
    "apps/frontend/src/pages/driver-finance/components/EarningsSection.tsx",
    "settlement-earnings-board",
    ["ParityTable", "earnings-section-table"],
  ],
  [
    "DeductionsSection",
    "apps/frontend/src/pages/driver-finance/components/DeductionsSection.tsx",
    "settlement-deductions-board",
    ["deductions-section-add", "ParityTable"],
  ],
  [
    "ExtraPaySection",
    "apps/frontend/src/pages/driver-finance/components/ExtraPaySection.tsx",
    "settlement-extra-pay-board",
    ["Add additional pay", "ParityTable"],
  ],
  [
    "ReimbursementsSection",
    "apps/frontend/src/pages/driver-finance/components/ReimbursementsSection.tsx",
    "settlement-reimbursements-board",
    ["Add reimbursement", "ParityTable"],
  ],
  [
    "FuelPurchasesSection",
    "apps/frontend/src/pages/driver-finance/components/FuelPurchasesSection.tsx",
    "settlement-fuel-purchases-board",
    ["ParityTable"],
  ],
  [
    "DeadheadPaySection",
    "apps/frontend/src/pages/driver-finance/components/DeadheadPaySection.tsx",
    "settlement-deadhead-pay-board",
    ["ParityTable"],
  ],
  [
    "SettlementLoadsSection",
    "apps/frontend/src/pages/driver-finance/components/SettlementLoadsSection.tsx",
    "settlement-loads-section",
    ["ParityTable"],
  ],
  [
    "MonthClosePage",
    "apps/frontend/src/pages/accounting/MonthClosePage.tsx",
    "month-close-checklist-board",
    ["Close month", "FORM_INPUT_CLASS"],
  ],
  [
    "SalesTaxPage",
    "apps/frontend/src/pages/accounting/SalesTaxPage.tsx",
    "sales-tax-returns-board",
    ["FORM_INPUT_CLASS", "sales-tax-returns-table"],
  ],
  [
    "OpeningBalanceRegisterPage",
    "apps/frontend/src/pages/accounting/OpeningBalanceRegisterPage.tsx",
    "opening-balance-register-board",
    ["Commit opening balances"],
  ],
  [
    "CreateMultipleBillsPage",
    "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx",
    "create-multiple-bills-board",
    ["createVendorBill", "create-multiple-bills-table"],
  ],
  [
    "DailyReconPage",
    "apps/frontend/src/pages/accounting/DailyReconPage.tsx",
    "daily-recon-empty-board",
    ["MoneyListToolbar", "fetchDailyRecon"],
  ],
  [
    "AccountRegisterPage",
    "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx",
    "account-register-lines-board",
    ["b1-account-register", "account-register-audit-board"],
  ],
];

function audit(read) {
  const fails = [];
  for (const [id, rel, testId, keep] of SURFACES) {
    const src = read(rel);
    if (!src.includes("components/v3/BoardSection")) {
      fails.push(`${id}: must import BoardSection`);
    }
    const re = new RegExp(
      `<BoardSection[\\s\\S]{0,320}testId=["']${testId}["']`,
    );
    if (!re.test(src) && !src.includes(`testId="${testId}"`)) {
      fails.push(`${id}: missing BoardSection testId=${testId}`);
    }
    for (const k of keep) {
      if (!src.includes(k)) fails.push(`${id}: must keep ${k}`);
    }
    if (
      /<section className="rounded-sm border border-gray-200 bg-white"/.test(
        src,
      )
    ) {
      fails.push(`${id}: still has bare rounded section shell`);
    }
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
  selftest([
    {
      name: "BoardSection import dropped",
      file: SURFACES[0][1],
      expect: "EarningsSection: must import BoardSection",
      mutate: (src) =>
        src.split("components/v3/BoardSection").join("components/v3/Gone"),
    },
    {
      name: "board testId removed",
      file: SURFACES[7][1],
      expect: "missing BoardSection testId=month-close-checklist-board",
      mutate: (src) =>
        src
          .split("month-close-checklist-board")
          .join("month-close-checklist-gone"),
    },
    {
      name: "action marker removed",
      file: SURFACES[9][1],
      expect: "must keep Commit opening balances",
      mutate: (src) => src.split("Commit opening balances").join("Commit gone"),
    },
    {
      name: "bare section shell planted",
      file: SURFACES[12][1],
      expect: "still has bare rounded section shell",
      mutate: (src) =>
        src +
        '\n// <section className="rounded-sm border border-gray-200 bg-white">\n',
    },
  ]);
}

const fails = audit(readReal);

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — ${SURFACES.length} Settlements/Accounting surfaces BoardSection-filled`,
);
