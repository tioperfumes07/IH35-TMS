import { withLuciaBypass } from "../../auth/db.js";
import {
  RELAY_DEPOSIT_CHARGED_AMOUNT_SQL,
  RELAY_DEPOSIT_FEE_AMOUNT_SQL,
  RELAY_DEPOSIT_MATCHABLE_SQL,
  RELAY_DEPOSIT_WALLET_AMOUNT_SQL,
} from "./relay-deposit-match-math.js";

type RelayDepositCategorizedMatchHintQueryRow = RelayDepositCategorizedMatchHintRow & {
  total: string;
};

export type RelayDepositCategorizedMatchHintRow = {
  bank_transaction_id: string;
  transaction_date: string;
  amount_cents: number;
  description: string | null;
  suggested_relay_deposit_id: string | null;
  relay_deposit_id: string | null;
  wallet_cents: number | null;
  fee_cents: number | null;
  charged_cents: number | null;
  deposit_date: string | null;
  amount_gap_cents: number | null;
  date_gap_days: number | null;
};

/**
 * ROUND 443.29-B / 443.54 — read-only: bank lines already categorized to Relay Fuel Wallet (outflows),
 * with the settled matchable deposit they would match (charged = total_amount_cents = wallet + fee).
 * No writes. MATCHABLE = company classification OR existing deposit JE (live 0680 stayed unclassified).
 */
export async function listRelayDepositCategorizedMatchHints(
  operatingCompanyId: string,
  limit = 2000
): Promise<{ rows: RelayDepositCategorizedMatchHintRow[]; total: number }> {
  const res = await withLuciaBypass((client) =>
    client.query<RelayDepositCategorizedMatchHintQueryRow>(
      `
      WITH wallet_lines AS (
        SELECT bt.id,
               bt.transaction_date::date::text AS transaction_date,
               abs(bt.amount_cents)::int AS amount_cents,
               bt.description
          FROM banking.bank_transactions bt
          JOIN catalogs.accounts ca
            ON ca.id = bt.categorization_gl_account_id
           AND ca.operating_company_id = bt.operating_company_id
         WHERE bt.operating_company_id = $1::uuid
           AND bt.voided_at IS NULL
           AND bt.is_credit = false
           AND bt.categorization_gl_account_id IS NOT NULL
           AND ca.system_purpose = 'relay_fuel_wallet'
           AND bt.matched_relay_deposit_id IS NULL
      ),
      with_suggestion AS (
        SELECT wl.*,
               sug.id::text AS suggested_relay_deposit_id,
               sug.deposit_id AS relay_deposit_id,
               ${RELAY_DEPOSIT_WALLET_AMOUNT_SQL.replace(/rd\./g, "sug.")}::int AS wallet_cents,
               ${RELAY_DEPOSIT_FEE_AMOUNT_SQL.replace(/rd\./g, "sug.")}::int AS fee_cents,
               ${RELAY_DEPOSIT_CHARGED_AMOUNT_SQL.replace(/rd\./g, "sug.")}::int AS charged_cents,
               COALESCE(sug.relay_created_at, sug.created_at)::date::text AS deposit_date,
               abs(${RELAY_DEPOSIT_CHARGED_AMOUNT_SQL.replace(/rd\./g, "sug.")} - wl.amount_cents)::int AS amount_gap_cents,
               abs(COALESCE(sug.relay_created_at, sug.created_at)::date - wl.transaction_date::date) AS date_gap_days
          FROM wallet_lines wl
          LEFT JOIN LATERAL (
            SELECT rd.*
              FROM integrations.relay_deposits rd
             WHERE rd.operating_company_id = $1::uuid
               AND rd.status = 'settled'
               AND ${RELAY_DEPOSIT_MATCHABLE_SQL}
               AND rd.voided_at IS NULL
               AND COALESCE(rd.is_active, true) = true
               AND rd.matched_bank_transaction_id IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM banking.bank_transactions b2
                  WHERE b2.matched_relay_deposit_id = rd.id AND b2.voided_at IS NULL
               )
             ORDER BY abs(${RELAY_DEPOSIT_CHARGED_AMOUNT_SQL} - wl.amount_cents),
                      abs(COALESCE(rd.relay_created_at, rd.created_at)::date - wl.transaction_date::date)
             LIMIT 1
          ) sug ON true
      )
      SELECT ws.*,
             (SELECT count(*)::text FROM wallet_lines) AS total
        FROM with_suggestion ws
       ORDER BY ws.transaction_date DESC, ws.id
       LIMIT $2::int
    `,
      [operatingCompanyId, limit]
    )
  );

  const total = res.rows[0] ? Number(res.rows[0].total) : 0;
  const rows = res.rows.map((r: RelayDepositCategorizedMatchHintQueryRow) => ({
    bank_transaction_id: r.bank_transaction_id,
    transaction_date: r.transaction_date,
    amount_cents: Number(r.amount_cents),
    description: r.description,
    suggested_relay_deposit_id: r.suggested_relay_deposit_id,
    relay_deposit_id: r.relay_deposit_id,
    wallet_cents: r.wallet_cents != null ? Number(r.wallet_cents) : null,
    fee_cents: r.fee_cents != null ? Number(r.fee_cents) : null,
    charged_cents: r.charged_cents != null ? Number(r.charged_cents) : null,
    deposit_date: r.deposit_date,
    amount_gap_cents: r.amount_gap_cents != null ? Number(r.amount_gap_cents) : null,
    date_gap_days: r.date_gap_days != null ? Number(r.date_gap_days) : null,
  }));

  return { rows, total };
}
