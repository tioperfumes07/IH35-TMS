#!/usr/bin/env node
/**
 * Rule-17 guard: escrow posting source EntityLink reverse drill (Law §9).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-posting-entitylink-reverse";
const ESCROW_PAGE = "apps/frontend/src/pages/accounting/EscrowPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertEscrowPostingEntitylinkReverse() {
  const errors = [];
  const escrow = read(ESCROW_PAGE);

  if (!escrow.includes("EscrowPostingSourceLink")) {
    errors.push(`${ESCROW_PAGE}: must render EscrowPostingSourceLink for posting sources`);
  }
  if (!escrow.includes("escrowSourceEntityKind")) {
    errors.push(`${ESCROW_PAGE}: must map escrow source_type → EntityKind via escrowSourceEntityKind`);
  }
  if (!escrow.includes('"driver_settlement"') || !escrow.includes('"settlement"')) {
    errors.push(`${ESCROW_PAGE}: driver_settlement sources must resolve to settlement EntityLink`);
  }
  if (!escrow.includes('"vendor_bill"') || !escrow.includes('"bill"')) {
    errors.push(`${ESCROW_PAGE}: vendor_bill sources must resolve to bill EntityLink`);
  }
  if (!escrow.includes('"factoring_advance"')) {
    errors.push(`${ESCROW_PAGE}: factoring_advance sources must resolve to factoring_advance EntityLink`);
  }
  if (!/linked_journal_entry_id/.test(escrow) || !/kind=["']journal_entry["']/.test(escrow)) {
    errors.push(`${ESCROW_PAGE}: postings must EntityLink linked_journal_entry_id → journal_entry`);
  }
  return errors;
}

function selftest() {
  const errors = assertEscrowPostingEntitylinkReverse();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertEscrowPostingEntitylinkReverse();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
