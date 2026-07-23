import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { listCoaRoles } from "../../api/accounting";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";

/**
 * QBO parity leaf: Undeposited Funds register — deep-links to Account Register for the
 * entity's designated undeposited_funds CoA role (fallback cash_clearing).
 */
export function UndepositedFundsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";

  const rolesQuery = useQuery({
    queryKey: ["undeposited-funds", "coa-roles", operatingCompanyId],
    queryFn: () => listCoaRoles(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const accountId =
    rolesQuery.data?.rows.find((r) => r.role === "undeposited_funds" && r.is_active && r.account_id)?.account_id ??
    rolesQuery.data?.rows.find((r) => r.role === "cash_clearing" && r.is_active && r.account_id)?.account_id ??
    null;

  if (rolesQuery.isError) {
    return (
      <AccountingSubNavWrapper title="Undeposited Funds" subtitle="Customer payments awaiting bank deposit">
        <ListErrorBanner message="Failed to load CoA roles." onRetry={() => void rolesQuery.refetch()} />
      </AccountingSubNavWrapper>
    );
  }

  if (rolesQuery.isPending) {
    return (
      <AccountingSubNavWrapper title="Undeposited Funds" subtitle="Customer payments awaiting bank deposit">
        <p className="text-sm text-gray-600">Loading undeposited funds account…</p>
      </AccountingSubNavWrapper>
    );
  }

  if (accountId) {
    return <Navigate to={`/accounting/account-register?accountId=${encodeURIComponent(accountId)}`} replace />;
  }

  return (
    <AccountingSubNavWrapper title="Undeposited Funds" subtitle="Customer payments awaiting bank deposit">
      {/* §7 palette: no yellow/amber bands in financial UI — slate tokens only. */}
      <div className="rounded-sm border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700">
        No undeposited funds account is designated for this entity. Map the{" "}
        <strong>undeposited_funds</strong> role under Accounting → More → CoA roles, then return here.
      </div>
    </AccountingSubNavWrapper>
  );
}

export default UndepositedFundsPage;
