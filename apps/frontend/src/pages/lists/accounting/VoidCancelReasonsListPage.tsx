import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import {
  createVoidCancelReason,
  deactivateVoidCancelReason,
  listVoidCancelReasons,
  updateVoidCancelReason,
  type CreateVoidCancelReasonInput,
  type UpdateVoidCancelReasonInput,
  type VoidCancelReason,
} from "../../../api/catalogs";
import { Button } from "../../../components/Button";
import { DataTable } from "../../../components/DataTable";
import { Modal } from "../../../components/Modal";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useCompanyContext } from "../../../contexts/CompanyContext";

const CATALOG_KEY = "void-cancel-reasons";

type StatusFilter = "active" | "inactive" | "all";

// Seed codes are lowercase snake_case; keep owner-added codes consistent with the DB convention.
const REASON_CODE_REGEX = /^[a-z][a-z0-9_]*$/;

function statusPill(isActive: boolean) {
  return isActive
    ? "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700"
    : "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500";
}

function parseConflict(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 409) return "A reason with this code already exists for this company.";
  const data = error.data as { details?: { fieldErrors?: Record<string, string[]> } } | undefined;
  return data?.details?.fieldErrors?.reason_code?.[0] ?? null;
}

type FormState = {
  reason_code: string;
  reason_label: string;
  requires_note: boolean;
  sort_order: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

function toInitial(row: VoidCancelReason | null): FormState {
  return {
    reason_code: row?.reason_code ?? "",
    reason_label: row?.reason_label ?? "",
    requires_note: row?.requires_note ?? false,
    sort_order: String(row?.sort_order ?? 100),
  };
}

export function VoidCancelReasonsListPage() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [activeRow, setActiveRow] = useState<VoidCancelReason | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["void-cancel-reasons", companyId],
    queryFn: () => listVoidCancelReasons(companyId, true),
    enabled: Boolean(companyId),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateVoidCancelReasonInput) => createVoidCancelReason(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["void-cancel-reasons"] });
      setModalMode(null);
      setActiveRow(null);
    },
    onError: (error) => setConflictError(parseConflict(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateVoidCancelReasonInput }) =>
      updateVoidCancelReason(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["void-cancel-reasons"] });
      setModalMode(null);
      setActiveRow(null);
    },
    onError: (error) => setConflictError(parseConflict(error)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateVoidCancelReason(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["void-cancel-reasons"] });
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
      return row.reason_code.toLowerCase().includes(term) || row.reason_label.toLowerCase().includes(term);
    });
  }, [allRows, search, status]);

  const isSaving = createMutation.isPending || updateMutation.isPending || deactivateMutation.isPending;
  const breadcrumb = useMemo(() => ["Lists & Catalogs", "Accounting", "Void/Cancel Reasons"], []);

  const columns = [
    { key: "reason_code", label: "Code", sortable: true, render: (row: VoidCancelReason) => <span className="font-semibold text-slate-800">{row.reason_code}</span> },
    { key: "reason_label", label: "Label", sortable: true, render: (row: VoidCancelReason) => <span className="text-slate-800">{row.reason_label}</span> },
    { key: "requires_note", label: "Note Required", sortable: true, render: (row: VoidCancelReason) => <span className="text-slate-700">{row.requires_note ? "Yes" : "No"}</span> },
    { key: "sort_order", label: "Order", sortable: true, numeric: true, render: (row: VoidCancelReason) => <span className="text-slate-700">{row.sort_order}</span> },
    { key: "is_active", label: "Status", sortable: true, render: (row: VoidCancelReason) => <span className={statusPill(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span> },
  ];

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={breadcrumb}
        title="Void/Cancel Reasons"
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
        Controlled reasons for FINANCIAL void/cancel actions (invoices, bills, payments, journal entries,
        settlements, work-order voids). Per entity. A reason marked "Note Required" forces a note when chosen.
      </div>

      <div className="grid gap-2 rounded border border-slate-200 bg-white p-3 md:grid-cols-[1fr_180px]">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Search
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search code or label"
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

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={(row) => {
          setConflictError(null);
          setActiveRow(row);
          setModalMode("edit");
        }}
        loading={listQuery.isLoading}
        tableKey="void-cancel-reasons"
        errorState={
          listQuery.isError
            ? { status: 0, message: "Failed to load void/cancel reasons.", onRetry: () => { void listQuery.refetch(); } }
            : undefined
        }
      />

      <div className="text-xs text-slate-500">Total rows: {rows.length}</div>

      <VoidCancelReasonModal
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
              reason_label: form.reason_label,
              requires_note: form.requires_note,
              sort_order: Number(form.sort_order),
            });
            return;
          }
          if (!activeRow) return;
          await updateMutation.mutateAsync({
            id: activeRow.id,
            payload: {
              reason_code: form.reason_code,
              reason_label: form.reason_label,
              requires_note: form.requires_note,
              sort_order: Number(form.sort_order),
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
  initialRow: VoidCancelReason | null;
  conflictError: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (form: FormState) => Promise<void>;
  onDeactivate?: () => Promise<void>;
};

function VoidCancelReasonModal({
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
    if (!next.reason_label.trim()) errors.reason_label = "Label is required.";
    if (!next.sort_order.trim() || Number.isNaN(Number(next.sort_order))) {
      errors.sort_order = "Sort order is required.";
    }
    return errors;
  }

  async function submit() {
    const next: FormState = {
      ...form,
      reason_code: normalizedCode,
      reason_label: form.reason_label.trim(),
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
      title={mode === "create" ? "Void/Cancel Reasons · Create Entry" : "Void/Cancel Reasons · Edit Entry"}
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
                setForm((current) => ({ ...current, reason_code: event.target.value.toLowerCase() }))
              }
              className="h-9 rounded border border-gray-300 px-2 text-[13px]"
              placeholder="example_code"
            />
            {fieldErrors.reason_code ? <span className="text-xs text-red-600">{fieldErrors.reason_code}</span> : null}
            {conflictError ? <span className="text-xs text-red-600">{conflictError}</span> : null}
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Label
            <input
              value={form.reason_label}
              onChange={(event) => setForm((current) => ({ ...current, reason_label: event.target.value }))}
              className="h-9 rounded border border-gray-300 px-2 text-[13px]"
              placeholder="Display label"
            />
            {fieldErrors.reason_label ? <span className="text-xs text-red-600">{fieldErrors.reason_label}</span> : null}
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <input
              type="checkbox"
              checked={form.requires_note}
              onChange={(event) => setForm((current) => ({ ...current, requires_note: event.target.checked }))}
              className="h-4 w-4 rounded border-gray-300"
            />
            Require a note when this reason is chosen
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

export { CATALOG_KEY as VOID_CANCEL_REASONS_CATALOG_KEY };
