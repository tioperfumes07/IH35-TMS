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

export type FactorReserveBalanceRow = {
  tenant_id: string;
  factor_id: string;
  balance_cents: number;
  last_movement_at: string | null;
  movement_count: number;
};

export type ReserveBalanceHistoryEntry = ReserveMovementRow & {
  signed_amount_cents: number;
  running_balance_cents: number;
};

export type ReserveBalanceHistoryPage = {
  movements: ReserveBalanceHistoryEntry[];
  total: number;
  limit: number;
  offset: number;
};

export type ReserveReleaseForecastPoint = {
  release_date: string;
  projected_release_cents: number;
  source_movement_count: number;
};

export type ReserveReleaseForecast = {
  factor_id: string;
  as_of: string;
  hold_period_days: number;
  lookahead_days: number;
  starting_balance_cents: number;
  total_projected_release_cents: number;
  schedule: ReserveReleaseForecastPoint[];
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

function mapFactorReserveBalanceRow(row: Record<string, unknown>): FactorReserveBalanceRow {
  return {
    tenant_id: String(row.tenant_id),
    factor_id: String(row.factor_id),
    balance_cents: toNumber(row.balance_cents),
    last_movement_at: row.last_movement_at ? String(row.last_movement_at) : null,
    movement_count: toNumber(row.movement_count),
  };
}

function toSignedAmount(direction: ReserveMovementDirection, amount: number) {
  return direction === "credit" ? amount : amount * -1;
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

export async function getFactorReserveBalances(
  tenantId: string,
  deps: { client: Queryable }
): Promise<FactorReserveBalanceRow[]> {
  const result = await deps.client.query<Record<string, unknown>>(
    `
      SELECT tenant_id, factor_id, balance_cents, last_movement_at, movement_count
      FROM factoring.v_factor_reserve_balance
      WHERE tenant_id = $1::uuid
      ORDER BY balance_cents DESC, last_movement_at DESC NULLS LAST, factor_id ASC
    `,
    [tenantId]
  );

  return result.rows.map(mapFactorReserveBalanceRow);
}

export async function getReserveBalanceHistory(
  tenantId: string,
  factorId: string,
  fromDate: string | undefined,
  toDate: string | undefined,
  deps: { client: Queryable; limit?: number; offset?: number }
): Promise<ReserveBalanceHistoryPage> {
  const limit = Math.min(250, Math.max(1, Math.floor(deps.limit ?? 50)));
  const offset = Math.max(0, Math.floor(deps.offset ?? 0));
  const values: unknown[] = [tenantId, factorId];

  const conditions = ["tenant_id = $1::uuid", "factor_id = $2::uuid"];
  if (fromDate) {
    values.push(fromDate);
    conditions.push(`created_at >= $${values.length}::timestamptz`);
  }
  if (toDate) {
    values.push(toDate);
    conditions.push(`created_at <= $${values.length}::timestamptz`);
  }

  const whereSql = conditions.join(" AND ");
  const listValues = [...values, limit, offset];
  const list = await deps.client.query<Record<string, unknown>>(
    `
      WITH filtered AS (
        SELECT
          id,
          tenant_id,
          batch_id,
          factor_id,
          direction,
          amount_cents,
          reason,
          created_at,
          CASE WHEN direction = 'credit' THEN amount_cents ELSE amount_cents * -1 END AS signed_amount_cents,
          SUM(CASE WHEN direction = 'credit' THEN amount_cents ELSE amount_cents * -1 END)
            OVER (ORDER BY created_at ASC, id ASC) AS running_balance_cents
        FROM factoring.reserve_movement
        WHERE ${whereSql}
      )
      SELECT *
      FROM filtered
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length + 1}::int
      OFFSET $${values.length + 2}::int
    `,
    listValues
  );

  const totalRes = await deps.client.query<Record<string, unknown>>(
    `
      SELECT COUNT(*)::bigint AS total
      FROM factoring.reserve_movement
      WHERE ${whereSql}
    `,
    values
  );

  const movements = list.rows.map((row) => {
    const movement = mapReserveMovementRow(row);
    const signed = toSignedAmount(movement.direction, movement.amount_cents);
    return {
      ...movement,
      signed_amount_cents: Number(row.signed_amount_cents ?? signed),
      running_balance_cents: toNumber(row.running_balance_cents),
    };
  });

  return {
    movements,
    total: toNumber(totalRes.rows[0]?.total),
    limit,
    offset,
  };
}

const DEFAULT_RESERVE_HOLD_DAYS = 60;

export async function forecastReserveReleases(
  tenantId: string,
  factorId: string,
  lookaheadDays: number | undefined,
  deps: { client: Queryable }
): Promise<ReserveReleaseForecast> {
  const normalizedLookahead = Math.min(365, Math.max(1, Math.floor(lookaheadDays ?? 30)));

  const scheduleRes = await deps.client.query<Record<string, unknown>>(
    `
      WITH credits AS (
        SELECT
          created_at,
          amount_cents,
          created_at + make_interval(days => $3::int) AS release_at
        FROM factoring.reserve_movement
        WHERE tenant_id = $1::uuid
          AND factor_id = $2::uuid
          AND direction = 'credit'
      )
      SELECT
        release_at::date::text AS release_date,
        SUM(amount_cents)::bigint AS projected_release_cents,
        COUNT(*)::bigint AS source_movement_count
      FROM credits
      WHERE release_at >= now()
        AND release_at < now() + make_interval(days => $4::int)
      GROUP BY release_at::date
      ORDER BY release_at::date ASC
    `,
    [tenantId, factorId, DEFAULT_RESERVE_HOLD_DAYS, normalizedLookahead]
  );

  const balanceRes = await deps.client.query<Record<string, unknown>>(
    `
      SELECT COALESCE(balance_cents, 0)::bigint AS balance_cents
      FROM factoring.v_factor_reserve_balance
      WHERE tenant_id = $1::uuid
        AND factor_id = $2::uuid
      LIMIT 1
    `,
    [tenantId, factorId]
  );

  const schedule = scheduleRes.rows.map((row) => ({
    release_date: String(row.release_date),
    projected_release_cents: toNumber(row.projected_release_cents),
    source_movement_count: toNumber(row.source_movement_count),
  }));

  const totalProjected = schedule.reduce((sum, row) => sum + row.projected_release_cents, 0);
  return {
    factor_id: factorId,
    as_of: new Date().toISOString(),
    hold_period_days: DEFAULT_RESERVE_HOLD_DAYS,
    lookahead_days: normalizedLookahead,
    starting_balance_cents: toNumber(balanceRes.rows[0]?.balance_cents),
    total_projected_release_cents: totalProjected,
    schedule,
  };
}
