import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  createMaintenanceReeferHoursLogEntry,
  fetchMaintenanceReeferHoursSnapshot,
  updateMaintenanceReeferSpecs,
} from "../../api/maintenance";

type ReeferSnapshot = Awaited<ReturnType<typeof fetchMaintenanceReeferHoursSnapshot>>;

export function TrailerReeferSection({
  trailerId,
  companyId,
}: {
  trailerId: string;
  companyId: string;
}) {
  const queryClient = useQueryClient();
  const [hoursInput, setHoursInput] = useState("");
  const [notesInput, setNotesInput] = useState("");

  const snapshotQ = useQuery({
    queryKey: ["reefer-hours-snapshot", trailerId, companyId],
    queryFn: () => fetchMaintenanceReeferHoursSnapshot(companyId, trailerId),
    enabled: Boolean(trailerId && companyId),
  });

  const manualMut = useMutation({
    mutationFn: () =>
      createMaintenanceReeferHoursLogEntry({
        operating_company_id: companyId,
        equipment_id: trailerId,
        hours_reading: Number(hoursInput),
        notes: notesInput,
      }),
    onSuccess: () => {
      setHoursInput("");
      setNotesInput("");
      void queryClient.invalidateQueries({ queryKey: ["reefer-hours-snapshot", trailerId, companyId] });
    },
  });

  const serviceMut = useMutation({
    mutationFn: (payload: { last_service_hours: number; last_service_date: string }) =>
      updateMaintenanceReeferSpecs({
        operating_company_id: companyId,
        equipment_id: trailerId,
        last_service_hours: payload.last_service_hours,
        last_service_date: payload.last_service_date,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reefer-hours-snapshot", trailerId, companyId] });
    },
  });

  if (snapshotQ.isLoading) {
    return (
      <section className="rounded border border-gray-200 bg-white p-4" data-testid="tp-reefer-a19-slot">
        <p className="text-xs text-gray-500">Loading reefer hours…</p>
      </section>
    );
  }

  const data = snapshotQ.data as ReeferSnapshot | undefined;
  const specs = data?.specs;
  const history = data?.history ?? [];

  const markService = () => {
    if (specs?.current_hours == null) return;
    serviceMut.mutate({
      last_service_hours: specs.current_hours,
      last_service_date: new Date().toISOString().slice(0, 10),
    });
  };

  return (
    <section className="rounded border border-gray-200 bg-white p-4" data-testid="tp-reefer-a19-slot">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">Reefer hours tracking</h2>
        {specs?.pm_status === "due" ? (
          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800" data-testid="reefer-pm-due">
            PM due
          </span>
        ) : specs?.pm_status === "near_due" ? (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">PM near due</span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Current hours" value={specs?.current_hours != null ? String(specs.current_hours) : "—"} />
        <Metric label="Brand" value={specs?.reefer_brand || "—"} />
        <Metric
          label="Service interval (hrs)"
          value={specs?.service_interval_hours != null ? String(specs.service_interval_hours) : "—"}
        />
        <Metric
          label="Hours until service"
          value={specs?.hours_until_service != null ? String(specs.hours_until_service) : "—"}
        />
      </div>

      <div className="mt-4 rounded border border-gray-100 bg-gray-50 p-3">
        <h3 className="text-xs font-semibold text-gray-700">Record hours (manual fallback)</h3>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs text-gray-600">
            Hours
            <input
              type="number"
              min={0}
              step="0.1"
              className="mt-1 block w-28 rounded border px-2 py-1 text-sm"
              value={hoursInput}
              onChange={(e) => setHoursInput(e.target.value)}
              data-testid="reefer-hours-input"
            />
          </label>
          <label className="text-xs text-gray-600">
            Notes
            <input
              type="text"
              className="mt-1 block w-48 rounded border px-2 py-1 text-sm"
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="rounded bg-[#1F2A44] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            disabled={!hoursInput || manualMut.isPending}
            onClick={() => manualMut.mutate()}
            data-testid="reefer-hours-record-btn"
          >
            Record hours
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 disabled:opacity-50"
            disabled={specs?.current_hours == null || serviceMut.isPending}
            onClick={markService}
            data-testid="reefer-mark-service-btn"
          >
            Mark service at current hours
          </button>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-xs font-semibold text-gray-700">Hours history</h3>
        {history.length === 0 ? (
          <p className="mt-1 text-xs text-gray-500">No readings yet — record manually or run Samsara ingest.</p>
        ) : (
          <table className="mt-2 w-full text-left text-xs" data-testid="reefer-hours-history">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-1 pr-2">Recorded</th>
                <th className="py-1 pr-2">Hours</th>
                <th className="py-1 pr-2">Source</th>
                <th className="py-1">Notes</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={String(row.id)} className="border-b border-gray-100">
                  <td className="py-1 pr-2">{String(row.recorded_at ?? "").slice(0, 16)}</td>
                  <td className="py-1 pr-2">{row.hours_reading}</td>
                  <td className="py-1 pr-2">{row.source_label}</td>
                  <td className="py-1">{row.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-100 p-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}
