/**
 * LEAD 443.304 — bank-match COMBINATION suggestions (owner 10-24 08:55 CT, verbatim intent: "a wire can have more than one
 * purchase … a bank transaction can have 20000 incoming money and it can be 2 purchases made in one day or a purchase and a
 * loan in the same amount … suggestions must also use logic in math amounts … we are able to select various transactions
 * and also resolve differences").
 *
 * PURE: no DB, no writes, never auto-matches (owner law 2026-09-12: "it should never automatch, it suggests and we accept").
 * Given the bank amount and the line's candidate POOL (taken BEFORE the single-document relevance floor — two purchases that
 * are each half of a wire fail that floor individually), find sets of 2..maxItems documents whose amounts add up to the bank
 * amount: exact (within the Q11 tolerance) first, then near sums the human can accept with Resolve difference.
 *
 * Bounded: pool capped (closest dates first), depth capped, node budget capped — a 1,000-candidate line cannot hang the drawer.
 */
export type ComboCandidate = {
  ledger_entry_kind: string;
  ledger_entry_id: string;
  amount_cents: number;
  date_gap_days: number;
  counterparty_name?: string | null;
  reference?: string | null;
};

export type AmountCombination = {
  members: Array<{ ledger_entry_kind: string; ledger_entry_id: string; amount_cents: number; reference: string | null }>;
  sum_cents: number;
  /** bank − sum: > 0 the bank received/paid MORE than the documents; < 0 less. 0 when exact. */
  variance_cents: number;
  exact: boolean;
  max_date_gap_days: number;
  same_counterparty: boolean;
};

export type CombinationOptions = {
  /** Q11 tolerance for "exact" (toleranceForAmountCents). */
  exactToleranceCents: number;
  /** Near sums offered for Resolve difference: |variance| ≤ max(this, nearPct of the bank amount). */
  nearToleranceCents?: number;
  nearPct?: number;
  maxItems?: number;
  maxPool?: number;
  maxResults?: number;
  nodeBudget?: number;
};

export function findAmountCombinations(bankCents: number, pool: ComboCandidate[], opts: CombinationOptions): AmountCombination[] {
  const bank = Math.abs(Math.round(bankCents));
  if (!(bank > 0)) return [];
  const maxItems = Math.min(Math.max(opts.maxItems ?? 4, 2), 6);
  const maxPool = opts.maxPool ?? 40;
  const maxResults = opts.maxResults ?? 6;
  const exactTol = Math.max(0, Math.round(opts.exactToleranceCents));
  const nearTol = Math.max(exactTol, Math.round(opts.nearToleranceCents ?? 0), Math.round((bank * (opts.nearPct ?? 0.02))));
  let budget = opts.nodeBudget ?? 250_000;

  // A member can never exceed the bank amount (all amounts are positive magnitudes); one document alone is the single list.
  const seen = new Set<string>();
  const items = pool
    .filter((c) => c.amount_cents > 0 && c.amount_cents < bank + nearTol)
    .filter((c) => { const k = `${c.ledger_entry_kind}:${c.ledger_entry_id}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.date_gap_days - b.date_gap_days || b.amount_cents - a.amount_cents)
    .slice(0, maxPool)
    .sort((a, b) => b.amount_cents - a.amount_cents);

  // suffix sums for pruning: the most the remaining items can add.
  const suffix: number[] = new Array(items.length + 1).fill(0);
  for (let i = items.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + items[i].amount_cents;

  const found: AmountCombination[] = [];
  const pick: number[] = [];
  const visit = (start: number, sum: number) => {
    if (budget-- <= 0) return;
    if (pick.length >= 2) {
      const variance = bank - sum;
      if (Math.abs(variance) <= nearTol) {
        const members = pick.map((i) => items[i]);
        const names = new Set(members.map((m) => (m.counterparty_name ?? "").trim().toLowerCase()).filter(Boolean));
        found.push({
          members: members.map((m) => ({ ledger_entry_kind: m.ledger_entry_kind, ledger_entry_id: m.ledger_entry_id, amount_cents: m.amount_cents, reference: m.reference ?? null })),
          sum_cents: sum,
          variance_cents: variance,
          exact: Math.abs(variance) <= exactTol,
          max_date_gap_days: Math.max(...members.map((m) => m.date_gap_days)),
          same_counterparty: names.size <= 1,
        });
      }
    }
    if (pick.length >= maxItems) return;
    for (let i = start; i < items.length; i++) {
      if (sum + suffix[i] < bank - nearTol) return;             // even every remaining document cannot reach the bank amount
      const next = sum + items[i].amount_cents;
      if (next > bank + nearTol) continue;                      // too big — a smaller one may still fit (sorted desc)
      pick.push(i);
      visit(i + 1, next);
      pick.pop();
      if (budget <= 0) return;
    }
  };
  visit(0, 0);

  found.sort((a, b) =>
    Number(b.exact) - Number(a.exact) ||
    Math.abs(a.variance_cents) - Math.abs(b.variance_cents) ||
    a.members.length - b.members.length ||
    Number(b.same_counterparty) - Number(a.same_counterparty) ||
    a.max_date_gap_days - b.max_date_gap_days);
  return found.slice(0, maxResults);
}
