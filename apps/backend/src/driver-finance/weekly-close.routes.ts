import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { listDriverBillsForSettlementPeriod, aggregateSettlementTotals } from "./settlements.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { recordPostingFlagSkip } from "../accounting/posting-flag-skip-audit.js";
import { applyPendingDeductionsToSettlementWithNetFloor } from "./settlement-deduction-cap.service.js";
import { applyAutoDeductionsToSettlement } from "../settlements/auto-deductions/apply.js";
import { computeSettlementContractTerms, SETTLEMENT_CONTRACT_TERMS_FLAG } from "./settlement-contract-terms.service.js";
import { SETTLEMENT_DEDUCTION_APPLY_FLAG } from "./settlements-load-bookended.service.js";

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

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

/**
 * REPAIR-A root cause: this draft-builder previously hardcoded deductions_total: 0,
 * reimbursements_total: 0, net_pay: grossPay with NO flag check and NO call to the canonical
 * deduction applier — a "pays gross" landmine the day a FE caller wires this route. Fixed by
 * reusing the SAME canonical helpers the load-bookended close already uses
 * (settlements-load-bookended.service.ts), in the SAME order:
 *   1) computeSettlementContractTerms (hire-contract MPG/referral/fines/reimbursements)
 *   2) applyAutoDeductionsToSettlement (materialize policy tranches into the sub-ledger)
 *   3) applyPendingDeductionsToSettlementWithNetFloor (net-floor, pay-first)
 *   4) aggregateSettlementTotals (derive gross/deductions/reimbursements/net FROM LINES)
 * Each step is flag-gated via canonical isEnabled; OFF records recordPostingFlagSkip
 * (verify-no-silent-noop-posting). NO new GL math — reuse only.
 */
export async function buildWeeklyCloseDraftForDriver(
  client: DbClient,
  opts: {
    operatingCompanyId: string;
    driverId: string;
    weekStart: string;
    weekEnd: string;
    actorUserId: string;
  }
): Promise<{ driverId: string; draftSettlementId: string } | null> {
  const bills = await listDriverBillsForSettlementPeriod(client, {
    operatingCompanyId: opts.operatingCompanyId,
    driverId: opts.driverId,
    periodStart: opts.weekStart,
    periodEnd: opts.weekEnd,
  });

  const displayRes = await client.query<{ next_id?: string }>(
    `SELECT driver_finance.next_settlement_display_id($1::uuid, $2::date) AS next_id`,
    [opts.operatingCompanyId, opts.weekStart]
  );
  const displayId = displayRes.rows[0]?.next_id ?? `S-${new Date(opts.weekStart).getUTCFullYear()}-0001`;

  // Insert with all-zero totals (mirrors the load-bookended INSERT). Real totals are computed
  // below by aggregateSettlementTotals, once every settlement_lines row exists — never composed
  // here from a locally-tracked grossPay variable.
  const settlementRes = await client.query<{ id?: string }>(
    `
      INSERT INTO driver_finance.driver_settlements (
        operating_company_id, display_id, driver_id, period_start, period_end, status,
        gross_pay, deductions_total, reimbursements_total, net_pay
      )
      VALUES ($1,$2,$3,$4,$5,'presettle',0,0,0,0)
      RETURNING id::text AS id
    `,
    [opts.operatingCompanyId, displayId, opts.driverId, opts.weekStart, opts.weekEnd]
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

  // ── Hire-contract terms (OFF-flag-gated) — parity with load-bookended close ─────────────────────
  // Without this, weekly-close never materializes reimbursements / MPG / referral / fine lines even
  // when SETTLEMENT_CONTRACT_TERMS_ENABLED is ON — software ignores the signed-hire money path.
  const contractTermsEnabled = await isEnabled(client, SETTLEMENT_CONTRACT_TERMS_FLAG, {
    operating_company_id: opts.operatingCompanyId,
  });
  if (contractTermsEnabled) {
    await computeSettlementContractTerms(client, {
      settlementId,
      driverId: opts.driverId,
      operatingCompanyId: opts.operatingCompanyId,
      actorUserId: opts.actorUserId,
    });
  } else {
    await recordPostingFlagSkip(client, opts.actorUserId, {
      flagKey: SETTLEMENT_CONTRACT_TERMS_FLAG,
      postingDomain: "driver_finance.settlement_contract_terms",
      operatingCompanyId: opts.operatingCompanyId,
      context: { settlement_id: settlementId, driver_id: opts.driverId, week_start: opts.weekStart, week_end: opts.weekEnd },
    });
  }

  // ── Deduction applier (OFF-flag-gated, canonical reuse — see settlements-load-bookended.service.ts) ──
  const deductionApplyEnabled = await isEnabled(client, SETTLEMENT_DEDUCTION_APPLY_FLAG, {
    operating_company_id: opts.operatingCompanyId,
  });
  if (deductionApplyEnabled) {
    const autoMaterialized = await applyAutoDeductionsToSettlement(client, {
      settlementId,
      driverId: opts.driverId,
      operatingCompanyId: opts.operatingCompanyId,
      actorUserId: opts.actorUserId,
    });

    const applied = await applyPendingDeductionsToSettlementWithNetFloor(client, {
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
        settlement_id: settlementId,
        driver_id: opts.driverId,
        operating_company_id: opts.operatingCompanyId,
        week_start: opts.weekStart,
        week_end: opts.weekEnd,
        applied_count: applied.appliedCount,
        applied_cents: applied.appliedCents,
        deferred_count: applied.deferredCount,
        deferred_cents: applied.deferredCents,
        gross_cents: applied.grossCents,
        floor_cents: applied.floorCents,
        available_cents: applied.availableCents,
        auto_materialized_count: autoMaterialized.materialized.length,
        auto_materialized_cents: autoMaterialized.total_materialized_cents,
        auto_materializer_schema_ready: autoMaterialized.schema_ready,
      },
      "info",
      "REPAIR-A-DEDUCTION-APPLY"
    );
  } else {
    // Flag OFF: pending deductions are NOT applied — never a silent no-op (verify-no-silent-noop-posting).
    await recordPostingFlagSkip(client, opts.actorUserId, {
      flagKey: SETTLEMENT_DEDUCTION_APPLY_FLAG,
      postingDomain: "driver_finance.settlement_deductions",
      operatingCompanyId: opts.operatingCompanyId,
      context: { settlement_id: settlementId, driver_id: opts.driverId, week_start: opts.weekStart, week_end: opts.weekEnd },
    });
  }

  // Recompute gross/deductions/reimbursements/net from the settlement_lines rows that now exist —
  // the ONLY place these four numbers are written for this settlement (no hardcoded literal here).
  await aggregateSettlementTotals(client, settlementId);

  await appendCrudAudit(client, opts.actorUserId, "driver_finance.settlement.weekly_close_draft", {
    operating_company_id: opts.operatingCompanyId,
    driver_id: opts.driverId,
    settlement_id: settlementId,
    week_start: opts.weekStart,
    week_end: opts.weekEnd,
    contract_terms_applied: contractTermsEnabled,
    deductions_applied: deductionApplyEnabled,
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
        const driverId = String(row.id);
        const draft = await buildWeeklyCloseDraftForDriver(client, {
          operatingCompanyId: parsed.data.operating_company_id,
          driverId,
          weekStart,
          weekEnd,
          actorUserId: user.uuid,
        });
        if (draft) results.push(draft);
      }

      return { rows: results };
    });

    if ("unavailable" in created) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    return reply.code(201).send(created.rows);
  });
}
