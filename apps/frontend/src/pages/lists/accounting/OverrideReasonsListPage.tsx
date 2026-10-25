// TABLE_DATE_OMIT: this table has no date column by design — one row per catalog entry (code / labels / contexts / order / status) — a reference list, not a time series.
// LEAD 443.294 step 1b — Lists screen for catalogs.override_reasons (same grammar as Void/Cancel Reasons).
import { useEffect, useMemo, useState } from "react";
import { catalogListSearchQueryOptions } from "../../../hooks/catalogListSearchQueryOptions";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import {
  OVERRIDE_CONTEXTS,
  createOverrideReason,
  deactivateOverrideReason,
  listOverrideReasons,
  updateOverrideReason,
  type CreateOverrideReasonInput,
  type OverrideContext,
  type OverrideReason,
  type UpdateOverrideReasonInput,
} from "../../../api/catalogs";
import { Button } from "../../../components/Button";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable } from "../../../components/parity/ParityTable";
import { Modal } from "../../../components/Modal";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { SelectCombobox } from "../../../components/Combobox";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { FORM_LABEL_STACK_CLASS } from "../../../components/forms/inputClass";

const CATALOG_KEY = "override-reasons";

type StatusFilter = "active" | "inactive" | "all";

// Seed codes are lowercase snake_case; keep owner-added codes consistent with the DB convention.
const REASON_CODE_REGEX = /^[a-z][a-z0-9_]*$/;

function statusPill(isActive: boolean) {
  return isActive
    ? "inline-flex rounded-full bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold text-[#1F2A44]"
    : "inline-flex rounded-full bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold text-[#6B7280]";
}

function parseConflict(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 409) return (error.data as { error?: string } | undefined)?.error === "role_only_reason_locked" ? "Owner / Accountant override rows keep their code and contexts." : "A reason with this code already exists for this company.";
  const data = error.data as { details?: { fieldErrors?: Record<string, string[]> } } | undefined;
  return data?.details?.fieldErrors?.reason_code?.[0] ?? null;
}

type FormState = {
  reason_code: string;
  label_en: string;
  label_es: string;
  contexts: OverrideContext[];
  sort_order: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

function toInitial(row: OverrideReason | null): FormState {
  return {
    reason_code: row?.reason_code ?? "",
    label_en: row?.label_en ?? "",
    label_es: row?.label_es ?? "",
    contexts: row?.contexts ?? [],
    sort_order: String(row?.sort_order ?? 100),
  };
}

const CONTEXT_LABELS: Record<OverrideContext, string> = {
  factoring: "Factoring",
  expense: "Expense",
  load_wizard: "Load wizard",
  settlement: "Settlement",
  banking: "Banking",
  invoice: "Invoice",
  bill: "Bill",
  dispatch: "Dispatch",
  safety: "Safety",
  maintenance: "Maintenance",
};

export function OverrideReasonsListPage() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState<StatusFilter>("active");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [activeRow, setActiveRow] = useState<OverrideReason | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  // LST-F5211 — Live Chrome deep-link: hub / Lists ?create=1 must open Create Entry (Payment Methods parity).
  useEffect(() => {
    if (searchParams.get("create") !== "1" || !companyId) return;
    setModalMode("create");
    setActiveRow(null);
    setConflictError(null);
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    setSearchParams(next, { replace: true });
  }, [searchParams, companyId, setSearchParams]);

  const listQuery = useQuery({
    queryKey: ["override-reasons", companyId],
    queryFn: () => listOverrideReasons(companyId, { includeInactive: true, includeRoleOnly: true }),
    enabled: Boolean(companyId),
    ...catalogListSearchQueryOptions,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateOverrideReasonInput) => createOverrideReason(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["void-cancel-reasons"] });
      setModalMode(null);
      setActiveRow(null);
    },
    onError: (error) => setConflictError(parseConflict(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateOverrideReasonInput }) =>
      updateOverrideReason(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["void-cancel-reasons"] });
      setModalMode(null);
      setActiveRow(null);
    },
    onError: (error) => setConflictError(parseConflict(error)),
  });

  // LISTS-F6334: unlike createMutation/updateMutation above (both wire onError to
  // setConflictError), deactivateMutation had no onError at all — a rejected deactivate silently
  // did nothing.
  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateOverrideReason(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["void-cancel-reasons"] });
      setModalMode(null);
      setActiveRow(null);
    },
    onError: (error) => setConflictError(parseConflict(error) ?? "Could not deactivate this reason."),
  });

  const allRows = listQuery.data?.reasons ?? [];
  // Round 296 filter law: the whole catalog is loaded; Show narrows by is_active and the house toolbar (ParityTable's
  // UniversalListToolbar) is the ONE search, over every row, with "N of M".
  const rows = useMemo(
    () => allRows.filter((row) => status === "all" || (status === "active" ? row.is_active : !row.is_active)),
    [allRows, status],
  );

  const isSaving = createMutation.isPending || updateMutation.isPending || deactivateMutation.isPending;
  const breadcrumb = useMemo(() => ["Lists & Catalogs", "Accounting", "Override Reasons"], []);

  const columns = [
    { key: "reason_code", label: "Code", sortable: true, render: (row: OverrideReason) => <span className="font-semibold text-[#1F2A44]">{row.reason_code}</span> },
    { key: "label_en", label: "Label (EN)", sortable: true, render: (row: OverrideReason) => <span className="text-[#1F2A44]">{row.label_en}</span> },
    { key: "label_es", label: "Label (ES)", sortable: true, render: (row: OverrideReason) => <span className="text-[#1F2A44]">{row.label_es}</span> },
    { key: "contexts", label: "Used in", sortable: true, sortValue: (row: OverrideReason) => row.contexts.join(","), render: (row: OverrideReason) => <span className="text-[#1F2A44]">{row.contexts.map((c) => CONTEXT_LABELS[c] ?? c).join(", ")}</span> },
    { key: "role_only", label: "Who", sortable: true, sortValue: (row: OverrideReason) => (row.role_only ? 1 : 0), render: (row: OverrideReason) => <span className="text-[#1F2A44]">{row.role_only ? "Owner / Accountant button" : "Reason list"}</span> },
    { key: "sort_order", label: "Order", sortable: true, kind: "number" as const, render: (row: OverrideReason) => <span className="text-[#1F2A44]">{row.sort_order}</span> },
    { key: "is_active", label: "Status", sortable: true, render: (row: OverrideReason) => <span className={statusPill(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span> },
  ];

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={breadcrumb}
        title="Override Reasons"
        countBadge={rows.length}
        actions={
          <Button
            onClick={() => {
              setConflictError(null);
              setActiveRow(null);
              setModalMode("create");
            }}
          >
            + Create Entry
          </Button>
        }
      />

      <div className="rounded-sm border border-[#E5E7EB] bg-white p-3 text-xs text-[#4B5563]">
        The one list of override reasons used across the app (factoring, expense, load wizard, settlement, banking,
        invoice, bill, dispatch, safety, maintenance). Owner and Accountant just confirm an override; everyone else picks a
        reason from this list for that screen. Nothing is typed. Per entity.
      </div>

      <div className="flex items-end gap-2 rounded-sm border border-[#E5E7EB] bg-white p-3">
        <label className={FORM_LABEL_STACK_CLASS}>
          Show
          <SelectCombobox
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="h-9 rounded-sm border border-gray-300 px-2 text-xs"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </SelectCombobox>
        </label>
      </div>

      {listQuery.isError ? (
        <ListErrorState
          title="Couldn't load list"
          status={0}
          message="Failed to load override reasons."
          onRetry={() => { void listQuery.refetch(); }}
        />
      ) : (
        <ParityTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          onRowClick={(row) => {
            setConflictError(null);
            setActiveRow(row);
            setModalMode("edit");
          }}
          loading={listQuery.isLoading}
          title="Override reasons"
          storageKey="override-reasons"
          allowAllPageSize
        />
      )}


      <OverrideReasonModal
        open={modalMode !== null}
        mode={modalMode ?? "create"}
        initialRow={activeRow}
        conflictError={conflictError}
        saving={isSaving}
        onClose={() => {
          setModalMode(null);
          setActiveRow(null);
        }}
        onSave={async (form) => {
          setConflictError(null);
          if (modalMode === "create") {
            await createMutation.mutateAsync({
              operating_company_id: companyId,
              reason_code: form.reason_code,
              label_en: form.label_en,
              label_es: form.label_es,
              contexts: form.contexts,
              sort_order: Number(form.sort_order),
            });
            return;
          }
          if (!activeRow) return;
          await updateMutation.mutateAsync({
            id: activeRow.id,
            payload: {
              ...(activeRow.role_only ? {} : { reason_code: form.reason_code, contexts: form.contexts }),
              label_en: form.label_en,
              label_es: form.label_es,
              sort_order: Number(form.sort_order),
            },
          });
        }}
        onDeactivate={
          modalMode === "edit" && activeRow && !activeRow.role_only
            ? async () => {
                await deactivateMutation.mutateAsync(activeRow.id);
              }
            : undefined
        }
      />
    </div>
  );
}

type ModalProps = {
  open: boolean;
  mode: "create" | "edit";
  initialRow: OverrideReason | null;
  conflictError: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (form: FormState) => Promise<void>;
  onDeactivate?: () => Promise<void>;
};

function OverrideReasonModal({
  open,
  mode,
  initialRow,
  conflictError,
  saving,
  onClose,
  onSave,
  onDeactivate,
}: ModalProps) {
  const [form, setForm] = useState<FormState>(toInitial(initialRow));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!open) return;
    setForm(toInitial(initialRow));
    setFieldErrors({});
  }, [open, initialRow]);

  const normalizedCode = useMemo(() => form.reason_code.trim().toLowerCase(), [form.reason_code]);

  function validate(next: FormState): FieldErrors {
    const errors: FieldErrors = {};
    if (!REASON_CODE_REGEX.test(next.reason_code.trim())) {
      errors.reason_code = "Code must be lowercase letters, numbers, and underscores only.";
    }
    if (!next.label_en.trim()) errors.label_en = "English label is required.";
    if (!next.label_es.trim()) errors.label_es = "Spanish label is required.";
    if (next.contexts.length === 0) errors.contexts = "Pick at least one place this reason is used.";
    if (!next.sort_order.trim() || Number.isNaN(Number(next.sort_order))) {
      errors.sort_order = "Sort order is required.";
    }
    return errors;
  }

  async function submit() {
    const next: FormState = {
      ...form,
      reason_code: normalizedCode,
      label_en: form.label_en.trim(),
      label_es: form.label_es.trim(),
    };
    const errors = validate(next);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    await onSave(next);
  }

  return (
    <Modal
      variant="drawer"
      open={open}
      onClose={onClose}
      title={mode === "create" ? "Override Reasons · Create Entry" : "Override Reasons · Edit Entry"}
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-2">
          <label className={FORM_LABEL_STACK_CLASS}>
            Code
            <input data-control-kind="code"
              value={form.reason_code}
              disabled={Boolean(initialRow?.role_only)}
              onChange={(event) =>
                setForm((current) => ({ ...current, reason_code: event.target.value.toLowerCase() }))
              }
              className="h-9 rounded-sm border border-gray-300 px-2 text-xs"
              placeholder="example_code"
            />
            {fieldErrors.reason_code ? <span className="text-xs text-red-600">{fieldErrors.reason_code}</span> : null}
            {conflictError ? <span className="text-xs text-red-600">{conflictError}</span> : null}
          </label>

          <label className={FORM_LABEL_STACK_CLASS}>
            Label (English)
            <input
              value={form.label_en}
              onChange={(event) => setForm((current) => ({ ...current, label_en: event.target.value }))}
              className="h-9 rounded-sm border border-gray-300 px-2 text-xs"
              placeholder="Display label"
            />
            {fieldErrors.label_en ? <span className="text-xs text-red-600">{fieldErrors.label_en}</span> : null}
          </label>

          <label className={FORM_LABEL_STACK_CLASS}>
            Label (Spanish)
            <input
              value={form.label_es}
              onChange={(event) => setForm((current) => ({ ...current, label_es: event.target.value }))}
              className="h-9 rounded-sm border border-gray-300 px-2 text-xs"
              placeholder="Etiqueta"
            />
            {fieldErrors.label_es ? <span className="text-xs text-red-600">{fieldErrors.label_es}</span> : null}
          </label>

          <fieldset className="flex flex-col gap-1 text-xs font-semibold text-gray-600" disabled={Boolean(initialRow?.role_only)}>
            <legend>Used in</legend>
            <div className="grid grid-cols-2 gap-1">
              {OVERRIDE_CONTEXTS.map((ctx) => (
                <label key={ctx} className="flex items-center gap-2 font-normal text-[#1F2A44]">
                  <input
                    type="checkbox"
                    checked={form.contexts.includes(ctx)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        contexts: event.target.checked ? [...current.contexts, ctx] : current.contexts.filter((c) => c !== ctx),
                      }))
                    }
                    className="h-4 w-4 rounded-sm border-gray-300"
                  />
                  {CONTEXT_LABELS[ctx]}
                </label>
              ))}
            </div>
            {fieldErrors.contexts ? <span className="text-xs text-red-600">{fieldErrors.contexts}</span> : null}
          </fieldset>

          <label className={FORM_LABEL_STACK_CLASS}>
            Sort Order
            <input
              type="number"
              value={form.sort_order}
              onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))}
              className="h-9 rounded-sm border border-gray-300 px-2 text-xs"
            />
            {fieldErrors.sort_order ? <span className="text-xs text-red-600">{fieldErrors.sort_order}</span> : null}
          </label>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            {mode === "edit" && onDeactivate ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  void onDeactivate();
                }}
                disabled={saving || !initialRow?.is_active}
              >
                Deactivate
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {mode === "create" ? "Create Entry" : "Save Changes"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export { CATALOG_KEY as OVERRIDE_REASONS_CATALOG_KEY };
