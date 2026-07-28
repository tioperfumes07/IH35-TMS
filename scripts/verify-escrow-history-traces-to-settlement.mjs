#!/usr/bin/env node
/**
 * SAF-B22 (settlement leg) — an escrow movement must trace back to the settlement that produced it.
 *
 * The defect: `driver_finance.escrow_ledger` has carried `settlement_id` and `settlement_line_id`
 * since it was created, and `escrow-history.service.ts` selected NEITHER. So the driver's escrow
 * history rendered as a column of amounts with no way back to the settlement that moved the money.
 * A balance that cannot be traced to its source is not auditable — McLeod drills an escrow movement
 * to the settlement it was deducted on, NetSuite drills a subledger row to its source transaction,
 * and QuickBooks drills a liability register line to the transaction that created it. The data was
 * already there; only the SELECT and the link were missing.
 *
 * This guard asserts both halves, because either one alone is useless: selecting the id without
 * rendering a link leaves it invisible, and rendering a link over an unselected id yields a dead
 * control that always reads "—".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SERVICE = join(ROOT, "apps/backend/src/master-data/drivers/operations-depth/escrow-history.service.ts");
const VIEW = join(ROOT, "apps/frontend/src/pages/drivers/operations/EscrowHistoryView.tsx");

const CHECKS = [
  {
    id: "service-selects-settlement-id",
    describe: "escrow-history must SELECT settlement_id from driver_finance.escrow_ledger",
    file: SERVICE,
    test: (src) => /settlement_id::text/.test(src),
  },
  {
    id: "service-types-settlement-id",
    describe: "the row type must expose settlement_id so the column is not silently dropped",
    file: SERVICE,
    test: (src) => /settlement_id:\s*string \| null/.test(src),
  },
  {
    id: "view-drills-to-settlement",
    describe: 'the escrow history view must render settlement_id as an EntityLink kind="settlement"',
    file: VIEW,
    test: (src) => /entityKind:\s*"settlement"/.test(src) && /idKey:\s*"settlement_id"/.test(src),
  },
];

export function run() {
  const problems = [];
  for (const c of CHECKS) {
    const src = readFileSync(c.file, "utf8");
    if (!c.test(src)) problems.push(`${c.describe} (${c.id}).`);
  }
  const ok = problems.length === 0;
  return {
    ok,
    total: CHECKS.length,
    problems,
    message: ok
      ? `PASS: all ${CHECKS.length} of ${CHECKS.length} escrow-history settlement-trace points hold ` +
        `(selected, typed, and drilled through).`
      : `FAIL (${problems.length} of ${CHECKS.length}):\n  - ${problems.join("\n  - ")}`,
  };
}

/** Plants each real defect back into the real sources one at a time and requires each to be caught. */
function selftest() {
  const cases = [
    {
      name: "service stops selecting settlement_id",
      file: SERVICE,
      find: "        settlement_id::text,\n",
      replace: "",
      expect: /service-selects-settlement-id/,
    },
    {
      name: "row type stops exposing settlement_id",
      file: SERVICE,
      find: "  settlement_id: string | null;",
      replace: "  // removed by selftest",
      expect: /service-types-settlement-id/,
    },
    {
      name: "view stops drilling to the settlement",
      file: VIEW,
      find: 'entityKind: "settlement"',
      replace: 'entityKind: "driver"',
      expect: /view-drills-to-settlement/,
    },
  ];

  const baseline = run();
  if (!baseline.ok) {
    console.error(`SELFTEST FAIL: repository already red before any mutation.\n${baseline.message}`);
    process.exit(1);
  }

  for (const c of cases) {
    const original = readFileSync(c.file, "utf8");
    if (!original.includes(c.find)) {
      console.error(`SELFTEST FAIL: anchor for "${c.name}" not found — the mutation would be a no-op.`);
      process.exit(1);
    }
    let caught;
    try {
      writeFileSync(c.file, original.replace(c.find, c.replace), "utf8");
      caught = run();
    } finally {
      writeFileSync(c.file, original, "utf8");
    }
    if (caught.ok || !c.expect.test(caught.message)) {
      console.error(`SELFTEST FAIL: "${c.name}" was NOT caught.\nGuard said: ${caught.message}`);
      process.exit(1);
    }
    console.log(`  caught: ${c.name}`);
  }

  const after = run();
  if (!after.ok) {
    console.error(`SELFTEST FAIL: restore did not return the repository to green.\n${after.message}`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS: all ${cases.length} planted defects were caught and the repository restored green.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  console.log(result.message);
  if (!result.ok) process.exit(1);
}
