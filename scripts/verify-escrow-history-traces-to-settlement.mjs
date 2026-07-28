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
    id: "service-resolves-journal-entry",
    describe: "escrow-history must resolve the posted journal entry via accounting.escrow_postings",
    file: SERVICE,
    test: (src) =>
      /accounting\.escrow_postings/.test(src) && /source_type\s*=\s*'driver_settlement'/.test(src),
  },
  {
    id: "je-join-is-driver-scoped",
    describe:
      "the journal-entry join must go through the accounting.escrow_accounts bridge on holder_type='driver' " +
      "so one driver can never surface another driver's GL entry",
    file: SERVICE,
    test: (src) =>
      /JOIN accounting\.escrow_accounts ea/.test(src) &&
      /ea\.holder_type\s*=\s*'driver'/.test(src) &&
      /ea\.holder_id\s*=\s*el\.driver_id/.test(src),
  },
  {
    id: "je-refuses-ambiguous-match",
    describe:
      "the journal-entry resolution must return NULL when candidate postings disagree — showing the WRONG " +
      "journal entry against a driver's money is worse than showing none",
    file: SERVICE,
    test: (src) => /count\(DISTINCT ep\.linked_journal_entry_id\)\s*=\s*1/.test(src),
  },
  {
    id: "view-drills-to-journal-entry",
    describe: 'the escrow history view must render journal_entry_id as an EntityLink kind="journal_entry"',
    file: VIEW,
    test: (src) => /entityKind:\s*"journal_entry"/.test(src) && /idKey:\s*"journal_entry_id"/.test(src),
  },
  {
    id: "service-resolves-bank-via-settlement",
    describe:
      "the bank transaction must be reached THROUGH driver_settlements.paid_via_bank_txn_id — escrow is a " +
      "withholding, so a direct escrow->bank FK would be a modelling error",
    file: SERVICE,
    test: (src) =>
      /LEFT JOIN driver_finance\.driver_settlements ds\b/.test(src) &&
      /ds\.paid_via_bank_txn_id::text AS bank_transaction_id/.test(src) &&
      /ds\.operating_company_id = el\.operating_company_id/.test(src),
  },
  {
    id: "escrow-columns-are-alias-qualified",
    describe:
      "escrow_ledger columns must be alias-qualified — driver_settlements shares id/operating_company_id/" +
      "created_at, so an unqualified reference is ambiguous and 500s every escrow history page",
    file: SERVICE,
    test: (src) => /el\.id::text AS uuid/.test(src) && /el\.created_at::text/.test(src),
  },
  {
    id: "view-drills-to-bank-transaction",
    describe: 'the escrow history view must render bank_transaction_id as an EntityLink kind="bank_transaction"',
    file: VIEW,
    test: (src) => /entityKind:\s*"bank_transaction"/.test(src) && /idKey:\s*"bank_transaction_id"/.test(src),
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
      find: "        el.settlement_id::text,\n",
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
      name: "JE resolution stops guarding against an ambiguous match",
      file: SERVICE,
      find: "count(DISTINCT ep.linked_journal_entry_id) = 1",
      replace: "count(ep.linked_journal_entry_id) >= 1",
      expect: /je-refuses-ambiguous-match/,
    },
    {
      name: "JE join stops being driver-scoped",
      file: SERVICE,
      find: "         AND ea.holder_id = el.driver_id\n",
      replace: "",
      expect: /je-join-is-driver-scoped/,
    },
    {
      name: "view stops drilling to the journal entry",
      file: VIEW,
      find: 'entityKind: "journal_entry"',
      replace: 'entityKind: "driver"',
      expect: /view-drills-to-journal-entry/,
    },
    {
      name: "bank leg stops going through the settlement",
      file: SERVICE,
      find: "      LEFT JOIN driver_finance.driver_settlements ds",
      replace: "      LEFT JOIN driver_finance.driver_settlements ds_unused",
      expect: /service-resolves-bank-via-settlement/,
    },
    {
      name: "escrow columns lose their alias qualification",
      file: SERVICE,
      find: "el.id::text AS uuid",
      replace: "id::text AS uuid",
      expect: /escrow-columns-are-alias-qualified/,
    },
    {
      name: "view stops drilling to the bank transaction",
      file: VIEW,
      find: 'entityKind: "bank_transaction"',
      replace: 'entityKind: "driver"',
      expect: /view-drills-to-bank-transaction/,
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
