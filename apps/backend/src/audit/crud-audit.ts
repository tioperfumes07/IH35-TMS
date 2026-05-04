type QueryableClient = {
  query: (query: string, values?: unknown[]) => Promise<unknown>;
};

type AuditSeverity = "info" | "warning";

function normalizeAuditValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}

function valuesDiffer(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeAuditValue(a)) !== JSON.stringify(normalizeAuditValue(b));
}

export function buildPatchChanges(
  patch: Record<string, unknown>,
  oldRow: Record<string, unknown>,
  newRow: Record<string, unknown>,
  fieldMap: Record<string, string> = {}
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const [patchKey, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) continue;
    const rowKey = fieldMap[patchKey] ?? patchKey;
    const from = oldRow[rowKey];
    const to = newRow[rowKey];
    if (!valuesDiffer(from, to)) continue;
    changes[patchKey] = {
      from: normalizeAuditValue(from),
      to: normalizeAuditValue(to),
    };
  }

  return changes;
}

export async function appendCrudAudit(
  client: QueryableClient,
  actorUserId: string,
  eventClass: string,
  payload: Record<string, unknown>,
  severity: AuditSeverity = "info",
  sourceTag = "BT-1-PHASE1-AUDIT"
) {
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
    eventClass,
    severity,
    JSON.stringify(payload),
    actorUserId,
    sourceTag,
  ]);
}
