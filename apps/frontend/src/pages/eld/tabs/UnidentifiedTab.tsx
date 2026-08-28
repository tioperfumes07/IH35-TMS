import { entityLabel } from "../../../lib/entity-label";
import { useMemo } from "react";
import { EntityLink } from "../../../components/shared/EntityLink";
import { useQuery } from "@tanstack/react-query";
import { fetchEldUnidentifiedDriving, type FleetLocationHosRow } from "../../../api/eld";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";

function formatSpeed(speed: number | null | undefined): string {
  if (speed == null || Number.isNaN(Number(speed))) return "—";
  return `${Number(speed).toFixed(0)} mph`;
}

type Props = { operatingCompanyId: string };

export function UnidentifiedTab({ operatingCompanyId }: Props) {
  const query = useQuery({
    queryKey: ["eld", "unidentified", operatingCompanyId],
    queryFn: () => fetchEldUnidentifiedDriving(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 60_000,
  });

  const rows = query.isError ? [] : query.data?.rows ?? [];

  const columns = useMemo<Array<ParityColumn<FleetLocationHosRow>>>(
    () => [
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        cellClass: "font-medium",
        render: (row) => (
          <EntityLink
            kind="unit"
            id={row.unit_id}
            label={entityLabel(row.unit_number, row.unit_id, "Unit")}
            className="text-slate-700 hover:underline"
            data-testid="eld-unidentified-unit-link"
          />
        ),
      },
      {
        key: "city",
        label: "Location",
        sortable: true,
        render: (row) =>
          row.formatted_location ||
          [row.city, row.state].filter(Boolean).join(", ") ||
          "—",
      },
      {
        key: "speed_mph",
        label: "Speed",
        sortable: true,
        render: (row) => formatSpeed(row.speed_mph),
      },
      {
        key: "engine_state",
        label: "Engine",
        sortable: true,
        render: (row) => row.engine_state ?? "—",
      },
      {
        key: "captured_at_local",
        label: "Last fix",
        sortable: true,
        render: (row) => row.captured_at_local ?? "—",
      },
      {
        key: "driver_id",
        label: "Assigned driver",
        render: () => <span className="text-amber-800">Unassigned</span>,
      },
    ],
    [],
  );

  if (!operatingCompanyId) {
    return <p className="text-sm text-slate-600">Select an operating company to load unidentified driving.</p>;
  }

  return (
    <div className="space-y-3" data-testid="eld-unidentified-tab">
      <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
        <div className="text-sm font-semibold text-slate-800">Unidentified Driving</div>
        <div className="text-[11px] text-slate-500">
          Units from <code className="text-[10px]">GET /api/v1/telematics/fleet-location-hos</code> that are moving or
          engine-active with no Samsara-assigned driver. Not a separate FMCSA unidentified-event ingest — honest
          proxy from live telematics until a dedicated feed exists.
        </div>
      </div>

      {query.isError ? (
        <ListErrorBanner
          message="Failed to load fleet location / HOS feed for unidentified driving."
          onRetry={() => void query.refetch()}
        />
      ) : null}

      <ParityTable<FleetLocationHosRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.unit_id}
        loading={query.isLoading}
        emptyText="No unassigned units currently reporting motion or active engine."
        storageKey="eld-unidentified"
        exportFilename="eld-unidentified-driving"
        tableTestId="eld-unidentified-table"
      />
    </div>
  );
}
