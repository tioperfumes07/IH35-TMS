/**
 * Boot-time column existence probe for the posting engine.
 *
 * Runs once per process on first use. Queries information_schema.columns for every
 * column the posting engine references in SQL. Throws loud if any column is missing —
 * this catches the "migration not applied" class of production bug before any data
 * is written.
 *
 * Skipped when DATABASE_URL is absent (unit-test environments).
 */
type DbClient = {
  query: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

let probeResult: "ok" | "skip" | null = null;

const REQUIRED_COLUMNS: {
  schema: string;
  table: string;
  columns: string[];
}[] = [
  {
    schema: "accounting",
    table: "journal_entries",
    columns: [
      "id",
      "operating_company_id",
      "entry_date",
      "memo",
      "status",
      "source",
      "created_by_user_id",
      "qbo_sync_pending",
      "created_at",
      "updated_at",
      "idempotency_key",
    ],
  },
  {
    schema: "accounting",
    table: "journal_entry_postings",
    columns: [
      "id",
      "operating_company_id",
      "journal_entry_uuid",
      "line_sequence",
      "account_id",
      "debit_or_credit",
      "amount_cents",
      "description",
      "source_transaction_type",
      "source_transaction_id",
      "source_transaction_line_id",
      "posting_batch_id",
      "idempotency_key",
      "created_at",
      "updated_at",
    ],
  },
  {
    schema: "accounting",
    table: "posting_batches",
    columns: [
      "id",
      "operating_company_id",
      "source_type",
      "source_id",
      "idempotency_key",
      "status",
      "created_at",
      "updated_at",
    ],
  },
  {
    schema: "accounting",
    table: "transaction_source_links",
    columns: [
      "id",
      "operating_company_id",
      "journal_entry_posting_id",
      "linked_object_type",
      "linked_object_id",
      "relationship_role",
    ],
  },
];

export class StartupColumnProbeError extends Error {
  constructor(missing: { table: string; column: string }[]) {
    const lines = missing
      .map((m) => `  ${m.table}.${m.column}`)
      .join("\n");
    super(
      `STARTUP COLUMN PROBE FAILED — required columns missing from live DB.\n` +
        `These columns are referenced by the posting engine but not found in information_schema.columns.\n` +
        `Run pending migrations before starting the server.\n\nMissing:\n${lines}`
    );
    this.name = "StartupColumnProbeError";
  }
}

export async function runStartupColumnProbe(client: DbClient): Promise<void> {
  if (probeResult === "ok" || probeResult === "skip") return;

  if (!process.env.DATABASE_URL) {
    probeResult = "skip";
    return;
  }

  const missing: { table: string; column: string }[] = [];

  for (const { schema, table, columns } of REQUIRED_COLUMNS) {
    const res = await client.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2`,
      [schema, table]
    );
    const existing = new Set(res.rows.map((r: { column_name: string }) => r.column_name.toLowerCase()));
    for (const col of columns) {
      if (!existing.has(col.toLowerCase())) {
        missing.push({ table: `${schema}.${table}`, column: col });
      }
    }
  }

  if (missing.length > 0) {
    throw new StartupColumnProbeError(missing);
  }

  probeResult = "ok";
}

export function resetStartupColumnProbeForTest(): void {
  probeResult = null;
}
