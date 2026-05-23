import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { type BalanceSheetLine, type BalanceSheetReport, getBalanceSheetReport } from "./balance-sheet.service.js";
import { applyCashBasisSuppression, computeCashBasisAdjustment, type CashBasisEntry, DEFAULT_BASIS } from "./cash-basis/engine.js";
import { findClosedPeriodForDate, readPeriodCashBasisSnapshot, upsertPeriodCashBasisSnapshot } from "./cash-basis/snapshot.service.js";

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

function inferSourceTypeForBalanceSheetLine(line: BalanceSheetLine): CashBasisEntry["source_type"] {
  const hint = `${line.account_code} ${line.account_name}`.toLowerCase();
  if (hint.includes("accounts receivable") || hint.includes("a/r")) return "ar_control";
  if (hint.includes("accounts payable") || hint.includes("a/p")) return "ap_control";
  return "other";
}

function toEntry(line: BalanceSheetLine): CashBasisEntry {
  return {
    entry_id: `${line.account_code}:${line.account_name}`,
    account_code: line.account_code,
    account_name: line.account_name,
    account_type: line.account_type,
    amount_cents: line.amount,
    source_type: inferSourceTypeForBalanceSheetLine(line),
  };
}

function lineFromEntry(entry: CashBasisEntry): BalanceSheetLine {
  return {
    account_code: entry.account_code,
    account_name: entry.account_name,
    account_type: entry.account_type,
    amount: entry.amount_cents,
  };
}

function transformBalanceSheetToCashBasis(report: BalanceSheetReport, asOfDate: string): BalanceSheetReport {
  const allEntries = [...report.assets.lines.map(toEntry), ...report.liabilities.lines.map(toEntry), ...report.equity.lines.map(toEntry)];
  const transformed = applyCashBasisSuppression(allEntries, { as_of_date: asOfDate });

  const assets = transformed.filter((entry) => entry.account_type === "Asset").map(lineFromEntry);
  const liabilities = transformed.filter((entry) => entry.account_type === "Liability").map(lineFromEntry);
  const equityLines = transformed.filter((entry) => entry.account_type === "Equity").map(lineFromEntry);

  const assetsTotal = assets.reduce((sum, line) => sum + line.amount, 0);
  const liabilitiesTotal = liabilities.reduce((sum, line) => sum + line.amount, 0);
  const equityBase = equityLines.reduce((sum, line) => sum + line.amount, 0);
  const equityWithoutAdj = equityBase + report.equity.current_year_earnings;

  const adjustment = computeCashBasisAdjustment({
    assets: { total: assetsTotal },
    liabilities: { total: liabilitiesTotal },
    equity: { total: equityWithoutAdj },
  });

  const adjustedEquityLines = [...equityLines, { account_code: adjustment.account_code, account_name: adjustment.account_name, account_type: "Equity", amount: adjustment.amount }];
  const equityTotal = equityWithoutAdj + adjustment.amount;
  const totalLiabilitiesAndEquity = liabilitiesTotal + equityTotal;
  return {
    assets: { lines: assets, total: assetsTotal },
    liabilities: { lines: liabilities, total: liabilitiesTotal },
    equity: {
      lines: adjustedEquityLines,
      current_year_earnings: report.equity.current_year_earnings,
      total: equityTotal,
    },
    total_liabilities_and_equity: totalLiabilitiesAndEquity,
    balanced: assetsTotal === totalLiabilitiesAndEquity,
  };
}

function cacheKey(asOfDate: string) {
  return `balance_sheet:${asOfDate}`;
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
        if (!closedPeriodId) return null;
        const snapshotPayload = await readPeriodCashBasisSnapshot(client, {
          operatingCompanyId: query.data.operating_company_id,
          periodId: closedPeriodId,
        });
        const reports = ((snapshotPayload?.reports as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
        const cached = reports[cacheKey(asOfDate)];
        if (!cached) return { closedPeriodId, snapshotPayload };
        return { cached_report: cached, closedPeriodId, snapshotPayload };
      });
      if (snapshotResult && "cached_report" in snapshotResult) {
        return reply.code(200).send(snapshotResult.cached_report);
      }
      const accrualReport = await getBalanceSheetReport({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        as_of_date: asOfDate,
      });
      const cashReport = transformBalanceSheetToCashBasis(accrualReport, asOfDate);
      const response = { ...cashReport, basis };
      if (snapshotResult?.closedPeriodId) {
        const existingPayload = (snapshotResult.snapshotPayload ?? {}) as Record<string, unknown>;
        const existingReports = ((existingPayload.reports as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
        const mergedPayload = {
          ...existingPayload,
          basis: "cash",
          reports: {
            ...existingReports,
            [cacheKey(asOfDate)]: response,
          },
        };
        await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
          upsertPeriodCashBasisSnapshot(client, {
            operatingCompanyId: query.data.operating_company_id,
            periodId: snapshotResult.closedPeriodId,
            snapshotPayload: mergedPayload,
            computedByUserUuid: user.uuid,
          }),
        );
      }
      return reply.code(200).send(response);
    }

    const report = await getBalanceSheetReport({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      as_of_date: asOfDate,
    });

    return reply.code(200).send({ ...report, basis });
  });
}
