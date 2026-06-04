import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listMaintenanceDvirDefects,
  triageMaintenanceDvirDefect,
  type DvirDefectInboxRow,
  type DvirDefectTriageStatus,
} from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { PageHeader } from "../../components/forms/shared/PageHeader";

export function DefectsInboxPage() {
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"pending" | DvirDefectTriageStatus | "all">("pending");

  const q = useQuery({
    queryKey: ["maintenance", "dvir-defects", operatingCompanyId, statusFilter],
    queryFn: () =>
      listMaintenanceDvirDefects(operatingCompanyId, {
        status: statusFilter === "all" ? "all" : statusFilter,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = useMemo(() => q.data?.defects ?? [], [q.data?.defects]);

  const triageMut = useMutation({
    mutationFn: (args: { id: string; action: "assign" | "escalate" | "close_no_action" | "convert_to_wo" }) =>
      triageMaintenanceDvirDefect(args.id, {
        operating_company_id: operatingCompanyId,
        action: args.action,
      }),
    onSuccess: async (result) => {
      if (result.work_order_id) {
        pushToast(`Work order ${result.display_id ?? result.work_order_id} created`, "success");
      } else {
        pushToast("Defect triage updated", "success");
      }
      await qc.invalidateQueries({ queryKey: ["maintenance", "dvir-defects", operatingCompanyId] });
    },
    onError: () => pushToast("Triage action failed", "error"),
  });

  return (
    <div className="space-y-4" data-testid="maint-dvir-defects-inbox">
      <PageHeader title="DVIR Defects" subtitle="Review driver-submitted defects and triage into work orders." />
      <div className="flex items-center justify-end">
        <SelectCombobox
          className="h-9 rounded border border-gray-300 px-2 text-sm"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          aria-label="Triage status filter"
        >
          <option value="pending">Pending</option>
          <option value="assigned">Assigned</option>
          <option value="escalated">Escalated</option>
          <option value="converted">Converted</option>
          <option value="closed">Closed (no action)</option>
          <option value="all">All</option>
        </SelectCombobox>
      </div>

      <div className="overflow-hidden rounded border border-gray-200 bg-white">
        <table className="w-full table-fixed text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-2">Submitted</th>
              <th className="px-2 py-2">Unit</th>
              <th className="px-2 py-2">Driver</th>
              <th className="px-2 py-2">Item</th>
              <th className="px-2 py-2">Severity</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: DvirDefectInboxRow) => (
              <tr key={row.id} className="border-t border-gray-100 align-top" data-testid={`defect-row-${row.id}`}>
                <td className="truncate px-2 py-2">
                  {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "—"}
                </td>
                <td className="truncate px-2 py-2">{row.unit_number ?? row.unit_id}</td>
                <td className="truncate px-2 py-2">{row.driver_name ?? "—"}</td>
                <td className="truncate px-2 py-2">{row.item_key}</td>
                <td className="px-2 py-2">
                  <span className={row.severity === "major" ? "font-semibold text-red-700" : "text-amber-700"}>
                    {row.severity}
                  </span>
                </td>
                <td className="px-2 py-2">{row.triage_status}</td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Link
                      to={`/maintenance/defects/${row.id}`}
                      className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:bg-gray-50"
                      data-testid={`defect-detail-link-${row.id}`}
                    >
                      Detail
                    </Link>
                    <Button size="sm" variant="secondary" onClick={() => triageMut.mutate({ id: row.id, action: "assign" })}>
                      Assign
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => triageMut.mutate({ id: row.id, action: "escalate" })}>
                      Escalate
                    </Button>
                    <Button size="sm" onClick={() => triageMut.mutate({ id: row.id, action: "convert_to_wo" })}>
                      Convert to WO
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-sm text-gray-500">
                  No DVIR defects in this queue.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
