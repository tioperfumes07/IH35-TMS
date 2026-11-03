/**
 * ENG-17 — Faro 1090 wire PROPOSAL engine (BUILD ONLY / owner BUILD-FIRST).
 *
 * For every posted factoring purchase with no live bank match, score unmatched bank
 * credit lines as wire candidates and classify:
 *   PROPOSED   — exactly one exact-amount candidate
 *   AMBIGUOUS  — two or more exact-amount candidates (or one exact + near)
 *   NO_EVIDENCE — zero candidates
 *
 * READ-ONLY. This module never writes rows and never calls createBankDeposit /
 * acceptMatch. The owner pick screen may preview a dry-run payload; matches stay deferred.
 */
import { bankLineIsUnmatchedSql } from "../banking/bank-line-match-pointer.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type WireProposalClass = "PROPOSED" | "AMBIGUOUS" | "NO_EVIDENCE";

export type FaroWireCandidate = {
  bank_transaction_id: string;
  transaction_date: string;
  amount_cents: number;
  description: string | null;
  merchant_name: string | null;
  amount_delta_cents: number;
  day_delta: number;
  exact_amount: boolean;
};

export type Faro1090WireProposal = {
  purchase_id: string;
  display_id: string;
  purchase_date: string;
  factoring_advance_id: string;
  net_to_company_cents: number;
  days_unfunded: number;
  classification: WireProposalClass;
  candidates: FaroWireCandidate[];
  /** Dry-run only — what an owner Accept would hand to the existing match / deposit path. Never executed here. */
  dry_run_accept_preview: {
    bank_transaction_id: string | null;
    factoring_advance_id: string;
    net_to_company_cents: number;
    executed: false;
    note: string;
  };
};

const DAY_WINDOW = 14;
const NEAR_CENTS = 1; // exact preferred; near = same cents (wires are exact)

function classify(candidates: FaroWireCandidate[]): WireProposalClass {
  const exact = candidates.filter((c) => c.exact_amount);
  if (exact.length === 1 && candidates.length === 1) return "PROPOSED";
  if (exact.length === 1 && candidates.length > 1) return "AMBIGUOUS";
  if (exact.length > 1) return "AMBIGUOUS";
  if (candidates.length === 0) return "NO_EVIDENCE";
  if (candidates.length === 1) return "PROPOSED";
  return "AMBIGUOUS";
}

/** Pure classifier exported for unit tests — no DB. */
export function classifyWireCandidates(candidates: FaroWireCandidate[]): WireProposalClass {
  return classify(candidates);
}

export async function listFaro1090WireProposals(
  client: DbClient,
  operatingCompanyId: string,
  asOfDate: string,
): Promise<{ proposals: Faro1090WireProposal[]; summary: Record<WireProposalClass, number> }> {
  const purchases = await client.query<{
    purchase_id: string;
    display_id: string;
    purchase_date: string;
    factoring_advance_id: string;
    net_to_company_cents: string | number;
    days_unfunded: string | number;
  }>(
    `
    SELECT p.id::text AS purchase_id,
           p.display_id,
           p.purchase_date::text,
           p.factoring_advance_id::text,
           p.net_to_company_cents,
           ($2::date - p.purchase_date)::int AS days_unfunded
      FROM accounting.factoring_purchases p
     WHERE p.operating_company_id = $1::uuid
       AND p.status = 'posted'
       AND p.voided_at IS NULL
       AND p.factoring_advance_id IS NOT NULL
       AND NOT EXISTS (
             SELECT 1 FROM banking.bank_transactions bt
              WHERE bt.matched_factoring_advance_id = p.factoring_advance_id
                AND bt.voided_at IS NULL
           )
       AND NOT EXISTS (
             SELECT 1 FROM banking.reconciliation_matches m
              WHERE m.ledger_entry_kind = 'factoring_advance'
                AND m.ledger_entry_id = p.factoring_advance_id
                AND m.voided_at IS NULL
                AND m.match_state IN ('auto_matched', 'user_matched')
           )
       AND NOT EXISTS (
             SELECT 1 FROM accounting.deposit_lines dl
               JOIN accounting.deposits d ON d.id = dl.deposit_id AND d.voided_at IS NULL
              WHERE dl.source_factoring_advance_id = p.factoring_advance_id
           )
     ORDER BY p.purchase_date, p.display_id
    `,
    [operatingCompanyId, asOfDate],
  );

  const wires = await client.query<{
    id: string;
    transaction_date: string;
    amount_cents: string | number;
    description: string | null;
    merchant_name: string | null;
  }>(
    `
    SELECT b.id::text, b.transaction_date::text, b.amount_cents, b.description, b.merchant_name
      FROM banking.bank_transactions b
     WHERE b.operating_company_id = $1::uuid
       AND b.voided_at IS NULL
       AND b.merged_into_bank_transaction_id IS NULL
       AND b.is_credit IS TRUE
       AND b.review_state IS DISTINCT FROM 'excluded'
       AND ${bankLineIsUnmatchedSql("b")}
       AND b.transaction_date BETWEEN ($2::date - ($3::int || ' days')::interval)::date
                                  AND ($2::date + ($3::int || ' days')::interval)::date
     ORDER BY b.transaction_date DESC, b.created_at DESC
     LIMIT 2000
    `,
    [operatingCompanyId, asOfDate, DAY_WINDOW + 60],
  );

  const wireRows = wires.rows.map((w) => ({
    id: w.id,
    transaction_date: w.transaction_date,
    amount_cents: Number(w.amount_cents),
    description: w.description,
    merchant_name: w.merchant_name,
  }));

  const proposals: Faro1090WireProposal[] = purchases.rows.map((p) => {
    const net = Number(p.net_to_company_cents);
    const purchaseDate = p.purchase_date;
    const candidates: FaroWireCandidate[] = [];
    for (const w of wireRows) {
      const amountDelta = Math.abs(w.amount_cents - net);
      if (amountDelta > NEAR_CENTS) continue;
      const dayDelta = Math.abs(daysBetween(purchaseDate, w.transaction_date));
      if (dayDelta > DAY_WINDOW) continue;
      candidates.push({
        bank_transaction_id: w.id,
        transaction_date: w.transaction_date,
        amount_cents: w.amount_cents,
        description: w.description,
        merchant_name: w.merchant_name,
        amount_delta_cents: amountDelta,
        day_delta: dayDelta,
        exact_amount: amountDelta === 0,
      });
    }
    candidates.sort((a, b) => a.amount_delta_cents - b.amount_delta_cents || a.day_delta - b.day_delta);
    const classification = classify(candidates);
    const top = candidates[0] ?? null;
    return {
      purchase_id: p.purchase_id,
      display_id: p.display_id,
      purchase_date: p.purchase_date,
      factoring_advance_id: p.factoring_advance_id,
      net_to_company_cents: net,
      days_unfunded: Number(p.days_unfunded),
      classification,
      candidates,
      dry_run_accept_preview: {
        bank_transaction_id: classification === "PROPOSED" ? top?.bank_transaction_id ?? null : null,
        factoring_advance_id: p.factoring_advance_id,
        net_to_company_cents: net,
        executed: false as const,
        note:
          classification === "PROPOSED"
            ? "DRY-RUN only — Accept is deferred (owner BUILD-FIRST). Would call existing factoring_advance match / createBankDeposit path."
            : classification === "AMBIGUOUS"
              ? "Owner must pick one candidate; engine will not silent-match."
              : "No wire candidate in window — residual stays until owner bank evidence exists.",
      },
    };
  });

  const summary: Record<WireProposalClass, number> = { PROPOSED: 0, AMBIGUOUS: 0, NO_EVIDENCE: 0 };
  for (const row of proposals) summary[row.classification] += 1;
  return { proposals, summary };
}

function daysBetween(a: string, b: string): number {
  const aa = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const bb = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(aa) || Number.isNaN(bb)) return 999;
  return Math.round((bb - aa) / 86_400_000);
}
