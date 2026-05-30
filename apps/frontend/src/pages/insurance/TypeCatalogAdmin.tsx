import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createInsuranceTypeCatalog,
  deactivateInsuranceTypeCatalog,
  listInsuranceTypeCatalog,
  updateInsuranceTypeCatalog,
  type InsuranceCoverageType,
  type InsuranceTypeCatalogEntry,
} from "../../api/insurance";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

const COVERAGE_OPTIONS: InsuranceCoverageType[] = [
  "auto_liability",
  "physical_damage",
  "cargo",
  "general_liability",
  "workers_comp",
  "trailer_interchange",
  "bobtail",
  "non_trucking_liability",
  "umbrella",
  "excess_liability",
  "occupational_accident",
  "garage_keepers",
  "reefer_breakdown",
  "pollution",
  "cyber_liability",
];

export function TypeCatalogAdmin() {
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";

  const [newCode, setNewCode] = useState<InsuranceCoverageType>("auto_liability");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("0");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [editingSortOrder, setEditingSortOrder] = useState("0");
  const [editingActive, setEditingActive] = useState(true);

  const query = useQuery({
    queryKey: ["insurance", "type-catalog", "admin", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listInsuranceTypeCatalog({ operating_company_id: companyId, include_inactive: true }).then((result) => result.types),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["insurance", "type-catalog", "admin", companyId] });
    await queryClient.invalidateQueries({ queryKey: ["insurance", "type-catalog", companyId] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createInsuranceTypeCatalog({
        operating_company_id: companyId,
        code: newCode,
        name: newName.trim(),
        description: newDescription.trim() || null,
        sort_order: Number(newSortOrder || 0),
        active: true,
      }),
    onSuccess: async () => {
      pushToast("Insurance type added", "success");
      setNewName("");
      setNewDescription("");
      setNewSortOrder("0");
      await refresh();
    },
    onError: () => pushToast("Failed to add insurance type", "error"),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; name: string; description: string; sort_order: number; active: boolean }) =>
      updateInsuranceTypeCatalog(payload.id, companyId, {
        name: payload.name,
        description: payload.description || null,
        sort_order: payload.sort_order,
        active: payload.active,
      }),
    onSuccess: async () => {
      pushToast("Insurance type updated", "success");
      setEditingId(null);
      await refresh();
    },
    onError: () => pushToast("Failed to update insurance type", "error"),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateInsuranceTypeCatalog(id, companyId),
    onSuccess: async () => {
      pushToast("Insurance type deactivated", "success");
      await refresh();
    },
    onError: () => pushToast("Failed to deactivate insurance type", "error"),
  });

  const orderedRows = useMemo(() => query.data ?? [], [query.data]);

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Select an operating company to manage insurance type catalog.</div>;
  }

  const beginEdit = (row: InsuranceTypeCatalogEntry) => {
    setEditingId(row.id);
    setEditingName(row.name);
    setEditingDescription(row.description ?? "");
    setEditingSortOrder(String(row.sort_order));
    setEditingActive(row.active);
  };

  return (
    <div className="space-y-4">
      <header className="rounded border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Type Catalog Admin</h2>
        <p className="mt-1 text-xs text-slate-600">Create, edit, and deactivate entries from insurance type catalog.</p>
      </header>

      <section className="rounded border border-gray-200 bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Add Type</h3>
        <div className="mt-2 grid gap-2 md:grid-cols-5">
          <label className="text-xs font-semibold text-slate-600">
            Code
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              value={newCode}
              onChange={(event) => setNewCode(event.target.value as InsuranceCoverageType)}
            >
              {COVERAGE_OPTIONS.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600 md:col-span-2">
            Name
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Display name"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Sort order
            <input
              type="number"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              value={newSortOrder}
              onChange={(event) => setNewSortOrder(event.target.value)}
            />
          </label>
          <div className="flex items-end">
            <Button size="sm" onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!newName.trim()}>
              Add type
            </Button>
          </div>
        </div>
        <label className="mt-2 block text-xs font-semibold text-slate-600">
          Description
          <input
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
            value={newDescription}
            onChange={(event) => setNewDescription(event.target.value)}
            placeholder="Optional"
          />
        </label>
      </section>

      {query.isLoading ? <div className="text-sm text-slate-500">Loading type catalog...</div> : null}
      {query.isError ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">Failed to load type catalog.</div> : null}

      <section className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-semibold">Code</th>
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Description</th>
              <th className="px-3 py-2 font-semibold">Sort</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orderedRows.map((row) => {
              const isEditing = row.id === editingId;
              return (
                <tr key={row.id} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2 text-slate-700">{row.code}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {isEditing ? (
                      <input
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                      />
                    ) : (
                      row.name
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {isEditing ? (
                      <input
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                        value={editingDescription}
                        onChange={(event) => setEditingDescription(event.target.value)}
                      />
                    ) : (
                      row.description || "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {isEditing ? (
                      <input
                        type="number"
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-xs"
                        value={editingSortOrder}
                        onChange={(event) => setEditingSortOrder(event.target.value)}
                      />
                    ) : (
                      row.sort_order
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {isEditing ? (
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={editingActive} onChange={(event) => setEditingActive(event.target.checked)} />
                        Active
                      </label>
                    ) : row.active ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">active</span>
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">inactive</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          loading={updateMutation.isPending}
                          onClick={() =>
                            updateMutation.mutate({
                              id: row.id,
                              name: editingName.trim(),
                              description: editingDescription.trim(),
                              sort_order: Number(editingSortOrder || 0),
                              active: editingActive,
                            })
                          }
                          disabled={!editingName.trim()}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="tertiary" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => beginEdit(row)}>
                          Edit
                        </Button>
                        {row.active ? (
                          <Button size="sm" variant="danger" loading={deactivateMutation.isPending && deactivateMutation.variables === row.id} onClick={() => deactivateMutation.mutate(row.id)}>
                            Deactivate
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!query.isLoading && orderedRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-5 text-center text-slate-500">
                  No type catalog entries.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
