#!/usr/bin/env node
/**
 * ACCT-F5610 regression guard — sync-outbound-accounting.entities.ts's "expense" QBO outbound
 * builder must select the REAL column (accounting.expenses.total_amount_cents) and convert it from
 * cents to dollars before handing it to QBO's payload, never the phantom `total_amount` (which never
 * existed) treated as an already-dollars value.
 *
 * WHY THIS MATTERS: this is the OPPOSITE direction from ACCT-F5607/ACCT-F5609's bug class (those two
 * tables store dollars in a numeric column; accounting.expenses stores CENTS in a bigint column). A
 * naive column-rename-only fix here would have pushed every synced expense to QuickBooks at 100x
 * OVERSTATED, not understated -- every other QBO outbound translator in this codebase (invoice.ts,
 * bill.ts, payment.ts, bill_payment.ts, credit_memo.ts, journal_entry.ts) divides amount_cents by 100
 * before building the QBO Amount field, so this guard locks both halves: the real column AND the /100.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-outbound-expense-total-amount-cents-column";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/integrations/qbo/sync-outbound-accounting.entities.ts";

const SELECT_LINE = "SELECT transaction_date::text, total_amount_cents::text, memo,";
const CONVERT_LINE = "const total = Number(e.total_amount_cents) / 100;";

function assertAll(src) {
  const problems = [];
  if (!src.includes(SELECT_LINE)) {
    problems.push(
      `"expense" QBO outbound query does not select the real total_amount_cents column ("${SELECT_LINE}") ` +
        `-- either reverted to the phantom total_amount (this query throws 42703) or drifted to yet ` +
        `another column name.`
    );
  }
  if (!src.includes(CONVERT_LINE)) {
    problems.push(
      `"expense" QBO outbound total does not divide total_amount_cents by 100 -- total_amount_cents is ` +
        `a bigint CENTS column, so treating it as already-dollars would push every synced expense to ` +
        `QuickBooks at ~100x overstated.`
    );
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const revertedColumn = src.replace(SELECT_LINE, "SELECT transaction_date::text, total_amount::text, memo,");
  const revertedProblems = assertAll(revertedColumn);
  if (!revertedProblems.some((p) => p.includes("phantom"))) {
    console.error(`${LABEL} SELFTEST FAILED: reverting to the phantom column not caught`);
    process.exit(1);
  }

  const droppedConversion = src.replace(CONVERT_LINE, "const total = Number(e.total_amount_cents);");
  const droppedProblems = assertAll(droppedConversion);
  if (!droppedProblems.some((p) => p.includes("100x overstated"))) {
    console.error(`${LABEL} SELFTEST FAILED: dropping the /100 cents-to-dollars conversion not caught`);
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
console.log(`${LABEL} OK — QBO outbound expense builder selects real total_amount_cents and converts cents to dollars`);
