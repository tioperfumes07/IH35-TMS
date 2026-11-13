#!/usr/bin/env node
/**
 * ENG-17 (CC-2 Row 17) — card/factoring payable residual guard.
 *
 * Verifies that for accounts 1090 (Undeposited Funds) and 2510 (Dreamline Diesel Card Payable):
 *   1. Every JE posting carries a source_transaction_id (no orphaned postings).
 *   2. GL balance = sum of open source documents.
 *
 * "Open" definition:
 *   1090: factoring_advance postings where advance.collected_at IS NULL +
 *         factoring_advance_deposit postings (advance-linked additional deposits, also open until collected).
 *   2510: expense and fuel_event postings (all open; no payment entries against 2510 yet).
 *
 * Measured 2026-11-13: 1090 $244,325.48 (36 postings, 0 missing src), 2510 $275,018.42 (1598 postings, 0 missing src).
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-card-factoring-payable-residual";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Max allowed postings with NULL source_transaction_id for these accounts.
const NO_SRC_CEILING = 0;

async function measure(client, operatingCompanyId) {
  // 1. Count postings missing source_transaction_id for 1090 and 2510
  const missingRes = await client.query(
    `SELECT a.account_number, a.account_name,
            COUNT(*) FILTER (WHERE jep.source_transaction_id IS NULL) no_src_count,
            COUNT(*) total_postings,
            COALESCE(SUM(jep.amount_cents), 0) gl_balance_cents
     FROM accounting.journal_entry_postings jep
     JOIN catalogs.accounts a ON a.id = jep.account_id
     WHERE jep.operating_company_id = $1::uuid
       AND a.account_number IN ('1090', '2510')
     GROUP BY a.account_number, a.account_name
     ORDER BY a.account_number`,
    [operatingCompanyId]
  );

  // 2. For 1090: compute open document sum
  // Open = factoring_advance postings for advances with collected_at IS NULL
  //      + factoring_advance_deposit postings (linked to open advances)
  const open1090Res = await client.query(
    `SELECT COALESCE(SUM(jep.amount_cents), 0) open_doc_cents
     FROM accounting.journal_entry_postings jep
     JOIN catalogs.accounts a ON a.id = jep.account_id
     LEFT JOIN accounting.factoring_advances fa
       ON fa.id = jep.source_transaction_id::uuid
      AND fa.operating_company_id = $1::uuid
     WHERE jep.operating_company_id = $1::uuid
       AND a.account_number = '1090'
       AND (
         -- factoring_advance postings: open if advance not collected
         (jep.source_transaction_type = 'factoring_advance' AND fa.collected_at IS NULL)
         -- factoring_advance_deposit postings: open if linked advance not collected
      OR (jep.source_transaction_type = 'factoring_advance_deposit' AND fa.collected_at IS NULL)
       )`,
    [operatingCompanyId]
  );

  // 3. For 2510: compute open document sum
  // Open = all expense + fuel_event postings (no payment entries reduce 2510 yet)
  const open2510Res = await client.query(
    `SELECT COALESCE(SUM(jep.amount_cents), 0) open_doc_cents
     FROM accounting.journal_entry_postings jep
     JOIN catalogs.accounts a ON a.id = jep.account_id
     WHERE jep.operating_company_id = $1::uuid
       AND a.account_number = '2510'
       AND jep.source_transaction_type IN ('expense', 'fuel_event')`,
    [operatingCompanyId]
  );

  const rows = missingRes.rows;
  const row1090 = rows.find((r) => r.account_number === "1090");
  const row2510 = rows.find((r) => r.account_number === "2510");
  const openDoc1090 = parseInt(open1090Res.rows[0]?.open_doc_cents ?? "0");
  const openDoc2510 = parseInt(open2510Res.rows[0]?.open_doc_cents ?? "0");

  return { rows, row1090, row2510, openDoc1090, openDoc2510 };
}

async function run() {
  const selftest = process.argv.includes("--selftest");

  if (selftest) {
    // Mutation 1: missing source_transaction_id > ceiling
    const fake1 = {
      rows: [
        { account_number: "1090", account_name: "Undeposited Funds", no_src_count: "1", total_postings: "36", gl_balance_cents: "24432548" },
        { account_number: "2510", account_name: "Dreamline Diesel Card Payable", no_src_count: "0", total_postings: "1598", gl_balance_cents: "27501842" },
      ],
      row1090: { account_number: "1090", no_src_count: "1", gl_balance_cents: "24432548" },
      row2510: { account_number: "2510", no_src_count: "0", gl_balance_cents: "27501842" },
      openDoc1090: 24432548,
      openDoc2510: 27501842,
    };
    const fails1 = check(fake1);
    if (fails1.length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation 1 (no_src_count > 0) not caught`);
      process.exit(1);
    }

    // Mutation 2: open document sum != GL balance
    const fake2 = {
      rows: [
        { account_number: "1090", account_name: "Undeposited Funds", no_src_count: "0", total_postings: "36", gl_balance_cents: "24432548" },
        { account_number: "2510", account_name: "Dreamline Diesel Card Payable", no_src_count: "0", total_postings: "1598", gl_balance_cents: "27501842" },
      ],
      row1090: { account_number: "1090", no_src_count: "0", gl_balance_cents: "24432548" },
      row2510: { account_number: "2510", no_src_count: "0", gl_balance_cents: "27501842" },
      openDoc1090: 24432548,
      openDoc2510: 27501842 + 100, // off by $1
    };
    const fails2 = check(fake2);
    if (fails2.length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation 2 (open doc sum mismatch) not caught`);
      process.exit(1);
    }

    console.log(`${LABEL} --selftest PASS 2/2 mutations caught`);
    process.exit(0);
  }

  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'on'");
    await client.query(`SET LOCAL app.operating_company_id = '${USMCA}'`);

    const data = await measure(client, USMCA);
    const fails = check(data);

    if (fails.length > 0) {
      console.error(`${LABEL} FAIL (${fails.length}):`);
      for (const f of fails) console.error(`  - ${f}`);
      process.exitCode = 1;
    } else {
      const r1 = data.row1090;
      const r2 = data.row2510;
      console.log(
        `${LABEL}: PASS — 1090 balance $${cents(r1?.gl_balance_cents)} postings=${r1?.total_postings} 0 missing src` +
          ` | 2510 balance $${cents(r2?.gl_balance_cents)} postings=${r2?.total_postings} 0 missing src` +
          ` | open-doc residuals match`
      );
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}

function check(data) {
  const fails = [];
  const { row1090, row2510, openDoc1090, openDoc2510 } = data;

  if (!row1090) {
    fails.push("account 1090 (Undeposited Funds) has no JE postings — expected at least 1");
  } else {
    const noSrc = parseInt(row1090.no_src_count ?? "0");
    if (noSrc > NO_SRC_CEILING) {
      fails.push(
        `account 1090: ${noSrc} posting(s) missing source_transaction_id (ceiling ${NO_SRC_CEILING})`
      );
    }
    const glBal = parseInt(row1090.gl_balance_cents ?? "0");
    if (glBal !== openDoc1090) {
      fails.push(
        `account 1090: GL balance ${cents(glBal)} ≠ open-document sum ${cents(openDoc1090)} (delta ${cents(glBal - openDoc1090)})`
      );
    }
  }

  if (!row2510) {
    fails.push("account 2510 (Dreamline Diesel Card Payable) has no JE postings — expected at least 1");
  } else {
    const noSrc = parseInt(row2510.no_src_count ?? "0");
    if (noSrc > NO_SRC_CEILING) {
      fails.push(
        `account 2510: ${noSrc} posting(s) missing source_transaction_id (ceiling ${NO_SRC_CEILING})`
      );
    }
    const glBal = parseInt(row2510.gl_balance_cents ?? "0");
    if (glBal !== openDoc2510) {
      fails.push(
        `account 2510: GL balance ${cents(glBal)} ≠ open-document sum ${cents(openDoc2510)} (delta ${cents(glBal - openDoc2510)})`
      );
    }
  }

  return fails;
}

function cents(v) {
  const n = parseInt(v ?? "0");
  return `$${(n / 100).toFixed(2)}`;
}

run().catch((err) => {
  console.error(`${LABEL} ERROR: ${err.message}`);
  process.exit(1);
});
