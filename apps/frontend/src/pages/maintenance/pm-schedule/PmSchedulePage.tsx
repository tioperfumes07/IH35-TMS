import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createMaintenancePmSchedule, generateMaintenancePmWorkOrder, listMaintenancePmSchedules } from "../../../api/maintenance";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";

export function PmSchedulePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["maintenance", "pm-schedule", companyId],
    queryFn: () => listMaintenancePmSchedules(companyId),
    enabled: Boolean(companyId),
  });

  const createM = useMutation({
    mutationFn: () =>
      createMaintenancePmSchedule({
        operating_company_id: companyId,
        unit_id: "00000000-0000-0000-0000-000000000000",
        pm_type: "oil change",
        interval_kind: "miles",
        interval_value: 10000,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["maintenance", "pm-schedule", companyId] });
    },
  });

  const generateM = useMutation({
    mutationFn: (id: string) => generateMaintenancePmWorkOrder(id, companyId),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">PM Schedule</h2>
        <Button type="button" onClick={() => createM.mutate()} disabled={!companyId}>
          + Create
        </Button>
      </div>
      <div className="rounded border border-gray-200 bg-white p-3 text-sm">
        <div className="mb-2 text-xs text-gray-500">Due-soon threshold is company-configurable (days/miles/hours).</div>
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] uppercase text-gray-600">
            <tr>
              <th className="py-1">Unit</th>
              <th className="py-1">PM Type</th>
              <th className="py-1">Interval</th>
              <th className="py-1">Status</th>
              <th className="py-1 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(listQ.data?.rows ?? []).map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="py-1">{row.unit_display_id}</td>
                <td className="py-1">{row.pm_type}</td>
                <td className="py-1">{row.interval_value} {row.interval_kind}</td>
                <td className="py-1">{row.status}</td>
                <td className="py-1 text-right">
                  <button
                    type="button"
                    className="rounded border border-gray-300 px-2 py-0.5 text-[11px]"
                    onClick={() => generateM.mutate(row.id)}
                    disabled={generateM.isPending}
                  >
                    Generate WO
                  </button>
                </td>
              </tr>
            ))}
            {(listQ.data?.rows ?? []).length === 0 ? (
              <tr>
                <td className="py-3 text-gray-500" colSpan={5}>
                  No PM schedules yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
