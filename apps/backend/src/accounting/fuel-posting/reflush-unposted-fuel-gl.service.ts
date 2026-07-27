/**
 * FUEL-01 — idempotent re-flush of canonical fuel.fuel_transactions that lack a
 * posted accounting.posting_batches row (source_transaction_type = 'fuel_event').
 *
 * Reuses flushFuelGlPostsAfterCommit / maybePostFuelExpenseFromCanonicalTxn /
 * postFuelExpenseFromEvent — NO new GL math. Flag EXPENSE_GL_POSTING_ENABLED must
 * be ON per-entity or every candidate returns skipped_flag_off.
 *
 * Does NOT enable the flag. Does NOT write to QBO.
 */
import { withLuciaBypass } from "../../auth/db.js";
import {
  flushFuelGlPostsAfterCommit,
  type FuelTxnGlPostCandidate,
} from "./maybe-post-from-fuel-transaction.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type UnpostedFuelRow = {
  id: string;
  operating_company_id: string;
  fuel_type: string;
  transaction_at: string;
  total_cost: string | number;
  driver_id: string | null;
  location_state: string | null;
  gallons: string | number | null;
};

export type ReflushFuelGlResult = {
  scanned: number;
  candidates: number;
  attempted: number;
  posted: number;
  skipped_flag_off: number;
  errors: number;
  dry_run: boolean;
  sample_unposted_ids: string[];
};

/**
 * Rows with no posted fuel_event posting_batch. archived_at IS NULL = active.
 * amount uses total_cost (dollars) → cents at flush time.
 */
export async function listUnpostedFuelTransactions(opts?: {
  operating_company_id?: string | null;
  limit?: number | null;
}): Promise<UnpostedFuelRow[]> {
  const limit = opts?.limit && opts.limit > 0 ? Math.min(opts.limit, 50_000) : null;
  return withLuciaBypass(async (client: DbClient) => {
    if (opts?.operating_company_id) {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
        opts.operating_company_id,
      ]);
    }
    const values: unknown[] = [];
    const where = [`ft.archived_at IS NULL`, `pb.id IS NULL`];
    if (opts?.operating_company_id) {
      values.push(opts.operating_company_id);
      where.push(`ft.operating_company_id = $${values.length}::uuid`);
    }
    let limitSql = "";
    if (limit != null) {
      values.push(limit);
      limitSql = `LIMIT $${values.length}`;
    }
    const res = await client.query<UnpostedFuelRow>(
      `
        SELECT
          ft.id::text,
          ft.operating_company_id::text,
          ft.fuel_type::text,
          ft.transaction_at::text,
          ft.total_cost,
          ft.driver_id::text,
          ft.location_state::text,
          ft.gallons
        FROM fuel.fuel_transactions ft
        LEFT JOIN accounting.posting_batches pb
          ON pb.operating_company_id = ft.operating_company_id
         AND pb.source_transaction_type = 'fuel_event'
         AND pb.source_transaction_id = ft.id::text
         AND pb.batch_status = 'posted'
        WHERE ${where.join(" AND ")}
        ORDER BY ft.transaction_at ASC, ft.id ASC
        ${limitSql}
      `,
      values
    );
    return res.rows;
  });
}

function toCandidate(row: UnpostedFuelRow, actorUserId?: string | null): FuelTxnGlPostCandidate | null {
  const dollars = Number(row.total_cost ?? 0);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  const amountCents = Math.round(dollars * 100);
  if (amountCents <= 0) return null;
  return {
    operating_company_id: row.operating_company_id,
    actor_user_id: actorUserId ?? null,
    fuel_transaction_id: row.id,
    fuel_type: row.fuel_type || "other",
    transaction_at: row.transaction_at,
    amount_cents: amountCents,
    driver_id: row.driver_id,
    location_state: row.location_state,
    gallons: row.gallons == null ? null : Number(row.gallons),
    cash_advance: false,
  };
}

/**
 * Dry-run lists unposted count; live path flushes through the shared post-commit entry point.
 */
export async function reflushUnpostedFuelGlExpenses(input: {
  operating_company_id?: string | null;
  actor_user_id?: string | null;
  dry_run?: boolean;
  limit?: number | null;
  log?: { warn?: (obj: unknown, msg?: string) => void; info?: (obj: unknown, msg?: string) => void };
}): Promise<ReflushFuelGlResult> {
  const rows = await listUnpostedFuelTransactions({
    operating_company_id: input.operating_company_id ?? null,
    limit: input.limit ?? null,
  });
  const candidates = rows
    .map((r) => toCandidate(r, input.actor_user_id))
    .filter((c): c is FuelTxnGlPostCandidate => c != null);

  const base: ReflushFuelGlResult = {
    scanned: rows.length,
    candidates: candidates.length,
    attempted: 0,
    posted: 0,
    skipped_flag_off: 0,
    errors: 0,
    dry_run: Boolean(input.dry_run),
    sample_unposted_ids: rows.slice(0, 10).map((r) => r.id),
  };

  if (input.dry_run) return base;

  const stats = await flushFuelGlPostsAfterCommit(candidates, input.log);
  return {
    ...base,
    attempted: stats.attempted,
    posted: stats.posted,
    skipped_flag_off: stats.skipped_flag_off,
    errors: stats.errors,
  };
}
