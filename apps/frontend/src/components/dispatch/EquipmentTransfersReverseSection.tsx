import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { Link } from "react-router-dom";

type Transfer = { uuid: string; status: string; transfer_location: string; from_driver_uuid: string | null; to_driver_uuid: string | null; from_driver_name?: string | null; to_driver_name?: string | null };

export function EquipmentTransfersReverseSection({ companyId, equipmentId }: { companyId: string; equipmentId: string }) {
  const query = useQuery({
    queryKey: ["equipment-transfers", companyId, equipmentId],
    enabled: Boolean(companyId && equipmentId),
    queryFn: () => apiRequest<{ requests: Transfer[] }>(`/api/v1/dispatch/equipment-transfers/pending?operating_company_id=${encodeURIComponent(companyId)}&equipment_uuid=${encodeURIComponent(equipmentId)}`),
  });
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800">Equipment transfers</h3>
      {query.isError ? <p className="mt-2 text-sm text-red-700">Equipment transfers could not be loaded.</p> : null}
      {query.isLoading ? <p className="mt-2 text-sm text-gray-500">Loading equipment transfers…</p> : null}
      {!query.isLoading && !query.isError && (query.data?.requests ?? []).length === 0 ? <p className="mt-2 text-sm text-gray-500">No equipment transfers are linked to this trailer.</p> : null}
      <div className="mt-2 space-y-2">
        {(query.data?.requests ?? []).map((transfer) => <div key={transfer.uuid} className="p-2 text-sm"><Link className="font-medium text-slate-700 underline" to={`/dispatch/equipment-transfers?transfer_id=${encodeURIComponent(transfer.uuid)}`}>{transfer.status}</Link> · {transfer.transfer_location} · <EntityLinkOrTombstone kind="driver" id={transfer.from_driver_uuid} name={transfer.from_driver_name} noun="Driver" />{" → "}<EntityLinkOrTombstone kind="driver" id={transfer.to_driver_uuid} name={transfer.to_driver_name} noun="Driver" /></div>)}
      </div>
    </section>
  );
}
