import type { PoolClient } from "pg";

export type BankingRuleRow = {
  id: string;
  priority: number;
  description_contains: string | null;
  description_regex: string | null;
  amount_min_cents: string | null;
  amount_max_cents: string | null;
  bank_account_filter_id: string | null;
  then_vendor_id: string | null;
  then_account_id: string;
};

export type BankTxnProbe = {
  description: string | null;
  amount_cents: number;
  bank_account_id: string;
};

export function bankingRuleMatches(rule: BankingRuleRow, txn: BankTxnProbe): boolean {
  if (rule.bank_account_filter_id && rule.bank_account_filter_id !== txn.bank_account_id) return false;
  const amt = txn.amount_cents;
  if (rule.amount_min_cents != null && amt < Number(rule.amount_min_cents)) return false;
  if (rule.amount_max_cents != null && amt > Number(rule.amount_max_cents)) return false;

  const descContains = rule.description_contains?.trim();
  if (descContains) {
    const hay = (txn.description ?? "").toLowerCase();
    if (!hay.includes(descContains.toLowerCase())) return false;
  }

  const rx = rule.description_regex?.trim();
  if (rx) {
    try {
      const re = new RegExp(rx, "i");
      if (!re.test(txn.description ?? "")) return false;
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * BNK-01 (owner, carried forward from 09-07, re-confirmed still open 09-09) — "fuzzy/many-to-one
 * fuel-card matching and vendor-alias matching." The exact-substring/regex engine above requires a
 * hand-authored rule per stable substring; live-measured (USMCA, Neon, 2026-09-10): plain,
 * one-word descriptions like "Uber" and "Office Depot" are a BYTE-FOR-BYTE match to an existing,
 * active vendor's own vendor_name (similarity 1.0) yet carry no suggestion at all, because nobody
 * has authored a rule for them — a gap that grows with every new vendor, one rule at a time.
 *
 * This is a FALLBACK, never a replacement: it only runs when the exact engine above found nothing,
 * so an authored rule always wins (same precedence a human would expect — an explicit rule is more
 * certain than an inferred one). Uses Postgres pg_trgm trigram similarity (already enabled on this
 * database) against every active vendor's vendor_name for the same company — no new schema, no new
 * GL math, same suggested_* columns the exact engine already writes.
 *
 * SAFETY (money-adjacent names are not "close enough"): a raw top-1 similarity threshold alone is
 * not safe here — Zelle/wire descriptions frequently carry a person's name, and this vendor list
 * commonly has several similarly-named people (driver payments), so "closest name wins" could
 * misattribute a payment to the WRONG person. Two guards: (1) MIN_SIMILARITY floor (0.30) so a
 * weak, coincidental resemblance never suggests anything; (2) a MARGIN over the runner-up (0.05) —
 * if the best and second-best candidates are within that margin of each other, the match is
 * genuinely ambiguous and this refuses to guess, leaving the transaction for a human to categorize
 * (exactly the fail-closed shape `bankingRuleMatches` already has for a malformed regex).
 */
const FUZZY_MIN_SIMILARITY = 0.3;
const FUZZY_RUNNER_UP_MARGIN = 0.05;

export type FuzzyVendorMatch = { vendorId: string; vendorName: string; similarity: number };

export async function matchVendorFuzzyByDescription(
  client: PoolClient,
  description: string | null,
  operatingCompanyId: string
): Promise<FuzzyVendorMatch | null> {
  const desc = (description ?? "").trim();
  if (!desc) return null;

  const res = await client.query<{ id: string; vendor_name: string; sim: number }>(
    `
      SELECT id::text, vendor_name, similarity(lower($1::text), lower(vendor_name)) AS sim
      FROM mdata.vendors
      WHERE operating_company_id = $2::uuid
        AND deactivated_at IS NULL
        AND vendor_name IS NOT NULL
      ORDER BY sim DESC
      LIMIT 2
    `,
    [desc, operatingCompanyId]
  );

  const top = res.rows[0];
  if (!top || top.sim < FUZZY_MIN_SIMILARITY) return null;

  const runnerUp = res.rows[1];
  if (runnerUp && top.sim - runnerUp.sim < FUZZY_RUNNER_UP_MARGIN) return null;

  return { vendorId: top.id, vendorName: top.vendor_name, similarity: top.sim };
}

/**
 * Writes the same suggested_* columns applyBankingRulesForTransaction does, but never touches
 * suggested_account_id (a fuzzy vendor guess says nothing about which GL account the exact-rule
 * engine's `then_account_id` would authoritatively assert) and is always 'low' confidence — a
 * fuzzy guess is categorically less certain than an authored rule, and the UI/operator review flow
 * already reads suggested_confidence to decide how much to trust a suggestion before accepting it.
 */
export async function applyFuzzyVendorMatchForTransaction(
  client: PoolClient,
  txnId: string,
  operatingCompanyId: string
): Promise<FuzzyVendorMatch | null> {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

  const txnRes = await client.query<{ description: string | null }>(
    `SELECT description FROM banking.bank_transactions WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [txnId, operatingCompanyId]
  );
  const txn = txnRes.rows[0];
  if (!txn) return null;

  const match = await matchVendorFuzzyByDescription(client, txn.description, operatingCompanyId);
  if (!match) return null;

  await client.query(
    `
      UPDATE banking.bank_transactions
      SET
        suggested_vendor_id = $2::uuid,
        suggested_confidence = 'low',
        suggested_source = $3,
        suggested_at = now(),
        updated_at = now()
      WHERE id = $1::uuid
    `,
    [txnId, match.vendorId, `fuzzy_vendor_match:sim=${match.similarity.toFixed(2)}`]
  );

  await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,NULL,$4)`, [
    "banking.rule_engine.fuzzy_match",
    "info",
    JSON.stringify({ transaction_id: txnId, vendor_id: match.vendorId, similarity: match.similarity }),
    "BNK-01",
  ]);

  return match;
}

export async function applyBankingRulesForTransaction(client: PoolClient, txnId: string, operatingCompanyId: string): Promise<boolean> {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

  const txnRes = await client.query<{ description: string | null; amount_cents: number; bank_account_id: string }>(
    `
      SELECT description, amount_cents::int, bank_account_id::text
      FROM banking.bank_transactions
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [txnId, operatingCompanyId]
  );
  const txn = txnRes.rows[0];
  if (!txn) return false;

  const rules = await client.query<BankingRuleRow>(
    `
      SELECT *
      FROM accounting.banking_rules
      WHERE operating_company_id = $1::uuid AND is_active = true
      ORDER BY priority DESC, created_at ASC
    `,
    [operatingCompanyId]
  );

  for (const rule of rules.rows) {
    if (!bankingRuleMatches(rule, txn)) continue;

    await client.query(
      `
        UPDATE banking.bank_transactions
        SET
          suggested_vendor_id = $2,
          suggested_account_id = $3::uuid,
          suggested_confidence = 'high',
          suggested_source = $4,
          suggested_at = now(),
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [txnId, rule.then_vendor_id, rule.then_account_id, `rule_id:${rule.id}`]
    );

    await client.query(
      `
        UPDATE accounting.banking_rules
        SET last_matched_at = now(), match_count = match_count + 1, updated_at = now()
        WHERE id = $1::uuid
      `,
      [rule.id]
    );

    await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,NULL,$4)`, [
      "banking.rule_engine.match",
      "info",
      JSON.stringify({ transaction_id: txnId, rule_id: rule.id }),
      "P7-W2-BANK-RULES",
    ]);

    return true;
  }

  return false;
}

/**
 * RECON-USMCA-BANK-01 (owner 2026-09-09): the per-transaction path above only ever runs at Plaid
 * sync time for a NEWLY-ingested row (plaid.service.ts) or from the reconciliation flow — nothing
 * re-applies the CURRENT rule set against transactions that already existed before a rule was
 * added, or that synced before this hook existed. That gap, not a normalization bug, is why most
 * of USMCA's 437 live bank_transactions carried no suggestion at all: 23 "Wire Transfer Fee" and
 * 18 "Love's Travel Stop" lines (among others) already match an EXISTING active rule byte-for-byte
 * but were simply never evaluated against it. This is the bulk counterpart — same per-row logic,
 * reused rather than duplicated, run across every not-yet-categorized transaction in a company so
 * newly-added or newly-matching rules retroactively reach the full live history, not just new
 * inbound rows. Suggestion-only: never touches categorized_at/matched_expense_id/matched_bill_id —
 * applyBankingRulesForTransaction itself only ever writes suggested_* columns.
 */
export async function applyBankingRulesForCompany(
  client: PoolClient,
  operatingCompanyId: string
): Promise<{ scanned: number; matched: number; fuzzyMatched: number }> {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

  const txnsRes = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid
        AND categorized_at IS NULL
      ORDER BY transaction_date DESC, id ASC
    `,
    [operatingCompanyId]
  );

  let matched = 0;
  let fuzzyMatched = 0;
  for (const row of txnsRes.rows) {
    const did = await applyBankingRulesForTransaction(client, row.id, operatingCompanyId);
    if (did) {
      matched += 1;
      continue;
    }
    // BNK-01 fallback — only reached when no authored rule fired for this row.
    const fuzzy = await applyFuzzyVendorMatchForTransaction(client, row.id, operatingCompanyId);
    if (fuzzy) fuzzyMatched += 1;
  }
  return { scanned: txnsRes.rows.length, matched, fuzzyMatched };
}
