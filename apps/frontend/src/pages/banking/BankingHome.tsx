import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAllAccounts,
  getBankingKpis,
  getBankingRegister,
  getBankingTiles,
  type BankingTile,
  undoCategorization,
} from "../../api/banking";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
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

export function BankingHomePage() {
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
            <ActionButton>+ Reconcile</ActionButton>
            <ActionButton onClick={() => setManualJeOpen(true)}>+ Manual JE</ActionButton>
          </div>
        }
      />

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
