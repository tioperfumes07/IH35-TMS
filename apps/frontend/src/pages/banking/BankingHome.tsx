import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAllAccounts,
  getBankingKpis,
  getBankingRegister,
  getBankingTiles,
  getPlaidBankAccounts,
  getReconciliationSessions,
  startReconciliationSession,
  type BankingTile,
} from "../../api/banking";
import { PageHeader } from "../../components/layout/PageHeader";
import { PlaidLinkButton } from "../../components/banking/PlaidLinkButton";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountTilesRow } from "./components/AccountTilesRow";
import { BankingKpiRow } from "./components/BankingKpiRow";
import { ManageAccountsModal } from "./components/ManageAccountsModal";
import { ManualJEModal } from "../accounting/ManualJEModal";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
import { SyncStatusStrip } from "./components/SyncStatusStrip";
import { BankingPlaidConnectionsPanel } from "./components/BankingPlaidConnectionsPanel";
import { Link, useNavigate } from "react-router-dom";
import { TransferModal } from "./TransferModal";
import { RecordCCPaymentModal } from "./RecordCCPaymentModal";
import { filterBankingTilesForCompany } from "../../lib/banking-company-filter";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { DriverEscrowTabContent } from "./components/DriverEscrowTabContent";
import { BankingReportsTabContent } from "./components/BankingReportsTabContent";
import { BankingTransactionsDesignView } from "./components/BankingTransactionsDesignView";

const BANKING_TABS = [
  { id: "accounts", label: "Accounts" },
  { id: "transactions", label: "Transactions" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "driver_escrow", label: "Driver Escrow" },
  { id: "reports", label: "Reports" },
] as const;

export function BankingHomePage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [manualJeOpen, setManualJeOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [ccPaymentModalOpen, setCcPaymentModalOpen] = useState(false);
  const [startReconOpen, setStartReconOpen] = useState(false);
  const [reconAccountId, setReconAccountId] = useState("");
  const [reconPeriodStart, setReconPeriodStart] = useState("");
  const [reconPeriodEnd, setReconPeriodEnd] = useState("");
  const [reconStatementBalance, setReconStatementBalance] = useState("");
  const [startingRecon, setStartingRecon] = useState(false);
  const [showDisconnectedBankAccounts, setShowDisconnectedBankAccounts] = useState(false);
  const [activeTab, setActiveTab] = useState<(typeof BANKING_TABS)[number]["id"]>("accounts");

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
    queryKey: ["banking", "all-accounts", companyId, showDisconnectedBankAccounts],
    queryFn: () => getAllAccounts(companyId, { include_inactive: showDisconnectedBankAccounts }),
    enabled: Boolean(companyId),
  });
  const plaidAccountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });
  const reconciliationSessionsQuery = useQuery({
    queryKey: ["banking", "reconciliation-sessions", companyId],
    queryFn: () => getReconciliationSessions(companyId),
    enabled: Boolean(companyId),
  });
  const tiles = useMemo(() => filterBankingTilesForCompany(tilesQuery.data?.tiles ?? [], companyId), [tilesQuery.data?.tiles, companyId]);

  useEffect(() => {
    if (!selectedAccountId) return;
    if (!tiles.some((t) => t.id === selectedAccountId)) setSelectedAccountId(null);
  }, [tiles, selectedAccountId]);
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

  const openStartReconciliation = () => {
    setReconAccountId(String(plaidAccountsQuery.data?.accounts?.[0]?.id ?? ""));
    setStartReconOpen(true);
  };

  const headerActions =
    activeTab === "accounts" ? (
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton>+ Import Statement</ActionButton>
        <ActionButton onClick={() => setManageOpen(true)}>+ Create Account / Manage Accounts</ActionButton>
        <PlaidLinkButton
          operatingCompanyId={companyId}
          accountType="bank"
          label="Connect Bank"
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ["banking", "plaid-accounts", companyId] });
          }}
        />
        <PlaidLinkButton
          operatingCompanyId={companyId}
          accountType="credit_card"
          label="+ Connect Credit Card"
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ["banking", "plaid-accounts", companyId] });
          }}
        />
        <PlaidLinkButton
          operatingCompanyId={companyId}
          accountType="all"
          label="+ Connect Other"
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ["banking", "plaid-accounts", companyId] });
          }}
        />
      </div>
    ) : activeTab === "transactions" ? (
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton onClick={() => setManualJeOpen(true)}>+ Manual JE</ActionButton>
        <ActionButton onClick={() => setTransferModalOpen(true)}>+ Record Transfer</ActionButton>
        <ActionButton onClick={() => setCcPaymentModalOpen(true)}>+ Pay Credit Card</ActionButton>
        <ActionButton onClick={() => navigate("/banking/transfers")}>View Transfers</ActionButton>
      </div>
    ) : activeTab === "reconciliation" ? (
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton onClick={openStartReconciliation}>+ Reconcile</ActionButton>
        <ActionButton onClick={() => navigate("/banking/reconcile")}>Open Reconcile Queue</ActionButton>
      </div>
    ) : null;

  return (
    <div className="space-y-3">
      <PageHeader
        title="Banking Home"
        subtitle="QBO mirrored accounts + categorization"
        actions={headerActions}
      />
      <SecondaryNavTabs
        tabs={BANKING_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as (typeof BANKING_TABS)[number]["id"])}
      />
      {kpiQuery.isError || tilesQuery.isError || registerQuery.isError ? <ListErrorBanner onRetry={() => void registerQuery.refetch()} /> : null}
      {activeTab === "accounts" ? (
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
          <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={showDisconnectedBankAccounts} onChange={(e) => setShowDisconnectedBankAccounts(e.target.checked)} />
            Show disconnected history (bank accounts list)
          </label>
          <BankingPlaidConnectionsPanel companyId={companyId} />
        </>
      ) : null}

      {activeTab === "transactions" ? (
        <BankingTransactionsDesignView
          companyId={companyId}
          accounts={plaidAccountsQuery.data?.accounts ?? []}
          selectedAccountId={selectedAccountId}
          onSelectAccount={setSelectedAccountId}
          onManageConnections={() => setActiveTab("accounts")}
          onDataChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ["banking"] });
          }}
        />
      ) : null}

      {activeTab === "reconciliation" ? (
        <div className="space-y-3">
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Reconciliation</p>
              <div className="flex flex-wrap items-center gap-3">
                <Link to="/banking/reconcile" className="text-xs font-medium text-blue-700 hover:underline">
                  Open Reconcile Queue
                </Link>
                <Link to="/banking/reconciliation" className="text-xs font-medium text-blue-700 hover:underline">
                  Open Workspace
                </Link>
              </div>
            </div>
            <p className="text-sm text-gray-700">Open sessions: {(reconciliationSessionsQuery.data?.open_sessions ?? []).length}</p>
            <div className="mt-2 space-y-1">
              {(reconciliationSessionsQuery.data?.open_sessions ?? []).map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className="w-full rounded border border-gray-100 px-2 py-1 text-left text-xs hover:bg-gray-50"
                  onClick={() => navigate(`/banking/reconciliation?session_id=${session.id}&bank_account_hint=${session.bank_account_id}`)}
                >
                  Open: {session.period_start} to {session.period_end} ({Number(session.variance_cents ?? 0) / 100})
                </button>
              ))}
              {(reconciliationSessionsQuery.data?.open_sessions ?? []).length === 0 ? (
                <p className="text-xs text-gray-500">No open reconciliation sessions.</p>
              ) : null}
            </div>
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recent completed</p>
              <div className="mt-1 space-y-1">
                {(reconciliationSessionsQuery.data?.completed_sessions ?? []).map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    className="w-full rounded border border-gray-100 px-2 py-1 text-left text-xs hover:bg-gray-50"
                    onClick={() => navigate(`/banking/reconciliation?session_id=${session.id}&bank_account_hint=${session.bank_account_id}`)}
                  >
                    {session.period_start} to {session.period_end} - variance {Number(session.variance_cents ?? 0) / 100}
                  </button>
                ))}
                {(reconciliationSessionsQuery.data?.completed_sessions ?? []).length === 0 ? (
                  <p className="text-xs text-gray-500">No completed sessions yet.</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "driver_escrow" ? (
        <DriverEscrowTabContent
          operatingCompanyId={companyId}
          driverEscrowBalance={Number(kpiQuery.data?.driver_escrow ?? 0)}
        />
      ) : null}

      {activeTab === "reports" ? (
        <BankingReportsTabContent />
      ) : null}

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
      <TransferModal
        open={transferModalOpen}
        operatingCompanyId={companyId}
        onClose={() => setTransferModalOpen(false)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["banking"] });
        }}
      />
      <RecordCCPaymentModal
        open={ccPaymentModalOpen}
        operatingCompanyId={companyId}
        onClose={() => setCcPaymentModalOpen(false)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["banking"] });
        }}
      />
      {startReconOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded bg-white p-4 shadow-lg">
            <h3 className="text-base font-semibold text-gray-900">Start reconciliation</h3>
            <div className="mt-3 grid grid-cols-1 gap-3">
              <SelectCombobox
                value={reconAccountId}
                onChange={(event) => setReconAccountId(event.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="">Select bank account</option>
                {(plaidAccountsQuery.data?.accounts ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.institution_name || "Bank"} - {account.account_name || "Account"} {account.account_mask ? `••••${account.account_mask}` : ""}
                  </option>
                ))}
              </SelectCombobox>
              <input
                type="date"
                value={reconPeriodStart}
                onChange={(event) => setReconPeriodStart(event.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <input
                type="date"
                value={reconPeriodEnd}
                onChange={(event) => setReconPeriodEnd(event.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <input
                type="number"
                step="0.01"
                value={reconStatementBalance}
                onChange={(event) => setReconStatementBalance(event.target.value)}
                placeholder="Statement balance (USD)"
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <ActionButton onClick={() => setStartReconOpen(false)}>Cancel</ActionButton>
              <ActionButton
                disabled={!reconAccountId || !reconPeriodStart || !reconPeriodEnd || !reconStatementBalance || startingRecon}
                onClick={() => {
                  setStartingRecon(true);
                  void startReconciliationSession({
                    bank_account_id: reconAccountId,
                    period_start: reconPeriodStart,
                    period_end: reconPeriodEnd,
                    statement_balance_cents: Math.round(Number(reconStatementBalance) * 100),
                  })
                    .then((res) => {
                      setStartReconOpen(false);
                      void queryClient.invalidateQueries({ queryKey: ["banking", "reconciliation-sessions", companyId] });
                      navigate(`/banking/reconciliation?session_id=${res.session_id}&bank_account_hint=${reconAccountId}`);
                    })
                    .catch((error) => pushToast(String((error as Error).message || "Failed to start reconciliation"), "error"))
                    .finally(() => setStartingRecon(false));
                }}
              >
                {startingRecon ? "Starting..." : "Create Session"}
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
