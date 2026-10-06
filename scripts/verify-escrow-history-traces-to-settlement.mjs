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

/** SQL/TS code only — comments cannot satisfy a check (one did: the old escrow_postings path named in a comment). */
function code(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const CHECKS = [
  {
    id: "service-selects-settlement-id",
    // KILL-THE-SECOND-SYSTEM (CC-1, 39a9cb7c0c): escrow history is now the GL register of the driver's 2100-00-<nnn>
    // sub-account; the settlement is the posting's own source document (source_transaction_type 'driver_settlement').
    describe: "escrow-history must SELECT settlement_id from the posting's own source (driver_settlement)",
    file: SERVICE,
    test: (src) =>
      /WHEN reg\.source_transaction_type = 'driver_settlement' THEN reg\.source_transaction_id::text END AS settlement_id/.test(code(src)),
  },
  {
    id: "service-types-settlement-id",
    describe: "the row type must expose settlement_id so the column is not silently dropped",
    file: SERVICE,
    test: (src) => /settlement_id:\s*string \| null/.test(src),
  },
  {
    id: "service-resolves-journal-entry",
    // Each row IS a posted GL line, so its journal entry is its own (j.id), from posted entries only — read from code,
    // never satisfied by a comment that names the old escrow_postings path.
    describe: "escrow-history must take each row's journal entry from the posting itself (posted entries only)",
    file: SERVICE,
    test: (src) =>
      /JOIN accounting\.journal_entries j ON j\.id = p\.journal_entry_uuid AND j\.status = 'posted'/.test(code(src)) &&
      /j\.id AS journal_entry_id/.test(code(src)) &&
      /reg\.journal_entry_id::text/.test(code(src)),
  },
  {
    id: "je-join-is-driver-scoped",
    describe:
      "the journal-entry join must go through the accounting.escrow_accounts bridge on holder_type='driver' " +
      "so one driver can never surface another driver's GL entry",
    file: SERVICE,
    // Both the count and the rows reach the postings ONLY through this driver's escrow sub-account in this company.
    test: (src) =>
      (code(src).match(
        /JOIN accounting\.escrow_accounts ea\s+ON ea\.coa_account_id = p\.account_id\s+AND ea\.holder_type = 'driver'\s+AND ea\.holder_id = \$1::uuid\s+AND ea\.operating_company_id = \$2::uuid/g
      ) ?? []).length >= 2,
  },
  {
    id: "je-refuses-ambiguous-match",
    describe:
      "the journal-entry resolution must return NULL when candidate postings disagree — showing the WRONG " +
      "journal entry against a driver's money is worse than showing none",
    file: SERVICE,
    // The old ledger->escrow_postings hop could find several JEs and had to refuse ambiguity. Now the JE is the row's
    // own posting's entry — exactly one by construction. Fail if the JE is ever resolved through escrow_postings again.
    test: (src) => /reg\.journal_entry_id::text/.test(code(src)) && !/accounting\.escrow_postings/.test(code(src)),
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
      /ds\.operating_company_id = reg\.operating_company_id/.test(code(src)) &&
      /ds\.id::text = reg\.source_transaction_id::text/.test(code(src)),
  },
  {
    id: "escrow-columns-are-alias-qualified",
    describe:
      "register columns must be alias-qualified (reg.) — driver_settlements shares id/operating_company_id/" +
      "created_at, so an unqualified reference is ambiguous and 500s every escrow history page",
    file: SERVICE,
    test: (src) => /reg\.id::text AS uuid/.test(code(src)) && /reg\.created_at::text/.test(code(src)),
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
      find: "THEN reg.source_transaction_id::text END AS settlement_id",
      replace: "THEN NULL::text END AS settlement_id",
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
      name: "JE resolution goes back through escrow_postings (ambiguous hop)",
      file: SERVICE,
      find: "        reg.journal_entry_id::text,\n",
      replace: "        (SELECT ep.linked_journal_entry_id FROM accounting.escrow_postings ep LIMIT 1)::text AS journal_entry_id,\n",
      expect: /je-refuses-ambiguous-match/,
    },
    {
      name: "JE join stops being driver-scoped",
      file: SERVICE,
      find: "           AND ea.holder_id = $1::uuid\n",
      replace: "",
      expect: /je-join-is-driver-scoped/,
    },
    {
      name: "JE taken from somewhere other than the posting's own entry",
      file: SERVICE,
      find: "j.id AS journal_entry_id",
      replace: "NULL::uuid AS journal_entry_id",
      expect: /service-resolves-journal-entry/,
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
      find: "reg.id::text AS uuid",
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
