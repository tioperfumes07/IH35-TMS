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

export async function applyBankingRulesForTransaction(client: PoolClient, txnId: string, operatingCompanyId: string): Promise<boolean> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

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
