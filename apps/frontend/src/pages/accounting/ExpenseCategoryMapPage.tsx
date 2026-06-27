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
} from "../../api/accounting";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

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
    queryKey: ["expense-category-map", "accounts"],
    queryFn: () => listCoaAccountsForJe(),
    staleTime: 60_000,
  });

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
      pushToast(String((error as Error)?.message ?? "Unable to create mapping"), "error");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateExpenseCategoryMapping(id, companyId),
    onSuccess: async () => {
      pushToast("Expense category mapping deactivated", "success");
      await queryClient.invalidateQueries({ queryKey: ["expense-category-map", companyId] });
    },
    onError: (error) => {
      pushToast(String((error as Error)?.message ?? "Unable to deactivate mapping"), "error");
    },
  });

  const canSubmit = Boolean(form.category_code.trim() && form.account_id && companyId);

  return (
    <AccountingSubNavWrapper
      title="Expense Category Map"
      subtitle="Map category kind + code to posting account + side"
      actions={<Button onClick={() => setShowAddModal(true)} disabled={!companyId}>+ Add Mapping</Button>}
    >

      <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />
          Show inactive rows
        </label>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 font-semibold">Kind</th>
              <th className="px-3 py-2 font-semibold">Code</th>
              <th className="px-3 py-2 font-semibold">Account</th>
              <th className="px-3 py-2 font-semibold">Side</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Audit</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {mapQuery.isLoading ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={7}>
                  Loading mappings...
                </td>
              </tr>
            ) : null}
            {!mapQuery.isLoading && (mapQuery.data?.rows ?? []).length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={7}>
                  No mappings found.
                </td>
              </tr>
            ) : null}
            {(mapQuery.data?.rows ?? []).map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-3 py-2">{row.category_kind}</td>
                <td className="px-3 py-2">{row.category_code}</td>
                <td className="px-3 py-2">
                  {row.account_number ?? "?"} - {row.account_name ?? row.account_id}
                </td>
                <td className="px-3 py-2">{row.posting_side}</td>
                <td className="px-3 py-2">{row.is_active ? "active" : "inactive"}</td>
                <td className="px-3 py-2">
                  <Link
                    to={`/admin/activity?event_class=expense_category_map_change&resource_id=${encodeURIComponent(row.id)}`}
                    className="text-slate-700 hover:underline"
                  >
                    View audit
                  </Link>
                </td>
                <td className="px-3 py-2">
                  {row.is_active ? (
                    <Button
                      size="sm"
                      variant="danger"
                      loading={deactivateMutation.isPending}
                      onClick={() => {
                        if (!window.confirm("Deactivate this mapping? This is a soft delete.")) return;
                        deactivateMutation.mutate(row.id);
                      }}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded border border-gray-200 bg-white p-4 shadow-lg">
            <h2 className="text-base font-semibold text-gray-900">Add Expense Category Mapping</h2>
            <div className="mt-3 grid gap-3">
              <label className="text-xs font-semibold text-gray-600">
                Category kind
                <select
                  className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
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
                  className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
                  value={form.category_code}
                  onChange={(event) => setForm((prev) => ({ ...prev, category_code: event.target.value }))}
                  placeholder="ex: DIESEL"
                />
              </label>

              <label className="text-xs font-semibold text-gray-600">
                Account (autocomplete)
                <input
                  list="expense-category-account-options"
                  className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
                  value={form.account_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, account_id: event.target.value }))}
                  placeholder="Select account id"
                />
                <datalist id="expense-category-account-options">
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.account_number} - {account.account_name}
                    </option>
                  ))}
                </datalist>
                <p className="mt-1 text-[11px] text-gray-500">
                  {selectedAccount
                    ? `Selected: ${selectedAccount.account_number} - ${selectedAccount.account_name}`
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
    </AccountingSubNavWrapper>
  );
}
