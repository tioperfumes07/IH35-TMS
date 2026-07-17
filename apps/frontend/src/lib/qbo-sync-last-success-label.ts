/** Pick the most recent successful QBO sync timestamp across push + master-data CDC sources. */
export function effectiveQboLastSuccessAt(
  lastSuccessfulSyncAt: string | null | undefined,
  masterDataLastSuccessAt: string | null | undefined
): string | null {
  const candidates = [lastSuccessfulSyncAt, masterDataLastSuccessAt].filter(
    (t): t is string => Boolean(t) && !Number.isNaN(Date.parse(String(t)))
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, t) => (Date.parse(t) > Date.parse(best) ? t : best));
}

export function formatQboLastSuccessLabel(iso: string | null | undefined): string {
  if (!iso) return "Last OK: never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Last OK: never";
  return `Last OK: ${d.toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}
