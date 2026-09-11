import { useEffect, useMemo, useState } from "react";
import { CatalogListSearchInput } from "../../../components/lists/CatalogListSearchInput";
import { catalogListSearchQueryOptions } from "../../../hooks/catalogListSearchQueryOptions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import {
  createLoadExceptionReason,
  deactivateLoadExceptionReason,
  listLoadExceptionReasons,
  updateLoadExceptionReason,
  type CreateLoadExceptionReasonInput,
  type LoadExceptionReason,
  type UpdateLoadExceptionReasonInput,
} from "../../../api/catalogs";
import { Button } from "../../../components/Button";
import { DataTable } from "../../../components/DataTable";
import { Modal } from "../../../components/Modal";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { SelectCombobox } from "../../../components/Combobox";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useCreateQueryParam } from "../../../hooks/useCreateQueryParam";

// LEAD ITEM 1 (2026-09-11) — built exactly like LoadCancellationReasonsListPage.tsx (its sibling
// catalog page) so the owner adds/edits rows here with no code change, ever. A load EXCEPTION
// (breakdown, accident, weather, border hold, detention, etc.) is a SEPARATE operational domain from
// a load CANCELLATION (catalogs.load_cancellation_reasons) — the load stays active/in-motion through
// an exception, it does not terminate the way a cancellation does.
const CATALOG_KEY = "load-exception-reasons";

type StatusFilter = "active" | "inactive" | "all";

const CODE_REGEX = /^[a-z][a-z0-9_]+$/;

function statusPill(isActive: boolean) {
  return `inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold ${isActive ? "text-slate-700" : "text-slate-600"}`;
}

/** Export the visible exception reason rows as CSV. */
function exportExceptionReasonsCsv(rows: LoadExceptionReason[]) {
  const headers = ["Code", "Name", "Applies To", "Linked Module", "Order", "Status"];
  const data = rows.map((r) => [
    csvCell(r.code),
    csvCell(r.name),
    csvCell(r.applies_to),
    csvCell(r.linked_module ?? ""),
    String(r.sort_order),
    r.is_active ? "Active" : "Inactive",
  ]);
  const csv = [headers, ...data].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `load-exception-reasons-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseConflict(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 409) return "A reason with this code already exists for this company.";
  const data = error.data as { details?: { fieldErrors?: Record<string, string[]> } } | undefined;
  const fieldErrors = data?.details?.fieldErrors;
  if (!fieldErrors) return null;
  for (const messages of Object.values(fieldErrors)) {
    if (messages?.[0]) return messages[0];
  }
  return null;
}

type FormState = {
  code: string;
  name: string;
  applies_to: string;
  linked_module: string;
  sort_order: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

function toInitial(row: LoadExceptionReason | null): FormState {
  return {
    code: row?.code ?? "",
    name: row?.name ?? "",
    applies_to: row?.applies_to ?? "load",
    linked_module: row?.linked_module ?? "",
    sort_order: String(row?.sort_order ?? 0),
  };
}

export function LoadExceptionReasonsListPage() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [showInactive, setShowInactive] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [activeRow, setActiveRow] = useState<LoadExceptionReason | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  useCreateQueryParam({
    companyId,
    onOpenCreate: () => {
      setConflictError(null);
      setActiveRow(null);
      setModalMode("create");
    },
  });

  const listQuery = useQuery({
    queryKey: ["load-exception-reasons", companyId],
    queryFn: () => listLoadExceptionReasons(companyId, true),
    enabled: Boolean(companyId),
    ...catalogListSearchQueryOptions,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateLoadExceptionReasonInput) => createLoadExceptionReason(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["load-exception-reasons"] });
      setModalMode(null);
      setActiveRow(null);
    },
    onError: (error) => setConflictError(parseConflict(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateLoadExceptionReasonInput }) =>
      updateLoadExceptionReason(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["load-exception-reasons"] });
      setModalMode(null);
      setActiveRow(null);
    },
    onError: (error) => setConflictError(parseConflict(error)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateLoadExceptionReason(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["load-exception-reasons"] });
      setModalMode(null);
      setActiveRow(null);
    },
    onError: (error) => setConflictError(parseConflict(error) ?? "Could not deactivate this reason."),
  });

  const allRows = listQuery.data?.reasons ?? [];
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (status === "active" && !row.is_active) return false;
      if (status === "inactive" && row.is_active) return false;
      if (!showInactive && !row.is_active) return false;
      if (!term) return true;
      return row.code.toLowerCase().includes(term) || row.name.toLowerCase().includes(term);
    });
  }, [allRows, search, status, showInactive]);

  const isSaving = createMutation.isPending || updateMutation.isPending || deactivateMutation.isPending;
  const breadcrumb = useMemo(() => ["Lists & Catalogs", "Dispatch", "Load Exception Reasons"], []);

  const columns = [
    { key: "code", label: "Code", sortable: true, render: (row: LoadExceptionReason) => <span className="font-semibold text-slate-800">{row.code}</span> },
    { key: "name", label: "Name", sortable: true, render: (row: LoadExceptionReason) => <span className="text-slate-800">{row.name}</span> },
    { key: "applies_to", label: "Applies To", sortable: true, render: (row: LoadExceptionReason) => <span className="text-slate-700">{row.applies_to}</span> },
    { key: "linked_module", label: "Linked Module", sortable: true, render: (row: LoadExceptionReason) => <span className="text-slate-600">{row.linked_module ?? "—"}</span> },
    { key: "sort_order", label: "Order", sortable: true, numeric: true, render: (row: LoadExceptionReason) => <span className="text-slate-700">{row.sort_order}</span> },
    { key: "is_active", label: "Status", sortable: true, render: (row: LoadExceptionReason) => <span className={statusPill(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span> },
  ];

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={breadcrumb}
        title="Load Exception Reasons"
        countBadge={rows.length}
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setConflictError(null);
                setActiveRow(null);
                setModalMode("create");
              }}
            >
              + Create Entry
            </Button>
            <button
              type="button"
              onClick={() => exportExceptionReasonsCsv(rows)}
              className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Print
            </button>
          </div>
        }
      />

      <div className="rounded-sm border border-slate-200 bg-white p-3 text-xs text-slate-600">
        Operational exception taxonomy for loads still active/in-motion (breakdown, accident,
        weather, border hold, detention, etc.) — distinct from Load Cancellation Reasons, which is a
        load's terminal state.
      </div>

      <div className="grid gap-2 rounded-sm border border-slate-200 bg-white p-3 md:grid-cols-[1fr_180px]">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Search
          <CatalogListSearchInput value={search} onChange={setSearch} placeholder="Search code or name" className="h-9 rounded-sm border border-gray-300 px-2 text-xs" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
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

      <label className="flex items-center gap-1 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="h-3.5 w-3.5 rounded-sm border-gray-300"
        />
        Show inactive
      </label>

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
        tableKey="load-exception-reasons"
        errorState={
          listQuery.isError
            ? { status: 0, message: "Failed to load exception reasons.", onRetry: () => { void listQuery.refetch(); } }
            : undefined
        }
      />

      <div className="text-xs text-slate-500">Total rows: {rows.length}</div>

      <LoadExceptionReasonModal
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
              code: form.code,
              name: form.name,
              applies_to: form.applies_to || "load",
              linked_module: form.linked_module || null,
              sort_order: Number(form.sort_order),
            });
            return;
          }
          if (!activeRow) return;
          await updateMutation.mutateAsync({
            id: activeRow.id,
            payload: {
              code: form.code,
              name: form.name,
              applies_to: form.applies_to || "load",
              linked_module: form.linked_module || null,
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
  initialRow: LoadExceptionReason | null;
  conflictError: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (form: FormState) => Promise<void>;
  onDeactivate?: () => Promise<void>;
};

function LoadExceptionReasonModal({
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

  const normalizedCode = useMemo(() => form.code.trim().toLowerCase(), [form.code]);

  function validate(next: FormState): FieldErrors {
    const errors: FieldErrors = {};
    if (!CODE_REGEX.test(next.code.trim())) {
      errors.code = "Code must be lowercase letters, numbers, and underscores only.";
    }
    if (!next.name.trim()) errors.name = "Name is required.";
    if (!next.sort_order.trim() || Number.isNaN(Number(next.sort_order))) {
      errors.sort_order = "Sort order is required.";
    }
    return errors;
  }

  async function submit() {
    const next: FormState = {
      ...form,
      code: normalizedCode,
      name: form.name.trim(),
      applies_to: form.applies_to.trim(),
      linked_module: form.linked_module.trim(),
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
      title={mode === "create" ? "Load Exception Reasons · Create Entry" : "Load Exception Reasons · Edit Entry"}
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
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toLowerCase() }))}
              className="h-9 rounded-sm border border-gray-300 px-2 text-xs"
              placeholder="example_code"
            />
            {fieldErrors.code ? <span className="text-xs text-red-600">{fieldErrors.code}</span> : null}
            {conflictError ? <span className="text-xs text-red-600">{conflictError}</span> : null}
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Name
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="h-9 rounded-sm border border-gray-300 px-2 text-xs"
              placeholder="Display name"
            />
            {fieldErrors.name ? <span className="text-xs text-red-600">{fieldErrors.name}</span> : null}
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Applies To
            <input
              value={form.applies_to}
              onChange={(event) => setForm((current) => ({ ...current, applies_to: event.target.value }))}
              className="h-9 rounded-sm border border-gray-300 px-2 text-xs"
              placeholder="load"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Linked Module
            <input
              value={form.linked_module}
              onChange={(event) => setForm((current) => ({ ...current, linked_module: event.target.value }))}
              className="h-9 rounded-sm border border-gray-300 px-2 text-xs"
              placeholder="Optional — e.g. maintenance, safety, border, detention, dispatch"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
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

export { CATALOG_KEY as LOAD_EXCEPTION_REASONS_CATALOG_KEY };
