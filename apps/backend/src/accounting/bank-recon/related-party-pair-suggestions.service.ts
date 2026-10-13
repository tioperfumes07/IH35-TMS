/**
 * ROUND 443.54-7 — SUGGESTED related-party pairs (read-only).
 *
 * A USMCA bank outflow to a related party and a Relay deposit on that party's card
 * with the SAME amount within 5 days → one suggested pair. Nothing auto-pairs.
 * Unpaired Zelle / IDCGR outflows are listed with deposit = null.
 *
 * Excludes: USMCA own card 0680 deposits; RELAY ATLANTA …260680 bank lines.
 */
import { withLuciaBypass } from "../../auth/db.js";
import {
  RELATED_PARTY_CARD_MAP,
  RELAY_ATLANTA_OWN_CARD_PATTERN,
  USMCA_OWN_RELAY_CARD_LAST4,
  describeBankLinePartyHint,
  isRelatedPartyOutboundCandidate,
  partyForCard,
} from "./related-party-card-map.js";

export const RELATED_PARTY_PAIR_WINDOW_DAYS = 5;

export type RelatedPartyPairSuggestionRow = {
  bank_transaction_id: string;
  transaction_date: string;
  amount_cents: number;
  description: string | null;
  bank_party_hint: string | null;
  suggested_relay_deposit_id: string | null;
  relay_deposit_id: string | null;
  deposit_date: string | null;
  funding_card_last4: string | null;
  party_key: string | null;
  party_name: string | null;
  party_account_number: string | null;
  card_confirmed: boolean | null;
  date_gap_days: number | null;
  pair_status: "suggested" | "unpaired";
};

type QueryRow = RelatedPartyPairSuggestionRow & { total: string };

/**
 * List suggested + unpaired related-party bank↔Relay pairs for Banking.
 * Owner confirms via POST …/related-party-pairs/confirm — this path writes nothing.
 */
export async function listRelatedPartyPairSuggestions(
  operatingCompanyId: string,
  limit = 2000
): Promise<{ rows: RelatedPartyPairSuggestionRow[]; total: number }> {
  const res = await withLuciaBypass((client) =>
    client.query<QueryRow>(
      `
      WITH bank_out AS (
        SELECT bt.id,
               bt.transaction_date::date AS transaction_date,
               abs(bt.amount_cents)::int AS amount_cents,
               bt.description
          FROM banking.bank_transactions bt
         WHERE bt.operating_company_id = $1::uuid
           AND bt.voided_at IS NULL
           AND bt.is_credit = false
           AND bt.matched_related_party_loan_id IS NULL
           AND bt.matched_relay_deposit_id IS NULL
           AND (
             bt.description ~* 'zelle'
             OR bt.description ~* 'IDCGR'
           )
           AND bt.description !~* 'RELAY[[:space:]]+ATLANTA.*260680'
      ),
      deposit_cand AS (
        SELECT rd.id,
               rd.deposit_id,
               COALESCE(rd.relay_created_at, rd.created_at)::date AS deposit_date,
               abs(rd.total_amount_cents)::int AS charged_cents,
               rd.funding_card_last4
          FROM integrations.relay_deposits rd
         WHERE rd.operating_company_id = $1::uuid
           AND rd.status = 'settled'
           AND rd.voided_at IS NULL
           AND COALESCE(rd.is_active, true) = true
           AND rd.matched_bank_transaction_id IS NULL
           AND rd.funding_card_last4 IS DISTINCT FROM $3::text
           AND NOT EXISTS (
             SELECT 1 FROM banking.bank_transactions b2
              WHERE b2.matched_relay_deposit_id = rd.id AND b2.voided_at IS NULL
           )
      ),
      paired AS (
        SELECT bo.id AS bank_transaction_id,
               bo.transaction_date::text AS transaction_date,
               bo.amount_cents,
               bo.description,
               sug.id::text AS suggested_relay_deposit_id,
               sug.deposit_id AS relay_deposit_id,
               sug.deposit_date::text AS deposit_date,
               sug.funding_card_last4,
               abs(sug.deposit_date - bo.transaction_date) AS date_gap_days
          FROM bank_out bo
          LEFT JOIN LATERAL (
            SELECT dc.*
              FROM deposit_cand dc
             WHERE dc.charged_cents = bo.amount_cents
               AND dc.deposit_date BETWEEN bo.transaction_date - ($2::int)
                                      AND bo.transaction_date + ($2::int)
             ORDER BY abs(dc.deposit_date - bo.transaction_date), dc.id
             LIMIT 1
          ) sug ON true
      )
      SELECT p.bank_transaction_id::text,
             p.transaction_date,
             p.amount_cents,
             p.description,
             NULL::text AS bank_party_hint,
             p.suggested_relay_deposit_id,
             p.relay_deposit_id,
             p.deposit_date,
             p.funding_card_last4,
             NULL::text AS party_key,
             NULL::text AS party_name,
             NULL::text AS party_account_number,
             NULL::boolean AS card_confirmed,
             p.date_gap_days,
             CASE WHEN p.suggested_relay_deposit_id IS NOT NULL THEN 'suggested' ELSE 'unpaired' END AS pair_status,
             (SELECT count(*)::text FROM bank_out) AS total
        FROM paired p
       ORDER BY p.transaction_date DESC, p.bank_transaction_id
       LIMIT $4::int
    `,
      [operatingCompanyId, RELATED_PARTY_PAIR_WINDOW_DAYS, USMCA_OWN_RELAY_CARD_LAST4, limit]
    )
  );

  const total = res.rows[0] ? Number(res.rows[0].total) : 0;
  const rows: RelatedPartyPairSuggestionRow[] = res.rows.map((r) => {
    const cardParty = partyForCard(r.funding_card_last4);
    const bankHint = describeBankLinePartyHint(r.description);
    const partyKey = cardParty?.party_key ?? bankHint.party_key;
    const partyName = cardParty?.counterparty_name ?? bankHint.counterparty_name;
    const accountNumber =
      cardParty?.liability_account_number ??
      (partyKey === "scentsx"
        ? "2410-00-002"
        : partyKey === "jorge"
          ? "2410-00-001"
          : partyKey === "tio_perfumes_2"
            ? "2410-00-003"
            : partyKey === "laura"
              ? "2410-00-004"
              : partyKey === "transportation"
                ? "8000"
                : null);
    const cardConfirmed = cardParty ? cardParty.card_confirmed : null;
    return {
      bank_transaction_id: r.bank_transaction_id,
      transaction_date: r.transaction_date,
      amount_cents: Number(r.amount_cents),
      description: r.description,
      bank_party_hint: bankHint.kind,
      suggested_relay_deposit_id: r.suggested_relay_deposit_id,
      relay_deposit_id: r.relay_deposit_id,
      deposit_date: r.deposit_date,
      funding_card_last4: r.funding_card_last4,
      party_key: partyKey,
      party_name: partyName,
      party_account_number: accountNumber,
      card_confirmed: cardConfirmed,
      date_gap_days: r.date_gap_days != null ? Number(r.date_gap_days) : null,
      pair_status: r.suggested_relay_deposit_id ? "suggested" : "unpaired",
    };
  });

  // Touch map export so guards can assert the known cards stay wired.
  void RELATED_PARTY_CARD_MAP;
  void RELAY_ATLANTA_OWN_CARD_PATTERN;
  void isRelatedPartyOutboundCandidate;

  return { rows, total };
}
