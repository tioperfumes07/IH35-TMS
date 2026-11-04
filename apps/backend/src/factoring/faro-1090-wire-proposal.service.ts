/**
 * ENG-17 — Faro 1090 wire PROPOSAL engine (BUILD ONLY / owner BUILD-FIRST).
 *
 * For every posted factoring purchase with no live bank match, score unmatched bank
 * credit lines as wire candidates and classify:
 *   PROPOSED   — exactly one exact-amount candidate, nothing else, and that wire is the exact
 *                candidate of NO other open purchase
 *   AMBIGUOUS  — two or more candidates, a lone non-exact candidate, a wire claimed by two
 *                purchases, or a same-day Faro SHORT wire (Faro withheld part of the net — the
 *                owner names where the gap goes through the existing Resolve difference)
 *   NO_EVIDENCE — zero candidates
 *
 * ACCT-F11071 (rows 89 90 112): the wire window is anchored on EACH PURCHASE DATE (± DAY_WINDOW),
 * never on as_of. The old window (as_of ± 74 days) silently dropped every wire older than
 * as_of − 74: run on 2026-11-03 it could not see the 08-17 / 08-18 / 08-19 Faro wires that equal
 * FP-2026-00013 / 00014 / 00015 to the cent, and reported them NO_EVIDENCE.
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
  /** Same-day Faro wire SMALLER than the purchase net — Faro withheld the gap. Never PROPOSED. */
  short_wire?: boolean;
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

export const DAY_WINDOW = 14;
const NEAR_CENTS = 1; // exact preferred; near = same cents (wires are exact)
/** A short wire must land within this many days of the purchase and name Faro. */
const SHORT_WIRE_DAY_WINDOW = 1;

function classify(candidates: FaroWireCandidate[], claimedByAnotherPurchase = false): WireProposalClass {
  if (candidates.length === 0) return "NO_EVIDENCE";
  const exact = candidates.filter((c) => c.exact_amount);
  // Money path: PROPOSED only for ONE exact wire with nothing beside it. A lone near / short candidate is
  // the owner's pick, never a proposal (the old code proposed a lone non-exact candidate).
  if (exact.length === 1 && candidates.length === 1 && !claimedByAnotherPurchase) return "PROPOSED";
  return "AMBIGUOUS";
}

/** Pure classifier exported for unit tests — no DB. */
export function classifyWireCandidates(candidates: FaroWireCandidate[], claimedByAnotherPurchase = false): WireProposalClass {
  return classify(candidates, claimedByAnotherPurchase);
}

export type WireRow = {
  id: string;
  transaction_date: string;
  amount_cents: number;
  description: string | null;
  merchant_name: string | null;
};

export type OpenPurchaseRow = {
  purchase_id: string;
  display_id: string;
  purchase_date: string;
  factoring_advance_id: string;
  net_to_company_cents: number;
  days_unfunded: number;
};

/** The wire window: every purchase's own date ± DAY_WINDOW — never as_of. Null when there is no purchase. */
export function wireWindowForPurchases(purchases: Array<Pick<OpenPurchaseRow, "purchase_date">>): { from: string; to: string } | null {
  if (purchases.length === 0) return null;
  const dates = purchases.map((p) => p.purchase_date.slice(0, 10)).sort();
  return { from: shiftDate(dates[0]!, -DAY_WINDOW), to: shiftDate(dates[dates.length - 1]!, DAY_WINDOW) };
}

function namesFaro(w: Pick<WireRow, "description" | "merchant_name">): boolean {
  return /faro/i.test(`${w.merchant_name ?? ""} ${w.description ?? ""}`);
}

/** Pure proposal builder (no DB) — exported for unit tests. */
export function buildFaro1090WireProposals(
  purchases: OpenPurchaseRow[],
  wireRows: WireRow[],
): { proposals: Faro1090WireProposal[]; summary: Record<WireProposalClass, number> } {
  const perPurchase = purchases.map((p) => {
    const net = p.net_to_company_cents;
    const candidates: FaroWireCandidate[] = [];
    for (const w of wireRows) {
      const amountDelta = Math.abs(w.amount_cents - net);
      const dayDelta = Math.abs(daysBetween(p.purchase_date, w.transaction_date));
      if (amountDelta <= NEAR_CENTS && dayDelta <= DAY_WINDOW) {
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
    }
    return { p, candidates };
  });

  // A wire that is the exact candidate of two purchases cannot be proposed to either.
  const exactClaims = new Map<string, number>();
  for (const row of perPurchase) {
    for (const c of row.candidates) if (c.exact_amount) exactClaims.set(c.bank_transaction_id, (exactClaims.get(c.bank_transaction_id) ?? 0) + 1);
  }

  // Short wires: a same-day Faro-named credit smaller than the net, offered only when the purchase has no
  // exact/near candidate and the wire is no purchase's exact candidate. Evidence for the owner, never a proposal.
  for (const row of perPurchase) {
    if (row.candidates.length > 0) continue;
    for (const w of wireRows) {
      if (exactClaims.has(w.id) || !namesFaro(w)) continue;
      if (w.amount_cents <= 0 || w.amount_cents >= row.p.net_to_company_cents) continue;
      const dayDelta = Math.abs(daysBetween(row.p.purchase_date, w.transaction_date));
      if (dayDelta > SHORT_WIRE_DAY_WINDOW) continue;
      row.candidates.push({
        bank_transaction_id: w.id,
        transaction_date: w.transaction_date,
        amount_cents: w.amount_cents,
        description: w.description,
        merchant_name: w.merchant_name,
        amount_delta_cents: row.p.net_to_company_cents - w.amount_cents,
        day_delta: dayDelta,
        exact_amount: false,
        short_wire: true,
      });
    }
  }

  const proposals: Faro1090WireProposal[] = perPurchase.map(({ p, candidates }) => {
    candidates.sort((a, b) => a.amount_delta_cents - b.amount_delta_cents || a.day_delta - b.day_delta);
    const top = candidates[0] ?? null;
    const claimedByAnother = top?.exact_amount === true && (exactClaims.get(top.bank_transaction_id) ?? 0) > 1;
    const classification = classify(candidates, claimedByAnother);
    const shortOnly = candidates.length > 0 && candidates.every((c) => c.short_wire === true);
    return {
      purchase_id: p.purchase_id,
      display_id: p.display_id,
      purchase_date: p.purchase_date,
      factoring_advance_id: p.factoring_advance_id,
      net_to_company_cents: p.net_to_company_cents,
      days_unfunded: p.days_unfunded,
      classification,
      candidates,
      dry_run_accept_preview: {
        bank_transaction_id: classification === "PROPOSED" ? top?.bank_transaction_id ?? null : null,
        factoring_advance_id: p.factoring_advance_id,
        net_to_company_cents: p.net_to_company_cents,
        executed: false as const,
        note:
          classification === "PROPOSED"
            ? "DRY-RUN only — Accept is deferred (owner BUILD-FIRST). Would call existing factoring_advance match / createBankDeposit path."
            : shortOnly
              ? "Faro wired LESS than the purchase net on the purchase date — owner picks the wire and names the account for the gap (Resolve difference); engine will not silent-match."
              : claimedByAnother
                ? "This wire is the exact candidate of more than one open purchase — owner must pick."
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

  const purchaseRows: OpenPurchaseRow[] = purchases.rows.map((p) => ({
    purchase_id: p.purchase_id,
    display_id: p.display_id,
    purchase_date: p.purchase_date,
    factoring_advance_id: p.factoring_advance_id,
    net_to_company_cents: Number(p.net_to_company_cents),
    days_unfunded: Number(p.days_unfunded),
  }));
  const window = wireWindowForPurchases(purchaseRows);
  if (!window) return buildFaro1090WireProposals([], []);

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
       AND b.transaction_date BETWEEN $2::date AND $3::date
     ORDER BY b.transaction_date, b.id
    `,
    [operatingCompanyId, window.from, window.to],
  );

  const wireRows: WireRow[] = wires.rows.map((w) => ({
    id: w.id,
    transaction_date: w.transaction_date,
    amount_cents: Number(w.amount_cents),
    description: w.description,
    merchant_name: w.merchant_name,
  }));

  return buildFaro1090WireProposals(purchaseRows, wireRows);
}

function shiftDate(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const aa = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const bb = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(aa) || Number.isNaN(bb)) return 999;
  return Math.round((bb - aa) / 86_400_000);
}
