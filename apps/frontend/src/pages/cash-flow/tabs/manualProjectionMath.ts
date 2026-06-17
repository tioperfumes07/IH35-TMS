import type { ForecastEntry } from "../../../api/forecast";

// MANUAL-PROJECTIONS-V2 Part A — summing-bug fix.
// Postgres serializes bigint columns (amount_cents) as JSON STRINGS, so the API
// hands us "650000" not 650000 even though the TS type says number. Adding those
// with `0 + e.amount_cents` triggers JS string concatenation:
//   "650000" + "550000" === "650000550000"  →  /100 === $6,500,005,500.00
// Every total MUST coerce to integer cents first and format exactly once.

/** Coerce a possibly-string bigint to integer cents. Never returns NaN. */
export function toCents(v: number | string | null | undefined): number {
  const n = Math.round(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

/** Sum amount_cents as INTEGER CENTS — never string concatenation. */
export function sumCents(rows: Array<{ amount_cents: number | string | null | undefined }>): number {
  return rows.reduce((s, e) => s + toCents(e.amount_cents), 0);
}

export type ProjectionTotals = { incomeCents: number; expenseCents: number; netCents: number };

/** income / expense / net (income − expense) totals in integer cents. */
export function computeProjectionTotals(entries: ForecastEntry[]): ProjectionTotals {
  const incomeCents = sumCents(entries.filter((e) => e.direction === "income"));
  const expenseCents = sumCents(entries.filter((e) => e.direction === "expense"));
  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents };
}
