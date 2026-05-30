import { withLuciaBypass } from "../auth/db.js";

export function calculateLateFee(amountCents: number | bigint, lateFeePct: number): bigint {
  const amount = typeof amountCents === "bigint" ? amountCents : BigInt(Math.max(0, amountCents));
  const pct = Number.isFinite(lateFeePct) ? Math.max(0, lateFeePct) : 0;
  const computed = Math.round(Number(amount) * (pct / 100));
  return BigInt(Math.max(0, computed));
}

export async function applyLateFee(scheduleId: string, today: string) {
  return withLuciaBypass(async (client) => {
    const updated = await client.query<{
      id: string;
      late_fee_cents: string;
      status: string;
    }>(
      `
        WITH candidate AS (
          SELECT
            ps.id,
            ps.tenant_id,
            ps.amount_cents,
            p.late_fee_pct
          FROM insurance.payment_schedule ps
          JOIN insurance.policy p
            ON p.id = ps.policy_id
           AND p.tenant_id = ps.tenant_id
          WHERE ps.id = $1::uuid
            AND ps.due_date < $2::date
            AND ps.status NOT IN ('paid', 'late_fee_applied')
          FOR UPDATE
        )
        UPDATE insurance.payment_schedule ps
        SET status = 'late_fee_applied',
            late_fee_cents = GREATEST(
              0,
              ROUND((candidate.amount_cents::numeric * candidate.late_fee_pct) / 100.0)
            )::bigint,
            updated_at = now()
        FROM candidate
        WHERE ps.id = candidate.id
        RETURNING ps.id::text, ps.late_fee_cents::text, ps.status
      `,
      [scheduleId, today]
    );

    return updated.rows[0] ?? null;
  });
}
