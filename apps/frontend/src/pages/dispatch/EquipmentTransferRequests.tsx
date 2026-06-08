import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EquipmentTransferModal } from "../../components/dispatch/EquipmentTransferModal";

type TransferRow = {
  uuid: string;
  equipment_kind: string;
  status: string;
  transfer_location: string;
  from_driver_uuid: string | null;
  to_driver_uuid: string | null;
  created_at: string;
};

export function EquipmentTransferRequests() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [showModal, setShowModal] = useState(false);

  const query = useQuery({
    queryKey: ["dispatch", "equipment-transfers", companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      apiRequest<{ requests: TransferRow[] }>(
        `/api/v1/dispatch/equipment-transfers/pending?operating_company_id=${encodeURIComponent(companyId)}`
      ),
  });

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Equipment transfer requests" subtitle="Dual-confirm handoff queue" />
      <button type="button" className="rounded bg-blue-600 px-3 py-2 text-white" onClick={() => setShowModal(true)}>
        New transfer
      </button>
      {companyId ? (
        <EquipmentTransferModal
          open={showModal}
          operatingCompanyId={companyId}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            void query.refetch();
          }}
        />
      ) : null}
      <div className="overflow-x-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">From → To</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.requests ?? []).map((row) => (
              <tr key={row.uuid}>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">{row.equipment_kind}</td>
                <td className="px-3 py-2">{row.transfer_location}</td>
                <td className="px-3 py-2">
                  {row.from_driver_uuid?.slice(0, 8)} → {row.to_driver_uuid?.slice(0, 8)}
                </td>
                <td className="px-3 py-2">{row.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default EquipmentTransferRequests;

export { EquipmentTransferRequests as EquipmentTransferRequestsPage };
