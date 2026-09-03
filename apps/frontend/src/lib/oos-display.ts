export function formatOosDays(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) return "0";
  return String(Math.max(0, Math.round(value)));
}

export function formatOosDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}
