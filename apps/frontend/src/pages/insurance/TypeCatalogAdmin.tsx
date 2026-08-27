import { useEffect, useMemo, useRef, useState } from "react";
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
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
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
  const actionGenerationRef = useRef(0);

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

  const refresh = async (submittedCompanyId: string) => {
    await queryClient.invalidateQueries({ queryKey: ["insurance", "type-catalog", "admin", submittedCompanyId] });
    await queryClient.invalidateQueries({ queryKey: ["insurance", "type-catalog", submittedCompanyId] });
  };

  const createMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; payload: Parameters<typeof createInsuranceTypeCatalog>[0] }) =>
      createInsuranceTypeCatalog(input.payload),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast("Insurance type added", "success");
      setNewName("");
      setNewDescription("");
      setNewSortOrder("0");
      await refresh(input.companyId);
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to add insurance type", "error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; payload: { id: string; name: string; description: string; sort_order: number; active: boolean } }) =>
      updateInsuranceTypeCatalog(input.payload.id, input.companyId, {
        name: input.payload.name,
        description: input.payload.description || null,
        sort_order: input.payload.sort_order,
        active: input.payload.active,
      }),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast("Insurance type updated", "success");
      setEditingId(null);
      await refresh(input.companyId);
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to update insurance type", "error");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (input: { id: string; companyId: string; generation: number }) => deactivateInsuranceTypeCatalog(input.id, input.companyId),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast("Insurance type deactivated", "success");
      await refresh(input.companyId);
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to deactivate insurance type", "error");
    },
  });

  useEffect(() => {
    actionGenerationRef.current += 1;
    setEditingId(null);
    setNewName("");
    setNewDescription("");
    setNewSortOrder("0");
    createMutation.reset();
    updateMutation.reset();
    deactivateMutation.reset();
  }, [companyId]);

  const orderedRows = useMemo(() => query.data ?? [], [query.data]);

  const beginEdit = (row: InsuranceTypeCatalogEntry) => {
    if (updateMutation.isPending) return;
    setEditingId(row.id);
    setEditingName(row.name);
    setEditingDescription(row.description ?? "");
    setEditingSortOrder(String(row.sort_order));
    setEditingActive(row.active);
  };

  const closeEdit = () => {
    if (updateMutation.isPending) return;
    setEditingId(null);
    updateMutation.reset();
  };

  const columns: Array<ParityColumn<InsuranceTypeCatalogEntry>> = useMemo(
    () => [
      {
        key: "code",
        label: "Code",
        sortable: true,
      },
      {
        key: "name",
        label: "Name",
        sortable: true,
        render: (row) =>
          row.id === editingId ? (
            <input
              className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
              value={editingName}
              onChange={(event) => setEditingName(event.target.value)}
              disabled={updateMutation.isPending}
            />
          ) : (
            row.name
          ),
      },
      {
        key: "description",
        label: "Description",
        sortable: true,
        sortValue: (row) => row.description ?? "",
        render: (row) =>
          row.id === editingId ? (
            <input
              className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
              value={editingDescription}
              onChange={(event) => setEditingDescription(event.target.value)}
              disabled={updateMutation.isPending}
            />
          ) : (
            row.description || "-"
          ),
      },
      {
        key: "sort_order",
        label: "Sort",
        sortable: true,
        render: (row) =>
          row.id === editingId ? (
            <input
              type="number"
              className="w-20 rounded-sm border border-gray-300 px-2 py-1 text-xs"
              value={editingSortOrder}
              onChange={(event) => setEditingSortOrder(event.target.value)}
              disabled={updateMutation.isPending}
            />
          ) : (
            row.sort_order
          ),
      },
      {
        key: "active",
        label: "Status",
        sortable: true,
        sortValue: (row) => (row.active ? 1 : 0),
        render: (row) =>
          row.id === editingId ? (
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={editingActive}
                onChange={(event) => setEditingActive(event.target.checked)}
                disabled={updateMutation.isPending}
              />
              Active
            </label>
          ) : row.active ? (
            <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">active</span>
          ) : (
            <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">inactive</span>
          ),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) =>
          row.id === editingId ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                loading={updateMutation.isPending}
                onClick={(event) => {
                  event.stopPropagation();
                  updateMutation.mutate({
                    companyId,
                    generation: actionGenerationRef.current,
                    payload: {
                      id: row.id,
                      name: editingName.trim(),
                      description: editingDescription.trim(),
                      sort_order: Number(editingSortOrder || 0),
                      active: editingActive,
                    },
                  });
                }}
                disabled={!editingName.trim()}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                onClick={(event) => {
                  event.stopPropagation();
                  closeEdit();
                }}
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  beginEdit(row);
                }}
                disabled={updateMutation.isPending}
              >
                Edit
              </Button>
              {row.active ? (
                <Button
                  size="sm"
                  variant="danger"
                  loading={deactivateMutation.isPending && deactivateMutation.variables?.id === row.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    deactivateMutation.mutate({ id: row.id, companyId, generation: actionGenerationRef.current });
                  }}
                >
                  Deactivate
                </Button>
              ) : null}
            </div>
          ),
      },
    ],
    [
      deactivateMutation,
      editingActive,
      editingDescription,
      editingId,
      editingName,
      editingSortOrder,
      updateMutation,
      closeEdit,
    ],
  );

  if (!companyId) {
    return <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Select an operating company to manage insurance type catalog.</div>;
  }

  return (
    <div className="space-y-4">
      <header className="rounded-sm border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Type Catalog Admin</h2>
        <p className="mt-1 text-xs text-slate-600">Create, edit, and deactivate entries from insurance type catalog.</p>
      </header>

      <section className="rounded-sm border border-gray-200 bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">+ Create type</h3>
        <div className="mt-2 grid gap-2 md:grid-cols-5">
          <label className="text-xs font-semibold text-slate-600">
            Code
            <select
              className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
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
              className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Display name"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Sort order
            <input
              type="number"
              className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
              value={newSortOrder}
              onChange={(event) => setNewSortOrder(event.target.value)}
            />
          </label>
          <div className="flex items-end">
            <Button
              size="sm"
              onClick={() =>
                createMutation.mutate({
                  companyId,
                  generation: actionGenerationRef.current,
                  payload: {
                    operating_company_id: companyId,
                    code: newCode,
                    name: newName.trim(),
                    description: newDescription.trim() || null,
                    sort_order: Number(newSortOrder || 0),
                    active: true,
                  },
                })
              }
              loading={createMutation.isPending}
              disabled={!newName.trim()}
            >
              + Create type
            </Button>
          </div>
        </div>
        <label className="mt-2 block text-xs font-semibold text-slate-600">
          Description
          <input
            className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
            value={newDescription}
            onChange={(event) => setNewDescription(event.target.value)}
            placeholder="Optional"
          />
        </label>
      </section>

      {query.isError ? (
        <ListErrorState
          title="Couldn't load type catalog"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable<InsuranceTypeCatalogEntry>
          columns={columns}
          rows={orderedRows}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          emptyText="No type catalog entries."
          storageKey="insurance-type-catalog-admin"
          tableTestId="insurance-type-catalog-admin-table"
        />
      )}
    </div>
  );
}
