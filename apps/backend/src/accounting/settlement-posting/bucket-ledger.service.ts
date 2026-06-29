// FIN-18 — BUCKETED deduction ledger operations (charge / application / reversal) + read.
// A SEPARATE running balance per (operating_company_id, driver_id, bucket_type), with an append-only
// history row per movement. All operations run on the CALLER's transaction client (atomic with the GL
// post / the recover-from-driver charge). No new GL math — these are running-balance bookkeeping only.

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

const RECURRING_BUCKETS = new Set(["lease", "insurance"]);

export type BucketRow = {
  id: string;
  bucket_type: string;
  is_recurring: boolean;
  charged_to_date_cents: number;
  deducted_to_date_cents: number;
  remaining_balance_cents: number;
  installments_total: number | null;
  installments_applied: number;
  status: string;
};

function mapBucket(row: Record<string, unknown>): BucketRow {
  return {
    id: String(row.id),
    bucket_type: String(row.bucket_type),
    is_recurring: Boolean(row.is_recurring),
    charged_to_date_cents: Number(row.charged_to_date_cents),
    deducted_to_date_cents: Number(row.deducted_to_date_cents),
    remaining_balance_cents: Number(row.remaining_balance_cents),
    installments_total: row.installments_total == null ? null : Number(row.installments_total),
    installments_applied: Number(row.installments_applied),
    status: String(row.status),
  };
}

/** Find or create the bucket for (company, driver, bucket_type); locks the row FOR UPDATE. */
export async function getOrCreateBucket(
  client: DbClient,
  args: { operatingCompanyId: string; driverId: string; bucketType: string; actorUserId: string }
): Promise<BucketRow> {
  const existing = await client.query(
    `SELECT id::text, bucket_type, is_recurring, charged_to_date_cents::bigint, deducted_to_date_cents::bigint,
            remaining_balance_cents::bigint, installments_total, installments_applied, status
       FROM driver_finance.driver_deduction_buckets
      WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid AND bucket_type = $3
      LIMIT 1 FOR UPDATE`,
    [args.operatingCompanyId, args.driverId, args.bucketType]
  );
  if (existing.rows[0]) return mapBucket(existing.rows[0]);

  const created = await client.query(
    `INSERT INTO driver_finance.driver_deduction_buckets
       (operating_company_id, driver_id, bucket_type, is_recurring, created_by_user_id)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid)
     RETURNING id::text, bucket_type, is_recurring, charged_to_date_cents::bigint, deducted_to_date_cents::bigint,
               remaining_balance_cents::bigint, installments_total, installments_applied, status`,
    [args.operatingCompanyId, args.driverId, args.bucketType, RECURRING_BUCKETS.has(args.bucketType), args.actorUserId]
  );
  return mapBucket(created.rows[0]!);
}

async function appendBucketEvent(
  client: DbClient,
  args: {
    operatingCompanyId: string;
    bucketId: string;
    eventType: "charge" | "application" | "reversal" | "adjustment";
    amountCents: number;
    balanceAfterCents: number;
    sourceExpenseId?: string | null;
    settlementId?: string | null;
    deductionId?: string | null;
    reason?: string | null;
    actorUserId: string;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO driver_finance.driver_deduction_bucket_events
       (operating_company_id, bucket_id, event_type, amount_cents, balance_after_cents,
        source_expense_id, settlement_id, deduction_id, reason, actor_user_id)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::uuid)`,
    [
      args.operatingCompanyId,
      args.bucketId,
      args.eventType,
      args.amountCents,
      args.balanceAfterCents,
      args.sourceExpenseId ?? null,
      args.settlementId ?? null,
      args.deductionId ?? null,
      args.reason ?? null,
      args.actorUserId,
    ]
  );
}

/** CHARGE: increase the bucket's obligation (charged + remaining). Used by recover-from-driver. */
export async function chargeBucket(
  client: DbClient,
  args: {
    operatingCompanyId: string;
    bucket: BucketRow;
    amountCents: number;
    sourceExpenseId?: string | null;
    reason?: string | null;
    actorUserId: string;
  }
): Promise<number> {
  const remainingAfter = args.bucket.remaining_balance_cents + args.amountCents;
  await client.query(
    `UPDATE driver_finance.driver_deduction_buckets
        SET charged_to_date_cents = charged_to_date_cents + $2,
            remaining_balance_cents = remaining_balance_cents + $2,
            status = 'active',
            updated_at = now()
      WHERE id = $1::uuid`,
    [args.bucket.id, args.amountCents]
  );
  await appendBucketEvent(client, {
    operatingCompanyId: args.operatingCompanyId,
    bucketId: args.bucket.id,
    eventType: "charge",
    amountCents: args.amountCents,
    balanceAfterCents: remainingAfter,
    sourceExpenseId: args.sourceExpenseId,
    reason: args.reason,
    actorUserId: args.actorUserId,
  });
  return remainingAfter;
}

/** APPLICATION: a settlement deduction draws against the bucket (deducted += amt, remaining -= amt). */
export async function applyDeductionToBucket(
  client: DbClient,
  args: {
    operatingCompanyId: string;
    bucketId: string;
    amountCents: number;
    settlementId: string;
    deductionId: string;
    actorUserId: string;
  }
): Promise<void> {
  const upd = await client.query<{ remaining_balance_cents: number; installments_total: number | null }>(
    `UPDATE driver_finance.driver_deduction_buckets
        SET deducted_to_date_cents = deducted_to_date_cents + $2,
            remaining_balance_cents = GREATEST(remaining_balance_cents - $2, 0),
            installments_applied = installments_applied + 1,
            status = CASE WHEN remaining_balance_cents - $2 <= 0 AND NOT is_recurring THEN 'completed' ELSE status END,
            updated_at = now()
      WHERE id = $1::uuid
      RETURNING remaining_balance_cents::bigint, installments_total`,
    [args.bucketId, args.amountCents]
  );
  const remainingAfter = Number(upd.rows[0]?.remaining_balance_cents ?? 0);
  await appendBucketEvent(client, {
    operatingCompanyId: args.operatingCompanyId,
    bucketId: args.bucketId,
    eventType: "application",
    amountCents: args.amountCents,
    balanceAfterCents: remainingAfter,
    settlementId: args.settlementId,
    deductionId: args.deductionId,
    actorUserId: args.actorUserId,
  });
}

/** REVERSAL: undo an application (void path) — restores the bucket balance. */
export async function reverseDeductionFromBucket(
  client: DbClient,
  args: {
    operatingCompanyId: string;
    bucketId: string;
    amountCents: number;
    settlementId: string;
    deductionId: string;
    actorUserId: string;
    reason?: string | null;
  }
): Promise<void> {
  const upd = await client.query<{ remaining_balance_cents: number }>(
    `UPDATE driver_finance.driver_deduction_buckets
        SET deducted_to_date_cents = GREATEST(deducted_to_date_cents - $2, 0),
            remaining_balance_cents = remaining_balance_cents + $2,
            installments_applied = GREATEST(installments_applied - 1, 0),
            status = 'active',
            updated_at = now()
      WHERE id = $1::uuid
      RETURNING remaining_balance_cents::bigint`,
    [args.bucketId, args.amountCents]
  );
  const remainingAfter = Number(upd.rows[0]?.remaining_balance_cents ?? 0);
  await appendBucketEvent(client, {
    operatingCompanyId: args.operatingCompanyId,
    bucketId: args.bucketId,
    eventType: "reversal",
    amountCents: args.amountCents,
    balanceAfterCents: remainingAfter,
    settlementId: args.settlementId,
    deductionId: args.deductionId,
    reason: args.reason,
    actorUserId: args.actorUserId,
  });
}

/** READ-ONLY: per-bucket balances for a driver (the PWA "Advance balance / Lease N of M" view). */
export async function getDriverBucketBalances(
  client: DbClient,
  args: { operatingCompanyId: string; driverId: string }
): Promise<
  Array<
    BucketRow & {
      installment_label: string | null;
    }
  >
> {
  const res = await client.query(
    `SELECT id::text, bucket_type, is_recurring, charged_to_date_cents::bigint, deducted_to_date_cents::bigint,
            remaining_balance_cents::bigint, installments_total, installments_applied, status
       FROM driver_finance.driver_deduction_buckets
      WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid
      ORDER BY bucket_type ASC`,
    [args.operatingCompanyId, args.driverId]
  );
  return res.rows.map((row) => {
    const b = mapBucket(row);
    const installment_label =
      b.is_recurring && b.installments_total != null ? `payment ${b.installments_applied} of ${b.installments_total}` : null;
    return { ...b, installment_label };
  });
}
