import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getComparisonReport,
  getCostCenterClassVariance,
  type ComparisonReportBasis,
  type ComparisonReportRow,
  type ComparisonReportType,
  type CostCenterClassVarianceRow,
} from "../../api/accounting";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function defaultPeriods() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter},${year - 1}-Q${quarter}`;
}

export function PeriodComparisonPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [type, setType] = useState<ComparisonReportType>("pl");
  const [basis, setBasis] = useState<ComparisonReportBasis>("accrual");
  const [periods, setPeriods] = useState(defaultPeriods);

  const reportQuery = useQuery({
    queryKey: ["accounting", "comparison-report", companyId, type, basis, periods],
    queryFn: () => getComparisonReport(companyId, { type, basis, periods }),
    enabled: Boolean(companyId),
  });

  const period1Label = reportQuery.data?.periods[0] ?? "Period 1";
  const period2Label = reportQuery.data?.periods[1] ?? "Period 2";

  const columns = useMemo<ParityColumn<ComparisonReportRow>[]>(
    () => [
      {
        key: "account",
        label: "Account",
        sortable: true,
        render: (row) => <span className="text-gray-900">{row.account}</span>,
      },
      {
        key: "period_1_amount",
        label: period1Label,
        sortable: true,
        render: (row) => money(row.period_1_amount),
      },
      {
        key: "period_2_amount",
        label: period2Label,
        sortable: true,
        render: (row) => money(row.period_2_amount),
      },
      {
        key: "variance_cents",
        label: "Variance",
        sortable: true,
        render: (row) => (
          <span className={`font-semibold ${row.variance_cents < 0 ? "text-red-700" : "text-slate-700"}`}>
            {money(row.variance_cents)}
          </span>
        ),
      },
      {
        key: "variance_pct",
        label: "Variance %",
        sortable: true,
        render: (row) => (
          <span className={`font-semibold ${row.variance_pct != null && row.variance_pct < 0 ? "text-red-700" : "text-slate-700"}`}>
            {row.variance_pct == null ? "n/a" : `${row.variance_pct.toFixed(2)}%`}
          </span>
        ),
      },
      {
        key: "lineage",
        label: "Lineage",
        render: (row) => (
          <Link
            to={`/accounting/posting-lineage?source_transaction_type=account&source_transaction_id=${encodeURIComponent(row.account_id ?? row.row_key)}`}
            className="text-xs font-medium text-slate-700 hover:underline"
          >
            Open lineage
          </Link>
        ),
      },
    ],
    [period1Label, period2Label],
  );

  return (
    <AccountingSubNavWrapper title="Period comparison" subtitle="Side-by-side period variance for P&L or balance sheet with accrual/cash basis selection.">

      {!companyId ? (
        <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">Select an operating company before running comparison.</p>
      ) : null}

      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-3">
        <label className="text-xs text-gray-600">
          Report type
          <select value={type} onChange={(event) => setType(event.target.value as ComparisonReportType)} className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-xs">
            <option value="pl">P&L</option>
            <option value="bs">Balance Sheet</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Basis
          <select value={basis} onChange={(event) => setBasis(event.target.value as ComparisonReportBasis)} className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-xs">
            <option value="accrual">Accrual</option>
            <option value="cash">Cash</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Periods (comma-separated)
          <input
            value={periods}
            onChange={(event) => setPeriods(event.target.value)}
            placeholder="2026-Q1,2025-Q1"
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-xs"
          />
        </label>
      </div>

      {reportQuery.isError ? (
        <ListErrorState
          title="Failed to load report"
          status={0}
          message="Use YYYY-QN or YYYY-MM in the periods input."
          onRetry={() => void reportQuery.refetch()}
        />
      ) : (
        <ParityTable
          columns={columns}
          rows={reportQuery.data?.rows ?? []}
          rowKey={(row) => row.row_key}
          loading={reportQuery.isLoading}
          storageKey="period-comparison"
          emptyText="No comparison rows."
        />
      )}

      <ClassCostCenterVariancePanel companyId={companyId} periods={periods} />
    </AccountingSubNavWrapper>
  );
}

/** ACCT-R-15 — Class = QBO cost-center dimension; variance on existing Period comparison leaf (no new tab). */
function ClassCostCenterVariancePanel({ companyId, periods }: { companyId: string; periods: string }) {
  const classQuery = useQuery({
    queryKey: ["accounting", "cost-center-class-variance", companyId, periods],
    queryFn: () => getCostCenterClassVariance(companyId, periods),
    enabled: Boolean(companyId),
  });

  const period1Label = classQuery.data?.periods[0] ?? "Period 1";
  const period2Label = classQuery.data?.periods[1] ?? "Period 2";

  const columns = useMemo<ParityColumn<CostCenterClassVarianceRow>[]>(
    () => [
      {
        key: "class_name",
        label: "Class / cost center",
        sortable: true,
        render: (row) =>
          row.class_id ? (
            <Link
              to={`/lists/accounting/classes?class_id=${encodeURIComponent(row.class_id)}`}
              className="text-xs font-medium text-slate-700 hover:underline"
            >
              {row.class_name}
              {row.class_code ? ` (${row.class_code})` : ""}
            </Link>
          ) : (
            <span className="text-slate-700">{row.class_name}</span>
          ),
      },
      {
        key: "period_1_cost_cents",
        label: period1Label,
        sortable: true,
        render: (row) => money(row.period_1_cost_cents),
      },
      {
        key: "period_2_cost_cents",
        label: period2Label,
        sortable: true,
        render: (row) => money(row.period_2_cost_cents),
      },
      {
        key: "variance_cents",
        label: "Variance",
        sortable: true,
        render: (row) => (
          <span className={`font-semibold ${row.variance_cents < 0 ? "text-red-700" : "text-slate-700"}`}>
            {money(row.variance_cents)}
          </span>
        ),
      },
      {
        key: "variance_pct",
        label: "Variance %",
        sortable: true,
        render: (row) =>
          row.variance_pct == null ? "n/a" : `${row.variance_pct.toFixed(2)}%`,
      },
    ],
    [period1Label, period2Label],
  );

  return (
    <section className="mt-6 space-y-2" data-testid="cost-center-class-variance-panel">
      <div>
        <h2 className="text-xs font-semibold text-gray-900">Cost centers (Class variance)</h2>
        <p className="text-xs text-gray-600">
          QBO Class dimension — expense / COGS / other-expense JE rollup. No new GL math.
        </p>
      </div>
      {classQuery.data ? (
        <p className="text-xs text-gray-600" data-testid="cost-center-class-density">
          Active classes: {classQuery.data.classes_active} · Classified cost lines:{" "}
          {classQuery.data.classified_posting_lines} · Unclassified cost lines:{" "}
          {classQuery.data.unclassified_posting_lines}
        </p>
      ) : null}
      {!companyId ? null : classQuery.isError ? (
        <ListErrorState
          title="Failed to load Class cost-center variance"
          status={0}
          message="Use YYYY-QN or YYYY-MM in the periods input."
          onRetry={() => void classQuery.refetch()}
        />
      ) : (
        <ParityTable
          columns={columns}
          rows={classQuery.data?.rows ?? []}
          rowKey={(row) => row.class_id ?? "__unclassified__"}
          loading={classQuery.isLoading}
          storageKey="cost-center-class-variance"
          emptyText="No Class cost rows for these periods."
        />
      )}
    </section>
  );
}
