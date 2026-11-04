#!/usr/bin/env node
/** Fill-not-shell batch 2 — BoardSection panels.  node scripts/verify-fill-batch2-boards.mjs [--selftest] */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fill-batch2-boards";
const SURFACES = [
  [
    "CollectionsPage",
    "apps/frontend/src/pages/accounting/CollectionsPage.tsx",
    [
      "collections-filters-board",
      "collections-queue-board",
      "collections-task-detail-board",
    ],
    ["Run sync now", "EntityLink"],
  ],
  [
    "VendorBalancesPage",
    "apps/frontend/src/pages/accounting/VendorBalancesPage.tsx",
    [
      "vendor-balances-vendors-board",
      "vendor-balances-bills-board",
      "vendor-balances-payments-board",
    ],
    ["PayBillModal", "vendor-balances-select-"],
  ],
  [
    "CompanyWaterfallSection",
    "apps/frontend/src/pages/driver-finance/components/CompanyWaterfallSection.tsx",
    ["settlement-company-waterfall-section"],
    ["waterfall-invoiced", "waterfall-net"],
  ],
  [
    "ImportFuelTransactionsModal",
    "apps/frontend/src/pages/fuel/components/ImportFuelTransactionsModal.tsx",
    ["fuel-import-selected-board", "fuel-import-wex-plan-board"],
    ["SelectCombobox", "fuel-import-kind"],
  ],
];
function audit(read) {
  const fails = [];
  for (const [id, rel, ids, keep] of SURFACES) {
    const src = read(rel);
    if (!src.includes("components/v3/BoardSection"))
      fails.push(`${id}: import BoardSection`);
    for (const tid of ids) {
      if (
        !new RegExp(`testId=["']${tid}["']`).test(src) &&
        !src.includes(`data-testid="${tid}"`)
      ) {
        fails.push(`${id}: missing testId=${tid}`);
      }
    }
    for (const k of keep) if (!src.includes(k)) fails.push(`${id}: keep ${k}`);
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
      expect: "CollectionsPage: import BoardSection",
      mutate: (src) =>
        src.split("components/v3/BoardSection").join("components/v3/Gone"),
    },
    {
      name: "board testId removed",
      file: SURFACES[1][1],
      expect: "missing testId=vendor-balances-bills-board",
      mutate: (src) =>
        src
          .split("vendor-balances-bills-board")
          .join("vendor-balances-bills-gone"),
    },
    {
      name: "action marker removed",
      file: SURFACES[1][1],
      expect: "keep PayBillModal",
      mutate: (src) => src.split("PayBillModal").join("PayGone"),
    },
    {
      name: "SelectCombobox dropped",
      file: SURFACES[3][1],
      expect: "keep SelectCombobox",
      mutate: (src) => src.split("SelectCombobox").join("RawSelect"),
    },
  ]);
}

const fails = audit(readReal);
if (fails.length) {
  console.error(`${LABEL}: FAIL\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${SURFACES.length} surfaces`);
