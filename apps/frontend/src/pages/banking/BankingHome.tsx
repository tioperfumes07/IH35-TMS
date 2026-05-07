import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  getAllAccounts,
  getBankingKpis,
  getBankingRegister,
  getBankingTiles,
  getBankingUncategorized,
  type BankingTile,
  undoCategorization,
} from "../../api/banking";
import { getFactoringSummary } from "../../api/factoring";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
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

const SUBNAV = [
  { id: "home", label: "Home" },
  { id: "all_transactions", label: "All Transactions" },
  { id: "boa_checking", label: "BOA Checking" },
  { id: "ibc_checking", label: "IBC Checking" },
  { id: "factoring_faro", label: "Factoring (Faro)" },
  { id: "escrow_virtual", label: "Escrow (virtual)" },
  { id: "categorize_drawer", label: "Categorize Drawer" },
  { id: "reconciliation_workspace", label: "Reconciliation Workspace" },
  { id: "bank_statement_import", label: "Bank Statement Import" },
  { id: "plaid_connections", label: "Plaid Connections" },
  { id: "relay_card", label: "Relay Card" },
  { id: "settings", label: "Settings" },
] as const;

export function BankingHomePage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Record<string, unknown> | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manualJeOpen, setManualJeOpen] = useState(false);
  const [tab, setTab] = useState<(typeof SUBNAV)[number]["id"]>("home");

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
  const uncatQuery = useQuery({
    queryKey: ["banking", "uncategorized", companyId],
    queryFn: () => getBankingUncategorized(companyId),
    enabled: Boolean(companyId),
  });
  const allAccountsQuery = useQuery({
    queryKey: ["banking", "all-accounts", companyId],
    queryFn: () => getAllAccounts(companyId),
    enabled: Boolean(companyId),
  });
  const factoringSummaryQuery = useQuery({
    queryKey: ["factoring", "summary", companyId],
    queryFn: () => getFactoringSummary(companyId),
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
            <Button size="sm" variant="secondary">Import Statement</Button>
            <Button size="sm" variant="secondary" onClick={() => setManageOpen(true)}>Manage Accounts</Button>
            <Button size="sm" variant="secondary">Reconcile</Button>
            <Button size="sm" onClick={() => setManualJeOpen(true)}>+ Manual JE</Button>
          </div>
        }
      />

      <div className="overflow-x-auto rounded bg-[#1A1F36] px-2 py-1 text-[11px] text-white">
        <div className="flex min-w-max gap-4">
          {SUBNAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "border-b border-white pb-0.5 font-semibold" : ""}
              onClick={() => setTab(item.id)}
            >
              {item.id === "categorize_drawer" ? `${item.label} (${uncatQuery.data?.transactions?.length ?? 0})` : item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "factoring_faro" ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm">
          <div className="font-medium text-gray-900">Factoring (Faro) overview</div>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-gray-500">Reserve Balance</div>
              <div className="text-sm font-semibold text-gray-900">
                {Number(factoringSummaryQuery.data?.reserve_balance ?? 0).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}
              </div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-gray-500">Chargeback Balance</div>
              <div className="text-sm font-semibold text-gray-900">
                {Number(factoringSummaryQuery.data?.chargeback_balance ?? 0).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}
              </div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-gray-500">Recourse Days</div>
              <div className="text-sm font-semibold text-gray-900">{Number(factoringSummaryQuery.data?.recourse_days ?? 90)}</div>
            </div>
          </div>
          <div className="mt-3">
            <Button size="sm" onClick={() => navigate("/factoring")}>
              Open full Factoring page
            </Button>
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}

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
