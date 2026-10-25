import type { PoolClient } from "pg";
import { loadPayeeParties, parseBankDescription, resolveDescribedPayee } from "./bank-description-payee.js";
import { isCatchAllRule } from "./suggestion-engine.js";

export type BankingRuleRow = {
  id: string;
  name?: string | null;
  priority: number;
  description_contains: string | null;
  description_regex: string | null;
  amount_min_cents: string | null;
  amount_max_cents: string | null;
  bank_account_filter_id: string | null;
  then_vendor_id: string | null;
  then_account_id: string;
  // RC1 443.341: enriched by enrichRulesWithAccountNumbers after loading.
  then_account_number?: string | null;
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

  const txnRes = await client.query<{ description: string | null; is_credit: boolean }>(
    `SELECT description, is_credit FROM banking.bank_transactions WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [txnId, operatingCompanyId]
  );
  const txn = txnRes.rows[0];
  if (!txn) return null;
  // LINK4-PR3 — same "money-in excluded from auto-categorization" guard as
  // applyBankingRulesForTransaction above, gated here too since this function is exported and
  // callable on its own, not only via applyBankingRulesForCompany's fallback loop.
  if (txn.is_credit) return null;

  const match = await matchVendorFuzzyByDescription(client, txn.description, operatingCompanyId);
  if (!match) return null;

  await client.query(
    `
      UPDATE banking.bank_transactions
      SET
        suggested_vendor_id = $2::uuid,
        suggested_confidence = 'low',
        suggested_source = $3,
        suggested_reason = $4,
        suggested_at = now(),
        updated_at = now()
      WHERE id = $1::uuid
    `,
    [txnId, match.vendorId, `fuzzy_vendor_match:sim=${match.similarity.toFixed(2)}`, `bank description resembles vendor ${match.vendorName} (similarity ${match.similarity.toFixed(2)})`]
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

  const txnRes = await client.query<{ description: string | null; amount_cents: number; bank_account_id: string; is_credit: boolean }>(
    `
      SELECT description, amount_cents::int, bank_account_id::text, is_credit
      FROM banking.bank_transactions
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [txnId, operatingCompanyId]
  );
  const txn = txnRes.rows[0];
  if (!txn) return false;

  // LINK4-PR3 (owner precedence, 2026-09-12): "money-in excluded from auto-categorization." A
  // deposit/refund/customer-payment is a business event a human should categorize deliberately, not
  // one this engine should guess an expense account for. This is the ONE place both call sites
  // (plaid.service.ts's sync loop, reconciliation.routes.ts's CSV import) resolve a transaction by
  // id, so gating here covers both without a second, easy-to-forget guard at each call site — and
  // applyBankingRulesForCompany below (the bulk driver) calls this same function per row, so its own
  // callers are covered too.
  if (txn.is_credit) return false;

  const rulesRaw = await client.query<BankingRuleRow>(
    `
      SELECT *
      FROM accounting.banking_rules
      WHERE operating_company_id = $1::uuid AND is_active = true
      ORDER BY priority DESC, created_at ASC
    `,
    [operatingCompanyId]
  );

  // RC1 443.341: enrich rules with account numbers for catch-all detection.
  const acctIds = [...new Set(rulesRaw.rows.map((r) => r.then_account_id))];
  let acctMap = new Map<string, string>();
  if (acctIds.length) {
    const acctRes = await client.query<{ id: string; account_number: string }>(
      `SELECT id::text, account_number FROM catalogs.accounts WHERE id = ANY($1::uuid[])`,
      [acctIds]
    );
    acctMap = new Map(acctRes.rows.map((a) => [a.id, a.account_number]));
  }
  const rules = rulesRaw.rows.map((r) => ({ ...r, then_account_number: acctMap.get(r.then_account_id) ?? null }));

  // RC1: two-pass — specific rules first (named vendor, non-9000), catch-all fallbacks second.
  const specific = rules.filter((r) => !isCatchAllRule(r));
  const catchAll = rules.filter((r) => isCatchAllRule(r));

  async function applyMatchedRule(rule: BankingRuleRow & { then_account_number?: string | null }, confidence: "high" | "low") {
    await client.query(
      `
        UPDATE banking.bank_transactions
        SET
          suggested_vendor_id = $2,
          suggested_account_id = $3::uuid,
          suggested_confidence = $4,
          suggested_source = $5,
          suggested_reason = $6,
          suggested_at = now(),
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [
        txnId, rule.then_vendor_id, rule.then_account_id, confidence,
        `rule_id:${rule.id}`,
        confidence === "low"
          ? `catch-all rule${rule.name ? ` "${rule.name}"` : ""} matched — needs a decision`
          : `banking rule${rule.name ? ` "${rule.name}"` : ""} matched the bank description`,
      ]
    );
    await client.query(
      `UPDATE accounting.banking_rules SET last_matched_at = now(), match_count = match_count + 1, updated_at = now() WHERE id = $1::uuid`,
      [rule.id]
    );
    await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,NULL,$4)`, [
      "banking.rule_engine.match",
      confidence === "low" ? "warning" : "info",
      JSON.stringify({ transaction_id: txnId, rule_id: rule.id, catch_all: confidence === "low" }),
      "P7-W2-BANK-RULES",
    ]);
  }

  for (const rule of specific) {
    if (!bankingRuleMatches(rule, txn)) continue;
    await applyMatchedRule(rule, "high");
    return true;
  }

  for (const rule of catchAll) {
    if (!bankingRuleMatches(rule, txn)) continue;
    await applyMatchedRule(rule, "low");
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
): Promise<{ scanned: number; matched: number; historyMatched: number; fuzzyMatched: number; describedMatched: number }> {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

  // LINK4-PR3 — is_credit = false at the SQL level (not just relying on the per-row guards below):
  // a deposit/refund/customer-payment is categorically out of scope for this pass, so it should
  // never even be "scanned", not merely skipped-and-counted.
  const txnsRes = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid
        AND categorized_at IS NULL
        AND is_credit = false
      ORDER BY transaction_date DESC, id ASC
    `,
    [operatingCompanyId]
  );

  const parties = await loadPayeeParties(client, operatingCompanyId);
  let matched = 0;
  let historyMatched = 0;
  let fuzzyMatched = 0;
  let describedMatched = 0;
  for (const row of txnsRes.rows) {
    const ruleMatched = await applyBankingRulesForTransaction(client, row.id, operatingCompanyId);
    if (ruleMatched) matched += 1;
    // RC3 443.341: history can upgrade a catch-all suggestion or fill a gap after rules fail.
    if (await applyHistoryLearningForTransaction(client, row.id, operatingCompanyId)) {
      historyMatched += 1;
      if (!ruleMatched) continue;
    }
    if (ruleMatched) continue;
    // 443.168 J — the payee the bank text NAMES (Zelle to / card merchant / wire BNF …) before the trigram guess.
    if (await applyDescribedPayeeForTransaction(client, row.id, operatingCompanyId, parties)) {
      describedMatched += 1;
      continue;
    }
    // BNK-01 fallback — only reached when no authored rule fired for this row.
    const fuzzy = await applyFuzzyVendorMatchForTransaction(client, row.id, operatingCompanyId);
    if (fuzzy) fuzzyMatched += 1;
  }

  // 443.168 J — money-in: no rule, no expense guess (LINK4-PR3 stands); only the CUSTOMER the bank text names
  // (Zelle from / WIRE IN ORIG: / ACH company) with that customer's own income account, suggest-only.
  const creditsRes = await client.query<{ id: string }>(
    `SELECT id::text FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid AND categorized_at IS NULL AND is_credit = true
      ORDER BY transaction_date DESC, id ASC`,
    [operatingCompanyId]
  );
  for (const row of creditsRes.rows) {
    if (await applyDescribedPayeeForTransaction(client, row.id, operatingCompanyId, parties)) describedMatched += 1;
  }
  return { scanned: txnsRes.rows.length + creditsRes.rows.length, matched, historyMatched, fuzzyMatched, describedMatched };
}

/**
 * RC3 443.341 — learn from HUMAN-accepted categorizations: if the same normalized description was
 * previously categorized by a user (categorized_by_user_id NOT NULL), suggest the account + vendor
 * they chose, with confidence keyed to count (1→low, 2→medium, 3+→high). Runs only when the line
 * has no suggestion OR the current suggestion is a catch-all (source='catch_all_rule').
 * Suggest-only: never writes categorized_* columns.
 */
export async function applyHistoryLearningForTransaction(
  client: PoolClient,
  txnId: string,
  operatingCompanyId: string
): Promise<boolean> {
  const txnRes = await client.query<{
    description: string | null;
    description_normalized: string | null;
    normalized_description: string | null;
    categorized_at: string | null;
    suggested_source: string | null;
  }>(
    `SELECT description, description_normalized, normalized_description, categorized_at::text, suggested_source
     FROM banking.bank_transactions
     WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [txnId, operatingCompanyId]
  );
  const txn = txnRes.rows[0];
  if (!txn || txn.categorized_at) return false;
  if (txn.suggested_source && !txn.suggested_source.startsWith("catch_all_rule")) return false;

  const key = (txn.description_normalized ?? txn.normalized_description ?? txn.description ?? "").toLowerCase().trim();
  if (!key) return false;

  const histRes = await client.query<{ account_id: string | null; vendor_id: string | null; n: string }>(
    `SELECT categorization_gl_account_id::text AS account_id, categorization_vendor_id::text AS vendor_id, COUNT(*) AS n
     FROM banking.bank_transactions
     WHERE operating_company_id = $1::uuid
       AND categorized_at IS NOT NULL
       AND categorized_by_user_id IS NOT NULL
       AND categorization_gl_account_id IS NOT NULL
       AND LOWER(COALESCE(description_normalized, normalized_description, description, '')) = $2
     GROUP BY categorization_gl_account_id, categorization_vendor_id
     ORDER BY COUNT(*) DESC, categorization_gl_account_id
     LIMIT 1`,
    [operatingCompanyId, key]
  );
  const h = histRes.rows[0];
  if (!h?.account_id) return false;

  const n = parseInt(h.n, 10);
  const confidence = n >= 3 ? "high" : n === 2 ? "medium" : "low";
  await client.query(
    `UPDATE banking.bank_transactions
     SET suggested_vendor_id = $2::uuid, suggested_account_id = $3::uuid,
         suggested_confidence = $4, suggested_source = $5, suggested_reason = $6,
         suggested_at = now(), updated_at = now()
     WHERE id = $1::uuid AND categorized_at IS NULL`,
    [txnId, h.vendor_id, h.account_id, confidence, `history:count=${n}`,
     `accepted ${n} time${n === 1 ? "" : "s"} for this payee`]
  );
  await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,NULL,$4)`, [
    "banking.rule_engine.history_match", "info",
    JSON.stringify({ transaction_id: txnId, count: n }),
    "443-341-RC3",
  ]);
  return true;
}

/**
 * RC6 443.341 — Relay fill suggestion: when a bank transaction is matched to a Relay fuel fill,
 * suggest the driver assigned to the load on that fill (not the relay API's own driver field).
 * Chain: bank_transaction.matched_relay_fuel_transaction_id
 *        → fuel.fuel_transactions.relay_fuel_transaction_id → fuel.fuel_transactions.load_id
 *        → mdata.loads.assigned_primary_driver_id
 *        → mdata.vendors.driver_id → vendor uuid
 * Account: always 5000 (Fuel & Diesel). Confidence: high. Source: relay_fill_load_driver.
 */
export async function applyRelayFillLoadDriverForTransaction(
  client: PoolClient,
  txnId: string,
  operatingCompanyId: string
): Promise<boolean> {
  const txnRes = await client.query<{
    matched_relay_fuel_transaction_id: string | null;
    categorized_at: string | null;
    suggested_source: string | null;
  }>(
    `SELECT matched_relay_fuel_transaction_id, categorized_at, suggested_source
     FROM banking.bank_transactions
     WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [txnId, operatingCompanyId]
  );
  const txn = txnRes.rows[0];
  if (!txn || txn.categorized_at || !txn.matched_relay_fuel_transaction_id) return false;
  // Don't overwrite a specific human-authored rule suggestion; only fill in gaps or upgrade catch-alls.
  if (txn.suggested_source && !txn.suggested_source.startsWith("catch_all_rule") && !txn.suggested_source.startsWith("description_payee") && !txn.suggested_source.startsWith("fuzzy")) return false;

  const linkRes = await client.query<{ load_id: string | null }>(
    `SELECT ft.load_id
     FROM fuel.fuel_transactions ft
     WHERE ft.relay_fuel_transaction_id = $1::uuid
       AND ft.operating_company_id = $2::uuid
     LIMIT 1`,
    [txn.matched_relay_fuel_transaction_id, operatingCompanyId]
  );
  const loadId = linkRes.rows[0]?.load_id;
  if (!loadId) return false;

  const driverRes = await client.query<{ assigned_primary_driver_id: string | null }>(
    `SELECT assigned_primary_driver_id FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [loadId, operatingCompanyId]
  );
  const driverId = driverRes.rows[0]?.assigned_primary_driver_id;
  if (!driverId) return false;

  const vendorRes = await client.query<{ id: string; default_expense_account_id: string | null }>(
    `SELECT v.id, v.default_expense_account_id
     FROM mdata.vendors v
     WHERE v.driver_id = $1::uuid AND v.operating_company_id = $2::uuid AND v.deactivated_at IS NULL
     LIMIT 1`,
    [driverId, operatingCompanyId]
  );
  const vendor = vendorRes.rows[0];
  if (!vendor) return false;

  // Account: prefer vendor's default expense account, fall back to 5000 Fuel & Diesel.
  const FUEL_ACCOUNT_ID = "353fbd5b-d39c-4709-ac19-60cae52018f7";
  const accountId = vendor.default_expense_account_id ?? FUEL_ACCOUNT_ID;

  const res = await client.query(
    `UPDATE banking.bank_transactions
     SET suggested_vendor_id = $2::uuid, suggested_account_id = $3::uuid,
         suggested_confidence = 'high', suggested_source = 'relay_fill_load_driver',
         suggested_at = now(), updated_at = now()
     WHERE id = $1::uuid AND categorized_at IS NULL`,
    [txnId, vendor.id, accountId]
  );
  if (!res.rowCount) return false;

  await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,NULL,$4)`, [
    "banking.rule_engine.relay_fill_load_driver",
    "info",
    JSON.stringify({ transaction_id: txnId, driver_id: driverId, vendor_id: vendor.id, load_id: loadId }),
    "443.341-RC6",
  ]);
  return true;
}

/**
 * 443.168 J — the ONE per-line suggestion entry for a newly-ingested line (Plaid sync, CSV import): authored rule →
 * RC6 Relay fill load-driver → history learning → the payee the description names → trigram fallback.
 * Every step writes suggested_* only (owner Law B).
 */
export async function suggestForBankTransaction(client: PoolClient, txnId: string, operatingCompanyId: string): Promise<boolean> {
  if (await applyBankingRulesForTransaction(client, txnId, operatingCompanyId)) {
    // History can upgrade a catch-all suggestion to the human-validated choice.
    await applyHistoryLearningForTransaction(client, txnId, operatingCompanyId);
    return true;
  }
  // RC6: Relay fill matched to a load → use the load's driver as vendor.
  if (await applyRelayFillLoadDriverForTransaction(client, txnId, operatingCompanyId)) return true;
  if (await applyHistoryLearningForTransaction(client, txnId, operatingCompanyId)) return true;
  if (await applyDescribedPayeeForTransaction(client, txnId, operatingCompanyId)) return true;
  return (await applyFuzzyVendorMatchForTransaction(client, txnId, operatingCompanyId)) != null;
}

/**
 * 443.168 J — read the payee out of the raw bank description (bank-description-payee.ts) and suggest it with the
 * reason: vendor + its default expense account on money out, customer + its default income account on money in.
 * Suggest-only: never categorized_*, never matched_*, never a JE. Never overwrites an authored-rule / Plaid-rule /
 * Faro suggestion — only an empty one or an earlier description / trigram guess.
 */
export async function applyDescribedPayeeForTransaction(
  client: PoolClient,
  txnId: string,
  operatingCompanyId: string,
  parties?: Awaited<ReturnType<typeof loadPayeeParties>>
): Promise<boolean> {
  const txnRes = await client.query<{ description: string | null; merchant_name: string | null; is_credit: boolean }>(
    `SELECT description, merchant_name, is_credit FROM banking.bank_transactions
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND categorized_at IS NULL LIMIT 1`,
    [txnId, operatingCompanyId]
  );
  const txn = txnRes.rows[0];
  if (!txn) return false;
  const parsed = parseBankDescription(txn.description, txn.merchant_name);
  if (!parsed) return false;
  const payee = resolveDescribedPayee(parsed, txn.is_credit, parties ?? (await loadPayeeParties(client, operatingCompanyId)));
  if (!payee) return false;
  const res = await client.query(
    `
      UPDATE banking.bank_transactions
      SET
        suggested_vendor_id = $2::uuid,
        suggested_customer_id = $3::uuid,
        suggested_account_id = $4::uuid,
        suggested_confidence = 'medium',
        suggested_source = $5,
        suggested_reason = $6,
        suggested_at = now(),
        updated_at = now()
      WHERE id = $1::uuid
        AND categorized_at IS NULL
        AND (suggested_source IS NULL OR suggested_source LIKE 'description_payee:%' OR suggested_source LIKE 'fuzzy_vendor_match:%')
    `,
    [txnId, payee.vendor_id, payee.customer_id, payee.account_id, `description_payee:${parsed.pattern}`, payee.reason]
  );
  if (!res.rowCount) return false;
  await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,NULL,$4)`, [
    "banking.rule_engine.described_payee",
    "info",
    JSON.stringify({ transaction_id: txnId, vendor_id: payee.vendor_id, customer_id: payee.customer_id, pattern: parsed.pattern }),
    "443.168-J",
  ]);
  return true;
}
