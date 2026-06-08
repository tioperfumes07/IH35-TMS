import type { ExhibitPeriod, ExhibitQueryClient } from "./types.js";

export type ExhibitD = {
  letter: "d";
  title: string;
  period_start: string;
  period_end: string;
  quarterly_disbursements_cents: number;
  fee_cents: number;
  statute: "28 U.S.C. § 1930(a)(6)";
  tier_label: string;
};

/** U.S. Trustee quarterly fee tiers per 28 U.S.C. § 1930(a)(6). */
export function calculateUsTrusteeQuarterlyFeeCents(disbursementsCents: number): {
  fee_cents: number;
  tier_label: string;
} {
  const dollars = disbursementsCents / 100;
  if (dollars <= 14_999.99) {
    return { fee_cents: 32_500, tier_label: "≤ $14,999.99 → $325" };
  }
  if (dollars <= 74_999.99) {
    return { fee_cents: 55_000, tier_label: "$15,000–$74,999.99 → $550" };
  }
  if (dollars <= 199_999.99) {
    return { fee_cents: 92_500, tier_label: "$75,000–$199,999.99 → $925" };
  }
  if (dollars <= 499_999.99) {
    return { fee_cents: 132_500, tier_label: "$200,000–$499,999.99 → $1,325" };
  }
  if (dollars <= 999_999.99) {
    return { fee_cents: 272_500, tier_label: "$500,000–$999,999.99 → $2,725" };
  }
  const overMillion = dollars - 1_000_000;
  const feeDollars = 4_875 + overMillion * 0.01;
  return {
    fee_cents: Math.round(feeDollars * 100),
    tier_label: "≥ $1,000,000 → $4,875 + 1% over $1M",
  };
}

export async function buildExhibitD(
  client: ExhibitQueryClient,
  input: ExhibitPeriod
): Promise<ExhibitD> {
  const res = await client.query<{ disbursements: string }>(
    `
      SELECT COALESCE(SUM(abs(bt.amount)), 0)::numeric AS disbursements
      FROM banking.bank_transactions bt
      JOIN banking.bank_accounts a ON a.id = bt.account_id
      WHERE bt.operating_company_id = $1
        AND a.is_dip = true
        AND COALESCE(a.account_type, '') NOT LIKE 'virtual_%'
        AND COALESCE(a.tag, '') NOT IN ('Factoring', 'Escrow')
        AND bt.amount < 0
        AND bt.txn_date >= $2::date
        AND bt.txn_date <= $3::date
    `,
    [input.operating_company_id, input.period_start, input.period_end]
  ).catch(() => ({ rows: [{ disbursements: "0" }] }));

  const quarterly_disbursements_cents = Math.round(Number(res.rows[0]?.disbursements ?? 0) * 100);
  const { fee_cents, tier_label } = calculateUsTrusteeQuarterlyFeeCents(quarterly_disbursements_cents);

  return {
    letter: "d",
    title: "Exhibit D — U.S. Trustee quarterly fee calculation",
    period_start: input.period_start,
    period_end: input.period_end,
    quarterly_disbursements_cents,
    fee_cents,
    statute: "28 U.S.C. § 1930(a)(6)",
    tier_label,
  };
}
