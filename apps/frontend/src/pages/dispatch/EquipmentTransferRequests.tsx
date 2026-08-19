import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EquipmentTransferModal } from "../../components/dispatch/EquipmentTransferModal";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";

type TransferRow = {
  uuid: string;
  equipment_uuid: string;
  equipment_number?: string | null;
  equipment_kind: string;
  status: string;
  transfer_location: string;
  from_driver_uuid: string | null;
  to_driver_uuid: string | null;
  from_driver_name?: string | null;
  to_driver_name?: string | null;
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

  // Migrated to the shared QBO-parity grid — columns and order preserved verbatim (§7 additive-only).
  const columns = useMemo<ParityColumn<TransferRow>[]>(
    () => [
      { key: "status", label: "Status", sortable: true },
      {
        key: "equipment_uuid",
        label: "Equipment",
        sortable: true,
        sortValue: (row) => row.equipment_number ?? row.equipment_kind,
        render: (row) => (
          <EntityLinkOrTombstone
            kind="trailer"
            id={row.equipment_uuid}
            name={row.equipment_number}
            noun={row.equipment_kind === "chassis" ? "Chassis" : "Trailer"}
            data-testid="equipment-transfer-trailer-link"
          />
        ),
      },
      { key: "equipment_kind", label: "Kind", sortable: true, defaultHidden: true },
      { key: "transfer_location", label: "Location", sortable: true },
      {
        key: "from_driver_uuid",
        label: "From → To",
        render: (row) => (
          <>
            {/* Raw-uuid display class: this used to print a truncated driver uuid — an opaque hex fragment —
                while the driver's NAME was one LEFT JOIN away in the list query. Show the name; fall back to the
                truncated id ONLY when the payload carried none, so a uuid here means MISSING DATA rather than
                normal rendering. */}
            <EntityLinkOrTombstone
              kind="driver"
              id={row.from_driver_uuid}
              name={row.from_driver_name}
              noun="Driver"
            />{" "}
            →{" "}
            <EntityLinkOrTombstone
              kind="driver"
              id={row.to_driver_uuid}
              name={row.to_driver_name}
              noun="Driver"
            />
          </>
        ),
      },
      { key: "created_at", label: "Created", sortable: true },
    ],
    [],
  );

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Equipment transfer requests" subtitle="Dual-confirm handoff queue" />
      <button type="button" className="rounded-sm bg-[#1F2A44] px-3 py-2 text-white" onClick={() => setShowModal(true)}>
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
      {query.isError ? (
        <ListErrorState
          title="Couldn't load equipment transfer requests"
          {...formatQueryErrorDetail(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable<TransferRow>
        columns={columns}
        rows={query.data?.requests ?? []}
        rowKey={(row) => row.uuid}
        loading={query.isLoading}
        emptyText="No pending equipment transfer requests."
        storageKey="dispatch-equipment-transfer-requests"
        exportFilename="equipment-transfer-requests"
        />
      )}
    </div>
  );
}

export default EquipmentTransferRequests;

export { EquipmentTransferRequests as EquipmentTransferRequestsPage };
