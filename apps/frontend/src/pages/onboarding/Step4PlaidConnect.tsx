import { useQuery } from "@tanstack/react-query";
import { PlaidLink } from "../../components/banking/PlaidLink";
import { getPlaidBankAccounts, type PlaidBankAccount } from "../../api/banking";

export type PlaidStepData = {
  linked_account_count?: number;
};

type Props = {
  companyId: string;
  value: PlaidStepData;
  disabled?: boolean;
  onChange: (patch: PlaidStepData) => void;
};

export function Step4PlaidConnect({ companyId, value, disabled, onChange }: Props) {
  const accountsQuery = useQuery({
    queryKey: ["onboarding", "plaid-accounts", companyId],
    enabled: Boolean(companyId),
    queryFn: () => getPlaidBankAccounts(companyId),
  });

  const accounts = accountsQuery.data?.accounts ?? [];
  const linkedCount = accounts.length || value.linked_account_count || 0;

  function handleSuccess(newAccounts: PlaidBankAccount[]) {
    onChange({ ...value, linked_account_count: newAccounts.length });
    void accountsQuery.refetch();
  }

  return (
    <div className="space-y-3" data-testid="onboarding-step-plaid">
      <h2 className="text-base font-semibold text-gray-900">Connect your bank (Plaid)</h2>
      <p className="text-sm text-gray-600">
        Link at least one bank account so transactions flow into banking, reconciliation, and cash-flow reports.
      </p>

      <div className="rounded border border-gray-200 bg-white p-3 text-sm">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${linkedCount > 0 ? "bg-emerald-500" : "bg-gray-400"}`} />
          <span className="font-medium text-gray-900">
            {linkedCount > 0 ? `${linkedCount} account${linkedCount === 1 ? "" : "s"} linked` : "No accounts linked"}
          </span>
        </div>
      </div>

      {disabled ? null : (
        <PlaidLink operatingCompanyId={companyId} onSuccess={handleSuccess} label="Connect bank account" />
      )}
    </div>
  );
}
