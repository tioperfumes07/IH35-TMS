/**
 * E-44 — Stops + miles section (Round 306). Consumes GET /api/v1/telematics/stop-events.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";

export type StopEventRow = {
  unit_id: string;
  unit_number: string | null;
  started_at: string;
  ended_at: string;
  dwell_minutes: number;
  city: string | null;
  state: string | null;
  odometer_mi: number | null;
  odometer_note: string;
  miles_since_previous_stop: number | null;
  miles_note: string;
  geofence_label: string | null;
  driver_id: string | null;
  driver_label: string | null;
};

function listStopEvents(
  companyId: string,
  params: { unitId?: string; driverId?: string; hours?: number }
) {
  const q = new URLSearchParams({ operating_company_id: companyId });
  if (params.unitId) q.set("unit_id", params.unitId);
  if (params.driverId) q.set("driver_id", params.driverId);
  if (params.hours != null) q.set("hours", String(params.hours));
  return apiRequest<{ rows: StopEventRow[]; hours: number; computed: boolean }>(
    `/api/v1/telematics/stop-events?${q.toString()}`
  );
}

export function StopsMilesSection({
  unitId,
  driverId,
  hours = 24,
}: {
  unitId?: string;
  driverId?: string;
  hours?: number;
}) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const enabled = Boolean(companyId && (unitId || driverId));

  const q = useQuery({
    queryKey: ["telematics", "stop-events", companyId, unitId ?? "", driverId ?? "", hours],
    queryFn: () => listStopEvents(companyId, { unitId, driverId, hours }),
    enabled,
  });

  const rows = useMemo(() => (q.isError ? [] : q.data?.rows ?? []), [q.data?.rows, q.isError]);

  const columns = useMemo<ParityColumn<StopEventRow>[]>(
    () => [
      {
        key: "started_at",
        label: "Stopped",
        sortable: true,
        render: (row) => `${formatDateTimeUS(row.started_at)} CT`,
      },
      {
        key: "dwell_minutes",
        label: "Dwell min",
        sortable: true,
        render: (row) => String(row.dwell_minutes),
      },
      ...(driverId
        ? ([
            {
              key: "unit_id",
              label: "Unit",
              render: (row: StopEventRow) => (
                <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />
              ),
            },
          ] as ParityColumn<StopEventRow>[])
        : ([
            {
              key: "driver_id",
              label: "Driver",
              render: (row: StopEventRow) =>
                row.driver_id ? (
                  <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_label} noun="Driver" />
                ) : (
                  "—"
                ),
            },
          ] as ParityColumn<StopEventRow>[])),
      {
        key: "place",
        label: "Place",
        render: (row) =>
          row.geofence_label ?? ([row.city, row.state].filter(Boolean).join(", ") || "—"),
      },
      {
        key: "odometer_mi",
        label: "Odometer",
        sortable: true,
        render: (row) => (row.odometer_mi == null ? "—" : row.odometer_mi.toFixed(1)),
      },
      {
        key: "miles_since_previous_stop",
        label: "Miles since prior",
        sortable: true,
        render: (row) =>
          row.miles_since_previous_stop == null ? "—" : row.miles_since_previous_stop.toFixed(1),
      },
    ],
    [driverId],
  );

  return (
    <section
      id="stops-miles"
      className="scroll-mt-4 space-y-2 rounded-sm border border-gray-200 bg-white p-4"
      data-testid="stops-miles-section"
    >
      <h3 className="text-xs font-semibold text-gray-800">Stops + miles (last {hours} h)</h3>
      <p className="text-xs text-[#4B5563]">
        Every stop over 3 minutes with odometer and miles since the prior stop — from the stop-odometer engine. Never
        interpolated.
      </p>
      {q.isError ? (
        <ListErrorState
          title="Couldn't load stops"
          status={0}
          message={(q.error as Error)?.message}
          onRetry={() => void q.refetch()}
        />
      ) : (
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => `${row.unit_id}-${row.started_at}`}
          loading={q.isLoading}
          storageKey={unitId ? `stops-miles-unit-${unitId}` : `stops-miles-driver-${driverId}`}
          emptyText="No stops ≥ 3 minutes in this window."
          exportFilename="stop-events"
        />
      )}
    </section>
  );
}
