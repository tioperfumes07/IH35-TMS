import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DUTY_LABEL, fetchEldLiveDutyRoster, type HosRosterDriver } from "../../../api/eld";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { companyToday } from "../../../lib/businessDate";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";

function formatMinutes(min: number | null | undefined): string {
  if (min == null || Number.isNaN(min)) return "—";
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}h ${String(abs % 60).padStart(2, "0")}m`;
}

type Props = { operatingCompanyId: string };

export function LiveDutyTab({ operatingCompanyId }: Props) {
  const date = companyToday();
  const query = useQuery({
    queryKey: ["eld", "live-duty", operatingCompanyId, date],
    queryFn: () => fetchEldLiveDutyRoster(operatingCompanyId, date),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 60_000,
  });

  const rows = query.data?.drivers ?? [];
  const counts = query.data?.counts;

  const columns = useMemo<Array<ParityColumn<HosRosterDriver>>>(
    () => [
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        cellClass: "font-medium",
        render: (row) => <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} />,
      },
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="unit"
            id={row.unit_id}
            label={entityLabel(row.unit_number, row.unit_id, "Unit") ?? "—"}
            data-testid="eld-live-duty-unit-link"
          />
        ),
      },
      {
        key: "current_duty_status",
        label: "Duty",
        sortable: true,
        render: (row) =>
          row.current_duty_status ? DUTY_LABEL[row.current_duty_status] ?? row.current_duty_status : "—",
      },
      {
        key: "drive_remaining_min",
        label: "Drive left",
        sortable: true,
        render: (row) => formatMinutes(row.clocks?.drive_remaining_min),
      },
      {
        key: "window_remaining_min",
        label: "Shift left",
        sortable: true,
        render: (row) => formatMinutes(row.clocks?.window_remaining_min),
      },
      {
        key: "clocks.status",
        label: "Clock",
        sortable: true,
        render: (row) => (row.available ? row.clocks?.status ?? "—" : "unavailable"),
      },
      {
        key: "action",
        label: "Action",
        render: (row) => (
          <Link to={`/drivers/${row.driver_id}/hos`} className="font-semibold text-slate-700 hover:underline">
            Drill-down
          </Link>
        ),
      },
    ],
    [],
  );

  if (!operatingCompanyId) {
    return <p className="text-sm text-slate-600">Select an operating company to load live duty status.</p>;
  }

  return (
    <div className="space-y-3" data-testid="eld-live-duty-tab">
      <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
        <div className="text-sm font-semibold text-slate-800">Live Duty Status</div>
        <div className="text-[11px] text-slate-500">
          Canonical roster from <code className="text-[10px]">GET /api/v1/telematics/hos/daily-roster</code> · duty day{" "}
          {date} (America/Chicago). Refreshes every 60s.
        </div>
      </div>

      {counts ? (
        <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-5" data-testid="eld-live-duty-kpis">
          {(
            [
              ["On duty", counts.on_duty],
              ["Driving", counts.driving],
              ["Low hours", counts.low],
              ["Violation", counts.violation],
              ["Unavailable", counts.unavailable],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[10px] uppercase text-slate-700">{label}</div>
              <div className="text-xl font-semibold tabular-nums text-slate-900">{value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {query.isError ? (
        <ListErrorBanner
          message="Failed to load live duty roster. Retry or check telematics HOS ingest health."
          onRetry={() => void query.refetch()}
        />
      ) : null}

      <ParityTable<HosRosterDriver>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.driver_id}
        loading={query.isLoading}
        emptyText="No HOS duty events for this company today (honest empty — ingest may be quiet)."
        storageKey="eld-live-duty"
        exportFilename="eld-live-duty"
        tableTestId="eld-live-duty-table"
      />
    </div>
  );
}
