import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { listCoaAccountsForJe, listCoaRoles, type CoaRole, COA_ROLE_VALUES, upsertCoaRole, validateCoaRoles } from "../../api/accounting";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

const ROLE_LABELS: Record<CoaRole, string> = {
  ar_control: "AR control",
  ap_control: "AP control",
  cash_clearing: "Cash clearing",
  undeposited_funds: "Undeposited funds",
  revenue_default: "Revenue default",
  expense_default: "Expense default",
  factor_reserve_default: "Factor reserve default",
  escrow_liability_default: "Escrow liability default",
  sales_tax_payable: "Sales tax payable",
  cash_basis_adjustment_equity: "Cash basis adjustment equity",
  retained_earnings: "Retained earnings",
};

export function CoaRolesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [draftByRole, setDraftByRole] = useState<Record<string, string>>({});

  const rowsQuery = useQuery({
    queryKey: ["coa-roles", companyId],
    queryFn: () => listCoaRoles(companyId),
    enabled: Boolean(companyId),
  });

  const accountsQuery = useQuery({
    queryKey: ["coa-roles", "accounts"],
    queryFn: () => listCoaAccountsForJe(),
    staleTime: 60_000,
  });

  const validateQuery = useQuery({
    queryKey: ["coa-roles", "validate", companyId],
    queryFn: () => validateCoaRoles(companyId),
    enabled: Boolean(companyId),
  });

  const upsertMutation = useMutation({
    mutationFn: (payload: { role: CoaRole; account_id: string }) => upsertCoaRole(companyId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["coa-roles", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["coa-roles", "validate", companyId] });
      pushToast("CoA role mapping saved", "success");
    },
    onError: (error) => pushToast(String((error as Error)?.message ?? "Failed to save role mapping"), "error"),
  });

  const roleRows = useMemo(() => {
    const byRole = new Map((rowsQuery.data?.rows ?? []).map((row) => [row.role, row]));
    return COA_ROLE_VALUES.map((role) => byRole.get(role) ?? { role, id: null, account_id: null, account_name: null, account_number: null, is_active: false, updated_at: null });
  }, [rowsQuery.data?.rows]);

  return (
    <AccountingSubNavWrapper
      title="CoA Roles"
      subtitle="Bind required accounting roles to company chart-of-accounts rows"
      actions={
        <Button
          variant="secondary"
          loading={validateQuery.isFetching}
          onClick={async () => {
            const data = await validateQuery.refetch();
            if (data.data?.valid) pushToast("All required CoA roles are mapped", "success");
            else pushToast(`Missing roles: ${(data.data?.missing_roles ?? []).join(", ")}`, "error");
          }}
        >
          Validate
        </Button>
      }
    >

      {!validateQuery.isLoading ? (
        <div className={`rounded border px-3 py-2 text-xs ${validateQuery.data?.valid ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {validateQuery.data?.valid
            ? "All required roles have active mappings."
            : `Missing role mappings: ${(validateQuery.data?.missing_roles ?? []).join(", ") || "unknown"}`}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 font-semibold">Role</th>
              <th className="px-3 py-2 font-semibold">Account</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Updated</th>
              <th className="px-3 py-2 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {roleRows.map((row) => {
              const value = draftByRole[row.role] ?? row.account_id ?? "";
              return (
                <tr key={row.role} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-gray-900">{ROLE_LABELS[row.role]}</div>
                    <div className="text-gray-500">{row.role}</div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      list={`coa-role-account-options-${row.role}`}
                      className="h-9 w-full min-w-[280px] rounded border border-gray-300 px-2 text-sm"
                      value={value}
                      onChange={(event) => setDraftByRole((prev) => ({ ...prev, [row.role]: event.target.value }))}
                      placeholder="Select account id"
                    />
                    <datalist id={`coa-role-account-options-${row.role}`}>
                      {(accountsQuery.data?.accounts ?? []).map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.account_number} - {account.account_name}
                        </option>
                      ))}
                    </datalist>
                  </td>
                  <td className="px-3 py-2">{row.is_active ? "active" : "missing"}</td>
                  <td className="px-3 py-2">{row.updated_at ? new Date(row.updated_at).toLocaleString() : "-"}</td>
                  <td className="px-3 py-2">
                    <Button
                      size="sm"
                      disabled={!companyId || !value}
                      loading={upsertMutation.isPending}
                      onClick={() => upsertMutation.mutate({ role: row.role, account_id: value })}
                    >
                      Save
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AccountingSubNavWrapper>
  );
}
