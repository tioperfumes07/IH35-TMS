import { useLocation, useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { BoardSection } from "../../components/v3/BoardSection";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { formatDateTimeUS } from "../../lib/formatDate";
import { resolveBackHref } from "../../lib/returnContext";

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
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  // ROUND 8.20 board20 — Fleet drills attach ?ret=; Back must restore origin.
  const fleetBackHref = resolveBackHref({ searchParams, pathname, fallback: "/fleet" });
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

  const columns = useMemo<ParityColumn<TransferRow>[]>(
    () => [
      {
        key: "equipment_number",
        label: "Trailer",
        sortable: true,
        render: (row) => (
          <EntityLinkOrTombstone kind="trailer" id={row.equipment_id} name={row.equipment_number} noun="Trailer" />
        ),
      },
      {
        key: "from_driver_name",
        label: "From",
        sortable: true,
        render: (row) => (
          <EntityLinkOrTombstone kind="driver" id={row.from_driver_id} name={row.from_driver_name} noun="Driver" />
        ),
      },
      {
        key: "to_driver_name",
        label: "To",
        sortable: true,
        render: (row) => (
          <EntityLinkOrTombstone kind="driver" id={row.to_driver_id} name={row.to_driver_name} noun="Driver" />
        ),
      },
      {
        key: "dropoff_ack_at",
        label: "Dropoff ack",
        sortable: true,
        sortValue: (row) => row.dual_ack?.dropoff_ack_at ?? "",
        render: (row) =>
          row.dual_ack?.dropoff_ack_at ? formatDateTimeUS(row.dual_ack.dropoff_ack_at) || "—" : "Pending",
      },
      {
        key: "pickup_ack_at",
        label: "Pickup ack",
        sortable: true,
        sortValue: (row) => row.dual_ack?.pickup_ack_at ?? "",
        render: (row) =>
          row.dual_ack?.pickup_ack_at ? formatDateTimeUS(row.dual_ack.pickup_ack_at) || "—" : "Pending",
      },
    ],
    [],
  );

  return (
    <div className="space-y-3" data-testid="transfers-in-progress-page">
      <PageHeader
        backHref={fleetBackHref}
        breadcrumb={["Fleet", "Transfers in progress"]}
        title="Equipment transfers in progress"
        subtitle="Dual confirmation — pending until both drivers acknowledge."
      />
      {!companyId ? (
        <BoardSection title="Equipment transfers" testId="transfers-need-company">
          <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company to view transfers.</p>
        </BoardSection>
      ) : query.isError ? (
        <ListErrorState
          title="Couldn't load equipment transfers"
          status={0}
          message="The transfer queue is temporarily unavailable."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <BoardSection
          title="Pending dual confirmation"
          subtitle="Dropoff and pickup must both acknowledge"
          testId="transfers-in-progress-board"
        >
          <ParityTable<TransferRow> appearance="board"
            columns={columns}
            rows={query.data ?? []}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            emptyText="No pending equipment transfers for this operating company."
            storageKey="fleet-transfers-in-progress"
            tableTestId="transfers-in-progress-table"
          />
        </BoardSection>
      )}
    </div>
  );
}
