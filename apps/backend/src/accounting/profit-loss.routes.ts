import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { DEFAULT_BASIS } from "./cash-basis/engine.js";
import { CashBasisSnapshotMissingError, resolveCashBasisRead } from "./cash-basis/read-policy.service.js";
import { transformProfitLossToCashBasis } from "./cash-basis/report-transforms.js";
import { findClosedPeriodForDate, readPeriodCashBasisSnapshot } from "./cash-basis/snapshot.service.js";
import { getProfitLossReport } from "./profit-loss.service.js";

const profitLossQuerySchema = companyQuerySchema.extend({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  basis: z.enum(["accrual", "cash"]).optional(),
});

function canAccessProfitLoss(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function registerProfitLossRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/profit-loss", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessProfitLoss(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = profitLossQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const basis = query.data.basis ?? DEFAULT_BASIS;
    const anchorDate = query.data.to_date ?? query.data.from_date ?? todayIsoDate();

    if (basis === "cash") {
      const snapshotResult = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const closedPeriodId = await findClosedPeriodForDate(client, {
          operatingCompanyId: query.data.operating_company_id,
          anchorDate,
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
          reportKey: "profit_loss",
          computeLiveCash: async () => {
            const accrualReport = await getProfitLossReport({
              userId: user.uuid,
              operating_company_id: query.data.operating_company_id,
              from_date: query.data.from_date,
              to_date: query.data.to_date,
            });
            return transformProfitLossToCashBasis(accrualReport, anchorDate);
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

    const report = await getProfitLossReport({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      from_date: query.data.from_date,
      to_date: query.data.to_date,
    });

    return reply.code(200).send({ ...report, basis });
  });
}
