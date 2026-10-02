import { activeFactorId, factoringBookReserveCents, factoringReservePostings } from "./factoring-kpi.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
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
        -- LV-TXN-016: prod RLS on this table gates WITH CHECK on operating_company_id, and the
        -- column is NULLABLE, so omitting it leaves NULL, the check yields NULL, and the write
        -- aborts 42501. tenant_id and operating_company_id are the same company id here
        -- (tenant_id REFERENCES org.companies(id)), so both are written from the same value.
      INSERT INTO factoring.reserve_movement (
        tenant_id,
        operating_company_id,
        batch_id,
        factor_id,
        direction,
        amount_cents,
        reason
      )
      VALUES (
        $1::uuid,
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

// OWNER LAW 2026-10-02 competing-engine audit — every reserve READER below reads the factoring KPI engine (the GL balances of
// the Faro Escrow Reserve + Faro Cash Reserve role accounts), the same figure Factoring, Banking and Reports show. The
// factoring.reserve_movement ledger these used to read has no live writer (the Faro CSV commit is retired) and is never
// read again. Shapes are unchanged so ReserveDashboard / ReserveTracker / FactorAdmin need no change.
type EngineClient = Parameters<typeof factoringReservePostings>[0];

export async function getFactorReserveBalances(
  tenantId: string,
  deps: { client: Queryable }
): Promise<FactorReserveBalanceRow[]> {
  const client = deps.client as unknown as EngineClient;
  const factorId = await activeFactorId(client, tenantId);
  if (!factorId) return [];
  const book = await factoringBookReserveCents(client, tenantId, companyBusinessDate());
  const postings = await factoringReservePostings(client, tenantId);
  return [{
    tenant_id: tenantId,
    factor_id: factorId,
    balance_cents: book.total,
    last_movement_at: postings.length ? postings[postings.length - 1]!.entry_date : null,
    movement_count: postings.length,
  }];
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
  const client = deps.client as unknown as EngineClient;
  if ((await activeFactorId(client, tenantId)) !== factorId) return { movements: [], total: 0, limit, offset };
  let running = 0;
  const all = (await factoringReservePostings(client, tenantId)).map((p) => {
    running += p.signed_cents;
    return {
      id: p.id,
      tenant_id: tenantId,
      batch_id: null,
      factor_id: factorId,
      // "credit" = added to the reserve (a GL debit on the asset), "debit" = taken out — the screen's existing meaning.
      direction: (p.signed_cents >= 0 ? "credit" : "debit") as ReserveMovementDirection,
      amount_cents: Math.abs(p.signed_cents),
      reason: `${p.pool === "escrow" ? "Escrow" : "Cash reserve"} · ${p.memo ?? "journal entry"}`,
      created_at: p.entry_date,
      signed_amount_cents: p.signed_cents,
      running_balance_cents: running,
    };
  });
  const inRange = all.filter((m) => (!fromDate || m.created_at >= fromDate.slice(0, 10)) && (!toDate || m.created_at <= toDate.slice(0, 10)));
  const newestFirst = inRange.reverse();
  return { movements: newestFirst.slice(offset, offset + limit), total: newestFirst.length, limit, offset };
}

const DEFAULT_RESERVE_HOLD_DAYS = 60;

export async function forecastReserveReleases(
  tenantId: string,
  factorId: string,
  lookaheadDays: number | undefined,
  deps: { client: Queryable }
): Promise<ReserveReleaseForecast> {
  const normalizedLookahead = Math.min(365, Math.max(1, Math.floor(lookaheadDays ?? 30)));
  const client = deps.client as unknown as EngineClient;
  const isActive = (await activeFactorId(client, tenantId)) === factorId;
  const postings = isActive ? await factoringReservePostings(client, tenantId) : [];
  const now = Date.now();
  const horizon = now + normalizedLookahead * 86_400_000;
  const byDay = new Map<string, { cents: number; n: number }>();
  for (const p of postings) {
    if (p.signed_cents <= 0) continue;
    const release = new Date(`${p.entry_date}T00:00:00Z`).getTime() + DEFAULT_RESERVE_HOLD_DAYS * 86_400_000;
    if (release < now || release >= horizon) continue;
    const day = new Date(release).toISOString().slice(0, 10);
    const cur = byDay.get(day) ?? { cents: 0, n: 0 };
    byDay.set(day, { cents: cur.cents + p.signed_cents, n: cur.n + 1 });
  }
  const schedule = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([release_date, v]) => ({
    release_date,
    projected_release_cents: v.cents,
    source_movement_count: v.n,
  }));
  const book = isActive ? await factoringBookReserveCents(client, tenantId, companyBusinessDate()) : { total: 0 };
  return {
    factor_id: factorId,
    as_of: new Date().toISOString(),
    hold_period_days: DEFAULT_RESERVE_HOLD_DAYS,
    lookahead_days: normalizedLookahead,
    starting_balance_cents: book.total,
    total_projected_release_cents: schedule.reduce((sum, row) => sum + row.projected_release_cents, 0),
    schedule,
  };
}
