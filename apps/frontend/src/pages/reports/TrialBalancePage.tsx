import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { BasisSelector, type AccountingBasis } from "../../components/accounting/BasisSelector";
import {
  exportTrialBalanceReport,
  getTrialBalanceReport,
  type AccountingTrialBalanceRow,
} from "../../api/reports";
import { ReportBlockTPendingBanner } from "./ReportBlockTPendingBanner";
import { ReportsSubNav } from "./ReportsSubNav";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function currentQuarterRange() {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3);
  const startMonth = q * 3;
  const start = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), startMonth + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function TrialBalancePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState(currentQuarterRange);
  const [applied, setApplied] = useState(currentQuarterRange);
  const [basis, setBasis] = useState<AccountingBasis>("accrual");

  const query = useQuery({
    queryKey: ["reports", "trial-balance", companyId, applied.start, applied.end, basis],
    queryFn: () =>
      getTrialBalanceReport({
        operating_company_id: companyId,
        from_date: applied.start,
        to_date: applied.end,
        basis,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const rows = useMemo(() => {
    const input = [...(query.data?.rows ?? [])];
    if (basis === "cash") {
      const hasAr = input.some((row) => row.account_name.toLowerCase().includes("accounts receivable") || row.account_code === "1100");
      const hasAp = input.some((row) => row.account_name.toLowerCase().includes("accounts payable") || row.account_code === "2000");
      if (!hasAr) {
        input.push({
          account_id: "cash-basis-ar-row",
          account_code: "1100",
          account_name: "Accounts Receivable",
          account_type: "Asset",
          total_debits: 0,
          total_credits: 0,
          net_balance: 0,
        });
      }
      if (!hasAp) {
        input.push({
          account_id: "cash-basis-ap-row",
          account_code: "2000",
          account_name: "Accounts Payable",
          account_type: "Liability",
          total_debits: 0,
          total_credits: 0,
          net_balance: 0,
        });
      }
    }
    const output = [...input];
    output.sort((a, b) => String(a.account_code).localeCompare(String(b.account_code)));
    return output;
  }, [query.data?.rows, basis]);

  const columns = useMemo<ParityColumn<AccountingTrialBalanceRow>[]>(
    () => [
      { key: "account_code", label: "Account #", sortable: true, render: (row) => <span className="font-medium text-gray-900">{row.account_code || "—"}</span> },
      { key: "account_name", label: "Account", sortable: true, render: (row) => row.account_name || "—" },
      { key: "account_type", label: "Type", sortable: true, render: (row) => row.account_type || "—" },
      { key: "total_debits", label: "Debits", sortable: true, className: "text-right", cellClass: "text-right", render: (row) => money(row.total_debits) },
      { key: "total_credits", label: "Credits", sortable: true, className: "text-right", cellClass: "text-right", render: (row) => money(row.total_credits) },
      {
        key: "net_balance",
        label: "Net",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => <span className={row.net_balance < 0 ? "text-rose-700" : "text-slate-900"}>{money(row.net_balance)}</span>,
      },
    ],
    [],
  );

  const summary = query.data?.summary;

  return (
    <div className="space-y-4 print:space-y-2">
      <style>{`
        @media print { .no-print { display: none !important; } body { background: white; } }
      `}</style>
      <ReportsSubNav />
      <PageHeader
        title="Trial balance"
        subtitle={`Ledger debits and credits by account · ${basis === "cash" ? "Cash" : "Accrual"} basis`}
        backHref="/reports"
        breadcrumb={["Reports", "Trial Balance"]}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              Print this page
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!companyId}
              onClick={() =>
                exportTrialBalanceReport({
                  operating_company_id: companyId,
                  as_of_date: applied.end,
                  format: "pdf",
                })
              }
            >
              Export PDF
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!companyId}
              onClick={() =>
                exportTrialBalanceReport({
                  operating_company_id: companyId,
                  as_of_date: applied.end,
                  format: "xlsx",
                })
              }
            >
              Export XLSX
            </Button>
          </div>
        }
      />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {query.isError ? <ReportBlockTPendingBanner error={query.error} onRetry={() => void query.refetch()} /> : null}

      <div className="no-print flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 bg-white p-3">
        <BasisSelector value={basis} onChange={setBasis} />
        <label className="text-xs text-gray-600">
          From
          <DatePicker
            className="mt-1 block h-9 rounded-sm border border-gray-300 px-2"
            value={period.start}
            onChange={(next) => setPeriod((previous) => ({ ...previous, start: next }))}
          />
        </label>
        <label className="text-xs text-gray-600">
          To
          <DatePicker
            className="mt-1 block h-9 rounded-sm border border-gray-300 px-2"
            value={period.end}
            onChange={(next) => setPeriod((previous) => ({ ...previous, end: next }))}
          />
        </label>
        <Button size="sm" onClick={() => setApplied({ ...period })}>
          Apply
        </Button>
      </div>

      {summary ? (
        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold uppercase text-gray-500">Grand total debits</div>
            <div className="text-lg font-semibold">{money(summary.grand_total_debits)}</div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold uppercase text-gray-500">Grand total credits</div>
            <div className="text-lg font-semibold">{money(summary.grand_total_credits)}</div>
          </div>
          <div className={`rounded-sm border bg-white px-3 py-2 ${summary.balanced ? "border-emerald-200" : "border-rose-300"}`}>
            <div className="text-[11px] font-semibold uppercase text-gray-500">Balance check</div>
            <div className={`text-lg font-semibold ${summary.balanced ? "text-emerald-700" : "text-rose-700"}`}>
              {summary.balanced ? "Balanced" : "Out of balance"}
            </div>
          </div>
        </div>
      ) : null}

      <ParityTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.account_id}
        loading={query.isPending || (query.isFetching && rows.length === 0)}
        storageKey="trial-balance"
        emptyText="No rows"
      />
    </div>
  );
}
