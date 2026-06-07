import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listPreFlightDvirQueue,
  routePreFlightDvirDefect,
  setPreFlightDvirSeverity,
  type DvirSeverityLevel,
  type PreFlightDvirQueueRow,
} from "../../../api/maintenance";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";
import { useToast } from "../../../components/Toast";
import { PageHeader } from "../../../components/forms/shared/PageHeader";
import { DvirSeverityBadge } from "../../../components/maintenance/DvirSeverityBadge";

const TABS: Array<{ key: DvirSeverityLevel; label: string }> = [
  { key: "major", label: "Major" },
  { key: "minor", label: "Minor" },
  { key: "observation", label: "Observations" },
];

export function PreFlightDvirQueue() {
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<DvirSeverityLevel>("major");

  const q = useQuery({
    queryKey: ["maintenance", "pre-flight-dvir", operatingCompanyId, tab],
    queryFn: () => listPreFlightDvirQueue(operatingCompanyId, { severity: tab, status: "open" }),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = useMemo(() => q.data?.defects ?? [], [q.data?.defects]);

  const routeMut = useMutation({
    mutationFn: (defectId: string) => routePreFlightDvirDefect(defectId, operatingCompanyId),
    onSuccess: async (result) => {
      if (result.action === "work_order_created") {
        pushToast(`Work order ${result.display_id ?? result.work_order_id} created`, "success");
      } else if (result.action === "queued_next_pm") {
        pushToast("Queued for next PM service", "success");
      } else if (result.action === "logged_observation") {
        pushToast("Logged observation (no work order)", "success");
      } else {
        pushToast("Defect already routed", "info");
      }
      await qc.invalidateQueries({ queryKey: ["maintenance", "pre-flight-dvir", operatingCompanyId] });
    },
    onError: () => pushToast("Routing failed", "error"),
  });

  const downgradeMut = useMutation({
    mutationFn: (defectId: string) =>
      setPreFlightDvirSeverity(defectId, { operating_company_id: operatingCompanyId, severity: "minor" }),
    onSuccess: async () => {
      pushToast("Severity set to minor", "success");
      await qc.invalidateQueries({ queryKey: ["maintenance", "pre-flight-dvir", operatingCompanyId] });
    },
    onError: () => pushToast("Severity change blocked — Manager+ role required for major changes", "error"),
  });

  return (
    <div className="space-y-4" data-testid="pre-flight-dvir-queue">
      <PageHeader
        title="Pre-Flight DVIR Queue"
        subtitle="Major defects block dispatch (WF-050 / 49 CFR §396.11). Minor defects queue for next PM; observations log only."
      />

      <div className="flex items-center gap-2 border-b border-gray-200">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            data-testid={`dvir-severity-tab-${entry.key}`}
            onClick={() => setTab(entry.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === entry.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {entry.label}
          </button>
        ))}
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
              <th className="px-2 py-2">CFR Code</th>
              <th className="px-2 py-2">Work Order</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: PreFlightDvirQueueRow) => (
              <tr key={row.id} className="border-t border-gray-100 align-top" data-testid={`dvir-queue-row-${row.id}`}>
                <td className="truncate px-2 py-2">
                  {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "—"}
                </td>
                <td className="truncate px-2 py-2">{row.unit_number ?? row.unit_id}</td>
                <td className="truncate px-2 py-2">{row.driver_name ?? "—"}</td>
                <td className="truncate px-2 py-2" title={row.notes}>
                  {row.item_key}
                </td>
                <td className="px-2 py-2">
                  <DvirSeverityBadge severity={row.severity} />
                </td>
                <td className="truncate px-2 py-2">{row.major_defect_code ?? "—"}</td>
                <td className="px-2 py-2">
                  {row.auto_wo_id ? (
                    <Link
                      to={`/maintenance/work-orders/${row.auto_wo_id}`}
                      className="text-blue-700 underline"
                      data-testid={`dvir-wo-link-${row.id}`}
                    >
                      View WO
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    {!row.routed ? (
                      <Button size="sm" onClick={() => routeMut.mutate(row.id)} disabled={routeMut.isPending}>
                        {row.severity === "major" ? "Create WO" : "Route"}
                      </Button>
                    ) : null}
                    {row.severity === "major" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => downgradeMut.mutate(row.id)}
                        disabled={downgradeMut.isPending}
                      >
                        Downgrade to minor
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center text-sm text-gray-500">
                  No {tab} DVIR defects in this queue.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
