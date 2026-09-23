#!/usr/bin/env node
// Q01 — costs are documents, never free-floating journal entries.
//
// A live JE that debits a 5xxx/6xxx expense account must be backed by the
// accounting.expenses document that owns it. The only current structured exception is a
// factoring_advance: its fee line belongs to the factoring advance document itself. For an
// expense-backed cost, 1090/1100/1150 are never payment accounts; only the explicitly approved
// cash/payable/card accounts below may be credited.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB =
  "live USMCA cost-JE/document linkage; fails closed through requireLiveDbOrExit";

const LABEL = "verify-costs-are-expenses-not-handwritten-jes";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPROVED_COST_CREDITS = new Set(["1000", "1295", "2500", "2510"]);
const FORBIDDEN_COST_CREDITS = new Set(["1090", "1100", "1150"]);
const STRUCTURED_NON_EXPENSE_SOURCES = new Set(["factoring_advance"]);

export function classifyCostJe(row) {
  const sourceTypes = new Set(row.source_types ?? []);
  const creditAccounts = row.credit_accounts ?? [];
  const structured =
    sourceTypes.size > 0 && [...sourceTypes].every((source) => STRUCTURED_NON_EXPENSE_SOURCES.has(source));
  if (structured) return [];

  const findings = [];
  if (!row.expense_id) findings.push("missing_expense_document");
  if (creditAccounts.some((account) => FORBIDDEN_COST_CREDITS.has(account))) {
    findings.push("forbidden_cost_credit");
  }
  if (creditAccounts.some((account) => !APPROVED_COST_CREDITS.has(account))) {
    findings.push("unapproved_cost_credit");
  }
  return findings;
}

async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const result = await client.query(
      `WITH live_cost_jes AS (
         SELECT DISTINCT je.id, je.memo
           FROM accounting.journal_entries je
           JOIN accounting.journal_entry_postings debit_line
             ON debit_line.journal_entry_uuid = je.id
            AND debit_line.debit_or_credit = 'debit'
            AND debit_line.reversed_by_line_id IS NULL
           JOIN catalogs.accounts debit_account ON debit_account.id = debit_line.account_id
          WHERE je.operating_company_id = $1::uuid
            AND je.status = 'posted'
            AND je.voided_at IS NULL
            AND je.reversed_by_je_id IS NULL
            AND je.reverses_je_id IS NULL
            AND debit_account.account_number ~ '^[56]'
       )
       SELECT je.id::text AS journal_entry_id,
              je.memo,
              array_remove(array_agg(DISTINCT p.source_transaction_type), NULL) AS source_types,
              array_remove(array_agg(DISTINCT a.account_number)
                FILTER (WHERE p.debit_or_credit = 'credit'), NULL) AS credit_accounts,
              min(e.id::text) AS expense_id
         FROM live_cost_jes je
         JOIN accounting.journal_entry_postings p
           ON p.journal_entry_uuid = je.id AND p.reversed_by_line_id IS NULL
         JOIN catalogs.accounts a ON a.id = p.account_id
         LEFT JOIN accounting.expenses e
           ON e.operating_company_id = $1::uuid
          AND e.journal_entry_id = je.id
          AND e.voided_at IS NULL
        GROUP BY je.id, je.memo
        ORDER BY je.id`,
      [USMCA_COMPANY_ID],
    );
    await client.query("COMMIT");

    const violations = result.rows.flatMap((row) =>
      classifyCostJe(row).map((finding) => ({ ...row, finding })),
    );
    if (violations.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${violations.length} cost-document violation(s)`);
      for (const row of violations.slice(0, 30)) {
        console.error(
          `  ✗ ${row.journal_entry_id} ${row.finding}; credits=${row.credit_accounts.join(",") || "none"}; memo=${JSON.stringify(row.memo)}`,
        );
      }
      process.exit(1);
    }
    console.log(
      `${LABEL}: LIVE PASS — ${result.rows.length} live cost JE(s); every non-factoring cost has an expense document and approved credit account`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

function selftest() {
  const cases = [
    {
      name: "planted fuel JE without expense and CR 1090 fails twice",
      row: { source_types: ["fuel_event"], credit_accounts: ["1090"], expense_id: null },
      want: ["missing_expense_document", "forbidden_cost_credit", "unapproved_cost_credit"],
    },
    {
      name: "expense paid from operating cash passes",
      row: { source_types: ["expense"], credit_accounts: ["1000"], expense_id: "expense-1" },
      want: [],
    },
    {
      name: "expense paid from Dreamline card payable passes",
      row: { source_types: ["expense"], credit_accounts: ["2510"], expense_id: "expense-2" },
      want: [],
    },
    {
      name: "expense paid from approved 1295/2500 passes",
      row: { source_types: ["expense"], credit_accounts: ["1295", "2500"], expense_id: "expense-3" },
      want: [],
    },
    {
      name: "factoring fee stays attached to its factoring document",
      row: { source_types: ["factoring_advance"], credit_accounts: ["2150"], expense_id: null },
      want: [],
    },
  ];
  let passed = 0;
  for (const test of cases) {
    const got = classifyCostJe(test.row);
    if (JSON.stringify(got) === JSON.stringify(test.want)) passed += 1;
    else console.error(`${LABEL}: SELFTEST FAIL ${test.name}: got=${JSON.stringify(got)} want=${JSON.stringify(test.want)}`);
  }
  if (passed !== cases.length) process.exit(1);
  console.log(`${LABEL}: --selftest PASS ${passed}/${cases.length}`);
}

if (process.argv.includes("--selftest")) selftest();
else await live();
