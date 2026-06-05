import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { apiRequest } from "../../api/client";

type TransferRow = {
  id: string;
  equipment_id: string;
  from_driver_id: string;
  to_driver_id: string;
  dual_ack?: { dropoff_ack_at: string | null; pickup_ack_at: string | null } | null;
  dual_ack_complete?: boolean;
};

export function TransfersInProgressPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const query = useQuery({
    queryKey: ["fleet", "equipment-transfers", companyId],
    queryFn: () => {
      const qs = new URLSearchParams({ operating_company_id: companyId, status: "pending_to_confirm" });
      return apiRequest<{ rows: TransferRow[] }>(`/api/v1/equipment-transfers?${qs}`).then((r) => r.rows);
    },
    enabled: Boolean(companyId),
  });

  return (
    <div className="space-y-3" data-testid="transfers-in-progress-page">
      <h2 className="text-lg font-semibold text-slate-900">Equipment transfers in progress</h2>
      <p className="text-sm text-slate-500">Dual confirmation — pending until both drivers acknowledge.</p>
      {(query.data ?? []).map((row) => (
        <div key={row.id} className="rounded border border-gray-200 bg-white px-3 py-2 text-sm">
          Dropoff: {row.dual_ack?.dropoff_ack_at ? "✓" : "pending"} · Pickup: {row.dual_ack?.pickup_ack_at ? "✓" : "pending"}
        </div>
      ))}
    </div>
  );
}
