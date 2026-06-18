import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getCancellationsReport, type CancellationBucket } from "../../api/reports";
import { ReportsSubNav } from "./ReportsSubNav";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

// GAP-10 — Load cancellations analytics. Read-only; groups cancellations by reason / driver / customer /
// date with billable-charge totals, scoped to the selected operating company (per-entity).
function BucketTable({ title, rows }: { title: string; rows: CancellationBucket[] }) {
  return (
    <div className="rounded border border-gray-200 bg-white">
      <div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-3 text-xs text-gray-500">No cancellations in range.</div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-gray-100 text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-1.5">{title.replace(/^By /, "")}</th>
              <th className="px-3 py-1.5 text-right">Count</th>
              <th className="px-3 py-1.5 text-right">Billable</th>
              <th className="px-3 py-1.5 text-right">Charges</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-gray-50 last:border-0">
                <td className="px-3 py-1.5 text-gray-800">{r.label}</td>
                <td className="px-3 py-1.5 text-right font-mono">{r.count}</td>
                <td className="px-3 py-1.5 text-right font-mono text-gray-600">{r.billable_count}</td>
                <td className="px-3 py-1.5 text-right font-mono">{money(r.total_charge_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

export function CancellationsReportPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});

  const query = useQuery({
    queryKey: ["reports", "cancellations", companyId, applied.from, applied.to],
    queryFn: () => getCancellationsReport({ operating_company_id: companyId, from: applied.from, to: applied.to }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const data = query.data;
  const total = data?.total ?? { count: 0, total_charge_cents: 0, billable_count: 0 };

  return (
    <div className="space-y-3">
      <PageHeader title="Cancellations" subtitle="Reports" />
      <ReportsSubNav />

      <div className="flex flex-wrap items-end gap-2 rounded border border-gray-200 bg-white px-3 py-2 text-xs">
        <label className="flex flex-col gap-0.5 font-semibold text-gray-700">
          From
          <DatePicker value={from} onChange={setFrom} />
        </label>
        <label className="flex flex-col gap-0.5 font-semibold text-gray-700">
          To
          <DatePicker value={to} onChange={setTo} />
        </label>
        <Button type="button" onClick={() => setApplied({ from: from || undefined, to: to || undefined })}>
          Apply
        </Button>
        {(applied.from || applied.to) && (
          <button
            type="button"
            className="rounded border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 hover:bg-gray-50"
            onClick={() => { setFrom(""); setTo(""); setApplied({}); }}
          >
            Clear
          </button>
        )}
      </div>

      {query.isLoading ? (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">Loading cancellations…</div>
      ) : query.isError ? (
        <div className="rounded border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Couldn't load the cancellations report.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <div className="rounded border border-gray-200 bg-white px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Cancellations</div>
              <div className="text-lg font-semibold">{total.count}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Billable to customer</div>
              <div className="text-lg font-semibold">{total.billable_count}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Total charges</div>
              <div className="text-lg font-semibold">{money(total.total_charge_cents)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <BucketTable title="By reason" rows={data?.by_reason ?? []} />
            <BucketTable title="By driver" rows={data?.by_driver ?? []} />
            <BucketTable title="By customer" rows={data?.by_customer ?? []} />
            <BucketTable title="By date" rows={data?.by_date ?? []} />
          </div>
        </>
      )}
    </div>
  );
}
