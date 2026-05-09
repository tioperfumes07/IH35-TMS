import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAllAccounts,
  getBankingKpis,
  getBankingRegister,
  getBankingTiles,
  getPlaidBankAccounts,
  type BankingTile,
  undoCategorization,
} from "../../api/banking";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { PlaidLinkButton } from "../../components/banking/PlaidLinkButton";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountTilesRow } from "./components/AccountTilesRow";
import { BankingKpiRow } from "./components/BankingKpiRow";
import { CategorizeDrawer } from "./components/CategorizeDrawer";
import { ManageAccountsModal } from "./components/ManageAccountsModal";
import { ManualJEModal } from "./components/ManualJEModal";
import { RegisterTable } from "./components/RegisterTable";
import { RegisterToolbar } from "./components/RegisterToolbar";
import { SyncStatusStrip } from "./components/SyncStatusStrip";
import { Link } from "react-router-dom";

function syncStatusClasses(status: string) {
  if (status === "active") return "bg-green-100 text-green-700";
  if (status === "pending") return "bg-gray-100 text-gray-700";
  if (status === "needs_reauth") return "bg-amber-100 text-amber-700";
  if (status === "error") return "bg-red-100 text-red-700";
  if (status === "disconnected") return "bg-gray-200 text-gray-600 line-through";
  return "bg-gray-100 text-gray-700";
}

export function BankingHomePage() {
  const auth = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Record<string, unknown> | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manualJeOpen, setManualJeOpen] = useState(false);

  const kpiQuery = useQuery({
    queryKey: ["banking", "kpis", companyId],
    queryFn: () => getBankingKpis(companyId),
    enabled: Boolean(companyId),
  });
  const tilesQuery = useQuery({
    queryKey: ["banking", "tiles", companyId],
    queryFn: () => getBankingTiles(companyId),
    enabled: Boolean(companyId),
  });
  const allAccountsQuery = useQuery({
    queryKey: ["banking", "all-accounts", companyId],
    queryFn: () => getAllAccounts(companyId),
    enabled: Boolean(companyId),
  });
  const plaidAccountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });
  const tiles = tilesQuery.data?.tiles ?? [];
  const selectedId = selectedAccountId ?? tiles[0]?.id ?? null;
  const registerQuery = useQuery({
    queryKey: ["banking", "register", companyId, selectedId ?? ""],
    queryFn: () => getBankingRegister(selectedId!, companyId),
    enabled: Boolean(companyId && selectedId),
  });
  const registerRows = registerQuery.data?.register_rows ?? [];

  const selectedTile = useMemo(
    () => tiles.find((tile: BankingTile) => tile.id === selectedId) ?? null,
    [tiles, selectedId]
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title="Banking Home"
        subtitle="QBO mirrored accounts + categorization"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton>+ Import Statement</ActionButton>
            <ActionButton onClick={() => setManageOpen(true)}>+ Manage Accounts</ActionButton>
            <PlaidLinkButton
              operatingCompanyId={companyId}
              onSuccess={() => {
                void queryClient.invalidateQueries({ queryKey: ["banking", "plaid-accounts", companyId] });
              }}
            />
            <ActionButton>+ Reconcile</ActionButton>
            <ActionButton onClick={() => setManualJeOpen(true)}>+ Manual JE</ActionButton>
          </div>
        }
      />
      {kpiQuery.isError || tilesQuery.isError || registerQuery.isError ? <ListErrorBanner onRetry={() => void registerQuery.refetch()} /> : null}

      <SyncStatusStrip
        syncedAt={String(selectedTile?.last_txn_date ?? "") || null}
        transactionCount={registerRows.length}
        uncategorizedCount={Number(kpiQuery.data?.total_uncategorized ?? 0)}
        pendingSyncCount={0}
      />
      <BankingKpiRow kpis={kpiQuery.data} />
      <AccountTilesRow
        tiles={tiles}
        selectedId={selectedId}
        onSelect={(id) => setSelectedAccountId(id)}
        onManageAccounts={() => setManageOpen(true)}
      />
      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Connected bank accounts</div>
        <div className="space-y-2">
          {(plaidAccountsQuery.data?.accounts ?? []).length === 0 ? (
            <p className="text-sm text-gray-500">No Plaid bank accounts connected yet.</p>
          ) : (
            (plaidAccountsQuery.data?.accounts ?? []).map((account) => (
              <div key={account.id} className="flex items-center justify-between rounded border border-gray-100 px-3 py-2">
                <div className="min-w-0">
                  <Link to={`/banking/accounts/${account.id}`} className="truncate text-sm font-semibold text-blue-700 hover:underline">
                    {account.institution_name || "Bank"} - {account.account_name || "Account"} {account.account_mask ? `••••${account.account_mask}` : ""}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {account.last_synced_at ? `Last synced ${new Date(account.last_synced_at).toLocaleString()}` : "Not synced yet"}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${syncStatusClasses(account.sync_status)}`}>{account.sync_status}</span>
              </div>
            ))
          )}
        </div>
        {auth.user?.role !== "Owner" && auth.user?.role !== "Administrator" ? (
          <p className="mt-2 text-xs text-gray-500">Connect Bank Account is visible only to Owner/Admin roles.</p>
        ) : null}
      </div>

      <RegisterToolbar rowCount={registerRows.length} onRefresh={() => void registerQuery.refetch()} />
      <RegisterTable
        rows={registerRows}
        selectedTransactionId={selectedTransaction ? String(selectedTransaction.id) : null}
        onSelect={(row) => setSelectedTransaction(row)}
        onCategorize={(row) => {
          setSelectedTransaction(row);
          setDrawerOpen(true);
        }}
        onUndo={(row) => {
          void undoCategorization(String(row.id), companyId)
            .then(() => {
              pushToast("Transaction reclassified", "success");
              void queryClient.invalidateQueries({ queryKey: ["banking"] });
            })
            .catch((error) => pushToast(String((error as Error).message || "Reclassify failed"), "error"));
        }}
      />

      <CategorizeDrawer
        open={drawerOpen}
        transaction={selectedTransaction}
        operatingCompanyId={companyId}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["banking"] });
        }}
      />

      <ManageAccountsModal
        open={manageOpen}
        operatingCompanyId={companyId}
        accounts={(allAccountsQuery.data?.accounts ?? []).map((account) => ({
          id: String(account.id),
          display_name: String(account.display_name ?? ""),
          account_type: String(account.account_type ?? ""),
          visible: Boolean(account.visible),
          tag: String(account.tag ?? ""),
          is_dip: Boolean(account.is_dip),
        }))}
        onClose={() => setManageOpen(false)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["banking"] });
        }}
      />

      <ManualJEModal
        open={manualJeOpen}
        operatingCompanyId={companyId}
        onClose={() => setManualJeOpen(false)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["banking"] });
        }}
      />
    </div>
  );
}
