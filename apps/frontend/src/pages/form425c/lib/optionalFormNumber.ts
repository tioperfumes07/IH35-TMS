/** Empty court money/count fields stay null — never Number("" || 0) inventing $0 / 0 employees. */
export function optionalFormNumber(raw: unknown): number | null {
  const t = String(raw ?? "").trim().replace(/[$,]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function optionalFormInt(raw: unknown): number | null {
  const n = optionalFormNumber(raw);
  if (n === null) return null;
  return Math.trunc(n);
}
