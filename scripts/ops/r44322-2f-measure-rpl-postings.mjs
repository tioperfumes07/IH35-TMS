#!/usr/bin/env node
/**
 * ROUND 443.22-2f — READ-ONLY measure of existing related-party loan GL lines (USMCA).
 * Writes JSON to stdout. Never writes to the ledger.
 */
import fs from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACCOUNT_NUMBERS = [
  "2410",
  "2410-00-001",
  "2410-00-002",
  "2410-00-003",
  "2410-00-004",
  "1270",
  "1295",
];

const FACILITY_BY_ACCOUNT = {
  "2410": { person: "(parent — Owner / Related-Party Loan Payable)", facility: null, note: "Do not backfill onto parent; reclassify to person sub-account first if still on parent." },
  "2410-00-001": { person: "Jorge Pablo Guadalupe Muñoz Gonzalez", facility: "Jorge Pablo Guadalupe Muñoz Gonzalez" },
  "2410-00-002": { person: "Scentsx", facility: "Scentsx" },
  "2410-00-003": { person: "Tio Perfumes 2", facility: "Tio Perfumes 2" },
  "2410-00-004": { person: "Laura Muñoz", facility: "Laura Muñoz" },
  "1270": { person: "(asset — Loans to Related Parties)", facility: null, note: "Company lent TO a related party — different facility series if ever used." },
  "1295": { person: "(asset — Relay Fuel Wallet)", facility: null, note: "Debit side for paid-direct Relay advances; not a liability facility." },
};

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const summary = await client.query(
    `
    SELECT a.account_number,
           a.account_name,
           COUNT(*)::int AS postings,
           COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END), 0)::bigint AS debit_cents,
           COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE 0 END), 0)::bigint AS credit_cents
    FROM accounting.journal_entry_postings jep
    JOIN accounting.journal_entries je
      ON je.id = jep.journal_entry_uuid
     AND je.operating_company_id = jep.operating_company_id
    JOIN catalogs.accounts a ON a.id = jep.account_id
    WHERE jep.operating_company_id = $1
      AND a.account_number = ANY($2::text[])
      AND COALESCE(je.is_sample_data, false) IS NOT TRUE
      AND je.status = 'posted'
      AND jep.reversed_by_line_id IS NULL
      AND jep.reversal_of_line_id IS NULL
    GROUP BY a.account_number, a.account_name
    ORDER BY a.account_number
    `,
    [USMCA, ACCOUNT_NUMBERS]
  );

  const lines = await client.query(
    `
    SELECT jep.id::text AS posting_id,
           je.id::text AS journal_entry_id,
           je.entry_date::text AS entry_date,
           je.memo,
           a.account_number,
           a.account_name,
           jep.debit_or_credit,
           jep.amount_cents::bigint AS amount_cents,
           jep.description,
           jep.source_transaction_type,
           jep.source_transaction_id,
           (jep.reversed_by_line_id IS NOT NULL OR jep.reversal_of_line_id IS NOT NULL) AS is_reversed_pair,
           jep.reversed_by_line_id::text AS reversed_by_line_id,
           jep.reversal_of_line_id::text AS reversal_of_line_id,
           bt.id::text AS bank_transaction_id,
           bt.posted_date::text AS bank_posted_date,
           bt.amount_cents::bigint AS bank_amount_cents,
           COALESCE(bt.merchant_name, bt.description) AS bank_payee,
           bt.description AS bank_description
    FROM accounting.journal_entry_postings jep
    JOIN accounting.journal_entries je
      ON je.id = jep.journal_entry_uuid
     AND je.operating_company_id = jep.operating_company_id
    JOIN catalogs.accounts a ON a.id = jep.account_id
    LEFT JOIN banking.bank_transactions bt
      ON bt.operating_company_id = jep.operating_company_id
     AND (
       (jep.source_transaction_type IN ('bank_transaction', 'bank_categorize') AND jep.source_transaction_id = bt.id::text)
       OR bt.matched_journal_entry_id = je.id
       OR bt.matched_related_party_loan_id::text = jep.source_transaction_id
     )
    WHERE jep.operating_company_id = $1
      AND a.account_number = ANY($2::text[])
      AND COALESCE(je.is_sample_data, false) IS NOT TRUE
      AND je.status = 'posted'
    ORDER BY a.account_number, je.entry_date, jep.line_sequence, jep.id
    `,
    [USMCA, ACCOUNT_NUMBERS]
  );

  const allPostedSummary = await client.query(
    `
    SELECT a.account_number,
           a.account_name,
           COUNT(*)::int AS postings_including_reversed,
           COUNT(*) FILTER (WHERE jep.reversed_by_line_id IS NULL AND jep.reversal_of_line_id IS NULL)::int AS live_postings,
           COUNT(*) FILTER (WHERE jep.reversed_by_line_id IS NOT NULL OR jep.reversal_of_line_id IS NOT NULL)::int AS reversed_pair_postings,
           COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' AND jep.reversed_by_line_id IS NULL AND jep.reversal_of_line_id IS NULL THEN jep.amount_cents ELSE 0 END), 0)::bigint AS live_debit_cents,
           COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'credit' AND jep.reversed_by_line_id IS NULL AND jep.reversal_of_line_id IS NULL THEN jep.amount_cents ELSE 0 END), 0)::bigint AS live_credit_cents
    FROM accounting.journal_entry_postings jep
    JOIN accounting.journal_entries je
      ON je.id = jep.journal_entry_uuid
     AND je.operating_company_id = jep.operating_company_id
    JOIN catalogs.accounts a ON a.id = jep.account_id
    WHERE jep.operating_company_id = $1
      AND a.account_number = ANY($2::text[])
      AND COALESCE(je.is_sample_data, false) IS NOT TRUE
      AND je.status = 'posted'
    GROUP BY a.account_number, a.account_name
    ORDER BY a.account_number
    `,
    [USMCA, ACCOUNT_NUMBERS]
  );

  await client.query("ROLLBACK");

  const proposals = lines.rows.map((row) => {
    const map = FACILITY_BY_ACCOUNT[row.account_number] || { person: "?", facility: null };
    // Liability 2410*: credit = money IN (advance / company owes more); debit = money OUT (repayment / company paid down).
    // Asset 1270/1295: debit = company asset up; credit = asset down.
    let direction;
    let proposedKind;
    if (String(row.account_number).startsWith("2410")) {
      if (row.debit_or_credit === "credit") {
        direction = "IN";
        proposedKind = "facility_advance";
      } else {
        direction = "OUT";
        proposedKind = "facility_repayment";
      }
    } else if (row.account_number === "1295") {
      direction = row.debit_or_credit === "debit" ? "DEBIT_WALLET" : "CREDIT_WALLET";
      proposedKind = "relay_fuel_wallet_side";
    } else {
      direction = row.debit_or_credit === "debit" ? "LOAN_OUT_ASSET" : "LOAN_OUT_COLLECT";
      proposedKind = "loans_to_related_parties_asset";
    }
    const isReversed = Boolean(row.is_reversed_pair);
    return {
      posting_id: row.posting_id,
      journal_entry_id: row.journal_entry_id,
      entry_date: row.entry_date,
      account_number: row.account_number,
      account_name: row.account_name,
      debit_or_credit: row.debit_or_credit,
      amount_cents: Number(row.amount_cents),
      amount_usd: (Number(row.amount_cents) / 100).toFixed(2),
      description: row.description,
      memo: row.memo,
      source_transaction_type: row.source_transaction_type,
      source_transaction_id: row.source_transaction_id,
      is_reversed_pair: isReversed,
      reversed_by_line_id: row.reversed_by_line_id,
      reversal_of_line_id: row.reversal_of_line_id,
      bank_transaction_id: row.bank_transaction_id,
      bank_posted_date: row.bank_posted_date,
      bank_payee: row.bank_payee,
      bank_amount_cents: row.bank_amount_cents != null ? Number(row.bank_amount_cents) : null,
      proposed_person: map.person,
      proposed_facility: map.facility,
      proposed_direction: direction,
      proposed_kind: isReversed ? "do_not_backfill_reversed_pair" : proposedKind,
      map_note: isReversed
        ? "Already reversed in GL — leave alone. Do not mint a facility entry."
        : map.note || null,
      rewrite_journal: false,
      backfill_only_via_engine_on_owner_word: !isReversed,
    };
  });

  const live = proposals.filter((p) => !p.is_reversed_pair);
  const reversed = proposals.filter((p) => p.is_reversed_pair);

  const out = {
    measured_at: new Date().toISOString(),
    branch: "br-fancy-credit-akjnd07a",
    operating_company_id: USMCA,
    filter: "posted JE, non-sample, all JEP lines on 2410* / 1270 / 1295 (live + reversed pairs)",
    packet_count_check: {
      expected_from_lead_packet: 209,
      measured_all_posted: proposals.length,
      measured_live_non_reversed: live.length,
      measured_reversed_pairs: reversed.length,
    },
    summary_live: summary.rows.map((r) => ({
      ...r,
      debit_cents: Number(r.debit_cents),
      credit_cents: Number(r.credit_cents),
      net_credit_cents: Number(r.credit_cents) - Number(r.debit_cents),
      net_credit_usd: ((Number(r.credit_cents) - Number(r.debit_cents)) / 100).toFixed(2),
      proposed_person: (FACILITY_BY_ACCOUNT[r.account_number] || {}).person,
    })),
    summary_all_posted: allPostedSummary.rows.map((r) => ({
      account_number: r.account_number,
      account_name: r.account_name,
      postings_including_reversed: r.postings_including_reversed,
      live_postings: r.live_postings,
      reversed_pair_postings: r.reversed_pair_postings,
      live_debit_cents: Number(r.live_debit_cents),
      live_credit_cents: Number(r.live_credit_cents),
      live_net_credit_cents: Number(r.live_credit_cents) - Number(r.live_debit_cents),
      live_net_credit_usd: (
        (Number(r.live_credit_cents) - Number(r.live_debit_cents)) /
        100
      ).toFixed(2),
      proposed_person: (FACILITY_BY_ACCOUNT[r.account_number] || {}).person,
    })),
    total_postings_all: proposals.length,
    total_live_candidates: live.length,
    total_reversed_leave_alone: reversed.length,
    live_candidates: live,
    reversed_leave_alone: reversed,
  };

  const outPath = process.argv[2];
  const json = JSON.stringify(out, null, 2);
  if (outPath) fs.writeFileSync(outPath, json + "\n");
  console.log(json);
} finally {
  await client.end();
}
