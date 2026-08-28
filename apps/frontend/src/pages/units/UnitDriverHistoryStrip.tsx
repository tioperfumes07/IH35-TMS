import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listVehicleDriverHistory, type VehicleDriverHistoryRow } from "../../api/vehicleDriverPairing";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { Button } from "../../components/Button";

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
    render: (row) => <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" className="font-medium text-gray-900" />,
  },
  {
    key: "driver_name",
    label: "Driver",
    sortable: true,
    render: (row) =>
      row.driver_name ? <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" /> : "Unassigned",
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
  const pageSize = 25;
  const [page, setPage] = useState(0);
  const enabled = Boolean(operatingCompanyId) && (Boolean(unitId) || Boolean(driverId));
  const historyQuery = useQuery({
    queryKey: ["vehicle-driver-history", operatingCompanyId, unitId, driverId, days, page],
    queryFn: () =>
      listVehicleDriverHistory({
        operating_company_id: operatingCompanyId,
        unit_id: unitId,
        driver_id: driverId,
        days,
        limit: pageSize,
        offset: page * pageSize,
      }),
    enabled,
  });

  useEffect(() => setPage(0), [operatingCompanyId, unitId, driverId, days]);

  const title = useMemo(() => {
    if (unitId && driverId) return "Driver-vehicle history";
    if (unitId) return "Unit driver history";
    return "Driver assignment history";
  }, [driverId, unitId]);

  const rows = historyQuery.data?.rows ?? [];
  const totalCount = historyQuery.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

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
            hidePager
          />
          {!historyQuery.isError && totalCount > pageSize ? (
            <div className="mt-2 flex items-center justify-end gap-2 text-xs" data-testid="unit-driver-history-server-pager">
              <Button size="sm" variant="secondary" disabled={page <= 0 || historyQuery.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button>
              <span className="text-slate-600">Page {page + 1} of {pageCount} · {totalCount} assignments</span>
              <Button size="sm" variant="secondary" disabled={page + 1 >= pageCount || historyQuery.isFetching} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
