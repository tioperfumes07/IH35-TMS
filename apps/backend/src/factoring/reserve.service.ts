export type ReserveMovementDirection = "credit" | "debit";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number(value ?? 0);
}

export type ReserveMovementRow = {
  id: string;
  tenant_id: string;
  batch_id: string | null;
  factor_id: string | null;
  direction: ReserveMovementDirection;
  amount_cents: number;
  reason: string;
  created_at: string;
};

export class ReserveMovementError extends Error {
  constructor(
    readonly code: "invalid_direction" | "invalid_amount",
    readonly statusCode: number
  ) {
    super(code);
  }
}

function mapReserveMovementRow(row: Record<string, unknown>): ReserveMovementRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    batch_id: row.batch_id ? String(row.batch_id) : null,
    factor_id: row.factor_id ? String(row.factor_id) : null,
    direction: String(row.direction) as ReserveMovementDirection,
    amount_cents: toNumber(row.amount_cents),
    reason: String(row.reason ?? ""),
    created_at: String(row.created_at),
  };
}

export function calculateBatchOverage(batchActualFunded: number, batchExpectedAdvance: number): number {
  const funded = Math.max(0, toNumber(batchActualFunded));
  const expected = Math.max(0, toNumber(batchExpectedAdvance));
  return Math.max(0, funded - expected);
}

export async function postReserveMovement(
  batchId: string | null,
  tenantId: string,
  direction: ReserveMovementDirection,
  amountCents: number,
  reason: string,
  deps: { client: Queryable; factorId?: string | null }
): Promise<ReserveMovementRow> {
  if (direction !== "credit" && direction !== "debit") {
    throw new ReserveMovementError("invalid_direction", 400);
  }
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    throw new ReserveMovementError("invalid_amount", 400);
  }
  const inserted = await deps.client.query<Record<string, unknown>>(
    `
      INSERT INTO factoring.reserve_movement (
        tenant_id,
        batch_id,
        factor_id,
        direction,
        amount_cents,
        reason
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::text,
        $5::bigint,
        $6::text
      )
      RETURNING *
    `,
    [tenantId, batchId, deps.factorId ?? null, direction, Math.round(amountCents), reason]
  );
  return mapReserveMovementRow(inserted.rows[0] ?? {});
}

export async function autoPostOverageOnSettle(
  batchId: string,
  actualFundedCents: number,
  tenantId: string,
  deps: { client: Queryable }
): Promise<{ overage_cents: number; posted: boolean; movement: ReserveMovementRow | null }> {
  const batchRes = await deps.client.query<Record<string, unknown>>(
    `
      SELECT id::text, tenant_id::text, expected_advance_cents::bigint, factor_id::text
      FROM factoring.batch
      WHERE id = $1::uuid
        AND tenant_id = $2::uuid
      LIMIT 1
    `,
    [batchId, tenantId]
  );

  const batch = batchRes.rows[0];
  if (!batch) return { overage_cents: 0, posted: false, movement: null };

  const overageCents = calculateBatchOverage(actualFundedCents, toNumber(batch.expected_advance_cents));
  if (overageCents <= 0) return { overage_cents: 0, posted: false, movement: null };

  const movement = await postReserveMovement(
    batchId,
    tenantId,
    "credit",
    overageCents,
    "batch_settlement_overage",
    { client: deps.client, factorId: batch.factor_id ? String(batch.factor_id) : null }
  );
  return { overage_cents: overageCents, posted: true, movement };
}

export async function listReserveMovementsForBatch(
  batchId: string,
  tenantId: string,
  deps: { client: Queryable }
): Promise<ReserveMovementRow[]> {
  const result = await deps.client.query<Record<string, unknown>>(
    `
      SELECT *
      FROM factoring.reserve_movement
      WHERE batch_id = $1::uuid
        AND tenant_id = $2::uuid
      ORDER BY created_at ASC, id ASC
    `,
    [batchId, tenantId]
  );
  return result.rows.map(mapReserveMovementRow);
}
