import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import {
  createLoadCancellationReason,
  deactivateLoadCancellationReason,
  listLoadCancellationReasons,
  updateLoadCancellationReason,
  type CreateLoadCancellationReasonInput,
  type LoadCancellationReason,
  type LoadCancellationReasonCategory,
  type UpdateLoadCancellationReasonInput,
} from "../../../api/catalogs";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useCompanyContext } from "../../../contexts/CompanyContext";

const CATALOG_KEY = "load-cancellation-reasons";

type StatusFilter = "active" | "inactive" | "all";

const CATEGORY_OPTIONS: { value: LoadCancellationReasonCategory; label: string }[] = [
  { value: "customer_initiated", label: "Customer Initiated" },
  { value: "carrier_initiated", label: "Carrier Initiated" },
  { value: "force_majeure", label: "Force Majeure" },
  { value: "other", label: "Other" },
];

const CATEGORY_LABELS = CATEGORY_OPTIONS.reduce<Record<string, string>>((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

const REASON_CODE_REGEX = /^[A-Z][A-Z0-9_]+$/;

function statusPill(isActive: boolean) {
  return isActive
    ? "inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700"
    : "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600";
}

function parseConflict(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 409) return "A reason with this code already exists for this company.";
  const data = error.data as { details?: { fieldErrors?: Record<string, string[]> } } | undefined;
  return data?.details?.fieldErrors?.reason_code?.[0] ?? null;
}

type FormState = {
  reason_code: string;
  display_name: string;
  category: LoadCancellationReasonCategory;
  description: string;
  sort_order: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

function toInitial(row: LoadCancellationReason | null): FormState {
  return {
    reason_code: row?.reason_code ?? "",
    display_name: row?.display_name ?? "",
    category: row?.category ?? "other",
    description: row?.description ?? "",
    sort_order: String(row?.sort_order ?? 100),
  };
}

export function LoadCancellationReasonsListPage() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [activeRow, setActiveRow] = useState<LoadCancellationReason | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["load-cancellation-reasons", companyId],
    queryFn: () => listLoadCancellationReasons(companyId, true),
    enabled: Boolean(companyId),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateLoadCancellationReasonInput) => createLoadCancellationReason(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["load-cancellation-reasons"] });
      setModalMode(null);
      setActiveRow(null);
    },
    onError: (error) => setConflictError(parseConflict(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateLoadCancellationReasonInput }) =>
      updateLoadCancellationReason(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["load-cancellation-reasons"] });
      setModalMode(null);
      setActiveRow(null);
    },
    onError: (error) => setConflictError(parseConflict(error)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateLoadCancellationReason(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["load-cancellation-reasons"] });
      setModalMode(null);
      setActiveRow(null);
    },
  });

  const allRows = listQuery.data?.reasons ?? [];
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (status === "active" && !row.is_active) return false;
      if (status === "inactive" && row.is_active) return false;
      if (!term) return true;
      return (
        row.reason_code.toLowerCase().includes(term) ||
        row.display_name.toLowerCase().includes(term)
      );
    });
  }, [allRows, search, status]);

  const isSaving = createMutation.isPending || updateMutation.isPending || deactivateMutation.isPending;
  const breadcrumb = useMemo(() => ["Lists & Catalogs", "Dispatch", "Load Cancellation Reasons"], []);

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={breadcrumb}
        title="Load Cancellation Reasons"
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

      <div className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-600">
        Cancellation root-cause reporting taxonomy. Codes here classify why a load was cancelled for
        dispatch reporting and analytics.
      </div>

      <div className="grid gap-2 rounded border border-slate-200 bg-white p-3 md:grid-cols-[1fr_180px]">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Search
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search code or display name"
            className="h-9 rounded border border-gray-300 px-2 text-[13px]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Show
          <SelectCombobox
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="h-9 rounded border border-gray-300 px-2 text-[13px]"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </SelectCombobox>
        </label>
      </div>

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50">
            <tr className="text-slate-600">
              <th className="px-3 py-2 font-semibold">Code</th>
              <th className="px-3 py-2 font-semibold">Display Name</th>
              <th className="px-3 py-2 font-semibold">Category</th>
              <th className="px-3 py-2 font-semibold">Desc</th>
              <th className="px-3 py-2 font-semibold">Order</th>
              <th className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {listQuery.isLoading ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={6}>
                  Loading entries...
                </td>
              </tr>
            ) : null}
            {!listQuery.isLoading && rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={6}>
                  No entries match these filters
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                onClick={() => {
                  setConflictError(null);
                  setActiveRow(row);
                  setModalMode("edit");
                }}
              >
                <td className="px-3 py-2 font-semibold text-slate-800">{row.reason_code}</td>
                <td className="px-3 py-2 text-slate-800">{row.display_name}</td>
                <td className="px-3 py-2 text-slate-700">{CATEGORY_LABELS[row.category] ?? row.category}</td>
                <td className="max-w-[280px] truncate px-3 py-2 text-slate-600">{row.description ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700">{row.sort_order}</td>
                <td className="px-3 py-2">
                  <span className={statusPill(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500">Total rows: {rows.length}</div>

      <LoadCancellationReasonModal
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
              display_name: form.display_name,
              category: form.category,
              sort_order: Number(form.sort_order),
              description: form.description || null,
            });
            return;
          }
          if (!activeRow) return;
          await updateMutation.mutateAsync({
            id: activeRow.id,
            payload: {
              reason_code: form.reason_code,
              display_name: form.display_name,
              category: form.category,
              sort_order: Number(form.sort_order),
              description: form.description || null,
            },
          });
        }}
        onDeactivate={
          modalMode === "edit" && activeRow
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
  initialRow: LoadCancellationReason | null;
  conflictError: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (form: FormState) => Promise<void>;
  onDeactivate?: () => Promise<void>;
};

function LoadCancellationReasonModal({
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

  const normalizedCode = useMemo(() => form.reason_code.trim().toUpperCase(), [form.reason_code]);

  function validate(next: FormState): FieldErrors {
    const errors: FieldErrors = {};
    if (!REASON_CODE_REGEX.test(next.reason_code.trim())) {
      errors.reason_code = "Code must be uppercase letters, numbers, and underscores only.";
    }
    if (!next.display_name.trim()) errors.display_name = "Display name is required.";
    if (!next.sort_order.trim() || Number.isNaN(Number(next.sort_order))) {
      errors.sort_order = "Sort order is required.";
    }
    return errors;
  }

  async function submit() {
    const next: FormState = {
      ...form,
      reason_code: normalizedCode,
      display_name: form.display_name.trim(),
      description: form.description.trim(),
    };
    const errors = validate(next);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    await onSave(next);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "Load Cancellation Reasons · Create Entry" : "Load Cancellation Reasons · Edit Entry"}
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Code
            <input
              value={form.reason_code}
              onChange={(event) =>
                setForm((current) => ({ ...current, reason_code: event.target.value.toUpperCase() }))
              }
              className="h-9 rounded border border-gray-300 px-2 text-[13px]"
              placeholder="EXAMPLE_CODE"
            />
            {fieldErrors.reason_code ? <span className="text-xs text-red-600">{fieldErrors.reason_code}</span> : null}
            {conflictError ? <span className="text-xs text-red-600">{conflictError}</span> : null}
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Display Name
            <input
              value={form.display_name}
              onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
              className="h-9 rounded border border-gray-300 px-2 text-[13px]"
              placeholder="Display name"
            />
            {fieldErrors.display_name ? <span className="text-xs text-red-600">{fieldErrors.display_name}</span> : null}
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Category
            <SelectCombobox
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({ ...current, category: event.target.value as LoadCancellationReasonCategory }))
              }
              className="h-9 rounded border border-gray-300 px-2 text-[13px]"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectCombobox>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Description
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              className="rounded border border-gray-300 px-2 py-1.5 text-[13px]"
              placeholder="Optional description"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Sort Order
            <input
              type="number"
              value={form.sort_order}
              onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))}
              className="h-9 rounded border border-gray-300 px-2 text-[13px]"
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

export { CATALOG_KEY as LOAD_CANCELLATION_REASONS_CATALOG_KEY };
