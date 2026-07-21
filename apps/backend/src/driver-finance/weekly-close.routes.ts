import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { listDriverBillsForSettlementPeriod } from "./settlements.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { recordPostingFlagSkip } from "../accounting/posting-flag-skip-audit.js";
import { aggregateSettlementTotals, SETTLEMENT_DEDUCTION_APPLY_FLAG } from "./settlements-load-bookended.service.js";
import { applyPendingDeductionsToSettlementWithNetFloor } from "./settlement-deduction-cap.service.js";
import { computeSettlementReimbursements } from "./settlement-contract-terms.service.js";

const bodySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  operating_company_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return fn(client);
  });
}

async function hasSettlementSchema(client: any) {
  const res = await client.query(`SELECT to_regclass('driver_finance.driver_settlements') IS NOT NULL AS ok`);
  return Boolean(res.rows[0]?.ok);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type WeeklyCloseDbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

/**
 * Draft a single driver's weekly-close settlement — bounded, testable unit extracted from the route
 * handler so it can be exercised with a mocked client (see __tests__/weekly-close-deduction-apply.test.ts),
 * mirroring closeSettlementForFinalLoad's testability in settlements-load-bookended.service.ts.
 *
 * REPAIR-A parity fix (root cause, 2026-07-21): this used to INSERT deductions_total=0 /
 * reimbursements_total=0 / net_pay=grossPay unconditionally — a driver with pending cash-advance/other
 * deductions or owed reimbursements was always paid gross. The canonical load-bookended close never has
 * this gap because it runs the SAME two calls below (computeSettlementReimbursements +
 * applyPendingDeductionsToSettlementWithNetFloor) BEFORE aggregateSettlementTotals recomputes net_pay.
 * Reuse those EXACT helpers here — no new GL/deduction math. Gated behind the SAME per-entity
 * SETTLEMENT_DEDUCTION_APPLY_ENABLED flag the canonical engine uses (confirmed ON for all 3 entities in
 * prod 2026-07-21); OFF => explicit skip-audit (recordPostingFlagSkip) so this is never a silent no-op.
 * Fail-closed: any error here propagates and rolls back the whole withCurrentUser transaction — a
 * weekly-close draft is never left half-computed and no driver is silently paid gross.
 */
export async function closeWeeklySettlementDraftForDriver(
  client: WeeklyCloseDbClient,
  opts: { operatingCompanyId: string; driverId: string; weekStart: string; weekEnd: string; actorUserId: string }
): Promise<{ driverId: string; draftSettlementId: string } | null> {
  const bills = await listDriverBillsForSettlementPeriod(client, {
    operatingCompanyId: opts.operatingCompanyId,
    driverId: opts.driverId,
    periodStart: opts.weekStart,
    periodEnd: opts.weekEnd,
  });

  const grossCents = bills.reduce((sum, b) => sum + Math.max(Number(b.gross_amount_cents ?? 0), 0), 0);
  const grossPay = grossCents / 100;

  const displayRes = await client.query<{ next_id?: string }>(
    `SELECT driver_finance.next_settlement_display_id($1::uuid, $2::date) AS next_id`,
    [opts.operatingCompanyId, opts.weekStart]
  );
  const displayId = displayRes.rows[0]?.next_id ?? `S-${new Date(opts.weekStart).getUTCFullYear()}-0001`;

  const settlementRes = await client.query<{ id?: string }>(
    `
      INSERT INTO driver_finance.driver_settlements (
        operating_company_id, display_id, driver_id, period_start, period_end, status,
        gross_pay, deductions_total, reimbursements_total, net_pay
      )
      VALUES ($1,$2,$3,$4,$5,'presettle',$6,$7,$8,$9)
      RETURNING id::text AS id
    `,
    [opts.operatingCompanyId, displayId, opts.driverId, opts.weekStart, opts.weekEnd, grossPay, 0, 0, grossPay]
  );

  const settlementId = String(settlementRes.rows[0]?.id ?? "");
  if (!settlementId) return null;

  for (const bill of bills) {
    const cents = Number(bill.gross_amount_cents ?? 0) / 100;
    await client.query(
      `
        INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
        VALUES ($1::uuid,'earnings',$2,$3)
      `,
      [settlementId, `Driver bill ${bill.bill_number ?? bill.load_number ?? bill.id}`, cents]
    );
  }

  const deductionApplyEnabled = await isEnabled(client, SETTLEMENT_DEDUCTION_APPLY_FLAG, {
    operating_company_id: opts.operatingCompanyId,
  });

  if (deductionApplyEnabled) {
    const reimbursements = await computeSettlementReimbursements(client, {
      settlementId,
      driverId: opts.driverId,
      operatingCompanyId: opts.operatingCompanyId,
      actorUserId: opts.actorUserId,
    });

    const deductionsApplied = await applyPendingDeductionsToSettlementWithNetFloor(client, {
      settlementId,
      driverId: opts.driverId,
      operatingCompanyId: opts.operatingCompanyId,
      actorUserId: opts.actorUserId,
    });

    await appendCrudAudit(
      client,
      opts.actorUserId,
      "driver_finance.settlement.deductions_applied",
      {
        operating_company_id: opts.operatingCompanyId,
        driver_id: opts.driverId,
        settlement_id: settlementId,
        week_start: opts.weekStart,
        week_end: opts.weekEnd,
        applied_count: deductionsApplied.appliedCount,
        applied_cents: deductionsApplied.appliedCents,
        deferred_count: deductionsApplied.deferredCount,
        deferred_cents: deductionsApplied.deferredCents,
        gross_cents: deductionsApplied.grossCents,
        floor_cents: deductionsApplied.floorCents,
        available_cents: deductionsApplied.availableCents,
        reimbursement_count: reimbursements.appliedCount,
        reimbursement_cents: reimbursements.appliedCents,
      },
      "info",
      "WEEKLY-CLOSE-DEDUCTION-APPLY"
    );
  } else {
    await recordPostingFlagSkip(client, opts.actorUserId, {
      flagKey: SETTLEMENT_DEDUCTION_APPLY_FLAG,
      postingDomain: "driver_finance.settlement_deductions",
      operatingCompanyId: opts.operatingCompanyId,
      context: { settlement_id: settlementId, driver_id: opts.driverId, week_start: opts.weekStart, week_end: opts.weekEnd },
    });
  }

  // Fail-closed recompute: gross/deductions/reimbursements/net are derived from the ACTUAL
  // settlement_lines (earnings + any deduction/reimbursement lines just applied above), never from the
  // INSERT-time placeholder above.
  await aggregateSettlementTotals(client, settlementId);

  await appendCrudAudit(client, opts.actorUserId, "driver_finance.settlement.weekly_close_draft", {
    operating_company_id: opts.operatingCompanyId,
    driver_id: opts.driverId,
    settlement_id: settlementId,
    week_start: opts.weekStart,
    week_end: opts.weekEnd,
  });

  return { driverId: opts.driverId, draftSettlementId: settlementId };
}

export async function registerWeeklyCloseRoutes(app: FastifyInstance) {
  app.post("/api/v1/settlements/weekly-close", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const weekStart = parsed.data.weekStart;
    const weekEnd = addDays(weekStart, 6);

    const created = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      if (!(await hasSettlementSchema(client))) return { unavailable: true as const };

      const driversRes = await client.query(
        `
          SELECT DISTINCT d.id
          FROM mdata.drivers d
          INNER JOIN mdata.driver_company_authorizations a
            ON a.driver_id = d.id
           AND a.company_id = $1::uuid
           AND a.is_authorized = true
           AND a.deactivated_at IS NULL
          WHERE d.status::text IN ('Active','Probation','OnLeave')
        `,
        [parsed.data.operating_company_id]
      );

      const results: Array<{ driverId: string; draftSettlementId: string }> = [];

      for (const row of driversRes.rows) {
        const closed = await closeWeeklySettlementDraftForDriver(client, {
          operatingCompanyId: parsed.data.operating_company_id,
          driverId: String(row.id),
          weekStart,
          weekEnd,
          actorUserId: user.uuid,
        });
        if (closed) results.push(closed);
      }

      return { rows: results };
    });

    if ("unavailable" in created) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    return reply.code(201).send(created.rows);
  });
}
