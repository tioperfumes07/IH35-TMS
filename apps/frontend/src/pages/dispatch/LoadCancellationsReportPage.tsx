import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportsSubNav } from "../reports/ReportsSubNav";

type GroupBy = "reason" | "driver" | "customer" | "date";

type AnalyticsRow = {
  group_key: string;
  group_label: string;
  cancellation_count: number;
  total_charge_cents: number;
  total_rate_cents: number;
};

type AnalyticsReport = {
  period: { from: string; to: string };
  group_by: GroupBy;
  rows: AnalyticsRow[];
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function defaultRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function fetchLoadCancellationsAnalytics(companyId: string, from: string, to: string, groupBy: GroupBy) {
  const q = new URLSearchParams({
    operating_company_id: companyId,
    from,
    to,
    group_by: groupBy,
  });
  return apiRequest<AnalyticsReport>(`/api/v1/dispatch/load-cancellations/analytics?${q.toString()}`);
}

export function LoadCancellationsReportPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [range, setRange] = useState(defaultRange);
  const [applied, setApplied] = useState(defaultRange);
  const [groupBy, setGroupBy] = useState<GroupBy>("reason");

  const query = useQuery({
    queryKey: ["dispatch", "load-cancellations-analytics", companyId, applied.from, applied.to, groupBy],
    queryFn: () => fetchLoadCancellationsAnalytics(companyId, applied.from, applied.to, groupBy),
    enabled: Boolean(companyId),
    retry: false,
  });

  const totals = useMemo(() => {
    const rows = query.data?.rows ?? [];
    return rows.reduce(
      (acc, row) => ({
        count: acc.count + Number(row.cancellation_count || 0),
        charge: acc.charge + Number(row.total_charge_cents || 0),
        rate: acc.rate + Number(row.total_rate_cents || 0),
      }),
      { count: 0, charge: 0, rate: 0 }
    );
  }, [query.data?.rows]);

  return (
    <div className="space-y-4 p-4" data-testid="load-cancellations-report-page">
      <PageHeader title="Load cancellations" subtitle="Cancellation volume grouped by reason, driver, customer, or day" />
      <ReportsSubNav />

      {!companyId ? <p className="text-sm text-red-600">Select operating company.</p> : null}

      <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-4">
        <label className="text-xs text-gray-600">
          From
          <DatePicker
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={range.from}
            onChange={(next) => setRange((prev) => ({ ...prev, from: next }))}
          />
        </label>
        <label className="text-xs text-gray-600">
          To
          <DatePicker
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={range.to}
            onChange={(next) => setRange((prev) => ({ ...prev, to: next }))}
          />
        </label>
        <label className="text-xs text-gray-600">
          Group by
          <select
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as GroupBy)}
          >
            <option value="reason">Reason</option>
            <option value="driver">Driver</option>
            <option value="customer">Customer</option>
            <option value="date">Date</option>
          </select>
        </label>
        <Button
          size="sm"
          disabled={!companyId}
          onClick={() => {
            setApplied(range);
            void query.refetch();
          }}
        >
          Apply
        </Button>
      </div>

      {query.isError ? (
        <p className="text-sm text-red-600">Failed to load cancellation analytics.</p>
      ) : null}

      {query.data ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border border-gray-200 bg-white p-4">
              <div className="text-xs text-gray-500">Cancellations</div>
              <div className="text-2xl font-semibold">{totals.count}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-4">
              <div className="text-xs text-gray-500">Cancelled rate total</div>
              <div className="text-2xl font-semibold">{money(totals.rate)}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-4">
              <div className="text-xs text-gray-500">Charge total</div>
              <div className="text-2xl font-semibold">{money(totals.charge)}</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2">{groupBy === "date" ? "Date" : "Group"}</th>
                  <th className="px-3 py-2">Count</th>
                  <th className="px-3 py-2">Rate total</th>
                  <th className="px-3 py-2">Charge total</th>
                </tr>
              </thead>
              <tbody>
                {(query.data.rows ?? []).map((row) => (
                  <tr key={row.group_key} className="border-b border-gray-100">
                    <td className="px-3 py-2">{row.group_label || row.group_key}</td>
                    <td className="px-3 py-2">{row.cancellation_count}</td>
                    <td className="px-3 py-2">{money(row.total_rate_cents)}</td>
                    <td className="px-3 py-2">{money(row.total_charge_cents)}</td>
                  </tr>
                ))}
                {(query.data.rows ?? []).length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-gray-500" colSpan={4}>
                      No cancellations in this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
