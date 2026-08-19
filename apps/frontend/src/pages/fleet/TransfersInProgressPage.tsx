import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";

type TransferRow = {
  id: string;
  equipment_id: string;
  equipment_number: string | null;
  from_driver_id: string;
  from_driver_name: string | null;
  to_driver_id: string;
  to_driver_name: string | null;
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
      <PageHeader
        backHref="/fleet"
        breadcrumb={["Fleet", "Transfers in progress"]}
        title="Equipment transfers in progress"
        subtitle="Dual confirmation — pending until both drivers acknowledge."
      />
      {!companyId ? (
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
          Select an operating company to view transfers.
        </div>
      ) : query.isLoading ? (
        <div className="rounded-sm border bg-white p-4 text-sm">Loading transfers…</div>
      ) : query.isError ? (
        <ListErrorState
          title="Couldn't load equipment transfers"
          status={0}
          message="The transfer queue is temporarily unavailable."
          onRetry={() => void query.refetch()}
        />
      ) : (query.data ?? []).length === 0 ? (
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
          No pending equipment transfers for this operating company.
        </div>
      ) : (
        (query.data ?? []).map((row) => (
          <div key={row.id} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm space-y-1">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span>
                Trailer:{" "}
                <EntityLinkOrTombstone kind="trailer" id={row.equipment_id} name={row.equipment_number} noun="Trailer" />
              </span>
              <span>
                From:{" "}
                <EntityLinkOrTombstone kind="driver" id={row.from_driver_id} name={row.from_driver_name} noun="Driver" />
              </span>
              <span>
                To:{" "}
                <EntityLinkOrTombstone kind="driver" id={row.to_driver_id} name={row.to_driver_name} noun="Driver" />
              </span>
            </div>
            <div className="text-xs text-gray-600">
              Dropoff: {row.dual_ack?.dropoff_ack_at ? "✓" : "pending"} · Pickup: {row.dual_ack?.pickup_ack_at ? "✓" : "pending"}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
