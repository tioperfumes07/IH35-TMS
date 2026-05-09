import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listInternalFineReasons, type InternalFineReasonRow } from "../../../api/catalogs-safety";
import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { InternalFineReasonModal } from "./InternalFineReasonModal";
import { moneyFromCents, STATUS_OPTIONS, statusPillClass, type StatusFilter } from "./shared";

export function InternalFineReasonsListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("true");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<InternalFineReasonRow | null>(null);

  const query = useQuery({
    queryKey: ["catalogs", "safety", "internal-fine-reasons", companyId, search, statusFilter],
    queryFn: () => listInternalFineReasons(companyId, { search: search || undefined, is_active: statusFilter, limit: 200, offset: 0 }),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  const emptyText = useMemo(() => {
    if (query.isLoading) return "Loading internal fine reasons...";
    if (rows.length > 0) return "";
    return "No internal fine reasons found.";
  }, [query.isLoading, rows.length]);

  return (
    <div className="space-y-3">
      <PageHeader title="Internal Fine Reasons" subtitle={`${total} entries`} actions={<Button onClick={() => { setSelectedRow(null); setModalOpen(true); }}>+ New Entry</Button>} />

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-3">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by code or reason name" className="h-9 rounded border border-gray-300 px-2 text-sm md:col-span-2" />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-9 rounded border border-gray-300 px-2 text-sm">
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Reason Name</th>
              <th className="px-3 py-2 text-left">Default Amount</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => { setSelectedRow(row); setModalOpen(true); }}>
                <td className="px-3 py-2 text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.reason_code}</td>
                <td className="px-3 py-2">{row.reason_name}</td>
                <td className="px-3 py-2">{moneyFromCents(row.default_amount)}</td>
                <td className="px-3 py-2">
                  <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {emptyText ? <div className="px-3 py-6 text-sm text-gray-500">{emptyText}</div> : null}
      </div>

      <InternalFineReasonModal
        open={modalOpen}
        companyId={companyId}
        row={selectedRow}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void query.refetch();
        }}
      />
    </div>
  );
}
