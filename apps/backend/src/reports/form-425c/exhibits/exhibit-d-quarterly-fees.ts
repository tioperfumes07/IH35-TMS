import type { ExhibitPeriod, ExhibitQueryClient } from "./types.js";

/**
 * F425C-EXHIBIT-D-NOT-A-REAL-QUARTER — the "Build all exhibits" period picker defaults to (and is
 * normally used for) a single calendar MONTH, shared across all six exhibits A-F. Exhibit D's fee
 * base is disbursements_cents summed over WHATEVER period_start/period_end was passed in — no
 * enforcement that it is an actual 28 U.S.C. § 1930(a)(6) calendar quarter. A filer who builds
 * exhibits on the default 1-month period gets a "quarterly_disbursements_cents" figure that is
 * really one month, silently understating the U.S. Trustee fee tier on a real court filing.
 * Fix: always snap to the calendar quarter (UTC) containing period_end, independent of whatever
 * range the other monthly exhibits used, and report that resolved quarter back on the exhibit so
 * the filer sees the real dates the fee was computed over.
 */
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, monthIndex: number, day: number) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

export function calendarQuarterContaining(dateIso: string): { period_start: string; period_end: string } {
  const [y, m] = dateIso.split("-").map(Number);
  const year = y ?? new Date().getUTCFullYear();
  const monthIndex = (m ?? 1) - 1;
  const quarterStartMonth = Math.floor(monthIndex / 3) * 3;
  const start = isoDate(year, quarterStartMonth, 1);
  // day 0 of the month after the quarter's last month = the quarter's last calendar day.
  const endDate = new Date(Date.UTC(year, quarterStartMonth + 3, 0));
  const end = isoDate(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  return { period_start: start, period_end: end };
}

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
  // F425C-EXHIBIT-D-NOT-A-REAL-QUARTER: never trust input.period_start/period_end for the fee base —
  // those are whatever (usually one-month) range the shared exhibits picker was left on. Snap to the
  // real calendar quarter containing period_end so the statutory fee can never be computed over a
  // partial quarter, regardless of what the other five monthly exhibits used.
  const quarter = calendarQuarterContaining(input.period_end);

  // REAL schema (db/migrations/0072,0073). Disbursements base for the U.S. Trustee quarterly fee
  // (28 U.S.C. § 1930(a)(6)) = money OUT = is_credit=false, summed via abs(amount_cents). GROUP ON
  // is_credit (NOT the Plaid-signed amount) and exclude own-transfers (mirrors
  // bank-feed-gl-posting.service.ts:155). NO .catch(): the prior zero-swallow directly UNDERSTATED
  // the statutory fee — it must FAIL LOUD instead of quietly filing $0.
  const res = await client.query<{ disbursements_cents: string }>(
    `
      SELECT COALESCE(SUM(CASE WHEN NOT bt.is_credit THEN abs(bt.amount_cents) END), 0)::bigint AS disbursements_cents
      FROM banking.bank_transactions bt
      JOIN banking.bank_accounts a ON a.id = bt.bank_account_id
      WHERE bt.operating_company_id = $1::uuid
        AND COALESCE(a.account_type, '') NOT LIKE 'virtual_%'
        AND bt.is_credit = false
        AND bt.transaction_date >= $2::date
        AND bt.transaction_date <= $3::date
        AND bt.review_state IS DISTINCT FROM 'transfer'
        AND bt.transfer_kind IS NULL
        AND bt.destination_bank_account_id IS NULL
    `,
    [input.operating_company_id, quarter.period_start, quarter.period_end]
  );

  const quarterly_disbursements_cents = Math.trunc(Number(res.rows[0]?.disbursements_cents ?? 0));
  const { fee_cents, tier_label } = calculateUsTrusteeQuarterlyFeeCents(quarterly_disbursements_cents);

  return {
    letter: "d",
    title: "Exhibit D — U.S. Trustee quarterly fee calculation",
    period_start: quarter.period_start,
    period_end: quarter.period_end,
    quarterly_disbursements_cents,
    fee_cents,
    statute: "28 U.S.C. § 1930(a)(6)",
    tier_label,
  };
}
