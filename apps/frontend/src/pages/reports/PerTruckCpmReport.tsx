import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportsSubNav } from "./ReportsSubNav";

type PerTruckCpmRow = {
  unit_uuid: string;
  display_id: string;
  miles: number;
  total_cost_cents: number;
  cpm_cents: number;
  rank: number;
  outlier?: boolean;
};

type PerTruckCpmResponse = {
  operating_company_id: string;
  period: { from: string; to: string };
  fleet_median_cpm_cents: number;
  rows: PerTruckCpmRow[];
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function currentQuarterRange() {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3);
  const startMonth = q * 3;
  const start = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), startMonth + 3, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function PerTruckCpmReport() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState(currentQuarterRange);
  const [applied, setApplied] = useState(currentQuarterRange);

  const query = useQuery({
    queryKey: ["reports", "per-truck-cpm", companyId, applied.from, applied.to],
    enabled: Boolean(companyId),
    queryFn: () =>
      apiRequest<PerTruckCpmResponse>(
        `/api/v1/reports/per-truck-cpm?operating_company_id=${encodeURIComponent(companyId)}&from=${applied.from}&to=${applied.to}`
      ),
  });

  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Per-truck CPM" subtitle="Cost per mile by unit (GAP-45)" />
      <ReportsSubNav />
      <div className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
        <label className="text-sm">
          From
          <DatePicker className="ml-2 rounded border px-2 py-1" value={period.from} onChange={(next) => setPeriod((p) => ({ ...p, from: next }))} />
        </label>
        <label className="text-sm">
          To
          <DatePicker className="ml-2 rounded border px-2 py-1" value={period.to} onChange={(next) => setPeriod((p) => ({ ...p, to: next }))} />
        </label>
        <Button onClick={() => setApplied(period)}>Apply</Button>
      </div>
      <div className="overflow-x-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Rank</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Miles</th>
              <th className="px-3 py-2">Total cost</th>
              <th className="px-3 py-2">CPM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.unit_uuid} className={row.outlier ? "bg-rose-50 text-rose-900" : ""}>
                <td className="px-3 py-2">{row.rank}</td>
                <td className="px-3 py-2">{row.display_id}</td>
                <td className="px-3 py-2">{row.miles.toLocaleString()}</td>
                <td className="px-3 py-2">{money(row.total_cost_cents)}</td>
                <td className="px-3 py-2">{money(row.cpm_cents)}/mi</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PerTruckCpmReport;
