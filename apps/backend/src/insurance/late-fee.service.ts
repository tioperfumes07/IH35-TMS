import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
// INS-MONEY-F6965 — companyBusinessDate(), not new Date().toISOString() (UTC): this "today" gates
// the due_date < today late-fee cutoff, so a UTC calendar date after ~19:00 Central can assess a
// fee one business day early relative to the real due date.
import { companyBusinessDate } from "../lib/company-business-date.js";

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

/**
 * ACCT-F5628 — applyLateFee() above is a complete, correct, per-row money function: it is the ONLY
 * code in the backend that ever writes insurance.payment_schedule.late_fee_cents or sets
 * status='late_fee_applied'. It was never called from anywhere — no route, no cron — so a policy
 * configured with a real late_fee_pct that goes past due silently never accrues the fee, and the
 * "Overdue" filter on the Payment Schedule tab always returns zero rows regardless of real overdue
 * installments. This sweep finds every past-due, not-yet-terminal schedule row for a tenant and
 * applies the existing function to each — no new GL math, reuses the exact existing poster.
 */
export async function applyOverdueLateFeesForTenant(tenantId: string, today: string) {
  const result = { scanned: 0, applied: 0 };

  const candidates = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [tenantId]);
    const rows = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM insurance.payment_schedule
        WHERE tenant_id = $1::uuid
          AND due_date < $2::date
          AND status NOT IN ('paid', 'late_fee_applied')
      `,
      [tenantId, today]
    );
    return rows.rows;
  });

  result.scanned = candidates.length;
  for (const row of candidates) {
    const applied = await applyLateFee(row.id, today);
    if (applied) result.applied += 1;
  }

  return result;
}

let lateFeeCronInitialized = false;

export function initializeInsuranceLateFeeCron(app: FastifyInstance) {
  if (lateFeeCronInitialized) return;
  lateFeeCronInitialized = true;

  // Runs after the 08:00 reminder cron (payment-reminder.service.ts), same timezone/company-sweep
  // pattern, so a schedule row is always reminded before it can ever be fee-assessed on the same day.
  cron.schedule(
    "0 9 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "insurance.late_fee_cron",
        async () => {
          await withLuciaBypass(async (client) => {
            const companies = await client.query<{ id: string }>(
              `
                SELECT id::text AS id
                FROM org.companies
                WHERE is_active = true
                  AND deactivated_at IS NULL
                ORDER BY id
              `
            );
            const today = companyBusinessDate();
            for (const company of companies.rows) {
              assertTenantContext(company.id, "insurance.late_fee_cron");
              await applyOverdueLateFeesForTenant(company.id, today);
            }
          });
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Insurance late fee cron scheduled (daily 09:00 America/Chicago)");
}
