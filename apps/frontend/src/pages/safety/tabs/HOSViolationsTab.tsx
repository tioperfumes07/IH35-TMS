import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { createHosViolation, listHosViolations, voidHosViolation } from "../../../api/safetyV64";
import { VoidReasonModal } from "../../../components/accounting/VoidReasonModal";
import { listDotViolationTypes } from "../../../api/catalogs-safety";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { DateTimePicker } from "../../../components/forms/DateTimePicker";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { useListState } from "../../../components/list-state";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { entityLabel } from "../../../lib/entity-label";
import { CappedListNotice } from "../../../components/CappedListNotice";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../../components/Button";
import { useStagedListFilters } from "../../../components/table";

type HosViolationRow = Record<string, unknown>;
type Source = "samsara_auto" | "manual_office" | "dot_citation";

const EMPTY_FILTERS = { driverId: "", loadId: "" };

function defaultOccurredAtIso(): string {
  return new Date().toISOString();
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyHosViolationForm = () => ({
  driver_id: "",
  related_load_id: "",
  violation_type: "",
  occurred_at: defaultOccurredAtIso(),
  duration_minutes: "",
  source: "manual_office" as Source,
  notes: "",
});

/** @matrix-built modules=safety cols=driver,load,connectivity,reverse_link */
export function HOSViolationsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightedViolationId = searchParams.get("violation_id")?.trim() ?? "";
  // LST-F5190 — visible reverse filters (URL-only ?driver_id=/?load_id= is not reverse chrome).
  // LV-SAFETY-HOS-VIOLATIONS-FILTER-SILENT-APPLY — stage until Apply; Cancel restores.
  const loadIdFromUrl = searchParams.get("load_id")?.trim() ?? "";
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const companyGenerationRef = useRef(0);
  const [voidTarget, setVoidTarget] = useState<HosViolationRow | null>(null);
  const [form, setForm] = useState(emptyHosViolationForm);
  const pageSize = 25;
  const [page, setPage] = useState(1);

  function patchSearchParam(next: { driverId: string; loadId: string }) {
    const p = new URLSearchParams(searchParams);
    if (next.driverId) p.set("driver_id", next.driverId);
    else p.delete("driver_id");
    if (next.loadId) p.set("load_id", next.loadId);
    else p.delete("load_id");
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: driverIdFromUrl,
    loadId: loadIdFromUrl,
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

  useEffect(() => {
    setApplied((prev) => ({
      ...prev,
      driverId: driverIdFromUrl,
      loadId: loadIdFromUrl,
    }));
  }, [driverIdFromUrl, loadIdFromUrl]);

  useEffect(() => setPage(1), [companyId, applied.driverId, applied.loadId]);

  function setDriverFilter(next: string) {
    staged.setDraft((d) => ({ ...d, driverId: next }));
  }
  function setLoadFilter(next: string) {
    staged.setDraft((d) => ({ ...d, loadId: next }));
  }

  const query = useQuery({
    queryKey: ["safety-v64", "hos-violations", companyId, applied.loadId, applied.driverId, page],
    queryFn: () =>
      listHosViolations(companyId, {
        load_id: applied.loadId || undefined,
        driver_id: applied.driverId || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
    enabled: Boolean(companyId),
  });

  // SAF-B14: catalogs.dot_violation_types (213 rows, 33 of them hours_of_service) was reachable only
  // from its own list page. The tab took the violation as free text, so two officers typing
  // "11 hour" and "11-hour rule" produced two different violations to FMCSA reporting — and because
  // nothing ever sent csa_points, EVERY HOS violation was stored with 0 severity even though the
  // route has always accepted the field. The catalog's severity_weight is that number.
  // SAF-B29 wave-4: typed term reaches listDotViolationTypes (query key includes search).
  const [violationTypeSearch, setViolationTypeSearch] = useState("");
  const violationTypesQuery = useQuery({
    queryKey: ["catalogs", "dot-violation-types", "hos", companyId, violationTypeSearch],
    queryFn: () =>
      listDotViolationTypes(companyId, {
        limit: 200,
        is_active: "true",
        basic_category: "hours_of_service",
        search: violationTypeSearch || undefined,
      }),
    enabled: Boolean(companyId),
  });

  // SAF-F6978: React Query retains the last successful catalog page after a rejected
  // refetch. Never leave those stale DOT codes selectable while the current scoped
  // read is failed; the error banner + Retry below is the only operational truth.
  const violationTypeRows = violationTypesQuery.isError ? [] : (violationTypesQuery.data?.rows ?? []);

  const violationTypeOptions = useMemo(
    () =>
      violationTypeRows.map((row) => ({
        value: row.violation_code,
        label: row.display_name,
        sublabel: row.violation_code,
      })),
    [violationTypeRows]
  );

  const selectedViolationType = violationTypeRows.find((row) => row.violation_code === form.violation_type);

  function violationTypeLabel(stored: unknown): string {
    const value = String(stored ?? "").trim();
    if (!value) return "—";
    const match = violationTypeRows.find((row) => row.violation_code === value);
    return match ? `${match.display_name} · ${match.violation_code}` : value;
  }

  const createMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; payload: Parameters<typeof createHosViolation>[1] }) =>
      createHosViolation(input.companyId, input.payload),
    onSuccess: async (_result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      setForm(emptyHosViolationForm());
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "hos-violations", input.companyId] });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (input: { id: string; reason: string; companyId: string; generation: number }) => voidHosViolation(input.companyId, input.id, input.reason),
    onSuccess: async (_result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      setVoidTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "hos-violations", input.companyId] });
    },
  });

  useEffect(() => {
    companyGenerationRef.current += 1;
    createMutation.reset();
    voidMutation.reset();
    setVoidTarget(null);
    setForm(emptyHosViolationForm());
    setViolationTypeSearch("");
  }, [companyId]);

  // LIST-EMPTY: the empty message renders only after the violations query settles.
  const listState = useListState(query, (query.data?.hos_violations ?? []).length === 0);
  const violationTotal = query.isError ? 0 : query.data?.total_count ?? 0;
  const violationPageCount = Math.max(1, Math.ceil(violationTotal / pageSize));

  const columns = useMemo<Array<ParityColumn<HosViolationRow>>>(
    () => [
      { key: "driver_id", label: "Driver", sortable: true, sortValue: (row) => String(row.driver_name ?? row.driver_id ?? ""), render: (row) => (
        <EntityLinkOrTombstone kind="driver" id={row.driver_id as string | undefined} name={row.driver_name} noun="Driver" />
      ) },
      { key: "related_load_id", label: "Load", sortable: true, sortValue: (row) => String(row.related_load_number ?? row.related_load_id ?? ""), render: (row) => (
        <EntityLinkOrTombstone kind="load" id={row.related_load_id as string | undefined} name={row.related_load_number} noun="Load" />
      ) },
      {
        key: "violation_type",
        label: "Violation Type",
        sortable: true,
        // Stored value is the FMCSA code (canonical, groupable); the operator reads the name. Rows
        // predating the catalog binding hold free text and fall through unchanged.
        render: (row) => violationTypeLabel(row.violation_type),
      },
      {
        key: "occurred_at",
        label: "Occurred",
        sortable: true,
        render: (row) => String(row.occurred_at ?? "").slice(0, 16).replace("T", " "),
      },
      { key: "source", label: "Source", sortable: true, render: (row) => String(row.source ?? "—") },
      {
        key: "duration_minutes",
        label: "Duration (min)",
        render: (row) => String(row.duration_minutes ?? "—"),
      },
      { key: "csa_points", label: "CSA Pts", sortable: true, render: (row) => String(row.csa_points ?? "0") },
      {
        key: "actions",
        label: "Actions",
        render: (row) => (
          <button
            type="button"
            className="text-red-700 underline disabled:opacity-50"
            disabled={Boolean(row.voided_at) || voidMutation.isPending}
            onClick={() => setVoidTarget(row)}
          >
            {row.voided_at ? "Voided" : "Void"}
          </button>
        ),
      },
    ],
    [voidMutation.isPending],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 bg-white p-3" data-testid="hos-violations-filters">
        <label className="block min-w-[200px] text-xs text-slate-600">
          Driver
          <div className="mt-1">
            <EntityPicker
              kind="driver"
              operatingCompanyId={companyId}
              value={draft.driverId || null}
              onChange={(next) => setDriverFilter(next ?? "")}
              allowCreate={false}
              placeholder="All drivers"
              className="w-full"
              dataTestId="hos-violations-filter-driver"
            />
          </div>
        </label>
        <label className="block min-w-[200px] text-xs text-slate-600">
          Load
          <div className="mt-1">
            <EntityPicker
              kind="load"
              operatingCompanyId={companyId}
              value={draft.loadId || null}
              onChange={(next) => setLoadFilter(next ?? "")}
              allowCreate={false}
              placeholder="All loads"
              className="w-full"
              dataTestId="hos-violations-filter-load"
            />
          </div>
        </label>
        <Button type="button" size="sm" data-testid="hos-violations-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="hos-violations-filter-cancel"
          onClick={staged.cancel}
          disabled={!staged.dirty}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="hos-violations-filter-reset"
          onClick={() => {
            staged.cancel();
            setApplied(EMPTY_FILTERS);
            patchSearchParam(EMPTY_FILTERS);
          }}
        >
          Reset
        </Button>
      </div>
      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-8">
        {/* SAF-F14: raw uuid text box replaced with the canonical driver picker (inline create). */}
        <div data-testid="hos-violation-driver-picker">
          <DriverPickerWithCreate
            operatingCompanyId={companyId}
            value={form.driver_id || null}
            onChange={(next) => setForm((v) => ({ ...v, driver_id: next ?? "" }))}
            placeholder="Search driver…"
          />
        </div>
        {/*
          LST-PICKER-01: Combobox had no inline create — operators had to leave HOS intake for Lists.
          ReferenceSelect first-row create → POST catalogs.dot_violation_types (HOS basic_category).
          Options keyed by violation_code (createdValueField=code).
        */}
        <ReferenceSelect
          value={form.violation_type || null}
          onChange={(next) => setForm((v) => ({ ...v, violation_type: next ?? "" }))}
          options={violationTypeOptions.map((o) => ({ value: o.value, label: o.label, type: o.sublabel }))}
          createKind="dot_violation_type"
          operatingCompanyId={companyId}
          createdValueField="code"
          placeholder="Violation type"
          loading={violationTypesQuery.isLoading}
          disabled={violationTypesQuery.isError}
          onSearch={setViolationTypeSearch}
          onOptionCreated={() => {
            void queryClient.invalidateQueries({ queryKey: ["catalogs", "dot-violation-types", "hos", companyId] });
            void violationTypesQuery.refetch();
          }}
        />
        {/* CLS-SILENT-CAP: this picker fetches a hard 200 cap. Server search narrows it, but with no
            disclosure a user who never types sees 200 of N and cannot tell the list was cut. Renders
            nothing until the cap is actually hit. */}
        <CappedListNotice
          shown={violationTypeRows.length}
          limit={200}
          hint="Type to search the full violation-type catalog."
        />
        <div data-testid="hos-violation-load-picker">
          <EntityPicker
            kind="load"
            operatingCompanyId={companyId}
            value={form.related_load_id || null}
            onChange={(next) => setForm((v) => ({ ...v, related_load_id: next ?? "" }))}
            placeholder="Related load (optional)"
          />
        </div>
        <DateTimePicker
          aria-label="Occurred at"
          value={toDatetimeLocalValue(form.occurred_at)}
          onChange={(next) =>
            // C3: guard the empty value. The old native input handed "" straight to
            // `new Date("").toISOString()`, which throws RangeError: Invalid time value — clearing
            // the field crashed the tab. Clearing now yields an empty occurred_at, which the
            // existing submit guard already treats as incomplete.
            setForm((v) => ({ ...v, occurred_at: next ? new Date(next).toISOString() : "" }))
          }
        />
        <SelectCombobox
          className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          value={form.source}
          onChange={(e) => setForm((v) => ({ ...v, source: e.target.value as Source }))}
        >
          <option value="manual_office">manual_office</option>
          <option value="samsara_auto">samsara_auto</option>
          <option value="dot_citation">dot_citation</option>
        </SelectCombobox>
        <input
          className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          type="number"
          min={0}
          placeholder="Duration min"
          value={form.duration_minutes}
          onChange={(e) => setForm((v) => ({ ...v, duration_minutes: e.target.value }))}
        />
        <input
          className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))}
        />
        <button
          type="button"
          className="rounded-sm bg-[#1f2a44] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
          disabled={!form.driver_id || !selectedViolationType?.id || createMutation.isPending}
          onClick={() => createMutation.mutate({
            companyId,
            generation: companyGenerationRef.current,
            payload: {
              driver_id: form.driver_id.trim(),
              related_load_id: form.related_load_id || null,
              violation_type: form.violation_type.trim(),
              occurred_at: new Date(form.occurred_at).toISOString(),
              duration_minutes: form.duration_minutes.trim() ? Number(form.duration_minutes) : null,
              source: form.source,
              notes: form.notes.trim() || null,
              csa_points: selectedViolationType?.severity_weight ?? null,
              dot_violation_type_id: selectedViolationType?.id ?? null,
            },
          })}
        >
          + Create
        </button>
      </div>
      {createMutation.isError && createMutation.variables?.generation === companyGenerationRef.current ? (
        <div className="rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-900" role="alert">
          {createMutation.error instanceof Error ? createMutation.error.message : "Create failed."}
        </div>
      ) : null}

      {(query.isError || violationTypesQuery.isError) && (
        <ListErrorBanner
          onRetry={() => {
            void query.refetch();
            void violationTypesQuery.refetch();
          }}
        />
      )}

      <ParityTable<HosViolationRow>
        columns={columns}
        rows={query.data?.hos_violations ?? []}
        rowKey={(row) => String(row.id)}
        loading={listState.isLoading}
        emptyText="No HOS violations found."
        storageKey="safety-hos-violations"
        exportFilename="hos-violations"
        hidePager
        rowClassName={(row) =>
          highlightedViolationId && String(row.id) === highlightedViolationId
            ? "bg-slate-100 ring-1 ring-inset ring-slate-300"
            : ""
        }
      />
      {!query.isError && violationTotal > pageSize ? (
        <div className="flex items-center justify-end gap-2 text-xs" data-testid="hos-violations-server-pager">
          <Button size="sm" variant="secondary" disabled={page <= 1 || query.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous violations</Button>
          <span className="text-slate-600">Page {page} of {violationPageCount} · {violationTotal} violations</span>
          <Button size="sm" variant="secondary" disabled={page >= violationPageCount || query.isFetching} onClick={() => setPage((current) => Math.min(violationPageCount, current + 1))}>Next violations</Button>
        </div>
      ) : null}

      <VoidReasonModal
        open={Boolean(voidTarget)}
        title="Void HOS Violation"
        entityRef={
          voidTarget
            ? `${violationTypeLabel(voidTarget.violation_type)} · driver ${entityLabel(voidTarget.driver_name, voidTarget.driver_id, "Driver")}`
            : undefined
        }
        minLength={3}
        postsReversingEntry={false}
        onClose={() => setVoidTarget(null)}
        onSubmit={async (reason) => {
          if (!voidTarget?.id) return;
          await voidMutation.mutateAsync({ id: String(voidTarget.id), reason, companyId, generation: companyGenerationRef.current });
        }}
      />
    </div>
  );
}
