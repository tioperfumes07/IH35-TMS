import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listVehicleDriverHistory, type VehicleDriverHistoryRow } from "../../api/vehicleDriverPairing";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";

function formatDateTime(value: string | null) {
  if (!value) return "Current";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

const COLUMNS: Array<ParityColumn<VehicleDriverHistoryRow>> = [
  {
    key: "unit_number",
    label: "Unit",
    sortable: true,
    render: (row) => <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number, row.unit_id, "Unit")} className="font-medium text-gray-900" />,
  },
  {
    key: "driver_name",
    label: "Driver",
    sortable: true,
    render: (row) =>
      row.driver_name ? entityLabel(row.driver_name, row.driver_id, "Driver") : "Unassigned",
  },
  {
    key: "started_at",
    label: "Started",
    sortable: true,
    render: (row) => formatDateTime(row.started_at),
  },
  {
    key: "ended_at",
    label: "Ended",
    sortable: true,
    render: (row) => formatDateTime(row.ended_at),
  },
  {
    key: "source",
    label: "Source",
    sortable: true,
  },
];

type UnitDriverHistoryStripProps = {
  operatingCompanyId: string;
  unitId?: string;
  driverId?: string;
  days?: number;
};

export function UnitDriverHistoryStrip({ operatingCompanyId, unitId, driverId, days = 30 }: UnitDriverHistoryStripProps) {
  const enabled = Boolean(operatingCompanyId) && (Boolean(unitId) || Boolean(driverId));
  const historyQuery = useQuery({
    queryKey: ["vehicle-driver-history", operatingCompanyId, unitId, driverId, days],
    queryFn: () =>
      listVehicleDriverHistory({
        operating_company_id: operatingCompanyId,
        unit_id: unitId,
        driver_id: driverId,
        days,
      }),
    enabled,
  });

  const title = useMemo(() => {
    if (unitId && driverId) return "Driver-vehicle history";
    if (unitId) return "Unit driver history";
    return "Driver assignment history";
  }, [driverId, unitId]);

  const rows = historyQuery.data?.rows ?? [];

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="unit-driver-history-strip">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">Last {days} days</span>
      </div>
      {historyQuery.isError ? (
        <div className="mt-2" data-testid="unit-driver-history-error">
          <ListErrorState
            title="Couldn't load driver assignment history"
            status={0}
            message={(historyQuery.error as Error)?.message}
            onRetry={() => void historyQuery.refetch()}
          />
        </div>
      ) : (
        <div className="mt-2">
          <ParityTable
            columns={COLUMNS}
            rows={rows}
            rowKey={(row) => row.id}
            loading={historyQuery.isLoading}
            emptyText="No assignment windows found for this period."
            storageKey="unit-driver-history"
            tableTestId="unit-driver-history-table"
            rowTestId={(row) => `unit-driver-history-row-${row.id}`}
            initialPageSize={25}
          />
        </div>
      )}
    </section>
  );
}
