import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import {
  createDriverTerminationReason,
  deactivateDriverTerminationReason,
  listDriverTerminationReasons,
  updateDriverTerminationReason,
  type CreateDriverTerminationReasonInput,
  type DriverTerminationReason,
  type DriverTerminationSeverity,
  type UpdateDriverTerminationReasonInput,
} from "../../../api/catalogs";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type StatusFilter = "active" | "inactive" | "all";

const CODE_REGEX = /^[a-z][a-z0-9_]+$/;

const SEVERITY_OPTIONS: { value: DriverTerminationSeverity; label: string }[] = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "severe", label: "Severe" },
];

const SEVERITY_LABELS: Record<DriverTerminationSeverity, string> = {
  info: "Info",
  warning: "Warning",
  severe: "Severe",
};

function severityBadgeClass(severity: DriverTerminationSeverity) {
  switch (severity) {
    case "severe":
      return "rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700";
    case "warning":
      return "rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800";
    default:
      return "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
  }
}

function statusPillClass(isActive: boolean) {
  return isActive
    ? "rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700"
    : "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600";
}

type FormState = {
  code: string;
  label: string;
  description: string;
  severity: DriverTerminationSeverity;
};

function toInitial(row: DriverTerminationReason | null): FormState {
  return {
    code: row?.code ?? "",
    label: row?.label ?? "",
    description: row?.description ?? "",
    severity: row?.severity ?? "warning",
  };
}

export function TerminationReasonsListPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [modalOpen, setModalOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<DriverTerminationReason | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["driver-termination-reasons"],
    queryFn: () => listDriverTerminationReasons(true),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateDriverTerminationReasonInput) => createDriverTerminationReason(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["driver-termination-reasons"] });
      setModalOpen(false);
      setActiveRow(null);
    },
    onError: (error) => setConflictError(parseConflict(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateDriverTerminationReasonInput }) =>
      updateDriverTerminationReason(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["driver-termination-reasons"] });
      setModalOpen(false);
      setActiveRow(null);
    },
    onError: (error) => setConflictError(parseConflict(error)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateDriverTerminationReason(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["driver-termination-reasons"] });
      setModalOpen(false);
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
      return row.code.toLowerCase().includes(term) || row.label.toLowerCase().includes(term);
    });
  }, [allRows, search, status]);

  const isSaving = createMutation.isPending || updateMutation.isPending || deactivateMutation.isPending;

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Drivers", "Termination reasons"]}
        title="Termination Reasons"
        countBadge={rows.length}
        actions={
          <Button
            onClick={() => {
              setConflictError(null);
              setActiveRow(null);
              setModalOpen(true);
            }}
          >
            + Create
          </Button>
        }
      />
      {listQuery.isError ? <ListErrorBanner onRetry={() => void listQuery.refetch()} /> : null}

      <div className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-600">
        Termination / separation reason taxonomy used on driver safety events. Severity influences how
        returning-driver detection surfaces the warning. Editable by Owners.
      </div>

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-3">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by code or label" className="h-9 rounded border border-gray-300 px-2 text-sm md:col-span-2" />
        <SelectCombobox value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="h-9 rounded border border-gray-300 px-2 text-sm">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </SelectCombobox>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Label</th>
              <th className="px-3 py-2 text-left">Severity</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {listQuery.isLoading ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={4}>
                  Loading termination reasons...
                </td>
              </tr>
            ) : null}
            {!listQuery.isLoading && rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={4}>
                  No termination reasons match these filters
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                onClick={() => {
                  setConflictError(null);
                  setActiveRow(row);
                  setModalOpen(true);
                }}
              >
                <td className="px-3 py-2 text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.code}</td>
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2">
                  <span className={severityBadgeClass(row.severity)}>{SEVERITY_LABELS[row.severity]}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500">Total rows: {rows.length}</div>

      <TerminationReasonModal
        open={modalOpen}
        initialRow={activeRow}
        conflictError={conflictError}
        saving={isSaving}
        onClose={() => {
          setModalOpen(false);
          setActiveRow(null);
        }}
        onSave={async (form) => {
          setConflictError(null);
          if (!activeRow) {
            await createMutation.mutateAsync({
              code: form.code,
              label: form.label,
              description: form.description || null,
              severity: form.severity,
            });
            return;
          }
          await updateMutation.mutateAsync({
            id: activeRow.id,
            payload: {
              code: form.code,
              label: form.label,
              description: form.description || null,
              severity: form.severity,
            },
          });
        }}
        onDeactivate={
          activeRow
            ? async () => {
                await deactivateMutation.mutateAsync(activeRow.id);
              }
            : undefined
        }
      />
    </div>
  );
}

function parseConflict(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 409) return "A termination reason with this code already exists.";
  const data = error.data as { details?: { fieldErrors?: Record<string, string[]> } } | undefined;
  return data?.details?.fieldErrors?.code?.[0] ?? null;
}

type ModalProps = {
  open: boolean;
  initialRow: DriverTerminationReason | null;
  conflictError: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (form: FormState) => Promise<void>;
  onDeactivate?: () => Promise<void>;
};

function TerminationReasonModal({ open, initialRow, conflictError, saving, onClose, onSave, onDeactivate }: ModalProps) {
  const [form, setForm] = useState<FormState>(toInitial(initialRow));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const isEdit = Boolean(initialRow);

  useEffect(() => {
    if (!open) return;
    setForm(toInitial(initialRow));
    setFieldErrors({});
  }, [open, initialRow]);

  function validate(next: FormState) {
    const errors: Record<string, string> = {};
    if (!CODE_REGEX.test(next.code.trim())) errors.code = "Use lowercase letters, numbers, and underscores only.";
    if (!next.label.trim()) errors.label = "Label is required.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submit() {
    const next: FormState = {
      ...form,
      code: form.code.trim(),
      label: form.label.trim(),
      description: form.description.trim(),
    };
    if (!validate(next)) return;
    await onSave(next);
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit Termination Reason" : "Create Termination Reason"}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-600">
          Code
          <input
            value={form.code}
            onChange={(event) => setForm((v) => ({ ...v, code: event.target.value.toLowerCase() }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
            placeholder="fired_aggressive"
          />
          {fieldErrors.code ? <div className="mt-1 text-[11px] text-red-700">{fieldErrors.code}</div> : null}
          {conflictError ? <div className="mt-1 text-[11px] text-red-700">{conflictError}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Label
          <input
            value={form.label}
            onChange={(event) => setForm((v) => ({ ...v, label: event.target.value }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
          />
          {fieldErrors.label ? <div className="mt-1 text-[11px] text-red-700">{fieldErrors.label}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Severity
          <SelectCombobox value={form.severity} onChange={(event) => setForm((v) => ({ ...v, severity: event.target.value as DriverTerminationSeverity }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm">
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectCombobox>
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Description
          <textarea
            value={form.description}
            onChange={(event) => setForm((v) => ({ ...v, description: event.target.value }))}
            rows={3}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="Optional description"
          />
        </label>

        <div className="flex items-center justify-between">
          <div>
            {isEdit && onDeactivate ? (
              <Button type="button" variant="secondary" disabled={saving || !initialRow?.is_active} onClick={() => void onDeactivate()}>
                Deactivate
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={saving}>
              {isEdit ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
