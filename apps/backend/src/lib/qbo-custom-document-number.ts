/**
 * GO-06 — QuickBooks custom transaction numbers.
 * Intuit: the last number the operator enters becomes the next suggested number.
 * Use verbatim when sent; mint only when blank. No pad/prefix/uppercase.
 */

export const QBO_DOCUMENT_NUMBER_MAX = 40;

export class DuplicateDocumentNumberError extends Error {
  readonly code = "duplicate_document_number" as const;
  constructor(
    public readonly field: string,
    public readonly value: string,
    public readonly documentKind: string
  ) {
    super("duplicate_document_number");
    this.name = "DuplicateDocumentNumberError";
  }
}

export function duplicateDocumentNumberBody(error: DuplicateDocumentNumberError) {
  return {
    error: "duplicate_document_number" as const,
    field: error.field,
    value: error.value,
    message: `That number is already used on ${error.documentKind} ${error.value}.`,
  };
}

export function incrementTrailingNumber(last: string): string | null {
  const match = last.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) return null;
  const next = (BigInt(match[2]) + 1n).toString().padStart(match[2].length, "0");
  return `${match[1]}${next}${match[3]}`;
}

export function parseOperatorDocumentNumber(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > QBO_DOCUMENT_NUMBER_MAX) {
    throw Object.assign(new Error("document_number_too_long"), { code: "document_number_too_long" });
  }
  if (/[\u0000-\u001F\u007F]/.test(trimmed) || /\s/.test(trimmed)) {
    throw Object.assign(new Error("document_number_invalid"), { code: "document_number_invalid" });
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(trimmed)) {
    throw Object.assign(new Error("document_number_invalid"), { code: "document_number_invalid" });
  }
  return trimmed;
}

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export async function suggestFromLastSaved(
  client: Queryable,
  lastSql: { text: string; values: unknown[] },
  mint: () => Promise<string>
): Promise<{ suggested: string; derived_from: string | null; document_number: string }> {
  const lastRes = await client.query<{ last_number: string | null }>(lastSql.text, lastSql.values);
  const derived_from = lastRes.rows[0]?.last_number?.trim() || null;
  const incremented = derived_from ? incrementTrailingNumber(derived_from) : null;
  const suggested = incremented ?? (await mint());
  return { suggested, derived_from, document_number: suggested };
}
