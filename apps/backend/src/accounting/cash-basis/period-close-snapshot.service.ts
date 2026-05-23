import { type BalanceSheetReport } from "../balance-sheet.service.js";
import { type ProfitLossReport } from "../profit-loss.service.js";
import { type TrialBalanceRow, type TrialBalanceSummary } from "../trial-balance.service.js";
import {
  transformBalanceSheetToCashBasis,
  transformProfitLossToCashBasis,
  transformTrialBalanceToCashBasis,
} from "./report-transforms.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type PeriodAggRow = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  total_debits: string | number;
  total_credits: string | number;
};

type SnapshotPayload = {
  basis: "cash";
  period: {
    period_id: string;
    operating_company_id: string;
    period_start: string;
    period_end: string;
  };
  reports: {
    balance_sheet: BalanceSheetReport;
    trial_balance: { rows: TrialBalanceRow[]; summary: TrialBalanceSummary };
    profit_loss: ProfitLossReport;
  };
};

async function queryPeriodAggregates(client: DbClient, input: { operatingCompanyId: string; periodStart: string; periodEnd: string }) {
  const res = await client.query<PeriodAggRow>(
    `
      SELECT
        p.account_id::text AS account_id,
        COALESCE(a.account_number, '') AS account_code,
        COALESCE(a.account_name, '') AS account_name,
        COALESCE(a.account_type, '') AS account_type,
        COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_debits,
        COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_credits
      FROM accounting.journal_entry_postings p
      JOIN accounting.journal_entries je
        ON je.id = p.journal_entry_uuid
       AND je.operating_company_id = p.operating_company_id
      LEFT JOIN accounting.posting_batches pb
        ON pb.id = p.posting_batch_id
       AND pb.operating_company_id = p.operating_company_id
      LEFT JOIN catalogs.accounts a
        ON a.id = p.account_id
      WHERE p.operating_company_id = $1::uuid
        AND je.status <> 'voided'
        AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
        AND je.entry_date BETWEEN $2::date AND $3::date
      GROUP BY p.account_id, a.account_number, a.account_name, a.account_type
      ORDER BY a.account_number ASC NULLS LAST, a.account_name ASC
    `,
    [input.operatingCompanyId, input.periodStart, input.periodEnd],
  );
  return res.rows;
}

function buildAccrualTrialBalance(rows: PeriodAggRow[]): { rows: TrialBalanceRow[]; summary: TrialBalanceSummary } {
  const trialRows: TrialBalanceRow[] = rows.map((row) => {
    const totalDebits = Number(row.total_debits ?? 0);
    const totalCredits = Number(row.total_credits ?? 0);
    return {
      account_id: row.account_id,
      account_code: row.account_code,
      account_name: row.account_name,
      account_type: row.account_type,
      total_debits: totalDebits,
      total_credits: totalCredits,
      net_balance: totalDebits - totalCredits,
    };
  });
  const grandTotalDebits = trialRows.reduce((sum, row) => sum + row.total_debits, 0);
  const grandTotalCredits = trialRows.reduce((sum, row) => sum + row.total_credits, 0);
  return {
    rows: trialRows,
    summary: {
      grand_total_debits: grandTotalDebits,
      grand_total_credits: grandTotalCredits,
      balanced: grandTotalDebits === grandTotalCredits,
    },
  };
}

async function buildAccrualBalanceSheet(client: DbClient, input: { operatingCompanyId: string; asOfDate: string }) {
  const rows = await client.query<PeriodAggRow>(
    `
      SELECT
        p.account_id::text AS account_id,
        COALESCE(a.account_number, '') AS account_code,
        COALESCE(a.account_name, '') AS account_name,
        COALESCE(a.account_type, '') AS account_type,
        COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_debits,
        COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_credits
      FROM accounting.journal_entry_postings p
      JOIN accounting.journal_entries je
        ON je.id = p.journal_entry_uuid
       AND je.operating_company_id = p.operating_company_id
      LEFT JOIN accounting.posting_batches pb
        ON pb.id = p.posting_batch_id
       AND pb.operating_company_id = p.operating_company_id
      LEFT JOIN catalogs.accounts a
        ON a.id = p.account_id
      WHERE p.operating_company_id = $1::uuid
        AND je.status <> 'voided'
        AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
        AND je.entry_date <= $2::date
        AND a.account_type IN ('Asset', 'Liability', 'Equity')
      GROUP BY p.account_id, a.account_number, a.account_name, a.account_type
      ORDER BY a.account_number ASC NULLS LAST, a.account_name ASC
    `,
    [input.operatingCompanyId, input.asOfDate],
  );
  const assets = [];
  const liabilities = [];
  const equity = [];
  for (const row of rows.rows) {
    const totalDebits = Number(row.total_debits ?? 0);
    const totalCredits = Number(row.total_credits ?? 0);
    if (row.account_type === "Asset") assets.push({ account_code: row.account_code, account_name: row.account_name, account_type: row.account_type, amount: totalDebits - totalCredits });
    else if (row.account_type === "Liability") liabilities.push({ account_code: row.account_code, account_name: row.account_name, account_type: row.account_type, amount: totalCredits - totalDebits });
    else if (row.account_type === "Equity") equity.push({ account_code: row.account_code, account_name: row.account_name, account_type: row.account_type, amount: totalCredits - totalDebits });
  }
  const earningsRes = await client.query<{ account_type: string; total_debits: string | number; total_credits: string | number }>(
    `
      SELECT
        COALESCE(a.account_type, '') AS account_type,
        COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_debits,
        COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_credits
      FROM accounting.journal_entry_postings p
      JOIN accounting.journal_entries je
        ON je.id = p.journal_entry_uuid
       AND je.operating_company_id = p.operating_company_id
      LEFT JOIN accounting.posting_batches pb
        ON pb.id = p.posting_batch_id
       AND pb.operating_company_id = p.operating_company_id
      LEFT JOIN catalogs.accounts a
        ON a.id = p.account_id
      WHERE p.operating_company_id = $1::uuid
        AND je.status <> 'voided'
        AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
        AND je.entry_date <= $2::date
        AND a.account_type IN ('Income', 'OtherIncome', 'CostOfGoodsSold', 'Expense', 'OtherExpense')
        AND je.id NOT IN (
          SELECT ap.retained_earnings_entry_id
          FROM accounting.periods ap
          WHERE ap.operating_company_id = $1::uuid
            AND ap.retained_earnings_entry_id IS NOT NULL
        )
      GROUP BY a.account_type
    `,
    [input.operatingCompanyId, input.asOfDate],
  );
  let revenueTotal = 0;
  let expenseTotal = 0;
  for (const row of earningsRes.rows) {
    const totalDebits = Number(row.total_debits ?? 0);
    const totalCredits = Number(row.total_credits ?? 0);
    if (row.account_type === "Income" || row.account_type === "OtherIncome") revenueTotal += totalCredits - totalDebits;
    else expenseTotal += totalDebits - totalCredits;
  }
  const currentYearEarnings = revenueTotal - expenseTotal;
  const assetsTotal = assets.reduce((sum, row) => sum + row.amount, 0);
  const liabilitiesTotal = liabilities.reduce((sum, row) => sum + row.amount, 0);
  const equityBaseTotal = equity.reduce((sum, row) => sum + row.amount, 0);
  const equityTotal = equityBaseTotal + currentYearEarnings;
  return {
    assets: { lines: assets, total: assetsTotal },
    liabilities: { lines: liabilities, total: liabilitiesTotal },
    equity: { lines: equity, current_year_earnings: currentYearEarnings, total: equityTotal },
    total_liabilities_and_equity: liabilitiesTotal + equityTotal,
    balanced: assetsTotal === liabilitiesTotal + equityTotal,
  } satisfies BalanceSheetReport;
}

function buildAccrualProfitLoss(rows: PeriodAggRow[]): ProfitLossReport {
  const revenue = [];
  const cogs = [];
  const operating = [];
  for (const row of rows) {
    const totalDebits = Number(row.total_debits ?? 0);
    const totalCredits = Number(row.total_credits ?? 0);
    if (row.account_type === "Income" || row.account_type === "OtherIncome") {
      revenue.push({ account_code: row.account_code, account_name: row.account_name, account_type: row.account_type, amount: totalCredits - totalDebits });
    } else if (row.account_type === "CostOfGoodsSold") {
      cogs.push({ account_code: row.account_code, account_name: row.account_name, account_type: row.account_type, amount: totalDebits - totalCredits });
    } else if (row.account_type === "Expense" || row.account_type === "OtherExpense") {
      operating.push({ account_code: row.account_code, account_name: row.account_name, account_type: row.account_type, amount: totalDebits - totalCredits });
    }
  }
  const revenueTotal = revenue.reduce((sum, row) => sum + row.amount, 0);
  const cogsTotal = cogs.reduce((sum, row) => sum + row.amount, 0);
  const operatingTotal = operating.reduce((sum, row) => sum + row.amount, 0);
  return {
    revenue: { lines: revenue, total: revenueTotal },
    cogs: { lines: cogs, total: cogsTotal },
    gross_profit: revenueTotal - cogsTotal,
    operating_expenses: { lines: operating, total: operatingTotal },
    net_income: revenueTotal - cogsTotal - operatingTotal,
  };
}

function buildSnapshotPayload(input: {
  operatingCompanyId: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  balanceSheet: BalanceSheetReport;
  trialBalance: { rows: TrialBalanceRow[]; summary: TrialBalanceSummary };
  profitLoss: ProfitLossReport;
}): SnapshotPayload {
  return {
    basis: "cash",
    period: {
      period_id: input.periodId,
      operating_company_id: input.operatingCompanyId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
    },
    reports: {
      balance_sheet: input.balanceSheet,
      trial_balance: input.trialBalance,
      profit_loss: input.profitLoss,
    },
  };
}

export async function writePeriodCashBasisSnapshotAtClose(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    periodId: string;
    periodStart: string;
    periodEnd: string;
    computedByUserUuid: string;
  },
) {
  const periodRows = await queryPeriodAggregates(client, input);
  const accrualTrialBalance = buildAccrualTrialBalance(periodRows);
  const accrualProfitLoss = buildAccrualProfitLoss(periodRows);
  const accrualBalanceSheet = await buildAccrualBalanceSheet(client, {
    operatingCompanyId: input.operatingCompanyId,
    asOfDate: input.periodEnd,
  });
  const cashBalanceSheet = transformBalanceSheetToCashBasis(accrualBalanceSheet, input.periodEnd);
  const cashTrialBalance = transformTrialBalanceToCashBasis(accrualTrialBalance.rows, accrualTrialBalance.summary, input.periodEnd);
  const cashProfitLoss = transformProfitLossToCashBasis(accrualProfitLoss, input.periodEnd);
  const payload = buildSnapshotPayload({
    operatingCompanyId: input.operatingCompanyId,
    periodId: input.periodId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    balanceSheet: cashBalanceSheet,
    trialBalance: cashTrialBalance,
    profitLoss: cashProfitLoss,
  });

  await client.query(
    `
      INSERT INTO accounting.period_cash_basis_snapshot (
        operating_company_id,
        period_id,
        snapshot_payload,
        computed_by_user_uuid
      )
      VALUES ($1::uuid, $2::uuid, $3::jsonb, $4::uuid)
      ON CONFLICT (operating_company_id, period_id) DO NOTHING
    `,
    [input.operatingCompanyId, input.periodId, JSON.stringify(payload), input.computedByUserUuid],
  );
}
