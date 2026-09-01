export type BulkPrecheckRow = {
  id: string;
  label?: string;
  /** null = allowed; non-null = blocked with human reason shown before the API runs. */
  blockedReason: string | null;
};

export type BulkPrecheckPartition = {
  voidable: BulkPrecheckRow[];
  blocked: BulkPrecheckRow[];
};

/** SEL-03 — partition a selection before bulk void/submit so blocked rows surface in UI first. */
export function partitionBulkPrecheck(rows: BulkPrecheckRow[]): BulkPrecheckPartition {
  const voidable: BulkPrecheckRow[] = [];
  const blocked: BulkPrecheckRow[] = [];
  for (const row of rows) {
    if (row.blockedReason) blocked.push(row);
    else voidable.push(row);
  }
  return { voidable, blocked };
}

export function precheckRowsFromIds(
  ids: string[],
  rowLabels: Record<string, string> | undefined,
  isBlocked: (id: string) => string | null
): BulkPrecheckRow[] {
  return ids.map((id) => ({
    id,
    label: rowLabels?.[id],
    blockedReason: isBlocked(id),
  }));
}
