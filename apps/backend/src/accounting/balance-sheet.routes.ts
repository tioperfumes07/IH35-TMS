import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { getBalanceSheetReport } from "./balance-sheet.service.js";
import { DEFAULT_BASIS } from "./cash-basis/engine.js";
import { CashBasisSnapshotMissingError, resolveCashBasisRead } from "./cash-basis/read-policy.service.js";
import { transformBalanceSheetToCashBasis } from "./cash-basis/report-transforms.js";
import { findClosedPeriodForDate, readPeriodCashBasisSnapshot } from "./cash-basis/snapshot.service.js";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";

const balanceSheetQuerySchema = companyQuerySchema.extend({
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  basis: z.enum(["accrual", "cash"]).optional(),
});

function canAccessBalanceSheet(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function registerBalanceSheetRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/balance-sheet", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessBalanceSheet(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = balanceSheetQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const asOfDate = query.data.as_of_date ?? todayIsoDate();
    const basis = query.data.basis ?? DEFAULT_BASIS;

    if (basis === "cash") {
      const snapshotResult = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const closedPeriodId = await findClosedPeriodForDate(client, {
          operatingCompanyId: query.data.operating_company_id,
          anchorDate: asOfDate,
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
          reportKey: "balance_sheet",
          computeLiveCash: async () => {
            const roleMatches = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
              return {
                arControlAccountId: await resolveRoleAccountOptional(client, query.data.operating_company_id, "ar_control"),
                apControlAccountId: await resolveRoleAccountOptional(client, query.data.operating_company_id, "ap_control"),
              };
            });
            const accrualReport = await getBalanceSheetReport({
              userId: user.uuid,
              operating_company_id: query.data.operating_company_id,
              as_of_date: asOfDate,
            });
            return transformBalanceSheetToCashBasis(accrualReport, asOfDate, roleMatches);
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

    const report = await getBalanceSheetReport({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      as_of_date: asOfDate,
    });

    return reply.code(200).send({ ...report, basis });
  });
}
