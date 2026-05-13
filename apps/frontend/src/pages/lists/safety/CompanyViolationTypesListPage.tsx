import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCompanyViolationTypes, type CompanyViolationTypeRow } from "../../../api/catalogs-safety";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { CompanyViolationTypeModal } from "./CompanyViolationTypeModal";
import { ListsSubNav } from "../ListsSubNav";
import { PAGE_SHELL_CLASS } from "../../../components/layout/pageShellClasses";
import { STATUS_OPTIONS, statusPillClass, type StatusFilter } from "./shared";

function severityBadgeClass(severity: number) {
  if (severity <= 3) return "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
  if (severity <= 6) return "rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800";
  return "rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700";
}

export function CompanyViolationTypesListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("true");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<CompanyViolationTypeRow | null>(null);

  const query = useQuery({
    queryKey: ["catalogs", "safety", "company-violation-types", companyId, search, statusFilter],
    queryFn: () => listCompanyViolationTypes(companyId, { search: search || undefined, is_active: statusFilter, limit: 200, offset: 0 }),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  const emptyText = useMemo(() => {
    if (query.isLoading) return "Loading company violation types...";
    if (rows.length > 0) return "";
    return "No company violation types found.";
  }, [query.isLoading, rows.length]);

  return (
    <div className={`${PAGE_SHELL_CLASS} space-y-3`}>
      <ListsSubNav />
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Safety", "Company violation types"]}
        title="Company Violation Types"
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

      <div className="grid grid-cols-1 gap-2 rounded border border-gray-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by type code or type name" className="h-9 rounded border border-gray-300 px-2 text-sm sm:col-span-2 lg:col-span-2" />
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
              <th className="px-3 py-2 text-left">Type Code</th>
              <th className="px-3 py-2 text-left">Type Name</th>
              <th className="px-3 py-2 text-left">Default Severity</th>
              <th className="px-3 py-2 text-left">Default Fine</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => { setSelectedRow(row); setModalOpen(true); }}>
                <td className="px-3 py-2 text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.type_code}</td>
                <td className="px-3 py-2">{row.type_name}</td>
                <td className="px-3 py-2">
                  <span className={severityBadgeClass(Number(row.default_severity ?? 1))}>{Number(row.default_severity ?? 1)}</span>
                </td>
                <td className="px-3 py-2">{row.amount_cents ? `$${(row.amount_cents / 100).toFixed(2)}` : "—"}</td>
                <td className="px-3 py-2">
                  <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {emptyText ? <div className="px-3 py-6 text-sm text-gray-500">{emptyText}</div> : null}
      </div>

      <CompanyViolationTypeModal
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
