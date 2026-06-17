import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getGeofenceDwellReport, listGeofences, type GeofenceLocationKind } from "../../api/geofencing";
import { ReportsSubNav } from "./ReportsSubNav";

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

  return (
    <div className="space-y-4">
      <ReportsSubNav />
      <PageHeader
        title="Geofence dwell report"
        subtitle="Entry/exit dwell durations by customer site, yard, and vendor geofence."
        actions={
          <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!reportQuery.data}>
            Export CSV
          </Button>
        }
      />

      <section className="rounded border border-slate-200 bg-white p-3">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs text-slate-700">
            Start
            <DatePicker
              className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm"
              value={periodStart}
              onChange={(next) => setPeriodStart(next)}
            />
          </label>
          <label className="text-xs text-slate-700">
            End
            <DatePicker
              className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm"
              value={periodEnd}
              onChange={(next) => setPeriodEnd(next)}
            />
          </label>
          <label className="text-xs text-slate-700">
            Geofence
            <select
              className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm"
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
              className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm"
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
        <div className="rounded border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] uppercase text-slate-500">Visits</div>
          <div className="text-lg font-semibold text-slate-900">{summary.events}</div>
        </div>
        <div className="rounded border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] uppercase text-slate-500">Closed dwells</div>
          <div className="text-lg font-semibold text-slate-900">{summary.completedDwells}</div>
        </div>
        <div className="rounded border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] uppercase text-slate-500">Avg dwell</div>
          <div className="text-lg font-semibold text-slate-900">{minutesToClock(summary.avgDwell)}</div>
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-3">
        {reportQuery.isLoading ? <p className="text-sm text-slate-500">Loading report...</p> : null}
        <div className="overflow-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-600">
              <tr>
                <th className="px-2 py-2">Geofence</th>
                <th className="px-2 py-2">Kind</th>
                <th className="px-2 py-2">Unit</th>
                <th className="px-2 py-2">Driver</th>
                <th className="px-2 py-2">Entered</th>
                <th className="px-2 py-2">Exited</th>
                <th className="px-2 py-2">Dwell</th>
              </tr>
            </thead>
            <tbody>
              {(reportQuery.data?.rows ?? []).map((row) => (
                <tr key={`${row.geofence_id}-${row.unit_id}-${row.entered_at}`} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-medium text-slate-900">{row.geofence_label}</td>
                  <td className="px-2 py-2">{row.location_kind}</td>
                  <td className="px-2 py-2">{row.unit_number}</td>
                  <td className="px-2 py-2">{driverName(row.first_name, row.last_name)}</td>
                  <td className="px-2 py-2">{new Date(row.entered_at).toLocaleString()}</td>
                  <td className="px-2 py-2">{row.exited_at ? new Date(row.exited_at).toLocaleString() : "In yard"}</td>
                  <td className="px-2 py-2">{minutesToClock(row.dwell_minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
