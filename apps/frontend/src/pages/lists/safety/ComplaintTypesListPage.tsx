import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listComplaintTypes, type ComplaintSeverity, type ComplaintTypeRow } from "../../../api/catalogs-safety";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ComplaintTypeModal } from "./ComplaintTypeModal";
import { ListsSubNav } from "../ListsSubNav";
import { STATUS_OPTIONS, statusPillClass, type StatusFilter } from "./shared";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

const SEVERITY_LABELS: Record<ComplaintSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

function severityBadgeClass(severity: ComplaintSeverity | null) {
  switch (severity) {
    case "critical":
      return "rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700";
    case "high":
      return "rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800";
    case "medium":
      return "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
    default:
      return "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500";
  }
}

export function ComplaintTypesListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("true");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ComplaintTypeRow | null>(null);

  const query = useQuery({
    queryKey: ["catalogs", "safety", "complaint-types", companyId, search, statusFilter],
    queryFn: () => listComplaintTypes(companyId, { search: search || undefined, is_active: statusFilter, limit: 200, offset: 0 }),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  const emptyText = useMemo(() => {
    if (query.isLoading) return "Loading complaint types...";
    if (rows.length > 0) return "";
    return "No complaint types found.";
  }, [query.isLoading, rows.length]);

  return (
    <div className="space-y-3">
      <ListsSubNav />
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Safety", "Complaint types"]}
        title="Complaint Types"
        countBadge={total}
        actions={
          <Button
            onClick={() => {
              setSelectedRow(null);
              setModalOpen(true);
            }}
          >
            + Create
          </Button>
        }
      />
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-3">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by type code or type name" className="h-9 rounded border border-gray-300 px-2 text-sm md:col-span-2" />
        <SelectCombobox value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-9 rounded border border-gray-300 px-2 text-sm">
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectCombobox>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Type Code</th>
              <th className="px-3 py-2 text-left">Type Name</th>
              <th className="px-3 py-2 text-left">Default Severity</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => { setSelectedRow(row); setModalOpen(true); }}>
                <td className="px-3 py-2 text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.type_code}</td>
                <td className="px-3 py-2">{row.type_name}</td>
                <td className="px-3 py-2">
                  <span className={severityBadgeClass(row.default_severity)}>{row.default_severity ? SEVERITY_LABELS[row.default_severity] : "—"}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {emptyText ? <div className="px-3 py-6 text-sm text-gray-500">{emptyText}</div> : null}
      </div>

      <ComplaintTypeModal
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
