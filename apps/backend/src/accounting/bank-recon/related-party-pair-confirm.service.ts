/**
 * ROUND 443.54-7 — owner CONFIRMS a suggested related-party bank↔Relay pair.
 *
 * Order (posts once, never twice):
 *   1) Categorize the USMCA bank outflow to Due to/from <party>
 *      → bank-feed JE: Dr Due to/from / Cr bank (postBankCategorizationOnClient).
 *   2) createRelatedPartyLoanEntry(party_transfer_out) — document + matched_related_party_loan_id.
 *      Loan poster is NOT called (GL already on the categorize JE).
 *   3) If a Relay deposit was suggested: stamp matched_relay_deposit_id + deposit.matched_bank_transaction_id
 *      (link only — deposit's own Cr Due to/from is CC-2's job).
 *
 * Unpaired confirm (no deposit): steps 1–2 only.
 * Nothing auto-pairs. Owner must POST confirm.
 */
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCompanyScope } from "../db-scope.js";
import { postBankCategorizationOnClient } from "../../banking/bank-feed-gl-posting.service.js";
import { createRelatedPartyLoanEntry } from "../related-party-loan-posting/create-entry.service.js";
import { RELATED_PARTY_PAIR_WINDOW_DAYS } from "./related-party-pair-suggestions.service.js";
import {
  RELATED_PARTY_CARD_MAP,
  USMCA_OWN_RELAY_CARD_LAST4,
  describeBankLinePartyHint,
  partyForCard,
} from "./related-party-card-map.js";

type PgClient = {
  query: <T = Record<string, unknown>>(text: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type ConfirmRelatedPartyPairInput = {
  operating_company_id: string;
  bank_transaction_id: string;
  /** Optional override; when omitted, uses the suggestion engine's pick (or unpaired). */
  relay_deposit_id?: string | null;
  actor_user_uuid: string;
};

export type ConfirmRelatedPartyPairOk = {
  ok: true;
  bank_transaction_id: string;
  related_party_loan_id: string;
  related_party_loan_display_id: string;
  party_account_number: string;
  party_name: string;
  journal_entry_id: string | null;
  relay_deposit_id: string | null;
  paired: boolean;
  duplicate_postings: 0;
};

export type ConfirmRelatedPartyPairErr = {
  ok: false;
  error:
    | "bank_transaction_not_found"
    | "already_confirmed"
    | "party_unresolved"
    | "party_account_not_found"
    | "bank_coa_unlinked"
    | "relay_deposit_not_found"
    | "amount_or_date_mismatch"
    | "categorize_failed"
    | "loan_create_failed"
    | "already_posted_elsewhere";
  message: string;
  detail?: unknown;
};

export type ConfirmRelatedPartyPairResult = ConfirmRelatedPartyPairOk | ConfirmRelatedPartyPairErr;

async function resolvePartyAccountId(
  client: PgClient,
  operatingCompanyId: string,
  accountNumber: string
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `SELECT id::text
       FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid
        AND account_number = $2
        AND deactivated_at IS NULL
      LIMIT 1`,
    [operatingCompanyId, accountNumber]
  );
  return res.rows[0]?.id ?? null;
}

function partyMetaFromBankAndCard(
  description: string | null,
  fundingCardLast4: string | null
): {
  party_key: string | null;
  party_name: string | null;
  account_number: string | null;
  relationship: "owner" | "spouse" | "related_company" | "other";
  card_confirmed: boolean | null;
} {
  const card = partyForCard(fundingCardLast4);
  const hint = describeBankLinePartyHint(description);
  const partyKey = card?.party_key ?? hint.party_key;
  const partyName = card?.counterparty_name ?? hint.counterparty_name;
  const accountNumber =
    card?.liability_account_number ??
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
  const relationship: "owner" | "spouse" | "related_company" | "other" =
    card?.relationship ??
    (partyKey === "laura" ? "spouse" : partyKey === "jorge" ? "owner" : "related_company");
  return {
    party_key: partyKey,
    party_name: partyName,
    account_number: accountNumber,
    relationship,
    card_confirmed: card ? card.card_confirmed : null,
  };
}

/**
 * Confirm one suggested (or unpaired) related-party bank outflow.
 * Writes inside one company-scoped transaction; loan poster stays off.
 */
export async function confirmRelatedPartyPair(
  input: ConfirmRelatedPartyPairInput
): Promise<ConfirmRelatedPartyPairResult> {
  const { operating_company_id: companyId, bank_transaction_id: bankTxId, actor_user_uuid: actor } = input;

  // withCompanyScope types the client as `any`; under noImplicitAny, `any.query<T>(…)`
  // is TS2347. Narrow once to the local typed PgClient so every query keeps its row type.
  return withCompanyScope(actor, companyId, async (rawClient) => {
    const client = rawClient as PgClient;
    const btRes = await client.query<{
      id: string;
      transaction_date: string;
      amount_cents: number;
      description: string | null;
      status: string | null;
      matched_related_party_loan_id: string | null;
      matched_relay_deposit_id: string | null;
      matched_journal_entry_id: string | null;
      bank_account_id: string;
      ledger_account_id: string | null;
      categorization_gl_account_id: string | null;
    }>(
      `SELECT bt.id::text,
              bt.transaction_date::text,
              abs(bt.amount_cents)::int AS amount_cents,
              bt.description,
              bt.status,
              bt.matched_related_party_loan_id::text,
              bt.matched_relay_deposit_id::text,
              bt.matched_journal_entry_id::text,
              bt.bank_account_id::text,
              ba.ledger_account_id::text,
              bt.categorization_gl_account_id::text
         FROM banking.bank_transactions bt
         JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id
        WHERE bt.id = $1::uuid
          AND bt.operating_company_id = $2::uuid
          AND bt.voided_at IS NULL
          AND bt.is_credit = false
        LIMIT 1`,
      [bankTxId, companyId]
    );
    const bt = btRes.rows[0];
    if (!bt) {
      return {
        ok: false as const,
        error: "bank_transaction_not_found" as const,
        message: "Bank line not found for this company (or it is a credit / voided).",
      };
    }
    if (bt.matched_related_party_loan_id) {
      return {
        ok: false as const,
        error: "already_confirmed" as const,
        message: `Already linked to related-party transfer ${bt.matched_related_party_loan_id}.`,
      };
    }
    if (!bt.ledger_account_id) {
      return {
        ok: false as const,
        error: "bank_coa_unlinked" as const,
        message: "Bank account has no ledger_account_id — cannot credit bank on the categorize JE.",
      };
    }

    // Resolve optional deposit: body override, else same-amount ±5d settled Relay deposit
    // on a non-USMCA card (same rule as listRelatedPartyPairSuggestions — inline so we stay
    // on this transaction's client).
    let depositId: string | null =
      input.relay_deposit_id === undefined ? null : input.relay_deposit_id;
    let fundingCardLast4: string | null = null;

    if (input.relay_deposit_id === undefined) {
      const sug = await client.query<{ id: string; funding_card_last4: string | null }>(
        `SELECT rd.id::text, rd.funding_card_last4
           FROM integrations.relay_deposits rd
          WHERE rd.operating_company_id = $1::uuid
            AND rd.status = 'settled'
            AND rd.voided_at IS NULL
            AND COALESCE(rd.is_active, true) = true
            AND rd.matched_bank_transaction_id IS NULL
            AND rd.funding_card_last4 IS DISTINCT FROM $4::text
            AND abs(rd.total_amount_cents) = $2::int
            AND COALESCE(rd.relay_created_at, rd.created_at)::date
                BETWEEN ($3::date - ($5::int)) AND ($3::date + ($5::int))
            AND NOT EXISTS (
              SELECT 1 FROM banking.bank_transactions b2
               WHERE b2.matched_relay_deposit_id = rd.id AND b2.voided_at IS NULL
            )
          ORDER BY abs(COALESCE(rd.relay_created_at, rd.created_at)::date - $3::date), rd.id
          LIMIT 1`,
        [
          companyId,
          bt.amount_cents,
          bt.transaction_date.slice(0, 10),
          USMCA_OWN_RELAY_CARD_LAST4,
          RELATED_PARTY_PAIR_WINDOW_DAYS,
        ]
      );
      depositId = sug.rows[0]?.id ?? null;
      fundingCardLast4 = sug.rows[0]?.funding_card_last4 ?? null;
    }

    if (depositId) {
      const dep = await client.query<{
        id: string;
        deposit_date: string;
        charged_cents: number;
        funding_card_last4: string | null;
        matched_bank_transaction_id: string | null;
      }>(
        `SELECT rd.id::text,
                COALESCE(rd.relay_created_at, rd.created_at)::date::text AS deposit_date,
                abs(rd.total_amount_cents)::int AS charged_cents,
                rd.funding_card_last4,
                rd.matched_bank_transaction_id::text
           FROM integrations.relay_deposits rd
          WHERE rd.id = $1::uuid
            AND rd.operating_company_id = $2::uuid
            AND rd.status = 'settled'
            AND rd.voided_at IS NULL
            AND COALESCE(rd.is_active, true) = true
          LIMIT 1`,
        [depositId, companyId]
      );
      const d = dep.rows[0];
      if (!d) {
        return {
          ok: false as const,
          error: "relay_deposit_not_found" as const,
          message: "Relay deposit not found / not settled for this company.",
        };
      }
      if (d.matched_bank_transaction_id && d.matched_bank_transaction_id !== bankTxId) {
        return {
          ok: false as const,
          error: "relay_deposit_not_found" as const,
          message: `Relay deposit already linked to bank line ${d.matched_bank_transaction_id}.`,
        };
      }
      if (d.charged_cents !== bt.amount_cents) {
        return {
          ok: false as const,
          error: "amount_or_date_mismatch" as const,
          message: `Amount mismatch: bank ${bt.amount_cents} ≠ deposit ${d.charged_cents}.`,
        };
      }
      const gap = Math.abs(
        (Date.parse(d.deposit_date) - Date.parse(bt.transaction_date.slice(0, 10))) / 86_400_000
      );
      if (gap > RELATED_PARTY_PAIR_WINDOW_DAYS) {
        return {
          ok: false as const,
          error: "amount_or_date_mismatch" as const,
          message: `Date gap ${gap} days exceeds ${RELATED_PARTY_PAIR_WINDOW_DAYS}-day window.`,
        };
      }
      fundingCardLast4 = d.funding_card_last4;
    }

    const party = partyMetaFromBankAndCard(bt.description, fundingCardLast4);
    if (!party.party_key || !party.party_name || !party.account_number) {
      return {
        ok: false as const,
        error: "party_unresolved" as const,
        message:
          "Cannot resolve related party from bank description / funding card. Name the party first (card map or Zelle payee).",
      };
    }

    const partyAccountId = await resolvePartyAccountId(client, companyId, party.account_number);
    if (!partyAccountId) {
      return {
        ok: false as const,
        error: "party_account_not_found" as const,
        message: `Due to/from account ${party.account_number} not found for this company.`,
      };
    }

    // 1) Categorize → one JE (Dr Due to/from / Cr bank). category_kind='expense' posts;
    //    category_kind='transfer' alone does NOT trip is_transfer (that needs transfer_kind /
    //    destination_bank_account_id / matched_transfer_id). Use 'expense' + the party liability
    //    so the register reads as a related-party outflow, not an own-bank transfer.
    if (bt.matched_journal_entry_id && bt.categorization_gl_account_id !== partyAccountId) {
      return {
        ok: false as const,
        error: "already_posted_elsewhere" as const,
        message: `Bank line already has JE ${bt.matched_journal_entry_id} to a different account — refuse double post.`,
      };
    }

    // 443.99: every write below is one unit. A refusal returned after the first write (poster threw, posted:false,
    // loan document refused) used to return ok:false while withCompanyScope COMMITTED the work already done — a bank
    // line categorized to the party account with no JE, or a JE with no loan document. Each such return rolls back
    // to this savepoint first, so a refusal leaves nothing behind (and a poster SQL error no longer poisons the tx).
    await client.query("SAVEPOINT related_party_pair_confirm");
    const refuse = async <R>(r: R): Promise<R> => {
      await client.query("ROLLBACK TO SAVEPOINT related_party_pair_confirm");
      return r;
    };

    if (!bt.matched_journal_entry_id) {
      await client.query(
        `UPDATE banking.bank_transactions
            SET status = 'categorized',
                category = 'expense',
                category_kind = 'expense',
                categorization_gl_account_id = $2::uuid,
                coa_account_id = $2::uuid,
                categorization_memo = $3,
                categorized_at = now(),
                categorized_by_user_id = $4::uuid,
                updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $5::uuid`,
        [
          bankTxId,
          partyAccountId,
          `Related-party transfer to ${party.party_name} (Due to/from ${party.account_number})`,
          actor,
          companyId,
        ]
      );

      let gl;
      try {
        gl = await postBankCategorizationOnClient(client as never, {
          companyId,
          actorUserUuid: actor,
          bankTransactionId: bankTxId,
        });
      } catch (e) {
        // The poster may have failed in SQL — roll back to the savepoint before anything else touches the tx.
        await client.query("ROLLBACK TO SAVEPOINT related_party_pair_confirm");
        return {
          ok: false as const,
          error: "categorize_failed" as const,
          message: String((e as Error)?.message ?? e),
        };
      }
      // BankFeedGlResult is { posted: true|false }, never { ok }.
      if (!gl || (gl as { posted?: boolean }).posted !== true) {
        return refuse({
          ok: false as const,
          error: "categorize_failed" as const,
          message: `Bank categorization did not post: ${JSON.stringify(gl)}`,
          detail: gl,
        });
      }
    }

    // 2) Document only — poster OFF (createRelatedPartyLoanEntry never posts).
    const loan = await createRelatedPartyLoanEntry(
      client as never,
      {
        operating_company_id: companyId,
        direction: "out",
        relationship: party.relationship,
        counterparty_kind: "other",
        counterparty_name: party.party_name,
        account_id: partyAccountId,
        target_type: "party_transfer_out",
        target_id: depositId,
        principal_cents: bt.amount_cents,
        entry_date: bt.transaction_date.slice(0, 10),
        interest_rate_bps: 0,
        interest_method: "none",
        bank_transaction_id: bankTxId,
        funding_account_id: bt.ledger_account_id,
        funding_source_note: `ROUND 443.54-7 confirm: bank ${bankTxId}${depositId ? ` ↔ Relay ${depositId}` : " (unpaired)"}`,
      },
      actor
    );
    if ("error" in loan) {
      return refuse({
        ok: false as const,
        error: "loan_create_failed" as const,
        message: `createRelatedPartyLoanEntry failed: ${JSON.stringify(loan)}`,
        detail: loan,
      });
    }

    // 3) Link deposit (pointer only — 0 additional postings).
    if (depositId) {
      await client.query(
        `UPDATE banking.bank_transactions
            SET matched_relay_deposit_id = $2::uuid,
                updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $3::uuid
            AND matched_relay_deposit_id IS NULL`,
        [bankTxId, depositId, companyId]
      );
      await client.query(
        `UPDATE integrations.relay_deposits
            SET matched_bank_transaction_id = COALESCE(matched_bank_transaction_id, $1::uuid)
          WHERE id = $2::uuid
            AND operating_company_id = $3::uuid`,
        [bankTxId, depositId, companyId]
      );
    }

    const jeAfter = await client.query<{ je: string | null }>(
      `SELECT matched_journal_entry_id::text AS je
         FROM banking.bank_transactions
        WHERE id = $1::uuid`,
      [bankTxId]
    );

    await appendCrudAudit(
      client as never,
      actor,
      "banking.related_party_pair.confirmed",
      {
        resource_type: "banking.bank_transactions",
        resource_id: bankTxId,
        operating_company_id: companyId,
        related_party_loan_id: loan.id,
        relay_deposit_id: depositId,
        party_account_number: party.account_number,
        card_confirmed: party.card_confirmed,
      },
      "info",
      "R44354-7-RELATED-PARTY-PAIR"
    );

    void RELATED_PARTY_CARD_MAP;

    return {
      ok: true as const,
      bank_transaction_id: bankTxId,
      related_party_loan_id: loan.id,
      related_party_loan_display_id: loan.display_id,
      party_account_number: party.account_number,
      party_name: party.party_name,
      journal_entry_id: jeAfter.rows[0]?.je ?? null,
      relay_deposit_id: depositId,
      paired: Boolean(depositId),
      duplicate_postings: 0 as const,
    };
  });
}
