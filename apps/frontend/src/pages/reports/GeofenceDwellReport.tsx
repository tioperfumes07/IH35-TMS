import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getGeofenceDwellReport, listGeofences, type GeofenceDwellRow, type GeofenceLocationKind } from "../../api/geofencing";
import { ReportsSubNav } from "./ReportsSubNav";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLink } from "../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

function minutesToClock(value: number | null) {
  if (value == null) return "In yard";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours}h ${minutes}m`;
}

function driverName(first: string | null, last: string | null) {
  const full = `${first ?? ""} ${last ?? ""}`.trim();
  return full || "Unpaired";
}

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function GeofenceDwellReport() {
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const [periodStart, setPeriodStart] = useState(monthStart);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [geofenceId, setGeofenceId] = useState("");
  const [locationKind, setLocationKind] = useState<GeofenceLocationKind | "">("");
  const [applied, setApplied] = useState({ periodStart: monthStart(), periodEnd: today(), geofenceId: "", locationKind: "" as GeofenceLocationKind | "" });

  const geofenceQuery = useQuery({
    queryKey: ["telematics", "geofences", operatingCompanyId],
    queryFn: () => listGeofences(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const reportQuery = useQuery({
    queryKey: ["reports", "geofence-dwell", operatingCompanyId, applied.periodStart, applied.periodEnd, applied.geofenceId, applied.locationKind],
    queryFn: () =>
      getGeofenceDwellReport({
        operating_company_id: operatingCompanyId,
        period_start: applied.periodStart,
        period_end: applied.periodEnd,
        geofence_id: applied.geofenceId || undefined,
        location_kind: (applied.locationKind || undefined) as GeofenceLocationKind | undefined,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  function exportCsv() {
    if (!reportQuery.data) return;
    const header = ["Geofence", "Kind", "Unit", "Driver", "Entered At", "Exited At", "Dwell Minutes", "Dwell Clock"];
    const lines = reportQuery.data.rows.map((row) =>
      [
        row.geofence_label,
        row.location_kind,
        row.unit_number,
        driverName(row.first_name, row.last_name),
        row.entered_at,
        row.exited_at ?? "",
        row.dwell_minutes ?? "",
        minutesToClock(row.dwell_minutes),
      ].join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `geofence-dwell-${applied.periodStart}-${applied.periodEnd}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const summary = useMemo(() => {
    const rows = reportQuery.data?.rows ?? [];
    const completed = rows.filter((row) => row.dwell_minutes != null);
    const total = completed.reduce((sum, row) => sum + (row.dwell_minutes ?? 0), 0);
    return {
      events: rows.length,
      completedDwells: completed.length,
      avgDwell: completed.length > 0 ? Math.round(total / completed.length) : 0,
    };
  }, [reportQuery.data?.rows]);

  const dwellRows = reportQuery.data?.rows ?? [];

  const columns = useMemo<ParityColumn<GeofenceDwellRow>[]>(
    () => [
      { key: "geofence_label", label: "Geofence", sortable: true, render: (row) => <span className="font-medium text-slate-900">{row.geofence_label}</span> },
      { key: "location_kind", label: "Kind", sortable: true },
      { key: "unit_number", label: "Unit", render: (row) => <EntityLink kind="unit" id={row.unit_id} label={row.unit_number} /> },
      { key: "driver", label: "Driver", render: (row) => <EntityLink kind="driver" id={row.driver_id ?? undefined} label={driverName(row.first_name, row.last_name)} /> },
      { key: "entered_at", label: "Entered", sortable: true, render: (row) => `${formatDateTimeUS(row.entered_at)} CT` },
      { key: "exited_at", label: "Exited", render: (row) => (row.exited_at ? `${formatDateTimeUS(row.exited_at)} CT` : "In yard") },
      { key: "dwell_minutes", label: "Dwell", sortable: true, render: (row) => minutesToClock(row.dwell_minutes) },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <ReportsSubNav />
      <PageHeader
        title="Geofence dwell report"
        subtitle="Entry/exit dwell durations by customer site, yard, and vendor geofence."
        backHref="/reports"
        breadcrumb={["Reports", "Geofence Dwell Report"]}
        actions={
          <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!reportQuery.data}>
            Export CSV
          </Button>
        }
      />

      <section className="rounded-sm border border-slate-200 bg-white p-3">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs text-slate-700">
            Start
            <DatePicker
              className="mt-1 block h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
              value={periodStart}
              onChange={(next) => setPeriodStart(next)}
            />
          </label>
          <label className="text-xs text-slate-700">
            End
            <DatePicker
              className="mt-1 block h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
              value={periodEnd}
              onChange={(next) => setPeriodEnd(next)}
            />
          </label>
          <label className="text-xs text-slate-700">
            Geofence
            <select
              className="mt-1 block h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
              value={geofenceId}
              onChange={(event) => setGeofenceId(event.target.value)}
            >
              <option value="">All geofences</option>
              {(geofenceQuery.data?.geofences ?? []).map((geofence) => (
                <option key={geofence.id} value={geofence.id}>
                  {geofence.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-700">
            Kind
            <select
              className="mt-1 block h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
              value={locationKind}
              onChange={(event) => setLocationKind(event.target.value as GeofenceLocationKind | "")}
            >
              <option value="">All kinds</option>
              <option value="customer_site">Customer site</option>
              <option value="yard">Yard</option>
              <option value="vendor_site">Vendor site</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            onClick={() =>
              setApplied({
                periodStart,
                periodEnd,
                geofenceId,
                locationKind,
              })
            }
          >
            Apply filters
          </Button>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-sm border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] uppercase text-slate-500">Visits</div>
          <div className="text-lg font-semibold text-slate-900">{summary.events}</div>
        </div>
        <div className="rounded-sm border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] uppercase text-slate-500">Closed dwells</div>
          <div className="text-lg font-semibold text-slate-900">{summary.completedDwells}</div>
        </div>
        <div className="rounded-sm border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] uppercase text-slate-500">Avg dwell</div>
          <div className="text-lg font-semibold text-slate-900">{minutesToClock(summary.avgDwell)}</div>
        </div>
      </section>

      <ParityTable
        rows={dwellRows}
        columns={columns}
        rowKey={(row) => `${row.geofence_id}-${row.unit_id}-${row.entered_at}`}
        loading={reportQuery.isPending || (reportQuery.isFetching && dwellRows.length === 0)}
        storageKey="geofence-dwell"
        emptyText="No dwell events for the current filters."
        exportFilename={`geofence-dwell-${applied.periodStart}-${applied.periodEnd}`}
      />
    </div>
  );
}
