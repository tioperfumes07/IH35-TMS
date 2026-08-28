import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createHosViolation } from "../../../api/safetyV64";
import { listDotViolationTypes } from "../../../api/catalogs-safety";
import { suggestExpenseLoad } from "../../../api/maintenance";
import { Button } from "../../../components/Button";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { Modal } from "../../../components/Modal";
import { DateTimePicker } from "../../../components/forms/DateTimePicker";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";

type Source = "samsara_auto" | "manual_office" | "dot_citation";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

function defaultOccurredAtIso(): string {
  return new Date().toISOString();
}

/** datetime-local value (local wall clock) ↔ ISO with offset for z.string().datetime({ offset: true }). */
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(local: string): string {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return defaultOccurredAtIso();
  return d.toISOString();
}

function occurredDateYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function emptyHosViolationForm() {
  return {
    driver_id: "",
    violation_type: "",
    occurred_at: defaultOccurredAtIso(),
    duration_minutes: "",
    source: "manual_office" as Source,
    notes: "",
    related_load_id: "",
  };
}

type HosViolationSubmission = {
  companyId: string;
  generation: number;
  draft: ReturnType<typeof emptyHosViolationForm>;
  violationType: { id: string; severityWeight: number | null };
};

export function HosViolationCreateModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyHosViolationForm);
  const pristineOccurredAtRef = useRef(form.occurred_at);
  const [attemptClose, setAttemptClose] = useState<() => void>(() => () => {});
  /** Once the active-trip resolver fills the load, preserve an operator override. */
  const [suggestionPinned, setSuggestionPinned] = useState(false);

  // DUAL_PATH_OLD_ACTIVE: HoursOfServicePage drawer still took free-text violation_type while
  // HOSViolationsTab already catalogs via ReferenceSelect. Same catalog + FK + CSA weight.
  // SAF-B29 wave-4: server search — 213 DOT types exceed a silent 200-cap page.
  const [violationTypeSearch, setViolationTypeSearch] = useState("");
  const lifecycleGenerationRef = useRef(0);
  const resetDraft = useCallback(() => {
    const next = emptyHosViolationForm();
    pristineOccurredAtRef.current = next.occurred_at;
    setForm(next);
    setSuggestionPinned(false);
    setViolationTypeSearch("");
  }, []);
  const violationTypesQuery = useQuery({
    queryKey: ["catalogs", "dot-violation-types", "hos", operatingCompanyId, violationTypeSearch],
    queryFn: () =>
      listDotViolationTypes(operatingCompanyId, {
        limit: 200,
        is_active: "true",
        basic_category: "hours_of_service",
        search: violationTypeSearch || undefined,
      }),
    enabled: open && Boolean(operatingCompanyId),
  });

  // SAF-F6978: a failed company-scoped refetch must not leave React Query's cached
  // DOT codes selectable. Empty the choices and require an explicit successful Retry.
  const violationTypeRows = violationTypesQuery.isError ? [] : (violationTypesQuery.data?.rows ?? []);

  const violationTypeOptions = useMemo(
    () =>
      violationTypeRows.map((row) => ({
        value: row.violation_code,
        label: row.display_name,
        type: row.violation_code,
      })),
    [violationTypeRows]
  );

  const selectedViolationType = violationTypeRows.find((row) => row.violation_code === form.violation_type);

  const occurredYmd = occurredDateYmd(form.occurred_at);
  const suggestionQuery = useQuery({
    queryKey: ["safety", "hos-violation-create", "suggest-load", operatingCompanyId, form.driver_id, occurredYmd],
    queryFn: () =>
      suggestExpenseLoad({
        operating_company_id: operatingCompanyId,
        driver_id: form.driver_id || undefined,
        transaction_date: occurredYmd,
      }),
    enabled: open && Boolean(operatingCompanyId && occurredYmd && form.driver_id),
  });

  useEffect(() => {
    setSuggestionPinned(false);
  }, [form.driver_id, occurredYmd]);

  useEffect(() => {
    if (form.related_load_id || suggestionPinned) return;
    const suggested = suggestionQuery.data?.data;
    if (!suggested?.load_id) return;
    setForm((v) => ({ ...v, related_load_id: suggested.load_id }));
    setSuggestionPinned(true);
  }, [form.related_load_id, suggestionPinned, suggestionQuery.data]);

  const mutation = useMutation({
    mutationFn: (input: HosViolationSubmission) =>
      createHosViolation(input.companyId, {
        driver_id: input.draft.driver_id.trim(),
        violation_type: input.draft.violation_type.trim(),
        occurred_at: input.draft.occurred_at.includes("T")
          ? new Date(input.draft.occurred_at).toISOString()
          : input.draft.occurred_at,
        duration_minutes: input.draft.duration_minutes.trim()
          ? Number(input.draft.duration_minutes)
          : null,
        source: input.draft.source,
        notes: input.draft.notes.trim() || null,
        csa_points: input.violationType.severityWeight,
        dot_violation_type_id: input.violationType.id,
        related_load_id: input.draft.related_load_id.trim() || null,
      }),
    onSuccess: (_created, input) => {
      if (lifecycleGenerationRef.current !== input.generation) return;
      onCreated();
      lifecycleGenerationRef.current += 1;
      resetDraft();
      onClose();
    },
  });

  const resetMutation = mutation.reset;
  useEffect(() => {
    lifecycleGenerationRef.current += 1;
    resetDraft();
    resetMutation();
  }, [open, operatingCompanyId, resetDraft, resetMutation]);

  const handleClose = useCallback(() => {
    if (mutation.isPending) return;
    lifecycleGenerationRef.current += 1;
    resetDraft();
    resetMutation();
    onClose();
  }, [mutation.isPending, onClose, resetDraft, resetMutation]);

  const canSubmit =
    Boolean(form.driver_id.trim() && selectedViolationType?.id && form.occurred_at) && !mutation.isPending;
  const isDirty =
    form.driver_id !== "" || form.violation_type !== "" || form.occurred_at !== pristineOccurredAtRef.current ||
    form.duration_minutes !== "" || form.source !== "manual_office" || form.notes !== "" ||
    form.related_load_id !== "";

  return (
    <Modal variant="drawer" open={open} onClose={handleClose} title="Create HOS Violation" confirmDiscardOnClose isDirty={isDirty} onRegisterAttemptClose={(next) => setAttemptClose(() => next)}>
      <form
        className="space-y-3"
        data-testid="hos-violation-create-modal"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!canSubmit || !selectedViolationType?.id) return;
          mutation.mutate({
            companyId: operatingCompanyId,
            generation: lifecycleGenerationRef.current,
            draft: { ...form },
            violationType: {
              id: selectedViolationType.id,
              severityWeight: selectedViolationType.severity_weight ?? null,
            },
          });
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-driver-id">
              Driver <span className="text-red-600">*</span>
            </label>
            <DriverPickerWithCreate
              operatingCompanyId={operatingCompanyId}
              value={form.driver_id || null}
              onChange={(next) => setForm((v) => ({ ...v, driver_id: next ?? "" }))}
              open={open}
              placeholder="Select driver…"
              dataField="hos-vio-driver-id"
            />
          </div>
          <div className="flex flex-col gap-1" data-testid="hos-vio-type">
            <label className="text-xs font-semibold text-gray-600">
              Violation type <span className="text-red-600">*</span>
            </label>
            {/*
              LST-PICKER-01: free-text dual path killed. ReferenceSelect first-row create →
              POST catalogs.dot_violation_types (same as HOSViolationsTab / guard 1816).
            */}
            <ReferenceSelect
              value={form.violation_type || null}
              onChange={(next) => setForm((v) => ({ ...v, violation_type: next ?? "" }))}
              options={violationTypeOptions}
              createKind="dot_violation_type"
              operatingCompanyId={operatingCompanyId}
              createdValueField="code"
              placeholder={violationTypesQuery.isLoading ? "Loading types…" : "Select violation type"}
              loading={violationTypesQuery.isLoading}
              disabled={!operatingCompanyId || violationTypesQuery.isLoading || violationTypesQuery.isError}
              onSearch={setViolationTypeSearch}
              onOptionCreated={() => {
                void queryClient.invalidateQueries({
                  queryKey: ["catalogs", "dot-violation-types", "hos", operatingCompanyId],
                });
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-occurred">
              Occurred at <span className="text-red-600">*</span>
            </label>
            <DateTimePicker
              id="hos-vio-occurred"
              aria-label="Occurred at"
              value={toDatetimeLocalValue(form.occurred_at)}
              onChange={(v) => setForm((prev) => ({ ...prev, occurred_at: fromDatetimeLocalValue(v) }))}
            />
          </div>
          <div className="flex flex-col gap-1" data-testid="hos-vio-load-picker">
            <label className="text-xs font-semibold text-gray-600">Related load</label>
            <EntityPicker
              kind="load"
              operatingCompanyId={operatingCompanyId}
              value={form.related_load_id || null}
              onChange={(next) => {
                setForm((v) => ({ ...v, related_load_id: next ?? "" }));
                setSuggestionPinned(true);
              }}
              // CREATE modal owes picker_law: + Add new load first row (same class as accidents #8949 / fuel #8741).
              allowCreate
              nestedInDrawer
              enabled={open && Boolean(operatingCompanyId)}
              placeholder="Search load…"
              className="w-full"
              dataField="hos-vio-load"
              dataTestId="hos-vio-load-entity-picker"
            />
            {suggestionPinned && form.related_load_id && suggestionQuery.data?.data?.load_id === form.related_load_id ? (
              <p className="text-[11px] text-slate-600" data-testid="hos-vio-load-suggested">
                Auto-filled from the active trip for this driver on the occurrence date.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-source">
              Source
            </label>
            <SelectCombobox
              id="hos-vio-source"
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              value={form.source}
              onChange={(e) => setForm((v) => ({ ...v, source: e.target.value as Source }))}
            >
              <option value="manual_office">manual_office</option>
              <option value="samsara_auto">samsara_auto</option>
              <option value="dot_citation">dot_citation</option>
            </SelectCombobox>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-duration">
              Duration (minutes)
            </label>
            <input
              id="hos-vio-duration"
              type="number"
              min={0}
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              value={form.duration_minutes}
              onChange={(e) => setForm((v) => ({ ...v, duration_minutes: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-xs font-semibold text-gray-600" htmlFor="hos-vio-notes">
              Notes
            </label>
            <textarea
              id="hos-vio-notes"
              rows={2}
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              value={form.notes}
              onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))}
            />
          </div>
        </div>
        {violationTypesQuery.isError ? (
          <ListErrorBanner
            message="Violation types could not be loaded. Retry before creating an HOS violation."
            onRetry={() => void violationTypesQuery.refetch()}
          />
        ) : null}
        {mutation.isError && mutation.variables?.generation === lifecycleGenerationRef.current ? (
          <div className="rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-900" role="alert">
            {mutation.error instanceof Error ? mutation.error.message : "Create failed. Please try again."}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={attemptClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!canSubmit}>
            + Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
