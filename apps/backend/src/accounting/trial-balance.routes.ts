import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { type TrialBalanceRow, type TrialBalanceSummary, getTrialBalanceReport } from "./trial-balance.service.js";
import { applyCashBasisSuppression, computeCashBasisAdjustment, type CashBasisEntry, DEFAULT_BASIS } from "./cash-basis/engine.js";
import { findClosedPeriodForDate, readPeriodCashBasisSnapshot, upsertPeriodCashBasisSnapshot } from "./cash-basis/snapshot.service.js";

const trialBalanceQuerySchema = companyQuerySchema.extend({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  basis: z.enum(["accrual", "cash"]).optional(),
});

function canAccessTrialBalance(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

function inferSourceTypeForTrialRow(row: TrialBalanceRow): CashBasisEntry["source_type"] {
  const hint = `${row.account_code} ${row.account_name}`.toLowerCase();
  if (hint.includes("accounts receivable") || hint.includes("a/r")) return "ar_control";
  if (hint.includes("accounts payable") || hint.includes("a/p")) return "ap_control";
  return "other";
}

function toEntries(row: TrialBalanceRow): CashBasisEntry[] {
  return [
    {
      entry_id: `${row.account_id}:debit`,
      account_code: row.account_code,
      account_name: row.account_name,
      account_type: row.account_type,
      amount_cents: row.total_debits,
      source_type: inferSourceTypeForTrialRow(row),
    },
    {
      entry_id: `${row.account_id}:credit`,
      account_code: row.account_code,
      account_name: row.account_name,
      account_type: row.account_type,
      amount_cents: -row.total_credits,
      source_type: inferSourceTypeForTrialRow(row),
    },
  ];
}

function transformTrialBalanceToCashBasis(rows: TrialBalanceRow[], summary: TrialBalanceSummary, asOfDate: string) {
  const entries = rows.flatMap(toEntries);
  const transformed = applyCashBasisSuppression(entries, { as_of_date: asOfDate });
  const aggregates = new Map<string, TrialBalanceRow>();

  for (const row of rows) {
    aggregates.set(row.account_id, { ...row, total_debits: 0, total_credits: 0, net_balance: 0 });
  }

  for (const entry of transformed) {
    const key = entry.entry_id.split(":")[0];
    const current = aggregates.get(key);
    if (!current) continue;
    if (entry.amount_cents >= 0) current.total_debits += entry.amount_cents;
    else current.total_credits += Math.abs(entry.amount_cents);
    current.net_balance = current.total_debits - current.total_credits;
  }

  const transformedRows = [...aggregates.values()];
  const grandTotalDebits = transformedRows.reduce((sum, row) => sum + row.total_debits, 0);
  const grandTotalCredits = transformedRows.reduce((sum, row) => sum + row.total_credits, 0);

  const adjustment = computeCashBasisAdjustment({
    assets: {
      total: transformedRows.filter((row) => row.account_type === "Asset").reduce((sum, row) => sum + row.net_balance, 0),
    },
    liabilities: {
      total: transformedRows.filter((row) => row.account_type === "Liability").reduce((sum, row) => sum + Math.abs(row.net_balance), 0),
    },
    equity: {
      total: transformedRows.filter((row) => row.account_type === "Equity").reduce((sum, row) => sum + Math.abs(row.net_balance), 0),
    },
  });

  if (adjustment.amount !== 0) {
    transformedRows.push({
      account_id: "cash-basis-adjustment",
      account_code: adjustment.account_code,
      account_name: adjustment.account_name,
      account_type: "Equity",
      total_debits: adjustment.amount > 0 ? adjustment.amount : 0,
      total_credits: adjustment.amount < 0 ? Math.abs(adjustment.amount) : 0,
      net_balance: adjustment.amount,
    });
  }

  const finalDebits = transformedRows.reduce((sum, row) => sum + row.total_debits, 0);
  const finalCredits = transformedRows.reduce((sum, row) => sum + row.total_credits, 0);
  return {
    rows: transformedRows,
    summary: {
      ...summary,
      grand_total_debits: finalDebits,
      grand_total_credits: finalCredits,
      balanced: finalDebits === finalCredits,
    },
  };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function cacheKey(fromDate?: string, toDate?: string) {
  return `trial_balance:${fromDate ?? ""}:${toDate ?? ""}`;
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
        if (!closedPeriodId) return null;
        const snapshotPayload = await readPeriodCashBasisSnapshot(client, {
          operatingCompanyId: query.data.operating_company_id,
          periodId: closedPeriodId,
        });
        const reports = ((snapshotPayload?.reports as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
        const cached = reports[cacheKey(query.data.from_date, query.data.to_date)];
        if (!cached) return { closedPeriodId, snapshotPayload };
        return { cached_report: cached, closedPeriodId, snapshotPayload };
      });
      if (snapshotResult && "cached_report" in snapshotResult) {
        return reply.code(200).send(snapshotResult.cached_report);
      }

      const accrualReport = await getTrialBalanceReport({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        from_date: query.data.from_date,
        to_date: query.data.to_date,
      });
      const cashReport = transformTrialBalanceToCashBasis(accrualReport.rows, accrualReport.summary, anchorDate);
      const response = { ...cashReport, basis };
      if (snapshotResult?.closedPeriodId) {
        const existingPayload = (snapshotResult.snapshotPayload ?? {}) as Record<string, unknown>;
        const existingReports = ((existingPayload.reports as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
        const mergedPayload = {
          ...existingPayload,
          basis: "cash",
          reports: {
            ...existingReports,
            [cacheKey(query.data.from_date, query.data.to_date)]: response,
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

    const report = await getTrialBalanceReport({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      from_date: query.data.from_date,
      to_date: query.data.to_date,
    });

    return reply.code(200).send({ ...report, basis });
  });
}
