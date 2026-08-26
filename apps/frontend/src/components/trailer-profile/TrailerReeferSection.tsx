import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createMaintenanceReeferHoursLogEntry,
  fetchMaintenanceReeferHoursSnapshot,
  updateMaintenanceReeferSpecs,
  type MaintenanceReeferHoursLogRow,
} from "../../api/maintenance";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { userFacingApiError } from "../../lib/api-error-message";

type ReeferSnapshot = Awaited<ReturnType<typeof fetchMaintenanceReeferHoursSnapshot>>;

const HISTORY_COLUMNS: Array<ParityColumn<MaintenanceReeferHoursLogRow>> = [
  {
    key: "recorded_at",
    label: "Recorded",
    sortable: true,
    sortValue: (row) => new Date(row.recorded_at).getTime(),
    render: (row) => String(row.recorded_at ?? "").slice(0, 16),
  },
  {
    key: "hours_reading",
    label: "Hours",
    sortable: true,
    render: (row) => row.hours_reading,
  },
  {
    key: "source_label",
    label: "Source",
    sortable: true,
  },
  {
    key: "notes",
    label: "Notes",
    sortable: true,
    render: (row) => row.notes || "—",
  },
];

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
  const actionGenerationRef = useRef(0);
  const [manualError, setManualError] = useState<unknown>(null);
  const [serviceError, setServiceError] = useState<unknown>(null);

  const snapshotQ = useQuery({
    queryKey: ["reefer-hours-snapshot", trailerId, companyId],
    queryFn: () => fetchMaintenanceReeferHoursSnapshot(companyId, trailerId),
    enabled: Boolean(trailerId && companyId),
  });

  const manualMut = useMutation({
    mutationFn: (input: { companyId: string; trailerId: string; generation: number; hoursReading: number; notes: string }) =>
      createMaintenanceReeferHoursLogEntry({
        operating_company_id: input.companyId,
        equipment_id: input.trailerId,
        hours_reading: input.hoursReading,
        notes: input.notes,
      }),
    onMutate: () => setManualError(null),
    onSuccess: (_result, input) => {
      if (input.generation === actionGenerationRef.current) {
        setHoursInput("");
        setNotesInput("");
      }
      void queryClient.invalidateQueries({ queryKey: ["reefer-hours-snapshot", input.trailerId, input.companyId] });
    },
    onError: (error, input) => {
      if (input.generation === actionGenerationRef.current) setManualError(error);
    },
  });

  const serviceMut = useMutation({
    mutationFn: (input: { companyId: string; trailerId: string; generation: number; lastServiceHours: number; lastServiceDate: string }) =>
      updateMaintenanceReeferSpecs({
        operating_company_id: input.companyId,
        equipment_id: input.trailerId,
        last_service_hours: input.lastServiceHours,
        last_service_date: input.lastServiceDate,
      }),
    onMutate: () => setServiceError(null),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: ["reefer-hours-snapshot", input.trailerId, input.companyId] });
    },
    onError: (error, input) => {
      if (input.generation === actionGenerationRef.current) setServiceError(error);
    },
  });

  useEffect(() => {
    actionGenerationRef.current += 1;
    setHoursInput("");
    setNotesInput("");
    setManualError(null);
    setServiceError(null);
    manualMut.reset();
    serviceMut.reset();
  }, [companyId, trailerId]);

  const historyColumns = useMemo(() => HISTORY_COLUMNS, []);

  if (snapshotQ.isLoading) {
    return (
      <section className="rounded-sm border border-gray-200 bg-white p-4" data-testid="tp-reefer-a19-slot">
        <p className="text-xs text-gray-500">Loading reefer hours…</p>
      </section>
    );
  }

  if (snapshotQ.isError) {
    const err = snapshotQ.error as { status?: number; message?: string } | null;
    return (
      <section className="rounded-sm border border-gray-200 bg-white p-4" data-testid="tp-reefer-a19-slot">
        <h2 className="text-sm font-semibold text-gray-800">Reefer hours tracking</h2>
        <ListErrorState
          title="Couldn't load reefer hours"
          status={typeof err?.status === "number" ? err.status : 0}
          message={err?.message}
          onRetry={() => void snapshotQ.refetch()}
        />
      </section>
    );
  }

  const data = snapshotQ.data as ReeferSnapshot | undefined;
  const specs = data?.specs;
  const history = data?.history ?? [];

  const markService = () => {
    if (specs?.current_hours == null) return;
    serviceMut.mutate({
      companyId,
      trailerId,
      generation: actionGenerationRef.current,
      lastServiceHours: specs.current_hours,
      lastServiceDate: new Date().toISOString().slice(0, 10),
    });
  };

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4" data-testid="tp-reefer-a19-slot">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">Reefer hours tracking</h2>
        {specs?.pm_status === "due" ? (
          <span className="rounded-sm bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800" data-testid="reefer-pm-due">
            PM due
          </span>
        ) : specs?.pm_status === "near_due" ? (
          <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">PM near due</span>
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

      <div className="mt-4 rounded-sm border border-gray-100 bg-gray-50 p-3">
        <h3 className="text-xs font-semibold text-gray-700">Record hours (manual fallback)</h3>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs text-gray-600">
            Hours
            <input
              type="number"
              min={0}
              step="0.1"
              className="mt-1 block w-28 rounded-sm border px-2 py-1 text-sm"
              value={hoursInput}
              onChange={(e) => setHoursInput(e.target.value)}
              data-testid="reefer-hours-input"
            />
          </label>
          <label className="text-xs text-gray-600">
            Notes
            <input
              type="text"
              className="mt-1 block w-48 rounded-sm border px-2 py-1 text-sm"
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="rounded-sm bg-[#1F2A44] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            disabled={!hoursInput || manualMut.isPending}
            onClick={() =>
              manualMut.mutate({
                companyId,
                trailerId,
                generation: actionGenerationRef.current,
                hoursReading: Number(hoursInput),
                notes: notesInput,
              })
            }
            data-testid="reefer-hours-record-btn"
          >
            Record hours
          </button>
          <button
            type="button"
            className="rounded-sm border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 disabled:opacity-50"
            disabled={specs?.current_hours == null || serviceMut.isPending}
            onClick={markService}
            data-testid="reefer-mark-service-btn"
          >
            Mark service at current hours
          </button>
        </div>
        {manualError ? (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {userFacingApiError(manualError, "Could not record reefer hours")}
          </p>
        ) : null}
        {serviceError ? (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {userFacingApiError(serviceError, "Could not mark reefer service")}
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        <h3 className="text-xs font-semibold text-gray-700">Hours history</h3>
        <div className="mt-2">
          <ParityTable
            storageKey="trailer-reefer-hours-history"
            tableTestId="reefer-hours-history"
            columns={historyColumns}
            rows={history}
            rowKey={(row) => String(row.id)}
            emptyText="No readings yet — record manually or run Samsara ingest."
            initialPageSize={20}
            pageSizeOptions={[10, 20, 50]}
          />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-gray-100 p-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}
