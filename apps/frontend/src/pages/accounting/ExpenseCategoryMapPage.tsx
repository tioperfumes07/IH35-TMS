import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createExpenseCategoryMapping,
  deactivateExpenseCategoryMapping,
  listCoaAccountsForJe,
  listExpenseCategoryMappings,
  type ExpenseCategoryMapKind,
  type ExpenseCategoryMapPostingSide,
  type ExpenseCategoryMapRow,
} from "../../api/accounting";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { ConfirmModal } from "../../components/shared/ConfirmModal";
import { useToast } from "../../components/Toast";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useListState } from "../../components/list-state";
import { ListErrorState } from "../../components/ListErrorState";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { userFacingApiError } from "../../lib/api-error-message";
import { entityLabel } from "../../lib/entity-label";

const KIND_OPTIONS: ExpenseCategoryMapKind[] = [
  "fuel",
  "maintenance",
  "driver_pay",
  "factoring_fee",
  "toll",
  "escrow",
  "insurance",
  "office",
  "other",
];

type AddFormState = {
  category_kind: ExpenseCategoryMapKind;
  category_code: string;
  account_id: string;
  posting_side: ExpenseCategoryMapPostingSide;
};

const DEFAULT_FORM: AddFormState = {
  category_kind: "fuel",
  category_code: "",
  account_id: "",
  posting_side: "debit",
};

export function ExpenseCategoryMapPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<string | null>(null);
  const [form, setForm] = useState<AddFormState>(DEFAULT_FORM);

  const mapQuery = useQuery({
    queryKey: ["expense-category-map", companyId, includeInactive],
    queryFn: () =>
      listExpenseCategoryMappings(companyId, {
        include_inactive: includeInactive,
      }),
    enabled: Boolean(companyId),
  });

  const accountsQuery = useQuery({
    queryKey: ["expense-category-map", "accounts", companyId],
    queryFn: () => listCoaAccountsForJe(companyId, { postableOnly: true }),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const listState = useListState(mapQuery, (mapQuery.data?.rows ?? []).length === 0);

  const accounts = accountsQuery.data?.accounts ?? [];
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === form.account_id) ?? null,
    [accounts, form.account_id],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      createExpenseCategoryMapping({
        operating_company_id: companyId,
        category_kind: form.category_kind,
        category_code: form.category_code.trim(),
        account_id: form.account_id,
        posting_side: form.posting_side,
      }),
    onSuccess: async () => {
      setShowAddModal(false);
      setForm(DEFAULT_FORM);
      pushToast("Expense category mapping created", "success");
      await queryClient.invalidateQueries({ queryKey: ["expense-category-map", companyId] });
    },
    onError: (error) => {
      pushToast(userFacingApiError(error, "Unable to create mapping"), "error");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateExpenseCategoryMapping(id, companyId),
    onSuccess: async () => {
      pushToast("Expense category mapping deactivated", "success");
      await queryClient.invalidateQueries({ queryKey: ["expense-category-map", companyId] });
    },
    onError: (error) => {
      pushToast(userFacingApiError(error, "Unable to deactivate mapping"), "error");
    },
  });

  const canSubmit = Boolean(form.category_code.trim() && form.account_id && companyId);

  // Display-only ParityTable migration: column order, cell content, and the inline
  // Deactivate action (handler unchanged) are preserved 1:1 from the hand-rolled table.
  const columns: Array<ParityColumn<ExpenseCategoryMapRow>> = [
    { key: "category_kind", label: "Kind", sortable: true },
    { key: "category_code", label: "Code", sortable: true },
    {
      key: "account_number",
      label: "Account",
      sortable: true,
      sortValue: (row) => entityLabel(row.account_name, row.account_id, "Account"),
      render: (row) => <>{entityLabel(row.account_name, row.account_id, "Account")}</>,
    },
    { key: "posting_side", label: "Side", sortable: true },
    {
      key: "is_active",
      label: "Status",
      sortable: true,
      sortValue: (row) => (row.is_active ? "active" : "inactive"),
      render: (row) => (row.is_active ? "active" : "inactive"),
    },
    {
      key: "audit",
      label: "Audit",
      render: (row) => (
        {/* ADMIN-ACTIVITY-F1 — action/entity_id are the params ActivityLogPage actually reads;
            event_class/resource_id (the previous names) were never consumed by that page at all,
            so this link silently landed on the generic unfiltered activity log instead of this
            row's own history. */}
        <Link
          to={`/admin/activity?action=expense_category_map_change&entity_id=${encodeURIComponent(row.id)}`}
          className="text-slate-700 hover:underline"
        >
          View audit
        </Link>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) =>
        row.is_active ? (
          <Button
            size="sm"
            variant="danger"
            loading={deactivateMutation.isPending}
            onClick={() => setDeactivateTarget(row.id)}
          >
            Deactivate
          </Button>
        ) : (
          "-"
        ),
    },
  ];

  return (
    <AccountingSubNavWrapper
      title="Expense Category Map"
      subtitle="Map category kind + code to posting account + side"
      actions={<Button onClick={() => setShowAddModal(true)} disabled={!companyId}>+ Create Mapping</Button>}
    >

      <div className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />
          Show inactive rows
        </label>
      </div>

      {listState.isError ? (
        <ListErrorState
          title="Couldn't load category mappings"
          status={0}
          message={(mapQuery.error as Error | undefined)?.message}
          onRetry={() => void mapQuery.refetch()}
        />
      ) : (
        <ParityTable<ExpenseCategoryMapRow>
          columns={columns}
          rows={mapQuery.data?.rows ?? []}
          rowKey={(row) => row.id}
          loading={mapQuery.isLoading}
          emptyText="No mappings found."
          storageKey="accounting-expense-category-map"
        />
      )}

      {showAddModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-sm border border-gray-200 bg-white p-4 shadow-lg">
            <h2 className="text-base font-semibold text-gray-900">Add Expense Category Mapping</h2>
            {accountsQuery.isError ? (
              <div className="mt-3">
                <ListErrorBanner
                  message={`Failed to load mapping accounts: ${(accountsQuery.error as Error)?.message ?? "Request failed"}`}
                  onRetry={() => void accountsQuery.refetch()}
                />
              </div>
            ) : null}
            <div className="mt-3 grid gap-3">
              <label className="text-xs font-semibold text-gray-600">
                Category kind
                <select
                  className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
                  value={form.category_kind}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, category_kind: event.target.value as ExpenseCategoryMapKind }))
                  }
                >
                  {KIND_OPTIONS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold text-gray-600">
                Category code
                <input
                  className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
                  value={form.category_code}
                  onChange={(event) => setForm((prev) => ({ ...prev, category_code: event.target.value }))}
                  placeholder="ex: DIESEL"
                />
              </label>

              <label className="text-xs font-semibold text-gray-600">
                Account
                <div className="mt-1">
                  <ReferenceSelect
                    value={form.account_id || null}
                    onChange={(next) => setForm((prev) => ({ ...prev, account_id: next ?? "" }))}
                    options={accounts.map((account) => ({
                      value: account.id,
                      label: account.account_name,
                    }))}
                    createKind="account"
                    addNewLabel="+ Add new account"
                    operatingCompanyId={companyId}
                    placeholder="Select account"
                    disabled={!companyId}
                  />
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  {selectedAccount
                    ? `Selected: ${selectedAccount.account_name}`
                    : "Pick from chart of accounts."}
                </p>
              </label>

              <fieldset className="text-xs font-semibold text-gray-600">
                <legend>Posting side</legend>
                <div className="mt-1 flex gap-3">
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="radio"
                      checked={form.posting_side === "debit"}
                      onChange={() => setForm((prev) => ({ ...prev, posting_side: "debit" }))}
                    />
                    Debit
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="radio"
                      checked={form.posting_side === "credit"}
                      onChange={() => setForm((prev) => ({ ...prev, posting_side: "credit" }))}
                    />
                    Credit
                  </label>
                </div>
              </fieldset>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowAddModal(false);
                  setForm(DEFAULT_FORM);
                }}
              >
                Cancel
              </Button>
              <Button disabled={!canSubmit} loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
                Save mapping
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmModal
        open={Boolean(deactivateTarget)}
        title="Deactivate mapping"
        message="Deactivate this mapping? This is a soft delete — it is not removed."
        confirmLabel="Deactivate"
        danger
        onClose={() => setDeactivateTarget(null)}
        onConfirm={async () => {
          if (!deactivateTarget) return;
          await deactivateMutation.mutateAsync(deactivateTarget);
          setDeactivateTarget(null);
        }}
      />
    </AccountingSubNavWrapper>
  );
}
