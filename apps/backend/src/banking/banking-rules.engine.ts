import type { PoolClient } from "pg";
import { withLuciaBypass } from "../auth/db.js";
import { maybePostBankCategorizationToGl } from "./bank-feed-gl-posting.service.js";

export type BankingRuleRow = {
  id: string;
  priority: number;
  description_contains: string | null;
  description_regex: string | null;
  merchant_contains: string | null;
  amount_min_cents: string | number | null;
  amount_max_cents: string | number | null;
  bank_account_filter_id: string | null;
  then_vendor_id: string | null;
  then_account_id: string;
};

export type BankTxnProbe = {
  description: string | null;
  merchant_name: string | null;
  amount_cents: number;
  bank_account_id: string;
};

/** Strip apostrophes / curly quotes so LOVE'S and LOVES match the same needle. */
export function normalizePayeeText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[''`´ʼ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTextCondition(rule: BankingRuleRow): boolean {
  return Boolean(
    rule.merchant_contains?.trim() ||
      rule.description_contains?.trim() ||
      rule.description_regex?.trim()
  );
}

export function bankingRuleMatches(rule: BankingRuleRow, txn: BankTxnProbe): boolean {
  if (rule.bank_account_filter_id && rule.bank_account_filter_id !== txn.bank_account_id) return false;
  const amt = txn.amount_cents;
  if (rule.amount_min_cents != null && amt < Number(rule.amount_min_cents)) return false;
  if (rule.amount_max_cents != null && amt > Number(rule.amount_max_cents)) return false;

  // QBO-like: never match everything on amount/bank alone — require ≥1 text condition.
  if (!hasTextCondition(rule)) return false;

  const merchantNeedle = rule.merchant_contains?.trim();
  if (merchantNeedle) {
    const hay = normalizePayeeText(`${txn.merchant_name ?? ""} ${txn.description ?? ""}`);
    if (!hay.includes(normalizePayeeText(merchantNeedle))) return false;
  }

  const descContains = rule.description_contains?.trim();
  if (descContains) {
    const hay = normalizePayeeText(txn.description ?? "");
    if (!hay.includes(normalizePayeeText(descContains))) return false;
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

async function loadTxnProbe(
  client: PoolClient,
  txnId: string,
  operatingCompanyId: string
): Promise<BankTxnProbe | null> {
  const txnRes = await client.query<{
    description: string | null;
    merchant_name: string | null;
    amount_cents: number;
    bank_account_id: string;
  }>(
    `
      SELECT description, merchant_name, amount_cents::int, bank_account_id::text
      FROM banking.bank_transactions
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [txnId, operatingCompanyId]
  );
  return txnRes.rows[0] ?? null;
}

async function loadActiveRules(client: PoolClient, operatingCompanyId: string): Promise<BankingRuleRow[]> {
  const rules = await client.query<BankingRuleRow>(
    `
      SELECT id, priority, description_contains, description_regex, merchant_contains,
             amount_min_cents, amount_max_cents, bank_account_filter_id,
             then_vendor_id, then_account_id
      FROM accounting.banking_rules
      WHERE operating_company_id = $1::uuid AND is_active = true
      ORDER BY priority DESC, created_at ASC
    `,
    [operatingCompanyId]
  );
  return rules.rows;
}

/** Suggestion badge only (suggested_*). Does not stamp categorization_gl_account_id. */
export async function applyBankingRulesForTransaction(
  client: PoolClient,
  txnId: string,
  operatingCompanyId: string
): Promise<boolean> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

  const txn = await loadTxnProbe(client, txnId, operatingCompanyId);
  if (!txn) return false;

  const rules = await loadActiveRules(client, operatingCompanyId);

  for (const rule of rules) {
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
 * CHAIN-05 stamp from accounting.banking_rules — evaluated BEFORE Plaid transaction_categories.
 * Reuses the same UPDATE + maybePostBankCategorizationToGl path as autoCategorize (no new GL math).
 */
export async function autoCategorizeFromBankingRules(
  transaction: { operating_company_id: string; id: string },
  opts?: { actorUserUuid?: string; dryRun?: boolean }
): Promise<BankingRuleRow | null> {
  let matched: BankingRuleRow | null = null;
  let applied = false;

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, false)`, [
      transaction.operating_company_id,
    ]);
    const txn = await loadTxnProbe(client, transaction.id, transaction.operating_company_id);
    if (!txn) return;
    const rules = await loadActiveRules(client, transaction.operating_company_id);
    matched = rules.find((rule) => Boolean(rule.then_account_id) && bankingRuleMatches(rule, txn)) ?? null;
    if (!matched?.then_account_id) {
      matched = null;
      return;
    }
    if (opts?.dryRun) return;

    const updated = await client.query(
      `
        UPDATE banking.bank_transactions
        SET
          status = 'categorized',
          category = COALESCE(NULLIF(BTRIM(category), ''), 'banking_rule_match'),
          category_kind = COALESCE(NULLIF(BTRIM(category_kind), ''), 'expense'),
          categorization_gl_account_id = $2::uuid,
          coa_account_id = $2::uuid,
          categorized_at = COALESCE(categorized_at, now()),
          skip_reason = NULL,
          investigate_note = NULL,
          updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $3::uuid
          AND matched_journal_entry_id IS NULL
          AND categorization_gl_account_id IS NULL
          AND COALESCE(status, 'pending_categorization') IN ('pending_categorization', 'uncategorized')
      `,
      [transaction.id, matched.then_account_id, transaction.operating_company_id]
    );
    applied = (updated.rowCount ?? 0) > 0;
    if (applied) {
      console.info("[BANKING_RULE_CATEGORIZE]", {
        operatingCompanyId: transaction.operating_company_id,
        transactionId: transaction.id,
        ruleId: matched.id,
        coaAccountId: matched.then_account_id,
        chain05: true,
      });
    }
  });

  if (opts?.dryRun) return matched;
  if (!applied || !matched) return null;

  if (opts?.actorUserUuid) {
    try {
      await maybePostBankCategorizationToGl({
        companyId: transaction.operating_company_id,
        actorUserUuid: opts.actorUserUuid,
        bankTransactionId: transaction.id,
      });
    } catch (err) {
      console.warn("[BANKING_RULE_CATEGORIZE_GL_FAILED]", {
        operatingCompanyId: transaction.operating_company_id,
        transactionId: transaction.id,
        message: String((err as Error)?.message ?? err),
      });
    }
  }

  return matched;
}
