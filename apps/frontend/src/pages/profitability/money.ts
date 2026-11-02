import { formatUsdCents } from "../../lib/money";

export function money(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  if (cents === 0) return formatUsdCents(0);
  return formatUsdCents(cents);
}

export function perMile(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return formatUsdCents(cents);
}

export function milesLabel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}
