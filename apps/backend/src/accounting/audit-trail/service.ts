type Queryable = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type AccountingAuditTrailEvent = {
  id: string;
  occurred_at: string;
  event_class: "accounting.posting_line_created" | "accounting.posting_line_reversal" | "accounting.posting_line_reversed";
  operating_company_id: string;
  journal_entry_id: string;
  posting_batch_id: string | null;
  source_transaction_type: string | null;
  source_transaction_id: string | null;
  source_transaction_line_id: string | null;
  account_id: string;
  account_number: string | null;
  account_name: string | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string | null;
  before_state_json: Record<string, unknown> | null;
  after_state_json: Record<string, unknown>;
};

export type AccountingSourceLineageRow = {
  posting_id: string;
  journal_entry_id: string;
  posting_batch_id: string | null;
  source_transaction_type: string;
  source_transaction_id: string;
  source_transaction_line_id: string | null;
  linked_object_type: string | null;
  linked_object_id: string | null;
  relationship_role: string | null;
  account_id: string;
  account_number: string | null;
  account_name: string | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string | null;
  occurred_at: string;
};

type Cursor = { occurred_at: string; id: string };

export function decodeAuditTrailCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<Cursor>;
    if (!parsed.occurred_at || !parsed.id) return null;
    if (Number.isNaN(Date.parse(parsed.occurred_at))) return null;
    return { occurred_at: parsed.occurred_at, id: parsed.id };
  } catch {
    return null;
  }
}

export function encodeAuditTrailCursor(row: { occurred_at: string; id: string }) {
  return Buffer.from(
    JSON.stringify({
      occurred_at: new Date(row.occurred_at).toISOString(),
      id: row.id,
    }),
    "utf8",
  ).toString("base64url");
}

export async function listAccountingAuditTrail(
  client: Queryable,
  input: {
    operating_company_id: string;
    limit: number;
    cursor?: Cursor | null;
    source_transaction_type?: string;
    source_transaction_id?: string;
    account_id?: string;
  },
): Promise<{ events: AccountingAuditTrailEvent[]; next_cursor: string | null }> {
  const values: unknown[] = [input.operating_company_id];
  const where = ["jp.operating_company_id = $1::uuid"];

  if (input.source_transaction_type) {
    values.push(input.source_transaction_type.trim());
    where.push(`jp.source_transaction_type = $${values.length}::text`);
  }
  if (input.source_transaction_id) {
    values.push(input.source_transaction_id.trim());
    where.push(`jp.source_transaction_id = $${values.length}::text`);
  }
  if (input.account_id) {
    values.push(input.account_id.trim());
    where.push(`jp.account_id = $${values.length}::uuid`);
  }
  if (input.cursor) {
    values.push(input.cursor.occurred_at, input.cursor.id);
    where.push(
      `(COALESCE(je.created_at, pb.created_at, now()), jp.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`,
    );
  }
  values.push(input.limit + 1);

  const res = await client.query(
    `
      SELECT
        jp.id::text AS id,
        COALESCE(je.created_at, pb.created_at, now())::text AS occurred_at,
        jp.operating_company_id::text AS operating_company_id,
        jp.journal_entry_uuid::text AS journal_entry_id,
        jp.posting_batch_id::text AS posting_batch_id,
        jp.source_transaction_type,
        jp.source_transaction_id,
        jp.source_transaction_line_id,
        jp.account_id::text AS account_id,
        a.account_number,
        a.account_name,
        jp.debit_or_credit,
        jp.amount_cents::bigint AS amount_cents,
        jp.description,
        jp.reversal_of_line_id::text AS reversal_of_line_id,
        jp.reversed_by_line_id::text AS reversed_by_line_id
      FROM accounting.journal_entry_postings jp
      JOIN accounting.journal_entries je
        ON je.id = jp.journal_entry_uuid
       AND je.operating_company_id = jp.operating_company_id
      LEFT JOIN accounting.posting_batches pb
        ON pb.id = jp.posting_batch_id
       AND pb.operating_company_id = jp.operating_company_id
      LEFT JOIN catalogs.accounts a
        ON a.id = jp.account_id
      WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(je.created_at, pb.created_at, now()) DESC, jp.id DESC
      LIMIT $${values.length}
    `,
    values,
  );

  const rows = res.rows as Array<Record<string, unknown>>;
  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;

  const events: AccountingAuditTrailEvent[] = page.map((row) => {
    const reversalOf = String(row.reversal_of_line_id ?? "").trim();
    const reversedBy = String(row.reversed_by_line_id ?? "").trim();
    const eventClass: AccountingAuditTrailEvent["event_class"] = reversalOf
      ? "accounting.posting_line_reversal"
      : reversedBy
        ? "accounting.posting_line_reversed"
        : "accounting.posting_line_created";
    const afterState = {
      posting_id: String(row.id ?? ""),
      posting_batch_id: row.posting_batch_id ? String(row.posting_batch_id) : null,
      source_transaction_type: row.source_transaction_type ? String(row.source_transaction_type) : null,
      source_transaction_id: row.source_transaction_id ? String(row.source_transaction_id) : null,
      source_transaction_line_id: row.source_transaction_line_id ? String(row.source_transaction_line_id) : null,
      account_id: String(row.account_id ?? ""),
      debit_or_credit: String(row.debit_or_credit ?? ""),
      amount_cents: Number(row.amount_cents ?? 0),
      description: row.description == null ? null : String(row.description),
      reversal_of_line_id: reversalOf || null,
      reversed_by_line_id: reversedBy || null,
    };
    const beforeState = reversalOf
      ? { reversal_of_line_id: reversalOf }
      : reversedBy
        ? { reversed_by_line_id: reversedBy }
        : null;
    return {
      id: String(row.id ?? ""),
      occurred_at: new Date(String(row.occurred_at ?? new Date().toISOString())).toISOString(),
      event_class: eventClass,
      operating_company_id: String(row.operating_company_id ?? ""),
      journal_entry_id: String(row.journal_entry_id ?? ""),
      posting_batch_id: row.posting_batch_id ? String(row.posting_batch_id) : null,
      source_transaction_type: row.source_transaction_type ? String(row.source_transaction_type) : null,
      source_transaction_id: row.source_transaction_id ? String(row.source_transaction_id) : null,
      source_transaction_line_id: row.source_transaction_line_id ? String(row.source_transaction_line_id) : null,
      account_id: String(row.account_id ?? ""),
      account_number: row.account_number == null ? null : String(row.account_number),
      account_name: row.account_name == null ? null : String(row.account_name),
      debit_or_credit: (String(row.debit_or_credit ?? "debit") === "credit" ? "credit" : "debit"),
      amount_cents: Number(row.amount_cents ?? 0),
      description: row.description == null ? null : String(row.description),
      before_state_json: beforeState,
      after_state_json: afterState,
    };
  });

  const last = events[events.length - 1];
  return {
    events,
    next_cursor: hasMore && last ? encodeAuditTrailCursor({ occurred_at: last.occurred_at, id: last.id }) : null,
  };
}

export async function listAccountingSourceLineage(
  client: Queryable,
  input: {
    operating_company_id: string;
    source_transaction_type: string;
    source_transaction_id: string;
    limit: number;
  },
): Promise<{ rows: AccountingSourceLineageRow[] }> {
  const res = await client.query(
    `
      SELECT
        jp.id::text AS posting_id,
        jp.journal_entry_uuid::text AS journal_entry_id,
        jp.posting_batch_id::text AS posting_batch_id,
        jp.source_transaction_type,
        jp.source_transaction_id,
        jp.source_transaction_line_id,
        tsl.linked_object_type,
        tsl.linked_object_id,
        tsl.relationship_role,
        jp.account_id::text AS account_id,
        a.account_number,
        a.account_name,
        jp.debit_or_credit,
        jp.amount_cents::bigint AS amount_cents,
        jp.description,
        je.created_at::text AS occurred_at
      FROM accounting.journal_entry_postings jp
      JOIN accounting.journal_entries je
        ON je.id = jp.journal_entry_uuid
       AND je.operating_company_id = jp.operating_company_id
      LEFT JOIN accounting.transaction_source_links tsl
        ON tsl.journal_entry_posting_id = jp.id
       AND tsl.operating_company_id = jp.operating_company_id
      LEFT JOIN catalogs.accounts a
        ON a.id = jp.account_id
      WHERE jp.operating_company_id = $1::uuid
        AND jp.source_transaction_type = $2::text
        AND jp.source_transaction_id = $3::text
      ORDER BY je.created_at DESC, jp.id DESC
      LIMIT $4::int
    `,
    [input.operating_company_id, input.source_transaction_type, input.source_transaction_id, input.limit],
  );

  return {
    rows: (res.rows as Array<Record<string, unknown>>).map((row) => ({
      posting_id: String(row.posting_id ?? ""),
      journal_entry_id: String(row.journal_entry_id ?? ""),
      posting_batch_id: row.posting_batch_id ? String(row.posting_batch_id) : null,
      source_transaction_type: String(row.source_transaction_type ?? ""),
      source_transaction_id: String(row.source_transaction_id ?? ""),
      source_transaction_line_id: row.source_transaction_line_id ? String(row.source_transaction_line_id) : null,
      linked_object_type: row.linked_object_type ? String(row.linked_object_type) : null,
      linked_object_id: row.linked_object_id ? String(row.linked_object_id) : null,
      relationship_role: row.relationship_role ? String(row.relationship_role) : null,
      account_id: String(row.account_id ?? ""),
      account_number: row.account_number == null ? null : String(row.account_number),
      account_name: row.account_name == null ? null : String(row.account_name),
      debit_or_credit: (String(row.debit_or_credit ?? "debit") === "credit" ? "credit" : "debit"),
      amount_cents: Number(row.amount_cents ?? 0),
      description: row.description == null ? null : String(row.description),
      occurred_at: new Date(String(row.occurred_at ?? new Date().toISOString())).toISOString(),
    })),
  };
}
