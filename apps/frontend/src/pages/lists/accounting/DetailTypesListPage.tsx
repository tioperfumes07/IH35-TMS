import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import { getAccountTypeCatalog } from "../../../api/account-type-catalog";
import { detailTypesCatalogClient, type DetailTypeRow } from "../../../api/detail-types-catalog";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useCompanyContext } from "../../../contexts/CompanyContext";

type StatusFilter = "true" | "false" | "all";

type FormState = { account_type_id: string; name: string; code: string; description: string; sort_order: number };

const EMPTY: FormState = { account_type_id: "", name: "", code: "", description: "", sort_order: 100 };

// Detail Type catalog (Block 4). Account Type is the fixed global taxonomy (read-only); detail types
// are canonical system rows (immutable, shared) + this entity's custom rows. Create/edit writes only
// per-entity non-system rows.
export function DetailTypesListPage() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [typeFilter, setTypeFilter] = useState("");
  const [status, setStatus] = useState<StatusFilter>("true");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [activeRow, setActiveRow] = useState<DetailTypeRow | null>(null);
  const [submitError, setSubmitError] = useState("");

  const accountTypesQuery = useQuery({ queryKey: ["account-type-catalog"], queryFn: getAccountTypeCatalog });
  const typeLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of accountTypesQuery.data ?? []) map.set(t.id, t.accountType);
    return map;
  }, [accountTypesQuery.data]);

  const listQuery = useQuery({
    queryKey: ["detail-types", companyId, typeFilter, status],
    queryFn: () => detailTypesCatalogClient.list({ operating_company_id: companyId, account_type_id: typeFilter || undefined, is_active: status, limit: 500 }),
    enabled: Boolean(companyId),
  });
  const rows = listQuery.data?.rows ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["detail-types"] });
  const createMutation = useMutation({
    mutationFn: (b: FormState) => detailTypesCatalogClient.create(companyId, { account_type_id: b.account_type_id, name: b.name, code: b.code || undefined, description: b.description || undefined, sort_order: b.sort_order }),
    onSuccess: async () => { await invalidate(); setModalMode(null); setActiveRow(null); },
    onError: (e) => setSubmitError(e instanceof ApiError ? String((e.data as Record<string, unknown>)?.error ?? e.message) : "Failed to create detail type."),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, b }: { id: string; b: FormState }) => detailTypesCatalogClient.update(id, companyId, { name: b.name, code: b.code || undefined, description: b.description || undefined, sort_order: b.sort_order }),
    onSuccess: async () => { await invalidate(); setModalMode(null); setActiveRow(null); },
    onError: (e) => setSubmitError(e instanceof ApiError ? String((e.data as Record<string, unknown>)?.error ?? e.message) : "Failed to update detail type."),
  });
  const deactivateMutation = useMutation({
    mutationFn: (id: string) => detailTypesCatalogClient.deactivate(id, companyId),
    onSuccess: async () => { await invalidate(); setModalMode(null); setActiveRow(null); },
  });

  const nextSort = rows.length ? Math.max(...rows.map((r) => r.sort_order ?? 0)) + 1 : 100;

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Accounting", "Detail Type"]}
        title="Detail Type"
        countBadge={rows.length}
        actions={
          <Button onClick={() => { setSubmitError(""); setActiveRow(null); setModalMode("create"); }}>+ Create</Button>
        }
      />

      <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Detail Types sub-classify each Account Type. The canonical set is system-locked and shared across
        entities; you can add your own custom detail types per entity. Account Type itself is a fixed
        reference taxonomy (read-only).
      </div>

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Account Type
          <SelectCombobox value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-9 rounded border border-gray-300 px-2 text-sm">
            <option value="">All account types</option>
            {(accountTypesQuery.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.group} · {t.accountType}</option>
            ))}
          </SelectCombobox>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Status
          <SelectCombobox value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="h-9 rounded border border-gray-300 px-2 text-sm">
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="all">All</option>
          </SelectCombobox>
        </label>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Account Type</th>
              <th className="px-3 py-2 text-left">Detail Type</th>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Order</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-t border-gray-100 ${row.is_system ? "" : "cursor-pointer hover:bg-gray-50"}`}
                onClick={() => { if (row.is_system) return; setSubmitError(""); setActiveRow(row); setModalMode("edit"); }}
              >
                <td className="px-3 py-2 text-slate-700">{typeLabel.get(row.account_type_id) ?? "—"}</td>
                <td className="px-3 py-2 font-medium text-slate-800">{row.name}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{row.code || "—"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${row.is_system ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-800"}`}>
                    {row.is_system ? "System (locked)" : "Custom"}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-700">{row.sort_order}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${row.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                    {row.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {listQuery.isLoading ? <div className="px-3 py-6 text-sm text-gray-500">Loading detail types…</div> : rows.length === 0 ? <div className="px-3 py-6 text-sm text-gray-500">No detail types found.</div> : null}
      </div>

      <DetailTypeModal
        open={modalMode !== null}
        mode={modalMode ?? "create"}
        row={activeRow}
        nextSort={nextSort}
        accountTypes={(accountTypesQuery.data ?? []).map((t) => ({ id: t.id, label: `${t.group} · ${t.accountType}` }))}
        saving={createMutation.isPending || updateMutation.isPending || deactivateMutation.isPending}
        submitError={submitError}
        onClose={() => { setModalMode(null); setActiveRow(null); }}
        onSave={async (form) => {
          setSubmitError("");
          if (modalMode === "create") await createMutation.mutateAsync(form);
          else if (activeRow) await updateMutation.mutateAsync({ id: activeRow.id, b: form });
        }}
        onDeactivate={modalMode === "edit" && activeRow ? async () => { await deactivateMutation.mutateAsync(activeRow.id); } : undefined}
      />
    </div>
  );
}

function DetailTypeModal({
  open, mode, row, nextSort, accountTypes, saving, submitError, onClose, onSave, onDeactivate,
}: {
  open: boolean;
  mode: "create" | "edit";
  row: DetailTypeRow | null;
  nextSort: number;
  accountTypes: Array<{ id: string; label: string }>;
  saving: boolean;
  submitError: string;
  onClose: () => void;
  onSave: (form: FormState) => Promise<void>;
  onDeactivate?: () => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  useEffect(() => {
    if (!open) return;
    setForm(row
      ? { account_type_id: row.account_type_id, name: row.name, code: row.code ?? "", description: row.description ?? "", sort_order: row.sort_order }
      : { ...EMPTY, sort_order: nextSort });
  }, [open, row, nextSort]);

  const canSubmit = Boolean(form.account_type_id) && Boolean(form.name.trim());

  return (
    <Modal open={open} onClose={onClose} title={mode === "create" ? "New Detail Type" : "Edit Detail Type"}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-600">
          Account Type
          <SelectCombobox
            value={form.account_type_id}
            disabled={mode === "edit"}
            onChange={(e) => setForm((v) => ({ ...v, account_type_id: e.target.value }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm disabled:bg-slate-100"
          >
            <option value="">Select an account type…</option>
            {accountTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </SelectCombobox>
          {mode === "edit" ? <span className="mt-1 block text-[10px] font-normal text-slate-400">Account Type is fixed after create.</span> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Detail Type name
          <input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" />
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Code (optional)
          <input value={form.code} onChange={(e) => setForm((v) => ({ ...v, code: e.target.value.toUpperCase() }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" />
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Description
          <textarea value={form.description} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} rows={2} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Sort order
          <input type="number" value={form.sort_order} onChange={(e) => setForm((v) => ({ ...v, sort_order: Number(e.target.value || 0) }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" />
        </label>

        {submitError ? <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">{submitError}</div> : null}

        <div className="flex items-center justify-between">
          <div>
            {mode === "edit" && onDeactivate ? (
              <Button type="button" variant="secondary" disabled={saving} onClick={() => void onDeactivate()}>Deactivate</Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Close</Button>
            <Button type="button" onClick={() => void onSave(form)} disabled={saving || !canSubmit}>{mode === "create" ? "Create" : "Save Changes"}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
