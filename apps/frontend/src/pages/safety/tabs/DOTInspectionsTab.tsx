import { useEffect, useState } from "react";
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

const EMPTY_FILTERS = { driverId: "", unitId: "", trailerId: "" };

export function DOTInspectionsTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
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

  const [form, setForm] = useState({
    inspection_date: companyToday(),
    driver_id: "",
    unit_id: "",
    trailer_id: "",
    inspector_name: "",
    inspection_level: 1,
    outcome: "PASS" as "PASS" | "WARNING" | "OOS",
    location: "",
    notes: "",
    csa_points: 0,
  });

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
    queryKey: ["safety-v64", "dot-inspections", companyId, applied.driverId, applied.unitId, applied.trailerId],
    queryFn: () =>
      listDotInspections(companyId, {
        driver_id: applied.driverId.trim() || undefined,
        unit_id: applied.unitId.trim() || undefined,
        trailer_id: applied.trailerId.trim() || undefined,
      }),
    enabled: Boolean(companyId),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (form.outcome === "OOS") {
        const confirmed = window.confirm("An OOS inspection will auto-spawn a maintenance WO. Confirm?");
        if (!confirmed) return null;
      }
      return createDotInspection(companyId, {
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
      });
    },
    onSuccess: async () => {
      setForm((prev) => ({ ...prev, inspector_name: "", notes: "", csa_points: 0, trailer_id: trailerIdFromUrl || "" }));
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "dot-inspections", companyId] });
    },
  });

  // SAF-F11: void is reason-required. Capture the reason before calling, instead of letting the
  // backend stamp a placeholder into the audit trail.
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null);
  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidDotInspection(companyId, id, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "dot-inspections", companyId] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadDotInspectionPdf(companyId, id, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "dot-inspections", companyId] });
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
                uploadMutation.mutate({ id: String(row.id), file });
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
  const openEventsQuery = useQuery({
    queryKey: ["safety", "dot-inspection-events", companyId],
    queryFn: () => listDotInspectionEvents(companyId, "open"),
    enabled: Boolean(companyId),
  });

  const followUpMutation = useMutation({
    mutationFn: (payload: { id: string; state: "reviewed" | "citation" | "clean" }) =>
      followUpDotInspectionEvent(payload.id, companyId, payload.state),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety", "dot-inspection-events", companyId] });
    },
  });

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
        <button type="button" className="rounded-sm bg-[#1f2a44] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60" disabled={!form.inspector_name || createMutation.isPending} onClick={() => createMutation.mutate()}>
          + Create
        </button>
      </div>
      {createMutation.isError ? (
        <ListErrorState
          title="Couldn't create DOT inspection"
          status={0}
          message={(createMutation.error as Error)?.message}
          onRetry={() => createMutation.mutate()}
        />
      ) : null}

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

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <h3 className="mb-2 text-xs font-semibold text-slate-800">Open DOT Station Dwell Events (last captured)</h3>
        {openEventsQuery.isError ? (
          <p className="text-xs text-red-700" data-testid="dot-dwell-events-query-error">
            {userFacingApiError(openEventsQuery.error, "Could not load DOT station dwell events.")}
          </p>
        ) : (openEventsQuery.data?.events ?? []).length === 0 ? (
          <p className="text-xs text-slate-500">No open DOT dwell follow-ups.</p>
        ) : (
          <div className="space-y-2">
            {(openEventsQuery.data?.events ?? []).slice(0, 20).map((row) => (
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
                    onClick={() => followUpMutation.mutate({ id: String(row.id), state: "reviewed" })}
                  >
                    Mark Reviewed
                  </button>
                  <button
                    type="button"
                    className="rounded-sm bg-red-700 px-2 py-1 text-[11px] font-semibold text-white"
                    onClick={() => followUpMutation.mutate({ id: String(row.id), state: "citation" })}
                  >
                    Mark Citation
                  </button>
                  <button
                    type="button"
                    className="rounded-sm bg-[#1f2a44] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#0f1729]"
                    onClick={() => followUpMutation.mutate({ id: String(row.id), state: "clean" })}
                  >
                    Mark Clean
                  </button>
                </div>
              </div>
            ))}
            {followUpMutation.isError ? (
              <p className="text-xs text-red-700" data-testid="dot-inspection-followup-error">
                {userFacingApiError(followUpMutation.error, "Could not update the DOT follow-up.")}
              </p>
            ) : null}
          </div>
        )}
      </div>
      {uploadMutation.isError ? (
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
          await voidMutation.mutateAsync({ id: voidTargetId, reason });
          setVoidTargetId(null);
        }}
      />
    </div>
  );
}
