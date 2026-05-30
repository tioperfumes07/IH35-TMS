type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export type BankTxnForFactoringMatch = {
  id: string;
  amount_cents: number;
  transaction_date: string;
};

export type FactoringBatchForMatch = {
  id: string;
  batch_number: string;
  status: "submitted" | "funded";
  expected_advance_cents: number;
  submitted_at: string | null;
};

export type FactoringBankMatchSuggestion = {
  id: string;
  bank_txn_id: string;
  batch_id: string;
  batch_number: string;
  status: "submitted" | "funded";
  expected_advance_cents: number;
  submitted_at: string | null;
  confidence: number;
  created_at: string;
  applied_at: string | null;
};

export class FactoringBankMatchError extends Error {
  constructor(
    readonly code: "bank_txn_not_found" | "suggestion_not_found" | "suggestion_already_applied" | "batch_already_matched",
    readonly statusCode: number
  ) {
    super(code);
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number(value ?? 0);
}

function toDateOnly(input: string) {
  return new Date(`${input.slice(0, 10)}T00:00:00.000Z`);
}

function daysBetweenInclusive(a: string, b: string) {
  const msPerDay = 86_400_000;
  return Math.abs(Math.round((toDateOnly(a).getTime() - toDateOnly(b).getTime()) / msPerDay));
}

export function scoreMatch(bankTxn: Pick<BankTxnForFactoringMatch, "amount_cents" | "transaction_date">, batch: Pick<FactoringBatchForMatch, "expected_advance_cents" | "submitted_at">): number {
  const expectedAdvance = Math.abs(toNumber(batch.expected_advance_cents));
  const txnAmount = Math.abs(toNumber(bankTxn.amount_cents));
  if (expectedAdvance <= 0) return 0;
  if (!batch.submitted_at) return 0;

  const amountDeltaPct = Math.abs(txnAmount - expectedAdvance) / expectedAdvance;
  if (amountDeltaPct > 0.005) return 0;

  const dateDistanceDays = daysBetweenInclusive(bankTxn.transaction_date, batch.submitted_at);
  if (dateDistanceDays > 14) return 0;

  const amountScore = Math.max(0, 1 - amountDeltaPct / 0.005);
  const dateScore = Math.max(0, 1 - dateDistanceDays / 14);
  const confidence = amountScore * 0.8 + dateScore * 0.2;
  return Number(confidence.toFixed(2));
}

export async function matchBankTxnToFactoringBatch(
  bankTxn: BankTxnForFactoringMatch,
  tenantId: string,
  deps: { client: Queryable }
) {
  const batchRes = await deps.client.query<Record<string, unknown>>(
    `
      SELECT
        b.id::text,
        b.batch_number,
        b.status,
        b.expected_advance_cents::bigint,
        b.submitted_at::text
      FROM factoring.batch b
      WHERE b.tenant_id = $1::uuid
        AND b.status IN ('submitted', 'funded')
        AND b.submitted_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM factoring.bank_match_suggestion s
          WHERE s.batch_id = b.id
            AND s.applied_at IS NOT NULL
        )
      ORDER BY b.submitted_at DESC
      LIMIT 300
    `,
    [tenantId]
  );

  const scored = batchRes.rows
    .map((row) => ({
      batch_id: String(row.id),
      confidence: scoreMatch(bankTxn, {
        expected_advance_cents: toNumber(row.expected_advance_cents),
        submitted_at: row.submitted_at ? String(row.submitted_at) : null,
      }),
    }))
    .filter((row) => row.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  await deps.client.query(
    `
      DELETE FROM factoring.bank_match_suggestion
      WHERE tenant_id = $1::uuid
        AND bank_txn_id = $2::uuid
        AND applied_at IS NULL
    `,
    [tenantId, bankTxn.id]
  );

  for (const row of scored) {
    await deps.client.query(
      `
        INSERT INTO factoring.bank_match_suggestion (
          tenant_id,
          bank_txn_id,
          batch_id,
          confidence,
          created_at,
          applied_at
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::numeric, now(), NULL)
      `,
      [tenantId, bankTxn.id, row.batch_id, row.confidence]
    );
  }
}

export async function getSuggestionsForTxn(
  bankTxnId: string,
  tenantId: string,
  deps: { client: Queryable }
): Promise<FactoringBankMatchSuggestion[]> {
  const txnRes = await deps.client.query<Record<string, unknown>>(
    `
      SELECT
        id::text,
        amount_cents::bigint,
        transaction_date::text
      FROM banking.bank_transactions
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [bankTxnId, tenantId]
  );
  const txn = txnRes.rows[0];
  if (!txn) throw new FactoringBankMatchError("bank_txn_not_found", 404);

  await matchBankTxnToFactoringBatch(
    {
      id: String(txn.id),
      amount_cents: toNumber(txn.amount_cents),
      transaction_date: String(txn.transaction_date),
    },
    tenantId,
    deps
  );

  const suggestionRes = await deps.client.query<Record<string, unknown>>(
    `
      SELECT
        s.id::text,
        s.bank_txn_id::text,
        s.batch_id::text,
        b.batch_number,
        b.status,
        b.expected_advance_cents::bigint,
        b.submitted_at::text,
        s.confidence::numeric::float8 AS confidence,
        s.created_at::text,
        s.applied_at::text
      FROM factoring.bank_match_suggestion s
      JOIN factoring.batch b ON b.id = s.batch_id
      WHERE s.tenant_id = $1::uuid
        AND s.bank_txn_id = $2::uuid
        AND s.applied_at IS NULL
      ORDER BY s.confidence DESC, s.created_at DESC
      LIMIT 5
    `,
    [tenantId, bankTxnId]
  );

  return suggestionRes.rows.map((row) => ({
    id: String(row.id),
    bank_txn_id: String(row.bank_txn_id),
    batch_id: String(row.batch_id),
    batch_number: String(row.batch_number),
    status: String(row.status) as "submitted" | "funded",
    expected_advance_cents: toNumber(row.expected_advance_cents),
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
    confidence: Number(toNumber(row.confidence).toFixed(2)),
    created_at: String(row.created_at),
    applied_at: row.applied_at ? String(row.applied_at) : null,
  }));
}

export async function applyMatch(suggestionId: string, tenantId: string, deps: { client: Queryable }) {
  const existing = await deps.client.query<Record<string, unknown>>(
    `
      SELECT id::text, batch_id::text, bank_txn_id::text, applied_at::text
      FROM factoring.bank_match_suggestion
      WHERE id = $1::uuid
        AND tenant_id = $2::uuid
      LIMIT 1
    `,
    [suggestionId, tenantId]
  );
  const row = existing.rows[0];
  if (!row) throw new FactoringBankMatchError("suggestion_not_found", 404);
  if (row.applied_at) throw new FactoringBankMatchError("suggestion_already_applied", 409);

  const batchLocked = await deps.client.query<Record<string, unknown>>(
    `
      SELECT 1
      FROM factoring.bank_match_suggestion
      WHERE batch_id = $1::uuid
        AND tenant_id = $2::uuid
        AND applied_at IS NOT NULL
      LIMIT 1
    `,
    [String(row.batch_id), tenantId]
  );
  if (batchLocked.rows[0]) throw new FactoringBankMatchError("batch_already_matched", 409);

  const appliedRes = await deps.client.query<Record<string, unknown>>(
    `
      UPDATE factoring.bank_match_suggestion
      SET applied_at = now()
      WHERE id = $1::uuid
        AND tenant_id = $2::uuid
        AND applied_at IS NULL
      RETURNING id::text, bank_txn_id::text, batch_id::text, applied_at::text
    `,
    [suggestionId, tenantId]
  );
  const applied = appliedRes.rows[0];
  if (!applied) throw new FactoringBankMatchError("suggestion_already_applied", 409);

  await deps.client.query(
    `
      UPDATE banking.bank_transactions
      SET reconciled_obligation_type = 'factoring_batch',
          reconciled_obligation_id = $2::uuid,
          updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $3::uuid
    `,
    [String(applied.bank_txn_id), String(applied.batch_id), tenantId]
  );

  return {
    id: String(applied.id),
    bank_txn_id: String(applied.bank_txn_id),
    batch_id: String(applied.batch_id),
    applied_at: String(applied.applied_at),
  };
}
