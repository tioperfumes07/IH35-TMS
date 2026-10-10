/**
 * ROUND 443.5 — EVERY DEDUCTION, ADMIN FEE AND FUEL LINE CARRIES ITS LOAD.
 * Owner rule 2026-10-02 (settlement-creator.service.ts): "every settlement item belongs to a load."
 *
 * MEASURED on main 745714fe5d: deductions went to createSettlementDeduction with no loadId (settlement-only);
 * admin_fee_cents was one settlement-level amount with no load; a fuel fill with no load typed was written with a
 * load exemption reason instead of being attributed.
 *
 * Rules (pure — run before anything is written, and as preview blockers):
 *   - a deduction names its load; blank -> deduction_load_required naming the line
 *   - the admin fee is a deduction line with its load (the drawer sends it that way); a separate admin_fee_cents is
 *     refused — it carries no load, and alongside an "Admin fee" deduction line it would be charged twice
 *   - a fuel fill with no load typed is attributed by purchase date against THIS settlement's loads (pickup date to
 *     delivery date): exactly one match -> that load; none or several -> fuel_load_ambiguous naming the fill, the date
 *     and the candidates. Never the first load.
 * Escrow with no load number keeps the settlement's first load (owner 2026-10-10: "escrow with no load number yes as
 * you said") — not changed here.
 */
import { SettlementCreatorError } from "./settlement-creator.service.js";

type LoadSpan = { load_number: string; pickup_date?: string | null; delivery_date?: string | null };
type MoneyLine = { description?: string | null; amount_cents: number; load_number?: string | null };
type FuelLine = { date: string; load_number?: string | null; load_id?: string | null; invoice?: string | null; vendor_name?: string | null };

/** This settlement's loads whose pickup..delivery window (dates, inclusive) contains the fill date. */
export function fuelLoadCandidates(loads: readonly LoadSpan[], date: string): string[] {
  return loads
    .filter((l) => {
      const from = l.pickup_date || l.delivery_date;
      const to = l.delivery_date || l.pickup_date;
      return Boolean(from && to && from <= date && date <= to);
    })
    .map((l) => l.load_number);
}

/** The load number a fuel fill belongs to: the typed one, else the single load whose dates cover the fill. */
export function attributeFuelLoadNumber(loads: readonly LoadSpan[], fuel: FuelLine): string | null {
  if (fuel.load_id) return null; // picked by id — resolved by resolveLineLoadId
  const typed = fuel.load_number?.trim();
  if (typed) return typed;
  const candidates = fuelLoadCandidates(loads, fuel.date);
  if (candidates.length === 1) return candidates[0]!;
  const name = [fuel.vendor_name, fuel.invoice].filter(Boolean).join(" ") || "fuel fill";
  throw new SettlementCreatorError(
    "fuel_load_ambiguous",
    candidates.length === 0
      ? `Fuel ${name} on ${fuel.date}: no load of this settlement covers that date — type its load number.`
      : `Fuel ${name} on ${fuel.date}: loads ${candidates.join(", ")} all cover that date — type which load it belongs to.`,
  );
}

type ExpenseLine = { item_name: string; amount_cents: number; is_company_expense: boolean; card?: string | null; vendor_name?: string | null };

/** ROUND 443.6 — a company expense names how it was paid (relay / dreamline / owed) and its vendor. No default. */
export function companyExpenseRefusal(expenses: readonly ExpenseLine[] | null | undefined): SettlementCreatorError | null {
  for (const e of expenses ?? []) {
    if (!e.is_company_expense || e.amount_cents <= 0) continue;
    if (!e.card) {
      return new SettlementCreatorError("expense_payment_source_required", `Company expense "${e.item_name}": choose how it was paid — Relay, Dreamline, or Owed to the vendor.`);
    }
    if (!e.vendor_name?.trim()) {
      return new SettlementCreatorError("expense_vendor_required", `Company expense "${e.item_name}": name the vendor.`);
    }
  }
  return null;
}

export function lineLoadRefusal(draft: {
  loads: readonly LoadSpan[];
  deductions?: readonly MoneyLine[] | null;
  admin_fee_cents?: number | null;
  fuel_purchases?: readonly FuelLine[] | null;
  expenses?: readonly ExpenseLine[] | null;
}): SettlementCreatorError | null {
  const exp = companyExpenseRefusal(draft.expenses);
  if (exp) return exp;
  for (const d of draft.deductions ?? []) {
    if (d.amount_cents > 0 && !d.load_number?.trim()) {
      return new SettlementCreatorError("deduction_load_required", `Deduction "${d.description || "deduction"}" needs its load number.`);
    }
  }
  if (Number(draft.admin_fee_cents ?? 0) > 0) {
    const asLine = (draft.deductions ?? []).some((d) => d.amount_cents > 0 && /admin\s*fee/i.test(d.description ?? ""));
    return new SettlementCreatorError(
      "admin_fee_needs_load",
      asLine
        ? "The admin fee is entered twice (as a deduction line and as a separate amount). Keep the deduction line with its load."
        : "Enter the admin fee as a deduction line with its load number.",
    );
  }
  for (const f of draft.fuel_purchases ?? []) {
    try {
      attributeFuelLoadNumber(draft.loads, f);
    } catch (err) {
      if (err instanceof SettlementCreatorError) return err;
      throw err;
    }
  }
  return null;
}
