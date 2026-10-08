import { useEffect, useMemo, useState } from "react";
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
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
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
//
// ROUND 17.2 (Lead, 2026-09-12 00:30 UTC): switched from components/DataTable to
// components/parity/ParityTable — the go26-consolidation-ratchet (owner ruling 2026-09-02) freezes
// DataTable importer count; this file was NEW sprawl behind that freeze. Matches
// DispatchCatalogListPage.tsx's ParityTable usage (columns/sort/storageKey/export/empty state).
const CATALOG_KEY = "load-exception-reasons";

type StatusFilter = "active" | "inactive" | "all";

const CODE_REGEX = /^[a-z][a-z0-9_]+$/;

function statusPill(isActive: boolean) {
  return `inline-flex rounded-full bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold ${isActive ? "text-[#1F2A44]" : "text-[#4B5563]"}`;
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

  const [status, setStatus] = useState<StatusFilter>("active");
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
  // Round 296 filter law: the whole catalog is loaded; the Show selector narrows by is_active and the house toolbar
  // (the table's UniversalListToolbar) is the ONE search, over every row, with "N of M". The old page search +
  // "Show inactive" checkbox double-filtered: Show = Inactive rendered nothing until the checkbox was also ticked.
  const rows = useMemo(
    () => allRows.filter((row) => status === "all" || (status === "active" ? row.is_active : !row.is_active)),
    [allRows, status],
  );

  const isSaving = createMutation.isPending || updateMutation.isPending || deactivateMutation.isPending;
  const breadcrumb = useMemo(() => ["Lists & Catalogs", "Dispatch", "Load Exception Reasons"], []);

  const columns: Array<ParityColumn<LoadExceptionReason>> = [
    { key: "code", label: "Code", sortable: true, render: (row) => <span className="font-semibold text-[#0F1219]">{row.code}</span> },
    { key: "name", label: "Name", sortable: true, render: (row) => <span className="text-[#0F1219]">{row.name}</span> },
    { key: "applies_to", label: "Applies To", sortable: true, render: (row) => <span className="text-[#1F2A44]">{row.applies_to}</span> },
    { key: "linked_module", label: "Linked Module", sortable: true, render: (row) => <span className="text-[#4B5563]">{row.linked_module ?? "—"}</span> },
    { key: "sort_order", label: "Order", sortable: true, render: (row) => <span className="text-[#1F2A44]">{row.sort_order}</span> },
    {
      key: "is_active",
      label: "Status",
      sortable: true,
      sortValue: (row) => (row.is_active ? 1 : 0),
      render: (row) => <span className={statusPill(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span>,
    },
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
              onClick={() => window.print()}
              className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Print
            </button>
          </div>
        }
      />

      <div className="rounded-sm border border-[#E5E7EB] bg-white p-3 text-xs text-[#4B5563]">
        Operational exception taxonomy for loads still active/in-motion (breakdown, accident,
        weather, border hold, detention, etc.) — distinct from Load Cancellation Reasons, which is a
        load's terminal state.
      </div>

      <div className="grid gap-2 rounded-sm border border-[#E5E7EB] bg-white p-3 md:grid-cols-[1fr_180px]">
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

      {listQuery.isError ? (
        <ListErrorState
          title="Couldn't load exception reasons"
          status={listQuery.error instanceof ApiError ? listQuery.error.status : 0}
          message={(listQuery.error as Error | null)?.message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={listQuery.isLoading}
          emptyText="No exception reasons match these filters"
          storageKey="load-exception-reasons"
          tableTestId="load-exception-reasons-table"
          exportFilename={`load-exception-reasons-${new Date().toISOString().slice(0, 10)}`}
          onRowClick={(row) => {
            setConflictError(null);
            setActiveRow(row);
            setModalMode("edit");
          }}
        />
      )}

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
