import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDateUS } from "../../../lib/formatDate";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { createDotInspection, listDotInspections, uploadDotInspectionPdf, voidDotInspection } from "../../../api/safetyV64";
import { followUpDotInspectionEvent, listDotInspectionEvents } from "../../../api/safety";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { companyToday } from "../../../lib/businessDate";
import { Button } from "../../../components/Button";
import { useListState } from "../../../components/list-state";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { InspectionScoreBadge } from "../../../components/safety/InspectionScoreBadge";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { VoidReasonModal } from "../../../components/accounting/VoidReasonModal";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useStagedListFilters } from "../../../components/table";
import { entityLabel } from "../../../lib/entity-label";
import { userFacingApiError } from "../../../lib/api-error-message";
import { ConfirmModal } from "../../../components/shared/ConfirmModal";

const EMPTY_FILTERS = { driverId: "", unitId: "", trailerId: "" };

const emptyInspectionForm = (trailerId = "") => ({
  inspection_date: companyToday(),
  driver_id: "",
  unit_id: "",
  trailer_id: trailerId,
  inspector_name: "",
  inspection_level: 1,
  outcome: "PASS" as "PASS" | "WARNING" | "OOS",
  location: "",
  notes: "",
  csa_points: 0,
});

/** @matrix-built modules=safety cols=driver,unit,trailer,connectivity,reverse_link */
export function DOTInspectionsTab() {
  const pageSize = 50;
  const [page, setPage] = useState(1);
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const companyGenerationRef = useRef(0);
  const [searchParams, setSearchParams] = useSearchParams();
  // LST-F5189 — list EntityPicker filters must write URL params on Apply (not silent draft).
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";
  const unitIdFromUrl = searchParams.get("unit_id")?.trim() ?? "";
  const trailerIdFromUrl = searchParams.get("trailer_id")?.trim() ?? "";

  // LV-SAFETY-DOT-INSPECTIONS-FILTER-SILENT-APPLY — stage until Apply; Cancel restores.
  function patchSearchParam(next: { driverId: string; unitId: string; trailerId: string }) {
    const p = new URLSearchParams(searchParams);
    const pairs: Array<["driver_id" | "unit_id" | "trailer_id", string]> = [
      ["driver_id", next.driverId],
      ["unit_id", next.unitId],
      ["trailer_id", next.trailerId],
    ];
    for (const [key, value] of pairs) {
      if (value) p.set(key, value);
      else p.delete(key);
    }
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: driverIdFromUrl,
    unitId: unitIdFromUrl,
    trailerId: trailerIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchSearchParam(next);
    },
  });
  const draft = staged.draft;

  const [form, setForm] = useState(() => emptyInspectionForm());
  type CreateInput = {
    companyId: string;
    generation: number;
    payload: Parameters<typeof createDotInspection>[1];
  };
  const [pendingOosCreate, setPendingOosCreate] = useState<CreateInput | null>(null);

  useEffect(() => {
    setApplied((prev) => ({
      ...prev,
      driverId: driverIdFromUrl,
      unitId: unitIdFromUrl,
      trailerId: trailerIdFromUrl,
    }));
  }, [driverIdFromUrl, unitIdFromUrl, trailerIdFromUrl]);

  // LST-F5163C: reverse ?trailer_id= also seeds create form when empty.
  useEffect(() => {
    if (trailerIdFromUrl) {
      setForm((prev) => (prev.trailer_id ? prev : { ...prev, trailer_id: trailerIdFromUrl }));
    }
  }, [trailerIdFromUrl]);

  const query = useQuery({
    queryKey: ["safety-v64", "dot-inspections", companyId, applied.driverId, applied.unitId, applied.trailerId, page],
    queryFn: () =>
      listDotInspections(companyId, {
        driver_id: applied.driverId.trim() || undefined,
        unit_id: applied.unitId.trim() || undefined,
        trailer_id: applied.trailerId.trim() || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
    enabled: Boolean(companyId),
  });
  const totalCount = query.isError ? 0 : query.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => setPage(1), [companyId, applied.driverId, applied.unitId, applied.trailerId]);

  const createMutation = useMutation({
    mutationFn: (input: CreateInput) => createDotInspection(input.companyId, input.payload),
    onSuccess: async (_result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      setForm((prev) => ({ ...prev, inspector_name: "", notes: "", csa_points: 0, trailer_id: trailerIdFromUrl || "" }));
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "dot-inspections", input.companyId] });
    },
  });

  // SAF-F11: void is reason-required. Capture the reason before calling, instead of letting the
  // backend stamp a placeholder into the audit trail.
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null);
  const voidMutation = useMutation({
    mutationFn: (input: { id: string; reason: string; companyId: string; generation: number }) => voidDotInspection(input.companyId, input.id, input.reason),
    onSuccess: async (_result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "dot-inspections", input.companyId] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (input: { id: string; file: File; companyId: string; generation: number }) => uploadDotInspectionPdf(input.companyId, input.id, input.file),
    onSuccess: async (_result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "dot-inspections", input.companyId] });
    },
  });

  // LIST-EMPTY: the empty message renders only after the inspections query settles.
  const listState = useListState(query, (query.data?.dot_inspections ?? []).length === 0);

  const columns: Array<ParityColumn<Record<string, unknown>>> = [
    { key: "inspection_date", label: "Date", sortable: true, render: (row) => formatDateUS(row.inspection_date) },
    {
      key: "driver_id",
      label: "Driver",
      render: (row) => (
        <EntityLinkOrTombstone
          kind="driver"
          id={row.driver_id as string | undefined}
          name={(row.driver_name as string | undefined)?.trim()}
          noun="Driver"
        />
      ),
    },
    {
      key: "unit_id",
      label: "Unit",
      render: (row) => (
        <EntityLinkOrTombstone
          kind="unit"
          id={row.unit_id as string | undefined}
          name={(row.unit_number as string | undefined)?.trim()}
          noun="Unit"
        />
      ),
    },
    {
      key: "trailer_id",
      label: "Trailer",
      render: (row) => (
        <EntityLinkOrTombstone
          kind="trailer"
          id={row.trailer_id as string | undefined}
          name={(row.trailer_number as string | undefined)?.trim()}
          noun="Trailer"
        />
      ),
    },
    { key: "fmcsa_level", label: "Level", sortable: true, render: (row) => String(row.fmcsa_level ?? "—") },
    { key: "outcome", label: "Outcome", sortable: true, render: (row) => String(row.outcome ?? "—") },
    { key: "csa_points", label: "CSA Pts", sortable: true, render: (row) => String(row.csa_points ?? "0") },
    {
      key: "auto_spawned_wo_id",
      label: "WO Spawned",
      render: (row) =>
        row.auto_spawned_wo_id ? (
          <EntityLinkOrTombstone
            kind="work_order"
            id={row.auto_spawned_wo_id as string}
            name={(row.work_order_display_id as string | undefined)?.trim()}
            noun="Work order"
          />
        ) : (
          "—"
        ),
    },
    {
      key: "action",
      label: "Actions",
      render: (row) => (
        <>
          <label className="mr-2 inline-flex cursor-pointer items-center text-slate-700 underline">
            PDF
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                uploadMutation.mutate({ id: String(row.id), file, companyId, generation: companyGenerationRef.current });
              }}
            />
          </label>
          <button
            type="button"
            className="text-red-700 underline disabled:opacity-50"
            disabled={Boolean(row.voided_at) || voidMutation.isPending}
            onClick={() => setVoidTargetId(String(row.id))}
          >
            {row.voided_at ? "Voided" : "Void"}
          </button>
        </>
      ),
    },
  ];

  // Open DOT station dwell-follow-up queue (samsara geofence dwell-detector → dot_inspection_events).
  const [dwellPage, setDwellPage] = useState(0);
  const dwellPageSize = 20;
  const openEventsQuery = useQuery({
    queryKey: ["safety", "dot-inspection-events", companyId, dwellPage],
    queryFn: () => listDotInspectionEvents(companyId, "open", { limit: dwellPageSize, offset: dwellPage * dwellPageSize }),
    enabled: Boolean(companyId),
  });

  const followUpMutation = useMutation({
    mutationFn: (input: { id: string; state: "reviewed" | "citation" | "clean"; companyId: string; generation: number }) =>
      followUpDotInspectionEvent(input.id, input.companyId, input.state),
    onSuccess: async (_result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["safety", "dot-inspection-events", input.companyId] });
    },
  });

  useEffect(() => {
    companyGenerationRef.current += 1;
    createMutation.reset();
    voidMutation.reset();
    uploadMutation.reset();
    followUpMutation.reset();
    setPendingOosCreate(null);
    setVoidTargetId(null);
    setForm(emptyInspectionForm(trailerIdFromUrl));
    setDwellPage(0);
  }, [companyId]);

  // SAF-F14 / S-A10: driver uses DriverPickerWithCreate; unit uses EntityPicker kind="unit" with
  // inline "+ Create unit" via EntityPicker allowCreate (server search — no silent roster page cap).
  // LST-F5163C: trailer create + list filter use EntityPicker kind="trailer".

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">DOT Inspections</h2>
        <InspectionScoreBadge companyId={companyId} />
      </div>
      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-5 lg:grid-cols-10">
        <div>
          <label className="sr-only" htmlFor="dot-inspection-tab-date">Inspection date</label>
          <DatePicker id="dot-inspection-tab-date" className="" value={form.inspection_date} onChange={(next) => setForm((v) => ({ ...v, inspection_date: next }))} />
        </div>
        <div data-testid="dot-inspection-driver-picker">
          <DriverPickerWithCreate
            operatingCompanyId={companyId}
            value={form.driver_id || null}
            onChange={(next) => setForm((v) => ({ ...v, driver_id: next ?? "" }))}
            placeholder="Search driver…"
          />
        </div>
        <div data-testid="dot-inspection-unit-picker">
          <EntityPicker
            kind="unit"
            operatingCompanyId={companyId}
            value={form.unit_id || null}
            onChange={(next) => setForm((v) => ({ ...v, unit_id: next ?? "" }))}
            placeholder="Search unit…"
            allowCreate
          />
        </div>
        <div data-testid="dot-inspection-trailer-picker">
          <EntityPicker
            kind="trailer"
            operatingCompanyId={companyId}
            value={form.trailer_id || null}
            onChange={(next) => setForm((v) => ({ ...v, trailer_id: next ?? "" }))}
            placeholder="Search trailer…"
            allowCreate
          />
        </div>
        <input className="rounded-sm border border-gray-300 px-2 py-1 text-xs" placeholder="Inspector" value={form.inspector_name} onChange={(e) => setForm((v) => ({ ...v, inspector_name: e.target.value }))} />
        <input className="rounded-sm border border-gray-300 px-2 py-1 text-xs" type="number" min={1} max={6} value={form.inspection_level} onChange={(e) => setForm((v) => ({ ...v, inspection_level: Number(e.target.value || 1) }))} />
        <SelectCombobox className="rounded-sm border border-gray-300 px-2 py-1 text-xs" value={form.outcome} onChange={(e) => setForm((v) => ({ ...v, outcome: e.target.value as typeof form.outcome }))}>
          <option value="PASS">PASS</option>
          <option value="WARNING">WARNING</option>
          <option value="OOS">OOS</option>
        </SelectCombobox>
        <input className="rounded-sm border border-gray-300 px-2 py-1 text-xs" placeholder="Location" value={form.location} onChange={(e) => setForm((v) => ({ ...v, location: e.target.value }))} />
        <input className="rounded-sm border border-gray-300 px-2 py-1 text-xs" type="number" min={0} placeholder="CSA pts" value={form.csa_points} onChange={(e) => setForm((v) => ({ ...v, csa_points: Number(e.target.value || 0) }))} />
        <button type="button" className="rounded-sm bg-[#1f2a44] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60" disabled={!form.inspector_name || createMutation.isPending} onClick={() => {
          const input: CreateInput = {
            companyId,
            generation: companyGenerationRef.current,
            payload: {
              inspection_date: form.inspection_date,
              driver_id: form.driver_id || undefined,
              unit_id: form.unit_id || undefined,
              trailer_id: form.trailer_id || undefined,
              inspector_name: form.inspector_name,
              inspection_level: form.inspection_level,
              outcome: form.outcome,
              location: form.location || undefined,
              notes: form.notes || undefined,
              csa_points_vehicle_maintenance: form.csa_points,
            },
          };
          if (input.payload.outcome === "OOS") setPendingOosCreate(input);
          else createMutation.mutate(input);
        }}>
          + Create
        </button>
      </div>
      {createMutation.isError && createMutation.variables?.generation === companyGenerationRef.current ? (
        <ListErrorState
          title="Couldn't create DOT inspection"
          status={0}
          message={(createMutation.error as Error)?.message}
          onRetry={() => createMutation.variables && createMutation.mutate(createMutation.variables)}
        />
      ) : null}

      <ConfirmModal
        open={Boolean(pendingOosCreate)}
        title="Create out-of-service inspection?"
        message="An OOS inspection will automatically create a linked maintenance work order."
        confirmLabel="Create inspection"
        onClose={() => setPendingOosCreate(null)}
        onConfirm={async () => {
          if (!pendingOosCreate) return;
          await createMutation.mutateAsync(pendingOosCreate);
        }}
      />

      {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed list query must not fall through to emptyText
          "No DOT inspections found." — that presents an outage as a clean carrier history. */}
      {listState.isError ? (
        <ListErrorState
          title="Couldn't load DOT inspections"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
      <ParityTable<Record<string, unknown>>
        columns={columns}
        rows={query.data?.dot_inspections ?? []}
        rowKey={(row) => String(row.id)}
        loading={listState.isLoading}
        emptyText="No DOT inspections found."
        storageKey="safety-dot-inspections"
        exportFilename="dot-inspections"
        pageSize={pageSize}
        pageSizeOptions={[pageSize]}
        hidePager
        filterBar={
          <div className="flex flex-wrap items-end gap-3" data-testid="dot-inspections-filters">
            <label className="text-[11px] text-slate-600">
              Driver
              <EntityPicker
                kind="driver"
                operatingCompanyId={companyId}
                value={draft.driverId || null}
                onChange={(next) => staged.setDraft((d) => ({ ...d, driverId: next ?? "" }))}
                allowCreate={false}
                placeholder="All drivers"
                className="mt-1"
                dataTestId="dot-inspections-filter-driver"
              />
            </label>
            <label className="text-[11px] text-slate-600">
              Unit
              <EntityPicker
                kind="unit"
                operatingCompanyId={companyId}
                value={draft.unitId || null}
                onChange={(next) => staged.setDraft((d) => ({ ...d, unitId: next ?? "" }))}
                allowCreate={false}
                placeholder="All units"
                className="mt-1"
                dataTestId="dot-inspections-filter-unit"
              />
            </label>
            <label className="text-[11px] text-slate-600">
              Trailer
              <EntityPicker
                kind="trailer"
                operatingCompanyId={companyId}
                value={draft.trailerId || null}
                onChange={(next) => staged.setDraft((d) => ({ ...d, trailerId: next ?? "" }))}
                allowCreate={false}
                placeholder="All trailers"
                className="mt-1"
                dataTestId="dot-inspections-trailer-filter"
              />
            </label>
            <Button type="button" size="sm" data-testid="dot-inspections-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
              Apply
            </Button>
            <Button type="button" size="sm" variant="secondary" data-testid="dot-inspections-filter-cancel" onClick={staged.cancel} disabled={!staged.dirty}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="dot-inspections-filter-reset"
              onClick={() => {
                staged.cancel();
                setApplied(EMPTY_FILTERS);
                patchSearchParam(EMPTY_FILTERS);
              }}
            >
              Reset
            </Button>
          </div>
        }
      />
      )}

      {!listState.isError && totalCount > pageSize ? (
        <div className="flex items-center justify-end gap-2 text-xs" data-testid="dot-inspections-server-pager">
          <Button size="sm" variant="secondary" disabled={page <= 1 || query.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
          <span className="text-gray-600">Page {page} of {pageCount} · {totalCount} inspections</span>
          <Button size="sm" variant="secondary" disabled={page >= pageCount || query.isFetching} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</Button>
        </div>
      ) : null}

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <h3 className="mb-2 text-xs font-semibold text-slate-800">Open DOT Station Dwell Events (last captured)</h3>
        {openEventsQuery.isError ? (
          <div data-testid="dot-dwell-events-query-error">
            <ListErrorState
              title="Couldn't load DOT station dwell events"
              status={0}
              message={userFacingApiError(openEventsQuery.error, "Could not load DOT station dwell events.")}
              onRetry={() => void openEventsQuery.refetch()}
            />
          </div>
        ) : (openEventsQuery.data?.events ?? []).length === 0 ? (
          <p className="text-xs text-slate-500">No open DOT dwell follow-ups.</p>
        ) : (
          <div className="space-y-2">
            {(openEventsQuery.data?.events ?? []).map((row) => (
              <div key={String(row.id)} className="rounded-sm border border-gray-200 p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">
                    {String(row.station_label ?? "DOT station")} · Unit{" "}
                    <EntityLinkOrTombstone kind="unit" id={row.unit_id as string | undefined} name={row.unit_number} noun="Unit" />
                  </span>
                  <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-slate-700">{String(row.dwell_minutes ?? 0)} min</span>
                </div>
                <p className="mt-1 text-slate-600">
                  Driver:{" "}
                  <EntityLinkOrTombstone kind="driver" id={row.driver_id as string | undefined} name={row.driver_name} noun="Driver" />{" "}
                  · Departed: {String(row.departed_at ?? "n/a")}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-sm bg-[#1f2a44] px-2 py-1 text-[11px] font-semibold text-white"
                    onClick={() => followUpMutation.mutate({ id: String(row.id), state: "reviewed", companyId, generation: companyGenerationRef.current })}
                  >
                    Mark Reviewed
                  </button>
                  <button
                    type="button"
                    className="rounded-sm bg-red-700 px-2 py-1 text-[11px] font-semibold text-white"
                    onClick={() => followUpMutation.mutate({ id: String(row.id), state: "citation", companyId, generation: companyGenerationRef.current })}
                  >
                    Mark Citation
                  </button>
                  <button
                    type="button"
                    className="rounded-sm bg-[#1f2a44] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#0f1729]"
                    onClick={() => followUpMutation.mutate({ id: String(row.id), state: "clean", companyId, generation: companyGenerationRef.current })}
                  >
                    Mark Clean
                  </button>
                </div>
              </div>
            ))}
            {followUpMutation.isError && followUpMutation.variables?.generation === companyGenerationRef.current ? (
              <p className="text-xs text-red-700" data-testid="dot-inspection-followup-error">
                {userFacingApiError(followUpMutation.error, "Could not update the DOT follow-up.")}
              </p>
            ) : null}
            {(openEventsQuery.data?.total_count ?? 0) > 0 ? (
              <div className="flex items-center justify-end gap-2 text-xs" data-testid="dot-dwell-events-server-pager">
                <span>{dwellPage * dwellPageSize + 1}–{Math.min((dwellPage + 1) * dwellPageSize, openEventsQuery.data?.total_count ?? 0)} of {openEventsQuery.data?.total_count ?? 0}</span>
                <Button type="button" size="sm" variant="secondary" disabled={dwellPage === 0} onClick={() => setDwellPage((value) => Math.max(0, value - 1))}>Previous</Button>
                <Button type="button" size="sm" variant="secondary" disabled={(dwellPage + 1) * dwellPageSize >= (openEventsQuery.data?.total_count ?? 0)} onClick={() => setDwellPage((value) => value + 1)}>Next</Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
      {uploadMutation.isError && uploadMutation.variables?.generation === companyGenerationRef.current ? (
        <p className="text-xs text-red-700" data-testid="dot-inspection-upload-error">
          {userFacingApiError(uploadMutation.error, "Could not upload the DOT inspection PDF.")}
        </p>
      ) : null}
      <VoidReasonModal
        open={voidTargetId !== null}
        title="Void DOT Inspection"
        entityRef={voidTargetId ? entityLabel(null, voidTargetId, "Inspection") : undefined}
        postsReversingEntry={false}
        onClose={() => setVoidTargetId(null)}
        onSubmit={async (reason) => {
          if (!voidTargetId) return;
          await voidMutation.mutateAsync({ id: voidTargetId, reason, companyId, generation: companyGenerationRef.current });
          setVoidTargetId(null);
        }}
      />
    </div>
  );
}
