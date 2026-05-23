import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { getTrialBalanceReport } from "./trial-balance.service.js";
import { DEFAULT_BASIS } from "./cash-basis/engine.js";
import { CashBasisSnapshotMissingError, resolveCashBasisRead } from "./cash-basis/read-policy.service.js";
import { transformTrialBalanceToCashBasis } from "./cash-basis/report-transforms.js";
import { findClosedPeriodForDate, readPeriodCashBasisSnapshot } from "./cash-basis/snapshot.service.js";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";

const trialBalanceQuerySchema = companyQuerySchema.extend({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  basis: z.enum(["accrual", "cash"]).optional(),
});

function canAccessTrialBalance(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function registerTrialBalanceRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/trial-balance", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessTrialBalance(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = trialBalanceQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const basis = query.data.basis ?? DEFAULT_BASIS;
    const anchorDate = query.data.to_date ?? query.data.from_date ?? todayIsoDate();

    if (basis === "cash") {
      const snapshotResult = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const closedPeriodId = await findClosedPeriodForDate(client, {
          operatingCompanyId: query.data.operating_company_id,
          anchorDate: anchorDate,
        });
        const snapshotPayload = closedPeriodId
          ? await readPeriodCashBasisSnapshot(client, {
              operatingCompanyId: query.data.operating_company_id,
              periodId: closedPeriodId,
            })
          : null;
        return { closedPeriodId, snapshotPayload };
      });
      try {
        const resolved = await resolveCashBasisRead({
          basis,
          closedPeriodId: snapshotResult.closedPeriodId,
          snapshotPayload: snapshotResult.snapshotPayload,
          reportKey: "trial_balance",
          computeLiveCash: async () => {
            const roleMatches = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
              return {
                arControlAccountId: await resolveRoleAccountOptional(client, query.data.operating_company_id, "ar_control"),
                apControlAccountId: await resolveRoleAccountOptional(client, query.data.operating_company_id, "ap_control"),
              };
            });
            const accrualReport = await getTrialBalanceReport({
              userId: user.uuid,
              operating_company_id: query.data.operating_company_id,
              from_date: query.data.from_date,
              to_date: query.data.to_date,
            });
            return transformTrialBalanceToCashBasis(accrualReport.rows, accrualReport.summary, anchorDate, roleMatches);
          },
        });
        return reply.code(200).send({ ...(resolved.report as Record<string, unknown>), basis, source: resolved.source });
      } catch (error) {
        if (error instanceof CashBasisSnapshotMissingError) {
          return reply.code(409).send({ error: "cash_basis_snapshot_missing", periodId: error.periodId });
        }
        throw error;
      }
    }

    const report = await getTrialBalanceReport({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      from_date: query.data.from_date,
      to_date: query.data.to_date,
    });

    return reply.code(200).send({ ...report, basis });
  });
}
