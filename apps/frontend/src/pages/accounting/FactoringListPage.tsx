import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listFactoringAdvances, type FactoringAdvance } from "../../api/accounting";
import { Button } from "../../components/Button";
import { DataPanel } from "../../components/layout/DataPanel";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SubmitFactoringModal } from "./SubmitFactoringModal";
import { AccountingSubNav } from "./AccountingSubNav";
import { PAGE_SHELL_CLASS } from "../../components/layout/pageShellClasses";

const STATUS_OPTIONS: Array<{ value: "all" | FactoringAdvance["status"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Submitted" },
  { value: "advanced", label: "Advanced" },
  { value: "reserve_held", label: "Reserve Held" },
  { value: "collected", label: "Collected" },
  { value: "released", label: "Released" },
  { value: "recourse_returned", label: "Recourse" },
  { value: "voided", label: "Voided" },
];

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function statusPill(status: FactoringAdvance["status"]) {
  const base = "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
  if (status === "advanced") return `${base} bg-blue-50 text-blue-700 border border-blue-200`;
  if (status === "reserve_held" || status === "collected") return `${base} bg-amber-50 text-amber-700 border border-amber-200`;
  if (status === "released") return `${base} bg-emerald-50 text-emerald-700 border border-emerald-200`;
  if (status === "recourse_returned") return `${base} bg-red-50 text-red-700 border border-red-200`;
  if (status === "voided") return `${base} bg-slate-100 text-slate-500 border border-slate-200 line-through`;
  return `${base} bg-slate-50 text-slate-700 border border-slate-200`;
}

export function FactoringListPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const [status, setStatus] = useState<"all" | FactoringAdvance["status"]>("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [submitOpen, setSubmitOpen] = useState(false);

  const query = useQuery({
    queryKey: ["accounting", "factoring-advances", selectedCompanyId, status, search, fromDate, toDate],
    queryFn: () =>
      listFactoringAdvances(selectedCompanyId!, {
        status,
        search: search || undefined,
        date_from: fromDate || undefined,
        date_to: toDate || undefined,
      }).then((res) => res.rows),
    enabled: Boolean(selectedCompanyId),
  });

  const rows = query.data ?? [];

  return (
    <div className={`${PAGE_SHELL_CLASS} space-y-3`}>
      <AccountingSubNav />
      <PageHeader title="Factoring" subtitle="Track factoring submissions, reserves, and releases" actions={<Button onClick={() => setSubmitOpen(true)}>+ Submit New Batch</Button>} />

      <DataPanel title="Filters">
        <div className="grid gap-2 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as "all" | FactoringAdvance["status"])} className="h-9 rounded border border-gray-300 px-2 text-[13px]">
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Search
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="FAC-2026-00012" className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Date from
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Date to
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>
        </div>
      </DataPanel>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50">
            <tr className="text-gray-600">
              <th className="px-3 py-2 font-semibold">Batch #</th>
              <th className="px-3 py-2 font-semibold">Submitted</th>
              <th className="px-3 py-2 font-semibold">Factor</th>
              <th className="px-3 py-2 font-semibold">Invoices</th>
              <th className="px-3 py-2 font-semibold">Total</th>
              <th className="px-3 py-2 font-semibold">Advanced</th>
              <th className="px-3 py-2 font-semibold">Reserve</th>
              <th className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={8}>
                  Loading factoring advances...
                </td>
              </tr>
            ) : null}
            {!query.isLoading && rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={8}>
                  No factoring batches for selected filters.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => navigate(`/accounting/factoring/${row.id}`)}>
                <td className="px-3 py-2 font-semibold text-gray-900">{row.display_id}</td>
                <td className="px-3 py-2 text-gray-700">{new Date(row.submitted_at).toLocaleDateString("en-US")}</td>
                <td className="px-3 py-2 text-gray-700">{row.factoring_company_name}</td>
                <td className="px-3 py-2 text-gray-700">{row.invoice_count}</td>
                <td className="px-3 py-2 text-gray-700">{money(row.invoice_total_cents)}</td>
                <td className="px-3 py-2 text-gray-700">{money(row.advance_amount_cents)}</td>
                <td className="px-3 py-2 text-gray-700">{money(row.reserve_amount_cents)}</td>
                <td className="px-3 py-2 text-gray-700">
                  <span className={statusPill(row.status)}>{row.status.replaceAll("_", " ")}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedCompanyId ? (
        <SubmitFactoringModal
          open={submitOpen}
          operatingCompanyId={selectedCompanyId}
          onClose={() => setSubmitOpen(false)}
          onCreated={(batchId) => {
            setSubmitOpen(false);
            void query.refetch();
            navigate(`/accounting/factoring/${batchId}`);
          }}
        />
      ) : null}
    </div>
  );
}
