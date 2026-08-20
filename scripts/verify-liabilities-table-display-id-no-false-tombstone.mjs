#!/usr/bin/env node
/**
 * ACCT-F5615 regression guard — LiabilitiesTable.tsx's "Display ID" column must never pass a null
 * name into entityLabel() for row.id, because driver_finance.driver_liabilities has NO display_id
 * column (confirmed against its own DDL, db/migrations/0138_p8b_j_pr3_driver_finance_stack.sql) and
 * row.id is the row's OWN primary key -- it never fails to resolve, unlike a foreign-key join. Passing
 * null there fed entityLabel's id-no-name branch, which renders the literal string
 * "Liability — not visible" for EVERY row on the roster, misapplying the "join failed" tombstone
 * signal to a record that unambiguously exists.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-liabilities-table-display-id-no-false-tombstone";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/frontend/src/pages/liabilities/components/LiabilitiesTable.tsx";

function assertAll(src) {
  const problems = [];
  if (!/entityLabel\(row\.type as string \| null, row\.id, "Liability"\)/.test(src)) {
    problems.push(
      "the Display ID column no longer passes row.type as entityLabel's name -- either reverted to " +
        "entityLabel(null, row.id, ...) (false tombstone on every row) or drifted to something else " +
        "not verified by this guard."
    );
  }
  if (/entityLabel\(null,\s*row\.id,\s*"Liability"\)/.test(src)) {
    problems.push("found entityLabel(null, row.id, \"Liability\") -- the false-tombstone regression is back.");
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const reverted = src.replace(
    'entityLabel(row.type as string | null, row.id, "Liability")',
    'entityLabel(null, row.id, "Liability")'
  );
  if (reverted === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: revert mutation string did not match live source`);
    process.exit(1);
  }
  const p1 = assertAll(reverted);
  if (!p1.length) {
    console.error(`${LABEL} SELFTEST FAILED: reverting to entityLabel(null, row.id, ...) not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
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
console.log(`${LABEL} OK — LiabilitiesTable's Display ID column resolves a real label (row.type), never a false "not visible" tombstone for a record that always exists`);
