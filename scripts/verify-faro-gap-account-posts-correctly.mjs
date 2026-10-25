#!/usr/bin/env node
/**
 * verify-faro-gap-account-posts-correctly (step 18805)
 *
 * For every USMCA factoring_advance that has bank_wire_gap_account_id set AND a live (non-reversed)
 * funding JE, verifies:
 *   1. 1090 (cash_clearing) DR = bank_wire_cents
 *   2. gap_account DR = (cash - bank_wire_cents) [factorHeld amount]
 *   3. 1230 (factor_reserve_held) DR = reserve_amount_cents (not inflated by the gap)
 *
 * PASS when 0 advances with bank_wire_gap_account_id set exist (seed not yet run).
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "live count: Faro gap-account balances that don't reconcile to zero";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const { pool } = await requireLiveDbOrExit();

const advances = await pool.query(`
  SELECT
    fa.id::text,
    fa.display_id,
    fa.advance_amount_cents,
    fa.bank_wire_cents,
    fa.reserve_amount_cents,
    fa.bank_wire_gap_account_id::text AS bank_wire_gap_account_id,
    ca_gap.account_number AS gap_account_number,
    je.id::text AS je_id
  FROM accounting.factoring_advances fa
  JOIN accounting.journal_entry_postings jep_key
    ON jep_key.source_transaction_id = fa.id::text
   AND jep_key.source_transaction_type = 'factoring_advance'
   AND jep_key.operating_company_id = fa.operating_company_id
  JOIN accounting.journal_entries je
    ON je.id = jep_key.journal_entry_uuid
   AND je.operating_company_id = fa.operating_company_id
   AND je.status = 'posted'
   AND je.reverses_je_id IS NULL
   AND je.reversed_by_je_id IS NULL
  LEFT JOIN catalogs.accounts ca_gap
    ON ca_gap.id = fa.bank_wire_gap_account_id
   AND ca_gap.operating_company_id = fa.operating_company_id
  WHERE fa.operating_company_id = $1
    AND fa.bank_wire_gap_account_id IS NOT NULL
    AND fa.bank_wire_cents IS NOT NULL
  GROUP BY fa.id, fa.display_id, fa.advance_amount_cents, fa.bank_wire_cents,
           fa.reserve_amount_cents, fa.bank_wire_gap_account_id,
           ca_gap.account_number, je.id
`,
  [USMCA]
);

if (advances.rows.length === 0) {
  console.log("PASS — 0 advances with bank_wire_gap_account_id set (seed not yet run)");
  await pool.end();
  process.exit(0);
}

const findings = [];

for (const adv of advances.rows) {
  const expectedBofA = Number(adv.bank_wire_cents);
  const expectedGap = Number(adv.advance_amount_cents) - expectedBofA;
  const expectedReserve = Number(adv.reserve_amount_cents);

  const legs = await pool.query(`
    SELECT ca.account_number, jep.debit_or_credit, jep.amount_cents::int AS amount_cents
      FROM accounting.journal_entry_postings jep
      JOIN catalogs.accounts ca ON ca.id = jep.account_id AND ca.operating_company_id = jep.operating_company_id
     WHERE jep.journal_entry_uuid = $1::uuid
       AND jep.operating_company_id = $2
  `, [adv.je_id, USMCA]);

  const bofa = legs.rows.filter(r => r.account_number === "1090" && r.debit_or_credit === "debit");
  const gap  = legs.rows.filter(r => r.account_number === adv.gap_account_number && r.debit_or_credit === "debit");
  const rsv  = legs.rows.filter(r => r.account_number === "1230" && r.debit_or_credit === "debit");

  const bofaAmt   = bofa.reduce((s, r) => s + r.amount_cents, 0);
  const gapAmt    = gap.reduce((s, r) => s + r.amount_cents, 0);
  const rsvAmt    = rsv.reduce((s, r) => s + r.amount_cents, 0);

  if (bofaAmt !== expectedBofA) {
    findings.push(`${adv.display_id}: 1090 DR=${bofaAmt} expected ${expectedBofA}`);
  }
  if (gapAmt !== expectedGap) {
    findings.push(`${adv.display_id}: ${adv.gap_account_number} DR=${gapAmt} expected ${expectedGap}`);
  }
  if (rsvAmt !== expectedReserve) {
    findings.push(`${adv.display_id}: 1230 DR=${rsvAmt} expected ${expectedReserve} (must not include gap)`);
  }
}

await pool.end();

if (findings.length > 0) {
  console.error("FAIL — gap account posting mismatches:");
  for (const f of findings) console.error("  " + f);
  process.exit(1);
}

console.log(`PASS — ${advances.rows.length} advance(s) with gap account all post correctly`);
process.exit(0);
