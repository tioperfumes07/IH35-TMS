import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { listCoaAccountsForJe, listCoaRoles, type CoaRole, type CoaRoleRow, COA_ROLE_VALUES, upsertCoaRole, validateCoaRoles } from "../../api/accounting";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { coaAccountReferenceOption } from "../../components/parity/referenceOptionLabels";

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
  driver_pay_expense: "Driver pay expense",
  driver_payroll_clearing: "Driver payroll clearing",
  reimbursement_expense: "Reimbursement expense",
  advance_recovery: "Advance recovery",
  damage_recovery: "Damage recovery",
  lease_recovery: "Lease recovery",
  insurance_recovery: "Insurance recovery",
  fuel_advance_recovery: "Fuel advance recovery",
  other_recovery: "Other recovery",
  abandonment_chargeback_recovery: "Abandonment chargeback recovery",
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
    queryKey: ["coa-roles", "accounts", companyId],
    queryFn: () => listCoaAccountsForJe(companyId, { postableOnly: true }),
    enabled: Boolean(companyId),
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

  const roleRows = useMemo<CoaRoleRow[]>(() => {
    const byRole = new Map((rowsQuery.data?.rows ?? []).map((row) => [row.role, row]));
    return COA_ROLE_VALUES.map((role) => byRole.get(role) ?? { role, id: null, account_id: null, account_name: null, account_number: null, is_active: false, updated_at: null });
  }, [rowsQuery.data?.rows]);

  // Column order/labels preserved 1:1 from the former hand-rolled table markup. The per-row
  // account picker is a ReferenceSelect (was a raw UUID text input + datalist — required typing
  // a raw account id by hand); the Save button keeps its exact handler unchanged.
  const columns: Array<ParityColumn<CoaRoleRow>> = [
    {
      key: "role",
      label: "Role",
      render: (row) => (
        <>
          <div className="font-semibold text-gray-900">{ROLE_LABELS[row.role]}</div>
          <div className="text-gray-500">{row.role}</div>
        </>
      ),
    },
    {
      key: "account_id",
      label: "Account",
      render: (row) => {
        const value = draftByRole[row.role] ?? row.account_id ?? "";
        const accountOptions = (accountsQuery.data?.accounts ?? []).map(coaAccountReferenceOption);
        return (
          <div className="min-w-[280px]">
            <ReferenceSelect
              value={value || null}
              onChange={(next) => setDraftByRole((prev) => ({ ...prev, [row.role]: next ?? "" }))}
              options={accountOptions}
              createKind="account"
              addNewLabel="+ Add new account"
              operatingCompanyId={companyId}
              placeholder="Select account…"
              disabled={!companyId}
              onOptionCreated={() => void accountsQuery.refetch()}
            />
          </div>
        );
      },
    },
    {
      key: "is_active",
      label: "Status",
      render: (row) => (row.is_active ? "active" : "missing"),
    },
    {
      key: "updated_at",
      label: "Updated",
      render: (row) => (row.updated_at ? new Date(row.updated_at).toLocaleString() : "-"),
    },
    {
      key: "action",
      label: "Action",
      render: (row) => {
        const value = draftByRole[row.role] ?? row.account_id ?? "";
        return (
          <Button
            size="sm"
            disabled={!companyId || !value}
            loading={upsertMutation.isPending}
            onClick={() => upsertMutation.mutate({ role: row.role, account_id: value })}
          >
            Save
          </Button>
        );
      },
    },
  ];

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

      {validateQuery.isError ? (
        <ListErrorBanner
          message={`Failed to validate CoA role mappings: ${(validateQuery.error as Error)?.message ?? "Request failed"}`}
          onRetry={() => void validateQuery.refetch()}
        />
      ) : null}

      {accountsQuery.isError ? (
        <ListErrorBanner
          message={`Failed to load chart of accounts for this entity: ${(accountsQuery.error as Error)?.message ?? "Request failed"}`}
          onRetry={() => void accountsQuery.refetch()}
        />
      ) : null}

      {!accountsQuery.isLoading && !accountsQuery.isError && companyId && (accountsQuery.data?.accounts.length ?? 0) === 0 ? (
        <ListErrorBanner
          message="No postable accounts returned for this entity. Check CoA seed / entity scope — designations cannot proceed with an empty picker."
          onRetry={() => void accountsQuery.refetch()}
        />
      ) : null}

      {!validateQuery.isLoading && !validateQuery.isError ? (
        <div className={`rounded-sm border px-3 py-2 text-xs ${validateQuery.data?.valid ? "border-slate-200 bg-slate-100 text-slate-700" : "border-slate-200 bg-slate-50 text-slate-800"}`}>
          {validateQuery.data?.valid
            ? "All required roles have active mappings."
            : `Missing role mappings: ${(validateQuery.data?.missing_roles ?? []).join(", ") || "unknown"}`}
        </div>
      ) : null}

      {rowsQuery.isError ? (
        <ListErrorState
          title="Couldn't load CoA role mappings"
          status={0}
          message={(rowsQuery.error as Error)?.message}
          onRetry={() => void rowsQuery.refetch()}
        />
      ) : (
      <ParityTable
        storageKey="accounting-coa-roles"
        tableTestId="coa-roles-table"
        columns={columns}
        rows={roleRows}
        rowKey={(row) => row.role}
        loading={rowsQuery.isLoading}
      />
      )}
    </AccountingSubNavWrapper>
  );
}
