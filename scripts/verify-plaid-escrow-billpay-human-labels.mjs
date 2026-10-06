#!/usr/bin/env node
/** LST-F121 — Plaid match labels + DriverEscrow settlement + BillPaymentForm bill chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UUID_SLICE_RE, uuidSliceCaseFailures } from "./lib/uuid-slice.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/banking/components/BankingPlaidConnectionsPanel.tsx",
  // BANK-F64 (2026-09-30) split DriverEscrowTabContent into these two sections; the labels live here now.
  "apps/frontend/src/pages/banking/components/DriverEscrowBoardSection.tsx",
  "apps/frontend/src/pages/banking/components/DriverEscrowLedgerSection.tsx",
  "apps/frontend/src/pages/banking/components/forms/BillPaymentForm.tsx",
];
const LABEL = "verify-plaid-escrow-billpay-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (UUID_SLICE_RE.test(src)) {
      problems.push(`${file}: still UUID-slices`);
    }
    if (!/entityLabel\(/.test(src)) {
      problems.push(`${file}: missing entityLabel`);
    }
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  // Append the defect; never replace text that may have moved (the old replace() targeted a file BANK-F64 emptied).
  planted[FILES[1]] = `${planted[FILES[1]]}\nconst plantedLabel = row.settlement_id.slice(0, 8);\n`;
  const wrong = uuidSliceCaseFailures();
  if (wrong.length) {
    console.error(`${LABEL} SELFTEST FAILED: UUID_SLICE_RE misjudges ${wrong.join(" | ")}`);
    process.exit(1);
  }
  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const live = assertAll(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
