import { useQuery } from "@tanstack/react-query";
import { getPlaidBankAccounts } from "../../api/banking";

type Props = { operatingCompanyId: string };

export function PlaidSyncStatusPanel({ operatingCompanyId }: Props) {
  const accountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts-status", operatingCompanyId],
    queryFn: () => getPlaidBankAccounts(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const accounts = accountsQuery.data?.accounts ?? [];
  const lastSync = accounts
    .map((account) => account.last_synced_at)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  return (
    <section data-testid="plaid-sync-status-panel" className="rounded border border-gray-200 p-3 text-sm">
      <h3 className="font-semibold">Plaid sync status</h3>
      <p>Accounts: {accounts.length}</p>
      <p>Last sync: {lastSync ? new Date(String(lastSync)).toLocaleString() : "—"}</p>
    </section>
  );
}
