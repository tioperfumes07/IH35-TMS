import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAllAccounts,
  getBankingKpis,
  getBankingTiles,
  getBankingUncategorized,
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
import { ManageAccountsModal } from "./components/ManageAccountsModal";
import { ManualJEModal } from "../accounting/ManualJEModal";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
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
  const uncategorizedQuery = useQuery({
    queryKey: ["banking", "uncategorized", companyId],
    queryFn: () => getBankingUncategorized(companyId, { limit: 8 }),
    enabled: Boolean(companyId),
  });

  const selectedTile = useMemo(() => tiles.find((tile: BankingTile) => tile.id === selectedId) ?? null, [tiles, selectedId]);
  const money = useMemo(
    () => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    []
  );
  const cashPosting = Number(kpiQuery.data?.total_cash ?? 0);
  const dipBalance = Number(kpiQuery.data?.dip_operating ?? 0) + Number(kpiQuery.data?.dip_payroll ?? 0);
  const uncategorizedCount = Number(kpiQuery.data?.total_uncategorized ?? 0);
  const reconAccounts = Number((reconciliationSessionsQuery.data?.open_sessions ?? []).length);
  const factoringReserve = Number(kpiQuery.data?.factoring_reserve ?? 0);
  const escrowFeed = Number(kpiQuery.data?.driver_escrow ?? 0);
  const sortedBankTiles = useMemo(
    () => [...tiles].sort((a, b) => a.display_order - b.display_order),
    [tiles]
  );
  const factoringTile = useMemo(
    () => tiles.find((t) => String(t.tile_kind) === "virtual" || t.display_name.toLowerCase().includes("factoring")) ?? null,
    [tiles]
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
      {kpiQuery.isError || tilesQuery.isError || uncategorizedQuery.isError ? <ListErrorBanner onRetry={() => void uncategorizedQuery.refetch()} /> : null}
      {activeTab === "accounts" ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            <div className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]"><div className="text-[10px] uppercase text-gray-500">Cash posting</div><div className="font-semibold">{money.format(cashPosting)}</div></div>
            <div className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]"><div className="text-[10px] uppercase text-gray-500">DIP balance</div><div className="font-semibold">{money.format(dipBalance)}</div></div>
            <button
              type="button"
              onClick={() => setActiveTab("transactions")}
              className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-left text-[11px] transition hover:bg-amber-100"
            >
              <div className="text-[10px] uppercase text-amber-700">Uncategorized</div>
              <div className="font-semibold text-amber-800">{uncategorizedCount}</div>
            </button>
            <div className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]"><div className="text-[10px] uppercase text-gray-500">Recon accts</div><div className="font-semibold">{reconAccounts}</div></div>
            <div className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px]"><div className="text-[10px] uppercase text-blue-700">Factoring res</div><div className="font-semibold text-blue-900">{money.format(factoringReserve)}</div></div>
            <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px]"><div className="text-[10px] uppercase text-emerald-700">Escrow feed</div><div className="font-semibold text-emerald-900">{money.format(escrowFeed)}</div></div>
          </div>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
            <div className="rounded border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                <span>Bank accounts</span>
                <button className="text-blue-700 hover:underline" type="button" onClick={() => setManageOpen(true)}>+</button>
              </div>
              <div className="max-h-[260px] overflow-y-auto">
                {sortedBankTiles.map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => setSelectedAccountId(tile.id)}
                    className={`grid w-full grid-cols-[1fr_auto] border-b border-gray-100 px-3 py-1.5 text-left text-sm ${selectedId === tile.id ? "bg-blue-50" : "hover:bg-gray-50"}`}
                  >
                    <span className="truncate">{tile.display_name}</span>
                    <span className="font-medium">{money.format(Number(tile.current_balance ?? 0))}</span>
                  </button>
                ))}
                {sortedBankTiles.length === 0 ? <p className="px-3 py-3 text-sm text-gray-500">No accounts yet.</p> : null}
              </div>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-gray-600">
                <input type="checkbox" checked={showDisconnectedBankAccounts} onChange={(e) => setShowDisconnectedBankAccounts(e.target.checked)} />
                Show disconnected history
              </label>
            </div>

            <div className="rounded border border-blue-200 bg-blue-50">
              <div className="flex items-center justify-between border-b border-blue-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                <span>Factoring · virtual bank</span>
                <span className="text-[10px]">Open</span>
              </div>
              <div className="space-y-1 px-3 py-2 text-sm">
                <div className="flex justify-between"><span>Reserves held</span><span>{money.format(factoringReserve)}</span></div>
                <div className="flex justify-between"><span>Advances funded MTD</span><span>{money.format(Math.max(cashPosting - factoringReserve, 0))}</span></div>
                <div className="flex justify-between"><span>Chargebacks open</span><span className="text-red-700">{money.format(0)}</span></div>
                <div className="flex justify-between"><span>+30 aging fees</span><span className="text-amber-700">{money.format(0)}</span></div>
                <div className="pt-1 text-xs text-gray-500">Last upload: {selectedTile?.last_txn_date ? String(selectedTile.last_txn_date) : "—"}</div>
                {factoringTile ? <div className="text-xs text-blue-800">{factoringTile.display_name}</div> : null}
              </div>
            </div>

            <div className="rounded border border-emerald-200 bg-emerald-50">
              <div className="border-b border-emerald-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">Driver escrow visualizer</div>
              <div className="space-y-1 px-3 py-2 text-sm">
                <div className="flex justify-between"><span>Total escrow held</span><span>{money.format(escrowFeed)}</span></div>
                <div className="flex justify-between"><span>Active drivers</span><span>{(plaidAccountsQuery.data?.accounts ?? []).length}</span></div>
                <div className="flex justify-between"><span>Contributions MTD</span><span>{money.format(0)}</span></div>
                <div className="flex justify-between"><span>Deductions MTD</span><span>{money.format(0)}</span></div>
                <button type="button" onClick={() => setActiveTab("driver_escrow")} className="pt-1 text-xs text-emerald-700 hover:underline">
                  Filter by name + date
                </button>
              </div>
            </div>
          </div>

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
