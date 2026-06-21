import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDotViolationTypes, type DotBasicCategory, type DotViolationTypeRow } from "../../../api/catalogs-safety";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { DotViolationTypeModal } from "./DotViolationTypeModal";
import { ListsSubNav } from "../ListsSubNav";
import { STATUS_OPTIONS, statusPillClass, type StatusFilter } from "./shared";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

const CATEGORY_LABELS: Record<DotBasicCategory, string> = {
  unsafe_driving: "Unsafe Driving",
  hours_of_service: "Hours of Service",
  driver_fitness: "Driver Fitness",
  controlled_substances: "Controlled Substances/Alcohol",
  vehicle_maintenance: "Vehicle Maintenance",
  crash_indicator: "Crash Indicator",
};

function severityBadgeClass(weight: number | null) {
  if (weight == null) return "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500";
  if (weight <= 3) return "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
  if (weight <= 6) return "rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800";
  return "rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700";
}

export function DotViolationTypesListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("true");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<DotViolationTypeRow | null>(null);

  const query = useQuery({
    queryKey: ["catalogs", "safety", "dot-violation-types", companyId, search, statusFilter],
    queryFn: () => listDotViolationTypes(companyId, { search: search || undefined, is_active: statusFilter, limit: 200, offset: 0 }),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  const emptyText = useMemo(() => {
    if (query.isLoading) return "Loading DOT violation types...";
    if (rows.length > 0) return "";
    return "No DOT violation types found.";
  }, [query.isLoading, rows.length]);

  return (
    <div className="space-y-3">
      <ListsSubNav />
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Safety", "DOT violation types"]}
        title="DOT Violation Types"
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
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by code or name" className="h-9 rounded border border-gray-300 px-2 text-sm md:col-span-2" />
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
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">BASIC Category</th>
              <th className="px-3 py-2 text-left">Severity</th>
              <th className="px-3 py-2 text-left">OOS</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => { setSelectedRow(row); setModalOpen(true); }}>
                <td className="px-3 py-2 text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.violation_code}</td>
                <td className="px-3 py-2">{row.display_name}</td>
                <td className="px-3 py-2 text-slate-700">{row.basic_category ? CATEGORY_LABELS[row.basic_category] : "—"}</td>
                <td className="px-3 py-2">
                  <span className={severityBadgeClass(row.severity_weight)}>{row.severity_weight ?? "—"}</span>
                </td>
                <td className="px-3 py-2 text-slate-700">{row.is_oos ? "Yes" : "—"}</td>
                <td className="px-3 py-2">
                  <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {emptyText ? <div className="px-3 py-6 text-sm text-gray-500">{emptyText}</div> : null}
      </div>

      <DotViolationTypeModal
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
