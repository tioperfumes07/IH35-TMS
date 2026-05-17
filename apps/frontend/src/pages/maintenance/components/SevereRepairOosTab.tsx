import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listUnits } from "../../../api/mdata";
import {
  completeWorkOrder,
  getSevereRepairRollup,
  listSevereRepairEstimates,
  markUnitBackInService,
  markUnitOos,
  refreshSevereRepairEstimate,
  type SevereRepairEstimate,
} from "../../../api/maintenance";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type Props = {
  operatingCompanyId: string;
};

function money(cents: number) {
  return `$${(Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function asDays(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "0";
  return String(Math.max(0, Math.round(value)));
}

function severityBadgeClass(severity: string) {
  if (severity === "total_loss") return "bg-red-100 text-red-800 border-red-300";
  if (severity === "out_of_service") return "bg-amber-100 text-amber-800 border-amber-300";
  return "bg-orange-100 text-orange-800 border-orange-300";
}

export function SevereRepairOosTab({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [markOosOpen, setMarkOosOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [oosReason, setOosReason] = useState("");
  const [oosLocation, setOosLocation] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnEstimate, setReturnEstimate] = useState<SevereRepairEstimate | null>(null);

  const estimatesQuery = useQuery({
    queryKey: ["maintenance", "severe-estimates", operatingCompanyId],
    queryFn: () => listSevereRepairEstimates(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });
  const rollupQuery = useQuery({
    queryKey: ["maintenance", "severe-rollup", operatingCompanyId],
    queryFn: () => getSevereRepairRollup(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });
  const unitsQuery = useQuery({
    queryKey: ["mdata", "units-for-oos", operatingCompanyId],
    queryFn: () => listUnits({ operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId) && markOosOpen,
  });

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["maintenance", "severe-estimates", operatingCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["maintenance", "severe-rollup", operatingCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["maintenance", "dashboard", "kpis", operatingCompanyId] }),
    ]);
  };

  const refreshMutation = useMutation({
    mutationFn: async (estimateId: string) => refreshSevereRepairEstimate(estimateId, operatingCompanyId),
    onSuccess: async () => {
      pushToast("Estimate refreshed", "success");
      await refreshAll();
    },
    onError: (error) => pushToast(String((error as Error)?.message ?? "Failed to refresh estimate"), "error"),
  });

  const completeMutation = useMutation({
    mutationFn: async (estimate: SevereRepairEstimate) => {
      if (!estimate.trigger_wo_id) throw new Error("No linked work order.");
      return completeWorkOrder(estimate.trigger_wo_id, operatingCompanyId);
    },
    onSuccess: async () => {
      pushToast("Linked work order marked complete", "success");
      await refreshAll();
    },
    onError: (error) => pushToast(String((error as Error)?.message ?? "Failed to complete work order"), "error"),
  });

  const markOosMutation = useMutation({
    mutationFn: async () =>
      markUnitOos(selectedUnitId, {
        operating_company_id: operatingCompanyId,
        reason: oosReason.trim(),
        oos_location: oosLocation.trim() || undefined,
      }),
    onSuccess: async () => {
      pushToast("Unit marked OOS", "success");
      setMarkOosOpen(false);
      setSelectedUnitId("");
      setOosReason("");
      setOosLocation("");
      await refreshAll();
    },
    onError: (error) => pushToast(String((error as Error)?.message ?? "Failed to mark unit OOS"), "error"),
  });

  const returnMutation = useMutation({
    mutationFn: async () => {
      if (!returnEstimate) throw new Error("No unit selected.");
      return markUnitBackInService(returnEstimate.unit_id, {
        operating_company_id: operatingCompanyId,
        review_notes: returnNotes.trim(),
      });
    },
    onSuccess: async () => {
      pushToast("Unit returned to service", "success");
      setReturnOpen(false);
      setReturnNotes("");
      setReturnEstimate(null);
      await refreshAll();
    },
    onError: (error) => pushToast(String((error as Error)?.message ?? "Failed to return unit to service"), "error"),
  });

  const estimates = estimatesQuery.data?.data ?? [];
  const rollup = rollupQuery.data?.data ?? { open_count: 0, total_cents: 0, avg_days_oos: 0, oldest_oos_days: 0 };
  const openByUnit = useMemo(() => {
    const map = new Map<string, number>();
    for (const estimate of estimates) {
      map.set(estimate.unit_id, (map.get(estimate.unit_id) ?? 0) + 1);
    }
    return map;
  }, [estimates]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">Total to bring fleet back online</div>
            <div className="text-lg font-semibold">{money(rollup.total_cents)}</div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">OOS units</div>
            <div className="text-lg font-semibold">{rollup.open_count}</div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">Average days OOS</div>
            <div className="text-lg font-semibold">{asDays(rollup.avg_days_oos)}</div>
          </div>
        </div>
        <div className="ml-3">
          <Button size="sm" onClick={() => setMarkOosOpen(true)}>
            Mark Unit OOS
          </Button>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 uppercase text-gray-600">
              <tr>
                <th className="px-2 py-2">Unit</th>
                <th className="px-2 py-2">Severity</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2">Location</th>
                <th className="px-2 py-2">Labor</th>
                <th className="px-2 py-2">Parts</th>
                <th className="px-2 py-2">Outside</th>
                <th className="px-2 py-2">Total</th>
                <th className="px-2 py-2">Days OOS</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {estimates.map((row) => (
                <tr key={row.id} className="border-t border-gray-100 align-top">
                  <td className="px-2 py-2 font-semibold">{row.unit_number ?? row.unit_id.slice(0, 8)}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${severityBadgeClass(row.damage_severity)}`}>
                      {row.damage_severity}
                    </span>
                  </td>
                  <td className="max-w-56 px-2 py-2">{row.description || "—"}</td>
                  <td className="px-2 py-2">{row.estimate_location || "—"}</td>
                  <td className="px-2 py-2">{money(row.estimated_labor_cents)}</td>
                  <td className="px-2 py-2">{money(row.estimated_parts_cents)}</td>
                  <td className="px-2 py-2">{money(row.estimated_outside_service_cents)}</td>
                  <td className="px-2 py-2 font-semibold">{money(row.estimated_total_cents)}</td>
                  <td className="px-2 py-2">{asDays(row.days_oos)}</td>
                  <td className="px-2 py-2">{row.estimate_status}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="secondary" loading={refreshMutation.isPending} onClick={() => void refreshMutation.mutateAsync(row.id)}>
                        Refresh
                      </Button>
                      <Button size="sm" variant="secondary" disabled onClick={() => pushToast("Approve estimate follows Owner workflow route in next iteration", "info")}>
                        Approve estimate
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!row.trigger_wo_id}
                        loading={completeMutation.isPending}
                        onClick={() => void completeMutation.mutateAsync(row)}
                      >
                        Mark complete
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={(openByUnit.get(row.unit_id) ?? 0) > 0}
                        onClick={() => {
                          setReturnEstimate(row);
                          setReturnNotes("");
                          setReturnOpen(true);
                        }}
                      >
                        Return to service
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {estimates.length === 0 ? (
          <div className="px-3 py-4 text-sm text-gray-500">No severe repairs or OOS units</div>
        ) : null}
      </div>

      <Modal open={markOosOpen} onClose={() => setMarkOosOpen(false)} title="Mark Unit OOS">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Unit</label>
            <SelectCombobox
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={selectedUnitId}
              onChange={(event) => setSelectedUnitId(event.target.value)}
            >
              <option value="">Select unit</option>
              {(unitsQuery.data?.units ?? []).map((unit) => {
                const row = unit as Record<string, unknown>;
                return (
                  <option key={String(row.id ?? "")} value={String(row.id ?? "")}>
                    {String(row.unit_number ?? row.id ?? "")}
                  </option>
                );
              })}
            </SelectCombobox>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Reason</label>
            <textarea
              className="min-h-20 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={oosReason}
              onChange={(event) => setOosReason(event.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Location (optional)</label>
            <input
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={oosLocation}
              onChange={(event) => setOosLocation(event.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              loading={markOosMutation.isPending}
              disabled={!selectedUnitId || oosReason.trim().length < 5}
              onClick={() => void markOosMutation.mutateAsync()}
            >
              Submit
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={returnOpen} onClose={() => setReturnOpen(false)} title="Return Unit to Service">
        <div className="space-y-3">
          <div className="text-sm text-gray-700">
            Unit: <span className="font-semibold">{returnEstimate?.unit_number ?? "—"}</span>
          </div>
          <div className="text-xs text-gray-500">
            Disabled if open estimates exist. Open count: <span className="font-semibold">{returnEstimate ? openByUnit.get(returnEstimate.unit_id) ?? 0 : 0}</span>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Review Notes</label>
            <textarea
              className="min-h-24 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={returnNotes}
              onChange={(event) => setReturnNotes(event.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              loading={returnMutation.isPending}
              disabled={!returnEstimate || (openByUnit.get(returnEstimate.unit_id) ?? 0) > 0 || returnNotes.trim().length < 10}
              onClick={() => void returnMutation.mutateAsync()}
            >
              Submit
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
