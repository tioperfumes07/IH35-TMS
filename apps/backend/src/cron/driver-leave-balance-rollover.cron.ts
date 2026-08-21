// P8C-K — Driver Scheduler Jan-1 balance rollover cron (GAP 1b).
// At year start, seeds each enrolled driver's new plan-year row in catalogs.driver_leave_balances per the
// company's catalogs.leave_policies. The rollover rule IS fully specified in the schema:
//   - vacation_allocated = policy.vacation_days_per_year + LEAST(policy.carryover_vacation_days_max,
//                          GREATEST(0, prior.vacation_allocated - prior.vacation_used))   ← carryover
//   - sick_allocated     = policy.sick_days_per_year        (no carryover column ⇒ reset)
//   - personal_allocated = policy.personal_days_per_year    (no carryover column ⇒ reset)
//   - *_used             = 0
// There is NO guessing: carryover is capped by the explicit carryover_vacation_days_max column, and sick /
// personal have no carryover column so they reset. Population = every driver with a prior-year balance row.
//
// Idempotent: INSERT ... ON CONFLICT (operating_company_id, driver_id, plan_year) DO NOTHING — re-running is
// a no-op and never resets a balance that already exists for the target year. Mutates ⇒ emits one summary
// audit event per company. Cross-tenant sweep under withLuciaBypass; per-company id validated before use.
// Default OFF: set DRIVER_LEAVE_BALANCE_ROLLOVER_CRON_ENABLED=true to arm it.
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";

const CRON_NAME = "safety.driver_leave_balance_rollover";

let initialized = false;

/** One tick: roll balances for `targetYear` (default = the year the cron fires in). */
export async function runDriverLeaveBalanceRolloverTick(targetYear = new Date().getUTCFullYear()): Promise<number> {
  const priorYear = targetYear - 1;
  let rolledTotal = 0;

  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
    );

    for (const company of companies.rows) {
      assertTenantContext(String(company.id ?? ""), CRON_NAME);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company.id]);

      // A company with no policy row cannot allocate — skip it (nothing to roll into).
      const policyRes = await client.query<{ ok: boolean }>(
        `SELECT true AS ok FROM catalogs.leave_policies WHERE operating_company_id = $1::uuid LIMIT 1`,
        [company.id]
      );
      if (policyRes.rows.length === 0) continue;

      const ins = await client.query(
        `
          INSERT INTO catalogs.driver_leave_balances (
            operating_company_id, driver_id, plan_year,
            vacation_allocated, vacation_used,
            sick_allocated, sick_used,
            personal_allocated, personal_used
          )
          SELECT
            $1::uuid,
            prev.driver_id,
            $2::int,
            p.vacation_days_per_year
              + LEAST(p.carryover_vacation_days_max, GREATEST(0, prev.vacation_allocated - prev.vacation_used)),
            0,
            p.sick_days_per_year,
            0,
            p.personal_days_per_year,
            0
          FROM catalogs.driver_leave_balances prev
          JOIN catalogs.leave_policies p ON p.operating_company_id = prev.operating_company_id
          WHERE prev.operating_company_id = $1::uuid
            AND prev.plan_year = $3::int
          ON CONFLICT (operating_company_id, driver_id, plan_year) DO NOTHING
        `,
        [company.id, targetYear, priorYear]
      );
      const rolled = ins.rowCount ?? 0;
      if (rolled === 0) continue;
      rolledTotal += rolled;

      // Mutation ⇒ append one summary audit event (company-scoped; leave_request_id null).
      await client.query(
        `
          INSERT INTO safety.driver_leave_audit_log (
            operating_company_id, leave_request_id, event_type, event_payload, actor_name
          ) VALUES ($1, NULL, 'leave_balance_rolled_over', $2::jsonb, 'system:balance-rollover-cron')
        `,
        [
          company.id,
          JSON.stringify({ plan_year: targetYear, prior_year: priorYear, drivers_rolled: rolled }),
        ]
      );
    }
  });

  return rolledTotal;
}

export function initializeDriverLeaveBalanceRolloverCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.DRIVER_LEAVE_BALANCE_ROLLOVER_CRON_ENABLED ?? "false").trim() !== "true") {
    app.log.info(
      "Driver leave balance-rollover cron disabled (set DRIVER_LEAVE_BALANCE_ROLLOVER_CRON_ENABLED=true to enable)"
    );
    return;
  }

  // Jan 1 at 00:30 America/Chicago — after the year rolls over locally.
  cron.schedule(
    "30 0 1 1 *",
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          const rolled = await runDriverLeaveBalanceRolloverTick();
          if (rolled > 0) app.log.info({ rolled }, "driver leave balances rolled over");
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Driver leave balance-rollover cron scheduled (Jan 1 00:30 America/Chicago)");
}
