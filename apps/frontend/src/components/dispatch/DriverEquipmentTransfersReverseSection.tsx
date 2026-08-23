import { useQuery } from "@tanstack/react-query";
import { ListErrorState } from "../ListErrorState";
import { apiRequest } from "../../api/client";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

type Transfer = {
  uuid: string;
  equipment_uuid: string;
  equipment_kind: string;
  equipment_number?: string | null;
  status: string;
  transfer_location: string;
};

export function DriverEquipmentTransfersReverseSection({
  operatingCompanyId,
  driverId,
}: {
  operatingCompanyId: string;
  driverId: string;
}) {
  const query = useQuery({
    queryKey: ["driver-equipment-transfers", operatingCompanyId, driverId],
    enabled: Boolean(operatingCompanyId && driverId),
    queryFn: () =>
      apiRequest<{ requests: Transfer[] }>(
        `/api/v1/dispatch/equipment-transfers/pending?operating_company_id=${encodeURIComponent(operatingCompanyId)}&driver=${encodeURIComponent(driverId)}&direction=both`,
      ),
  });
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3">
      <h3 className="text-sm font-semibold text-gray-800">Equipment transfer history</h3>
      {query.isError ? <ListErrorState status={0} message="Equipment transfer history could not be loaded." onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <p className="mt-2 text-sm text-gray-500">Loading equipment transfer history…</p> : null}
      {!query.isLoading && !query.isError && (query.data?.requests ?? []).length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No equipment transfers are linked to this driver.</p>
      ) : null}
      <div className="mt-2 space-y-2">
        {(query.data?.requests ?? []).map((row) => (
          <div key={row.uuid} className="text-sm">
            <EntityLinkOrTombstone
              kind="trailer"
              id={row.equipment_uuid}
              name={row.equipment_number}
              noun={row.equipment_kind || "Equipment"}
            />{" "}
            · {row.status} · {row.transfer_location}
          </div>
        ))}
      </div>
    </section>
  );
}
