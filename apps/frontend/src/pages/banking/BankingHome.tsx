import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAllAccounts,
  getBankingKpis,
  getFactoringVirtual,
  getFactoringVirtualTimeline,
  getBankingTiles,
  getBankingUncategorized,
  getPlaidBankAccounts,
  getQboSyncQueueStats,
  getReconciliationSessions,
  startReconciliationSession,
  createPettyCashAccount,
  reorderBankAccounts,
} from "../../api/banking";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityPicker } from "../../components/EntityPicker";
import { entityLabel } from "../../lib/entity-label";
import { PageHeader } from "../../components/layout/PageHeader";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { EntityEmptyState } from "../../components/shared/EntityEmptyState";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";
import { ManageAccountsModal } from "./components/ManageAccountsModal";
import { AccountTilesRow } from "./components/AccountTilesRow";
import { SyncStatusStrip } from "./components/SyncStatusStrip";
import { DriftAlertsPanel } from "./components/DriftAlertsPanel";
import { getQboConnectionStatus } from "../../api/forensic";
import { ManualJEModal } from "../accounting/ManualJEModal";
import { BankingPlaidConnectionsPanel } from "./components/BankingPlaidConnectionsPanel";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { TransferModal } from "./TransferModal";
import { RecordTransferModal } from "./RecordTransferModal";
import { RecordCCPaymentModal } from "./RecordCCPaymentModal";
import { filterBankingTilesForCompany } from "../../lib/banking-company-filter";
import { SelectCombobox } from "../../components/Combobox";
import { DriverEscrowTabContent } from "./components/DriverEscrowTabContent";
import { BankingReportsTabContent } from "./components/BankingReportsTabContent";
import { BankingTransactionsDesignView } from "./components/BankingTransactionsDesignView";
import { StatementUpload } from "../../components/banking/StatementUpload";
import { BANKING_TAB_PATH, bankingTabFromPath } from "../../router/route-manifest";
import { BANKING_MODULE_TABS, type BankingModuleTabId } from "./BANKING_NAV_CONFIG";
import { formatUsd } from "../../lib/money";
import { userFacingApiError } from "../../lib/api-error-message";
import { BankingNewMenu } from "./components/BankingNewMenu";
import { LinkSuggestionsPanel } from "./components/LinkSuggestionsPanel";
import { MoneyKpiTile, MoneySparkline } from "../../components/money/MoneyKpiTile";
import { NotApplicable } from "../../components/money/NotApplicable";
import { staleSyncLabel, MONEY_TONE_COLORS } from "../../design/money-design-system";


type BankingTabId = BankingModuleTabId;

// DISP-F9993 -- FactoringStatus is a machine enum ("reserve_held", "recourse_returned");
// same label convention as FactoringListPage.tsx / SubmissionWorkqueue.tsx's local STATUS_LABEL.
const FACTORING_STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  advanced: "Funded",
  reserve_held: "Reserve Held",
  collected: "Collected",
  released: "Released",
  recourse_returned: "Recourse",
  voided: "Voided",
};

type Props = {
  initialTab?: BankingTabId;
};

// ROUND 16.19 (owner, 2026-09-06): "in the banking home page it shows many bank accounts but in
// transactions only 3. that is not correct." MEASURED live and in db/migrations/
// 202608041400_restore_banking_account_tiles_view.sql: Home's tile strip shows 6 tiles — 3 REAL
// Plaid-linked accounts (tile_kind='real', real banking.bank_accounts rows) plus 3 VIRTUAL
// synthetic sub-ledger pools (tile_kind='virtual': Factoring Reserve, Driver Escrow Pool, Cash
// Advance Pool) that are hardcoded UUIDs ('00000000-...-59'/'-56'/'-60') computed from
// views.factoring_balance_invoice_linkage / driver_finance.escrow_balances /
// driver_finance.driver_advances — they are NOT banking.bank_accounts rows and have no Plaid feed,
// so they cannot and should not appear as Transactions tabs (that register is typed
// PlaidBankAccount[] and shows real bank-transaction feeds). That gap is correct by nature — a
// sub-ledger pool has no bank feed to categorize, same as QuickBooks' Undeposited Funds is not a
// bank account. The REAL bug (root-caused live): clicking one of the 3 virtual tiles navigated to
// /banking/accounts/:id or the Transactions tab keyed to that synthetic id, which matches nothing
// in banking.bank_accounts or the Plaid account list — a dead click ("it failed to load"). Fixed:
// route each virtual tile to the page that already shows its REAL underlying ledger instead.
function virtualTileRoute(tile: { tile_kind?: string; account_type?: string } | undefined): string | null {
  if (!tile || tile.tile_kind !== "virtual") return null;
  if (tile.account_type === "virtual_factoring") return "/banking/factoring";
  if (tile.account_type === "virtual_escrow") return "/banking/driver-escrow";
  if (tile.account_type === "virtual_advance") return "/cash-advances";
  return null;
}

export function BankingHomePage({ initialTab }: Props = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkTxnId = searchParams.get("txn_id");
  // LINK-F5171/LINK-F5184: factoring:banking.entry reverse — a load can filter this tab's "Recent
  // Faro advances" timeline down to its own advance(s) via ?load_id=.
  // LST-F5203 — visible Load EntityPicker must also write ?load_id= (seed-only was not enough).
  const deepLinkLoadId = searchParams.get("load_id");
  function patchLoadFilter(next: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("load_id", next);
        else params.delete("load_id");
        return params;
      },
      { replace: true },
    );
  }
  const { selectedCompanyId, selectedCompany } = useCompanyContext();
  const { user } = useAuth();
  const canSeeEmailQueue = user?.role === "Owner" || user?.role === "Administrator";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [manualJeOpen, setManualJeOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  // DISP-F6XXX (hop.bank) — TransferModal only ever posts transfer_type "bank_to_bank"/"intercompany"
  // (createTransfer/createIntercompanyTransfer, no type selector). A customer payment recorded via
  // RecordPaymentModal always lands in the entity's undeposited_funds CoA account (never a real bank
  // account) until it is deposited, so there was NO live path from Banking Home's general-purpose
  // "+ Record Transfer" button to move it into a real bank account -- the only place a Cash Deposit
  // could be recorded was RecordTransferModal, and that component was only ever mounted gated behind
  // an EXISTING flagged bank-feed row (BankingTransactionsDesignView.tsx transferModalTx), which can't
  // exist yet for a brand-new payment. Confirmed live: a real $1,200.00 test payment (PMT-2026-00009,
  // fully applied to INV-2026-00044) sat in Undeposited Funds with no way to reach the bank-reconciliation
  // workspace's candidate list. RecordTransferModal itself already supports "Cash Deposit" (coa -> bank)
  // via its own type radio group -- this just gives the general entry point a way to reach it, additive,
  // no change to the existing Bank-to-Bank/Intercompany flow.
  const [recordDepositOpen, setRecordDepositOpen] = useState(false);
  const [ccPaymentModalOpen, setCcPaymentModalOpen] = useState(false);
  const [startReconOpen, setStartReconOpen] = useState(false);
  const [reconAccountId, setReconAccountId] = useState("");
  const [reconPeriodStart, setReconPeriodStart] = useState("");
  const [reconPeriodEnd, setReconPeriodEnd] = useState("");
  const [reconStatementBalance, setReconStatementBalance] = useState("");
  const [startingRecon, setStartingRecon] = useState(false);
  const [showDisconnectedBankAccounts, setShowDisconnectedBankAccounts] = useState(false);
  const [activeTab, setActiveTab] = useState<BankingTabId>(initialTab ?? bankingTabFromPath(location.pathname) as BankingTabId);
  const [inspectTileId, setInspectTileId] = useState<string | null>(null);
  // Uncategorized KPI tile → Transactions tab pre-filtered. Reset to "all" whenever the Transactions tab
  // is reached any other way (top tab bar) so the filter only sticks when it came from the tile.
  const [transactionsInitialFilter, setTransactionsInitialFilter] = useState<string>("all");

  useEffect(() => {
    setActiveTab(bankingTabFromPath(location.pathname) as BankingTabId);
  }, [location.pathname]);

  // Legacy /banking/uncategorized alias lands here via manifest redirect (?type=uncategorized).
  useEffect(() => {
    if (searchParams.get("type") === "uncategorized") {
      setTransactionsInitialFilter("uncategorized");
    }
  }, [searchParams]);

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
  // QBO sync-queue stats power the top SyncStatusStrip's "Last sync" + "Pending QBO sync" fields —
  // those are genuinely about the sync queue. FIX-3: they must NOT feed the "Transactions" count (that
  // metric now comes from kpiQuery.data.total_transactions, the real banking.bank_transactions total —
  // see below). Read-only, existing endpoint — no new backend surface.
  const qboSyncStatsQuery = useQuery({
    queryKey: ["banking", "qbo-sync-stats", companyId],
    queryFn: () => getQboSyncQueueStats(companyId),
    enabled: Boolean(companyId),
  });
  const qboConnectionQuery = useQuery({
    queryKey: ["banking", "qbo-connection", companyId],
    queryFn: () => getQboConnectionStatus(companyId),
    enabled: Boolean(companyId),
  });
  const tiles = useMemo(() => filterBankingTilesForCompany(tilesQuery.data?.tiles ?? [], companyId), [tilesQuery.data?.tiles, companyId]);

  const uncategorizedQuery = useQuery({
    queryKey: ["banking", "uncategorized", companyId],
    queryFn: () => getBankingUncategorized(companyId, { limit: 8 }),
    enabled: Boolean(companyId),
  });
  const factoringVirtualQuery = useQuery({
    queryKey: ["banking", "factoring-virtual", companyId],
    queryFn: () => getFactoringVirtual(companyId),
    enabled: Boolean(companyId),
  });
  const factoringTimelineQuery = useQuery({
    queryKey: ["banking", "factoring-virtual-timeline", companyId, deepLinkLoadId],
    queryFn: () => getFactoringVirtualTimeline(companyId, deepLinkLoadId ?? undefined),
    enabled: Boolean(companyId) && activeTab === "factoring",
  });

  const money = useMemo(
    () => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    []
  );
  // BANK-F01 / AUDIT row 2 — Cash posting KPI must match the per-account tile sum in dollars.
  // GET /api/v1/banking/dashboard/kpis sets total_cash = sumAuthoritativeDepositoryCashCents() / 100
  // (dollars for UI; same authoritative total as cash-flow opening_cash_cents). Do NOT divide again
  // here — #3997 converted cents at the selector; #4011 moved conversion to the API, and a second
  // /100 made TRANSP render ~$1,739 instead of ~−$173,932 (100× deflation vs tile sum).
  const cashPosting = Number(kpiQuery.data?.total_cash ?? 0);
  const dipBalance = Number(kpiQuery.data?.dip_operating ?? 0) + Number(kpiQuery.data?.dip_payroll ?? 0);
  const uncategorizedCount = Number(kpiQuery.data?.total_uncategorized ?? 0);
  const factoringVirtualSummary = useMemo(() => {
    const companies = factoringVirtualQuery.data?.companies ?? [];
    return companies.reduce(
      (acc, row) => ({
        reserve: acc.reserve + Number(row.reserve_balance ?? 0),
        // FACTORING-CHARGEBACK-BALANCE-IS-ACTUALLY-OUTSTANDING-LIABILITY: row.chargeback_balance
        // is actually Advance + Reserve still owed to the factor (outstanding_liability_signed_cents),
        // not a real chargeback/recourse figure — prefer outstanding_liability_balance.
        outstandingLiability: acc.outstandingLiability + Number(row.outstanding_liability_balance ?? 0),
        lastAdvanceAt: row.last_advance_at && (!acc.lastAdvanceAt || row.last_advance_at > acc.lastAdvanceAt) ? row.last_advance_at : acc.lastAdvanceAt,
      }),
      { reserve: 0, outstandingLiability: 0, lastAdvanceAt: null as string | null },
    );
  }, [factoringVirtualQuery.data?.companies]);
  const factoringReserve = factoringVirtualSummary.reserve;
  const factoringOutstandingLiability = factoringVirtualSummary.outstandingLiability;
  const escrowFeed = Number(kpiQuery.data?.driver_escrow ?? 0);
  const sortedBankTiles = useMemo(
    () =>
      [...tiles]
        .sort((a, b) => a.display_order - b.display_order)
        .map((tile) => {
          const isFactoringVirtual =
            String(tile.tile_kind) === "virtual" &&
            (tile.tag === "Factoring" || tile.display_name.toLowerCase().includes("factoring"));
          if (!isFactoringVirtual) return tile;
          return { ...tile, current_balance: factoringReserve };
        }),
    [tiles, factoringReserve],
  );
  const realBankTiles = useMemo(
    () => sortedBankTiles.filter((t) => String(t.tile_kind) === "real"),
    [sortedBankTiles],
  );
  // ROUND-20.8 B7 — "Recon accts" used to read the count of currently-OPEN reconciliation sessions,
  // not accounts that have ever actually been reconciled — a live 0 there read as neutral gray next
  // to a healthy figure. The honest metric: of the real bank accounts this company has, how many
  // have at least one COMPLETED session ever? (completed_sessions carries bank_account_id already —
  // no new backend surface.)
  const reconciledAccountIds = useMemo(
    () => new Set((reconciliationSessionsQuery.data?.completed_sessions ?? []).map((s) => s.bank_account_id)),
    [reconciliationSessionsQuery.data?.completed_sessions],
  );
  const reconciledAccountsCount = reconciledAccountIds.size;
  const virtualBankTiles = useMemo(
    () => sortedBankTiles.filter((t) => String(t.tile_kind) === "virtual"),
    [sortedBankTiles],
  );
  const showVirtualTilesEmptyHonesty =
    tilesQuery.isSuccess &&
    realBankTiles.length === 0 &&
    virtualBankTiles.length === 0 &&
    (allAccountsQuery.isSuccess ? (allAccountsQuery.data?.accounts ?? []).length === 0 : false);
  // BANK-SURF-05 — resolve Relay via CoA system_purpose (never phantom is_relay).
  const relayWalletTiles = useMemo(
    () => sortedBankTiles.filter((t) => t.is_relay_wallet === true || t.system_purpose === "relay_fuel_wallet"),
    [sortedBankTiles],
  );
  // SyncStatusStrip data. FIX-3: "Transactions" must be the REAL bank-transaction total (canonical
  // banking.bank_transactions, entity-scoped) — it previously read qboStats.synced, a count of
  // qbo_sync_queue entities (any type) in status 'synced', which is NOT a bank-transaction total and
  // showed "Transactions: 0" for companies with hundreds of un-pushed categorized transactions.
  const qboStats = qboSyncStatsQuery.data;
  const syncedAt = qboStats?.last_successful_sync_at ?? null;
  const syncTransactionCount = Number(kpiQuery.data?.total_transactions ?? 0);
  const pendingSyncCount = Number(qboStats?.pending ?? 0);
  const bankAccountsPanelRows = useMemo(() => {
    const realTiles = sortedBankTiles.filter((tile) => String(tile.tile_kind) === "real");
    if (realTiles.length > 0) {
      return realTiles.map((tile) => ({
        id: tile.id,
        displayName: tile.display_name,
        balance: Number(tile.current_balance ?? 0),
      }));
    }
    return (plaidAccountsQuery.data?.accounts ?? []).map((account) => ({
      id: account.id,
      displayName: `${account.account_name || "Account"}${account.account_mask ? ` ••••${account.account_mask}` : ""}`,
      balance: Number(account.current_balance_cents ?? 0) / 100,
    }));
  }, [plaidAccountsQuery.data?.accounts, sortedBankTiles]);
  const totalBankAccountsForRecon = bankAccountsPanelRows.length;
  // ROUND-20.8 A5 — the "Bank feed" KPI tile's staleness, from the same last_synced_at
  // PlaidSyncStatusPanel used to read (that panel is gone now — B9 — so this is its one remaining
  // consumer). The account with the newest last_synced_at wins.
  const bankFeedLastSync = useMemo(() => {
    const accounts = plaidAccountsQuery.data?.accounts ?? [];
    return (
      accounts
        .map((a) => a.last_synced_at)
        .filter((v): v is string => Boolean(v))
        .sort()
        .reverse()[0] ?? null
    );
  }, [plaidAccountsQuery.data?.accounts]);
  const bankFeedInstitution = plaidAccountsQuery.data?.accounts?.[0]?.institution_name ?? null;
  useEffect(() => {
    if (!selectedAccountId) return;
    if (!bankAccountsPanelRows.some((row) => row.id === selectedAccountId)) setSelectedAccountId(null);
  }, [bankAccountsPanelRows, selectedAccountId]);
  const selectedId = selectedAccountId ?? bankAccountsPanelRows[0]?.id ?? null;

  const handleReorderAccount = async (accountId: string, direction: "up" | "down") => {
    const ids = bankAccountsPanelRows.map((r) => r.id);
    const idx = ids.indexOf(accountId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ids.length) return;
    [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
    void queryClient.cancelQueries({ queryKey: ["banking", "tiles", companyId] });
    const prevTiles = tilesQuery.data;
    queryClient.setQueryData(["banking", "tiles", companyId], (old: { tiles: typeof tiles } | undefined) => {
      if (!old) return old;
      const reordered = ids.map((id, i) => {
        const tile = old.tiles.find((t) => t.id === id);
        return tile ? { ...tile, display_order: i } : null;
      }).filter(Boolean) as typeof tiles;
      const untouched = old.tiles.filter((t) => !ids.includes(t.id));
      return { ...old, tiles: [...untouched, ...reordered].sort((a, b) => a.display_order - b.display_order) };
    });
    try {
      await reorderBankAccounts(companyId, ids);
      void queryClient.invalidateQueries({ queryKey: ["banking", "tiles", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["banking", "all-accounts", companyId] });
    } catch {
      queryClient.setQueryData(["banking", "tiles", companyId], prevTiles);
      pushToast("Failed to reorder account", "error");
    }
  };
  // BNK-account-reorder-on-transactions (owner 09-07: "banking transactions view needs a way to
  // reorder bank accounts") — the Accounts tab's reorder (handleReorderAccount above) already
  // persists a real display_order via reorderBankAccounts(), but the Transactions tab's own account
  // selector reads straight off plaidAccountsQuery, which carries no display_order at all, so a
  // reorder made on Accounts was invisible here. Re-derive the same order bankAccountsPanelRows
  // already resolved (tiles' display_order when tiles exist, else the raw query order) instead of
  // adding a second, divergent ordering source.
  const sortedTransactionAccounts = useMemo(() => {
    const accounts = plaidAccountsQuery.data?.accounts ?? [];
    const order = new Map(bankAccountsPanelRows.map((row, i) => [row.id, i]));
    return [...accounts].sort((a, b) => {
      const ai = order.get(a.id);
      const bi = order.get(b.id);
      if (ai == null && bi == null) return 0;
      if (ai == null) return 1;
      if (bi == null) return -1;
      return ai - bi;
    });
  }, [plaidAccountsQuery.data?.accounts, bankAccountsPanelRows]);
  const factoringTile = useMemo(
    () => tiles.find((t) => String(t.tile_kind) === "virtual" || t.display_name.toLowerCase().includes("factoring")) ?? null,
    [tiles]
  );
  const dipAccountId = useMemo(() => {
    const dip = (allAccountsQuery.data?.accounts ?? []).find((a) => Boolean((a as Record<string, unknown>).is_dip));
    return dip ? String((dip as Record<string, unknown>).id ?? "") || null : null;
  }, [allAccountsQuery.data?.accounts]);
  const openStartReconciliation = () => {
    setReconAccountId(String(plaidAccountsQuery.data?.accounts?.[0]?.id ?? ""));
    setStartReconOpen(true);
  };

  // Doc-18 defects #10/#11 — QBO always surfaces "Bank Register" + "Chart of Accounts" as persistent
  // Banking nav actions (not buried in Lists), so both render on every Banking tab, alongside whatever
  // tab-specific actions apply. Bank Register MUST pre-bind the selected bank's Cash GL
  // (ledger_account_id) — same path as CoA "View register". Never open the unbound empty picker.
  const openBankRegister = () => {
    const bankRow = (allAccountsQuery.data?.accounts ?? []).find((a) => String(a.id) === String(selectedId ?? ""));
    const ledgerAccountId = bankRow?.ledger_account_id ? String(bankRow.ledger_account_id) : null;
    if (ledgerAccountId) {
      navigate(`/accounting/chart-of-accounts/register/${ledgerAccountId}`);
      return;
    }
    if (selectedId) {
      // FAIL-3: Cash GL setup was routed but unreachable — send operator to the wired surface.
      navigate("/banking/cash-gl-setup");
      pushToast("This bank has no Cash GL mapping. Map it here, then open Bank Register.", "error");
      return;
    }
    pushToast("Select a bank account first, then open Bank Register.", "error");
  };
  // ROUND-20.8 B1/B2 — was THIRTEEN unstyled text links crammed into one header line (measured live
  // on the Accounts tab: Bank Register, Chart of Accounts, +Record Transfer, +Record Deposit, View
  // Transfers, +Import Statement, Cash GL setup, Email Queue, +Create Account/Manage Accounts,
  // +Petty Cash, Connect Bank, +Connect Credit Card, +Connect Other). B2 deletes 5 of those outright
  // — +Import Statement (duplicates the Statement Import tab), Connect Bank / +Connect Credit Card /
  // +Connect Other (duplicate the Plaid Connections tab — now live inside
  // BankingPlaidConnectionsPanel itself, see that file), +Create Account/Manage Accounts (duplicates
  // the Accounts tab, which already has its own "+" manage-accounts affordance in the Bank accounts
  // panel below). Bank Register stays a separate persistent button (Doc-18 #10/#11 — must render on
  // every tab, pre-binding the selected bank's Cash GL). Everything else folds into ONE "+ New"
  // grouped menu.
  const handleCreatePettyCash = async () => {
    try {
      const result = await createPettyCashAccount(companyId);
      pushToast(result.account.already_existed ? "Petty Cash account already exists." : "Petty Cash account created.", "success");
      void queryClient.invalidateQueries({ queryKey: ["banking", "tiles", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["banking", "accounts", companyId] });
    } catch (err) {
      pushToast(`Failed to create Petty Cash account: ${(err as Error)?.message ?? "Unknown error"}`, "error");
    }
  };
  const navActions = (
    <>
      <ActionButton onClick={openBankRegister}>Bank Register</ActionButton>
      <BankingNewMenu
        groups={[
          {
            heading: "Record",
            items: [
              { key: "record-transfer", label: "+ Record Transfer", onClick: () => setTransferModalOpen(true) },
              { key: "record-deposit", label: "+ Record Deposit", onClick: () => setRecordDepositOpen(true) },
              { key: "petty-cash", label: "+ Petty Cash", onClick: () => void handleCreatePettyCash() },
              { key: "view-transfers", label: "View Transfers", onClick: () => navigate("/banking/transfers") },
            ],
          },
          {
            heading: "Setup",
            items: [
              { key: "coa", label: "Chart of Accounts", onClick: () => navigate("/lists/accounting/chart-of-accounts") },
              { key: "cash-gl", label: "Cash GL setup", onClick: () => navigate("/banking/cash-gl-setup") },
              ...(canSeeEmailQueue ? [{ key: "email-queue", label: "Email Queue", onClick: () => navigate("/banking/email-queue") }] : []),
            ],
          },
        ]}
      />
    </>
  );

  const tabActions =
    activeTab === "transactions" ? (
      <>
        <ActionButton onClick={() => setManualJeOpen(true)}>+ Manual JE</ActionButton>
        <ActionButton onClick={() => setCcPaymentModalOpen(true)}>+ Pay Credit Card</ActionButton>
      </>
    ) : activeTab === "reconciliation" ? (
      <>
        <ActionButton onClick={openStartReconciliation}>+ Reconcile</ActionButton>
        <ActionButton onClick={() => navigate("/banking/reconcile")}>Open Reconcile Queue</ActionButton>
      </>
    ) : null;

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {navActions}
      {tabActions}
    </div>
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title="Banking Home"
        subtitle="QBO mirrored accounts + categorization"
        actions={headerActions}
      />
      <NavyPageSubNav
        items={BANKING_MODULE_TABS.map((tab) => ({
          label: tab.label,
          to: BANKING_TAB_PATH[tab.id],
        }))}
      />
      {/* GO-20 slice A — "Blocks the highest-value card on the owner home page after 425C." Shown
          regardless of the active sub-tab, same as the highest-priority attention surface should be. */}
      <DriftAlertsPanel companyId={companyId} />
      {kpiQuery.isError || tilesQuery.isError || uncategorizedQuery.isError ? <ListErrorBanner onRetry={() => void uncategorizedQuery.refetch()} /> : null}
      {/* ROUND-20.8 B9 — this "Plaid sync status" + bare "Connect via PlaidLink" pair used to render
          here UNCONDITIONALLY (every tab), on top of BankingPlaidConnectionsPanel appearing again
          on Accounts/Plaid Connections/Settings — the same fact rendered up to 3x on one page.
          BankingPlaidConnectionsPanel is now the ONE canonical panel (it grew its own
          + Connect bank/credit card/other buttons, see that file) — this duplicate pair is deleted. */}
      {activeTab === "accounts" ? (
        <>
          {/* QBO-parity banking home: horizontal account-tiles row + QBO sync strip (May-1 spec).
              Additive — the KPI grid, vertical Bank-accounts list, and register below are unchanged. */}
          <SyncStatusStrip
            syncedAt={syncedAt}
            transactionCount={syncTransactionCount}
            uncategorizedCount={uncategorizedCount}
            pendingSyncCount={pendingSyncCount}
            failedSyncCount={Number(qboStats?.failed ?? 0)}
            isConnected={qboConnectionQuery.data?.connected ?? false}
          />
          {showVirtualTilesEmptyHonesty ? (
            <div
              className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700"
              data-testid="banking-virtual-tiles-empty-honesty-banner"
            >
              <p className="font-semibold">Banking account tiles are empty — not a silent healthy $0.</p>
              <p className="mt-1">
                DIP, Factoring reserve, and Driver Escrow KPIs normally come from the banking account summary
                feed. When that feed returns no rows, zeros here are unproven. Connect Plaid / map Cash GL
                accounts, or open Factoring and Driver Escrow
                tabs for canonical virtual-bank truth.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <ActionButton onClick={() => setActiveTab("factoring")}>Factoring entry</ActionButton>
                <ActionButton onClick={() => setActiveTab("driver_escrow")}>Driver Escrow</ActionButton>
                <Link to="/banking/cash-gl-setup" className="text-xs font-medium text-slate-800 underline">
                  Cash GL setup
                </Link>
              </div>
            </div>
          ) : null}
          {tilesQuery.isSuccess &&
          sortedBankTiles.length > 0 &&
          virtualBankTiles.length === 0 &&
          factoringReserve === 0 &&
          escrowFeed === 0 &&
          dipBalance === 0 ? (
            <div
              className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
              data-testid="banking-dip-factoring-escrow-zero-density-banner"
            >
              Real bank tiles are wired; DIP / Factoring / Escrow virtual pools read $0 on live density — honest empty
              until settlements, Faro advances, or escrow postings populate.
            </div>
          ) : null}
          {allAccountsQuery.isSuccess &&
          (() => {
            const accts = allAccountsQuery.data?.accounts ?? [];
            const unbound = accts.filter((a) => !a.ledger_account_id).length;
            if (accts.length === 0 || unbound === 0) return null;
            // ROUND-20.8 B5 — this is a POSTING BLOCKER (an unbound bank cannot post at all), not
            // routine information. Bad treatment (border-left spine + tinted background from
            // MONEY_TONE_COLORS.bad) and a real primary button, not a text link.
            return (
              <div
                className="rounded-[9px] border border-[#C7D2DC] px-3 py-2 text-xs"
                style={{ borderLeft: "4px solid #B42318", background: "#fdecea" }}
                data-testid="banking-accounts-cash-gl-unbound-banner"
              >
                <p className="font-semibold" style={{ color: "#B42318" }}>
                  Cash GL unbound on {unbound} of {accts.length} bank account(s)
                </p>
                <p className="mt-1 text-slate-700">
                  Bank Register and bank-feed posting need a Cash GL per account. Until it is mapped, that account
                  cannot post — do not treat Accounts home as posting-ready.
                </p>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => navigate("/banking/cash-gl-setup")}
                    className="rounded-sm px-2.5 py-1 font-bold text-white"
                    style={{ background: "#B42318", fontSize: "11px" }}
                  >
                    Map Cash GL
                  </button>
                </div>
              </div>
            );
          })()}
          <AccountTilesRow
            tiles={sortedBankTiles}
            selectedId={selectedId}
            onSelect={(id) => {
              const virtualPath = virtualTileRoute(sortedBankTiles.find((t) => t.id === id));
              if (virtualPath) {
                navigate(virtualPath);
                return;
              }
              setSelectedAccountId(id);
              navigate(`/banking/accounts/${id}`);
            }}
            onView={(id) => {
              const virtualPath = virtualTileRoute(sortedBankTiles.find((t) => t.id === id));
              if (virtualPath) {
                navigate(virtualPath);
                return;
              }
              setSelectedAccountId(id);
              setTransactionsInitialFilter("all");
              setActiveTab("transactions");
              navigate(BANKING_TAB_PATH.transactions);
            }}
            onInspect={(id) => setInspectTileId(id)}
            onManageAccounts={() => setManageOpen(true)}
          />
          {inspectTileId ? (
            <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid="bank-account-inspect-panel">
              {(() => {
                const tile = sortedBankTiles.find((t) => t.id === inspectTileId);
                const plaid = (plaidAccountsQuery.data?.accounts ?? []).find((a) => a.id === inspectTileId);
                return (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 text-xs text-gray-800">
                      <p className="font-semibold text-gray-900">{tile?.display_name ?? "Account"}</p>
                      <p className="text-xs text-gray-600">Type: {tile?.account_type ?? plaid?.account_type ?? <NotApplicable reason="no_source" />}</p>
                      <p className="text-xs text-gray-600">Institution: {plaid?.institution_name ?? <NotApplicable reason="not_applicable" data-testid="bank-account-inspect-no-institution" />}</p>
                      <p className="text-xs text-gray-600">Mask: {plaid?.account_mask ? `••••${plaid.account_mask}` : <NotApplicable reason="not_applicable" />}</p>
                      <p className="text-xs text-gray-600">
                        Balance: ${Number(tile?.current_balance ?? (plaid?.current_balance_cents ?? 0) / 100).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-600">Last txn: {tile?.last_txn_date ? String(tile.last_txn_date).slice(0, 10) : <NotApplicable reason="not_loaded" />}</p>
                      <p className="text-xs text-gray-600">Uncategorized: {Number(tile?.uncategorized_count ?? 0)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                        onClick={() => {
                          const virtualPath = virtualTileRoute(tile);
                          if (virtualPath) {
                            navigate(virtualPath);
                            setInspectTileId(null);
                            return;
                          }
                          setSelectedAccountId(inspectTileId);
                          setActiveTab("transactions");
                          navigate(BANKING_TAB_PATH.transactions);
                          setInspectTileId(null);
                        }}
                      >
                        {virtualTileRoute(tile) ? "View ledger" : "View register"}
                      </button>
                      <button type="button" className="rounded-sm border border-gray-300 px-2 py-1 text-xs" onClick={() => setInspectTileId(null)}>
                        Close
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : null}
          {/* ROUND-20.8 PART A/B4/B6/B7 — the Money Design System's KPI anatomy, replacing the flat
              KpiStatCard band (every number was the same gray at the same weight — a 59%
              uncategorized rate read identically to a routine cash balance). Each tile's tone
              below is a THRESHOLD, named in its own comment, never a developer's mood (A1). */}
          <div className="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {(() => {
              // THRESHOLD: 0 uncategorized -> good; any uncategorized -> warn. Never bad — an
              // uncategorized backlog is routine review work, not a blocked/failed state.
              const uncatPct = syncTransactionCount > 0 ? (uncategorizedCount / syncTransactionCount) * 100 : 0;
              const uncatTone = uncategorizedCount === 0 ? "good" : "warn";
              return (
                <MoneyKpiTile
                  label="Uncategorized"
                  value={`${Math.round(uncatPct)}%`}
                  tone={uncatTone}
                  sub={`${uncategorizedCount} of ${syncTransactionCount} transactions`}
                  sparkline={<MoneySparkline kind="fill" pct={uncatPct} colorHex={MONEY_TONE_COLORS[uncatTone].text} />}
                  action={uncategorizedCount > 0 ? { label: "Categorize now", onClick: () => { setTransactionsInitialFilter("uncategorized"); navigate(`${BANKING_TAB_PATH.transactions}?type=uncategorized`); } } : undefined}
                  onClick={() => { setTransactionsInitialFilter("uncategorized"); navigate(`${BANKING_TAB_PATH.transactions}?type=uncategorized`); }}
                  data-testid="banking-kpi-uncategorized"
                />
              );
            })()}
            {(() => {
              // THRESHOLD: 0 real bank accounts -> neutral (nothing to reconcile yet); 0 of N
              // reconciled -> bad (a real gap, never routine gray); some but not all -> warn;
              // all reconciled -> good.
              const reconTone =
                totalBankAccountsForRecon === 0 ? "neutral" : reconciledAccountsCount === 0 ? "bad" : reconciledAccountsCount === totalBankAccountsForRecon ? "good" : "warn";
              const reconPct = totalBankAccountsForRecon > 0 ? (reconciledAccountsCount / totalBankAccountsForRecon) * 100 : 0;
              return (
                <MoneyKpiTile
                  label="Accounts reconciled"
                  value={totalBankAccountsForRecon > 0 ? `${reconciledAccountsCount} of ${totalBankAccountsForRecon}` : "—"}
                  tone={reconTone}
                  sub={totalBankAccountsForRecon === 0 ? "no bank accounts yet" : reconciledAccountsCount === 0 ? "no account has ever been reconciled" : `${reconciledAccountsCount} of ${totalBankAccountsForRecon} ever reconciled`}
                  sparkline={totalBankAccountsForRecon > 0 ? <MoneySparkline kind="fill" pct={reconPct} colorHex={MONEY_TONE_COLORS[reconTone].text} /> : undefined}
                  action={reconciledAccountsCount === 0 && totalBankAccountsForRecon > 0 ? { label: "Start reconciliation", onClick: openStartReconciliation } : undefined}
                  onClick={() => navigate(BANKING_TAB_PATH.reconciliation)}
                  data-testid="banking-kpi-recon-accounts"
                />
              );
            })()}
            {/* THRESHOLD: always neutral — a cash balance is informational money, never a pass/fail
                verdict on its own. */}
            <MoneyKpiTile
              label="Cash on hand"
              value={formatUsd(cashPosting)}
              tone="neutral"
              sub={`${realBankTiles.length} real bank account(s)`}
              onClick={() => navigate("/lists/accounting/chart-of-accounts")}
              data-testid="banking-kpi-cash-on-hand"
            />
            {/* THRESHOLD: always neutral — informational money. B6: "DIP BALANCE" jargon spelled out
                rather than removed — this is a real Chapter 11 debtor-in-possession cash figure,
                not decoration, and dropping it silently would hide a compliance-relevant balance. */}
            <MoneyKpiTile
              label="Debtor-in-possession cash"
              value={money.format(dipBalance)}
              tone="neutral"
              sub="operating + payroll DIP accounts (Ch. 11)"
              onClick={() => (dipAccountId ? navigate(`/banking/accounts/${dipAccountId}`) : setActiveTab("accounts"))}
              data-testid="banking-kpi-dip-balance"
            />
            {/* THRESHOLD: always good — a reserve Faro is actually holding is funded, not at risk. */}
            <MoneyKpiTile
              label="Factoring reserve"
              value={money.format(factoringReserve)}
              tone="good"
              sub="held by Faro · virtual ledger"
              onClick={() => navigate("/factoring/reserve-tracker")}
              data-testid="banking-kpi-factoring-reserve"
            />
            {/* THRESHOLD: always good — escrow held in trust for drivers is a funded liability, not
                a risk signal. */}
            <MoneyKpiTile
              label="Driver escrow"
              value={money.format(escrowFeed)}
              tone="good"
              sub={`${Number(kpiQuery.data?.drivers_with_escrow_balance ?? 0)} driver(s) · liability, held in trust`}
              onClick={() => navigate(BANKING_TAB_PATH.driver_escrow)}
              data-testid="banking-kpi-driver-escrow"
            />
            {(() => {
              // THRESHOLD: staleSyncLabel() — >4h since last sync -> warn (A5); never synced -> bad.
              const stale = staleSyncLabel(bankFeedLastSync);
              const stalePct = bankFeedLastSync ? Math.min(100, ((Date.now() - new Date(bankFeedLastSync).getTime()) / (24 * 60 * 60 * 1000)) * 100) : 100;
              return (
                <MoneyKpiTile
                  label="Bank feed"
                  value={stale.label}
                  tone={stale.tone}
                  sub={bankFeedInstitution ? `${bankFeedInstitution} · last sync` : "no bank feed connected yet"}
                  sparkline={<MoneySparkline kind="fill" pct={stalePct} colorHex={MONEY_TONE_COLORS[stale.tone].text} />}
                  action={stale.tone !== "good" && plaidAccountsQuery.data?.accounts?.[0]?.id ? { label: "Sync now", onClick: () => navigate(BANKING_TAB_PATH.plaid_connections) } : undefined}
                  data-testid="banking-kpi-bank-feed"
                />
              );
            })()}
          </div>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1.3fr_1fr_1fr]">
            <div className="rounded-sm border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                <span>Bank accounts</span>
                {/* CLS-CHROME-LAW-8: this bare "+" panel-header shortcut (same action as the "+
                    Create Account / Manage Accounts" button above) had no accessible label at
                    all. Added aria-label so it identifies itself to screen readers / a11y
                    tooling; kept the compact glyph visually since space here is tight. */}
                <button
                  className="text-slate-700 hover:underline"
                  type="button"
                  onClick={() => setManageOpen(true)}
                  aria-label="Manage bank accounts"
                >
                  +
                </button>
              </div>
              <div className="max-h-[260px] overflow-y-auto">
                {bankAccountsPanelRows.map((row, idx) => (
                  <div
                    key={row.id}
                    className={`grid w-full grid-cols-[1fr_auto_auto] items-center border-b border-gray-100 px-3 py-1.5 text-xs ${selectedId === row.id ? "bg-slate-100" : "hover:bg-gray-50"}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAccountId(row.id);
                        navigate(`/banking/accounts/${row.id}`);
                      }}
                      className="truncate text-left"
                    >
                      {row.displayName}
                    </button>
                    <span className="font-medium">{money.format(row.balance)}</span>
                    <span className="flex flex-col">
                      <button
                        type="button"
                        className="text-xs leading-none text-gray-400 hover:text-gray-700 disabled:opacity-30"
                        disabled={idx === 0}
                        onClick={() => void handleReorderAccount(row.id, "up")}
                        aria-label={`Move ${row.displayName} up`}
                        data-testid={`bank-account-reorder-up-${row.id}`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="text-xs leading-none text-gray-400 hover:text-gray-700 disabled:opacity-30"
                        disabled={idx === bankAccountsPanelRows.length - 1}
                        onClick={() => void handleReorderAccount(row.id, "down")}
                        aria-label={`Move ${row.displayName} down`}
                        data-testid={`bank-account-reorder-down-${row.id}`}
                      >
                        ▼
                      </button>
                    </span>
                  </div>
                ))}
                {bankAccountsPanelRows.length === 0 ? <EntityEmptyState entityName={selectedCompany?.legal_name} noun="bank accounts" /> : null}
              </div>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-gray-600">
                <input type="checkbox" checked={showDisconnectedBankAccounts} onChange={(e) => setShowDisconnectedBankAccounts(e.target.checked)} />
                Show disconnected history
              </label>
            </div>

            <div className="rounded-sm border border-slate-300 bg-slate-100">
              <div className="flex items-center justify-between border-b border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                <Link to="/factoring" className="hover:underline">Factoring · virtual bank</Link>
                <span className="text-xs">Open</span>
              </div>
              <div className="space-y-1 px-3 py-2 text-xs">
                <Link to="/factoring/reserve-tracker" className="flex justify-between hover:underline">
                  <span>Reserves held</span><span>{money.format(factoringReserve)}</span>
                </Link>
                <div className="flex justify-between">
                  <span>Advances funded MTD</span>
                  <span title="No advances_funded_mtd on factoring-virtual API — open Factoring module">
                    — (see Factoring module)
                  </span>
                </div>
                <Link to="/factoring/chargebacks-fees" className="flex justify-between hover:underline">
                  {/* FACTORING-CHARGEBACK-BALANCE-IS-ACTUALLY-OUTSTANDING-LIABILITY: honest label
                      for what this figure actually is (Advance + Reserve owed to the factor). */}
                  <span>Outstanding liability</span><span className="text-red-700">{money.format(factoringOutstandingLiability)}</span>
                </Link>
                <Link to="/factoring/chargebacks-fees" className="flex justify-between hover:underline">
                  <span>+30 aging fees</span>
                  <span className="text-slate-700" title="No aging_fees_30d field on factoring-virtual — open Chargebacks & Fees">
                    — (see Chargebacks & Fees)
                  </span>
                </Link>
                <div className="pt-1 text-xs text-gray-500">
                  Last advance: {factoringVirtualSummary.lastAdvanceAt ? String(factoringVirtualSummary.lastAdvanceAt).slice(0, 10) : <NotApplicable reason="not_applicable" />}
                </div>
                {factoringTile ? <div className="text-xs text-slate-700">{factoringTile.display_name}</div> : null}
              </div>
            </div>

            <div className="rounded-sm border border-slate-300 bg-slate-100">
              <div className="border-b border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Driver escrow visualizer</div>
              <div className="space-y-1 px-3 py-2 text-xs">
                <div className="flex justify-between"><span>Total escrow held</span><span>{money.format(escrowFeed)}</span></div>
                <div className="flex justify-between">
                  <span
                    title="Count of drivers whose escrow balance is currently non-zero."
                    className="cursor-help border-b border-dotted border-slate-400"
                  >
                    Drivers with escrow:
                  </span>
                  <span>{Number(kpiQuery.data?.drivers_with_escrow_balance ?? 0)}</span>
                </div>
                <div className="flex justify-between"><span>Contributions MTD</span><span>{money.format(0)}</span></div>
                <div className="flex justify-between"><span>Deductions MTD</span><span>{money.format(0)}</span></div>
                <button type="button" onClick={() => setActiveTab("driver_escrow")} className="pt-1 text-xs text-slate-700 hover:underline">
                  Filter by name + date
                </button>
              </div>
            </div>
          </div>

          <BankingPlaidConnectionsPanel companyId={companyId} />
        </>
      ) : null}

      {activeTab === "transactions" ? (
        <div className="space-y-3">
          {uncategorizedCount > 0 ? (
            <div
              className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700"
              data-testid="banking-forreview-backlog-banner"
            >
              <p className="font-semibold">
                For-review backlog: {uncategorizedCount.toLocaleString()} transaction(s) still need Match/Categorize
              </p>
              <p className="mt-1">
                Live bank feed is not “caught up” until these are matched or categorized. Use the For review tab below —
                Match opens candidates; Categorize posts to a GL account. Do not treat a large for-review queue as
                reconciled books.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <ActionButton
                  onClick={() => {
                    setTransactionsInitialFilter("uncategorized");
                    navigate(`${BANKING_TAB_PATH.transactions}?type=uncategorized`);
                  }}
                >
                  Focus uncategorized filter
                </ActionButton>
                <Link to="/banking/categorize" className="text-xs font-medium text-slate-800 underline">
                  /banking/categorize deep link
                </Link>
              </div>
            </div>
          ) : null}
          <BankingTransactionsDesignView
            companyId={companyId}
            accounts={sortedTransactionAccounts}
            selectedAccountId={selectedAccountId}
            onSelectAccount={setSelectedAccountId}
            onReorderAccount={handleReorderAccount}
            onManageConnections={() => navigate(BANKING_TAB_PATH.plaid_connections)}
            initialTransactionType={transactionsInitialFilter}
            highlightTransactionId={deepLinkTxnId}
            onDataChanged={() => {
              void queryClient.invalidateQueries({ queryKey: ["banking"] });
            }}
          />
        </div>
      ) : null}

      {activeTab === "link_suggestions" ? <LinkSuggestionsPanel companyId={companyId} /> : null}

      {activeTab === "reconciliation" ? (
        <div className="space-y-3">
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Reconciliation</p>
              <div className="flex flex-wrap items-center gap-3">
                <Link to="/banking/reconcile" className="text-xs font-medium text-slate-700 hover:underline">
                  Open Reconcile Queue
                </Link>
                <Link to="/banking/reconciliation-workspace" className="text-xs font-medium text-slate-700 hover:underline">
                  Open Workspace
                </Link>
              </div>
            </div>
            {reconciliationSessionsQuery.isSuccess &&
            (reconciliationSessionsQuery.data?.open_sessions ?? []).length === 0 &&
            (reconciliationSessionsQuery.data?.completed_sessions ?? []).length === 0 ? (
              <div
                className="mb-3 border-l-4 border-slate-400 bg-slate-100 px-3 py-2 text-xs text-slate-700"
                data-testid="banking-recon-never-completed-banner"
              >
                <p className="font-semibold">No reconciliation sessions exist for this company yet.</p>
                <p className="mt-1">
                  Statement reconcile is not proven live until a session is started and completed. Uncategorized /
                  for-review bank transactions still need Match/Categorize on the Transactions tab (
                  {uncategorizedCount.toLocaleString()} currently flagged). Do not treat this screen as “reconciled.”
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <ActionButton onClick={openStartReconciliation}>+ Start first reconciliation</ActionButton>
                  <ActionButton
                    onClick={() => {
                      setTransactionsInitialFilter("uncategorized");
                      navigate(`${BANKING_TAB_PATH.transactions}?type=uncategorized`);
                    }}
                  >
                    Open for-review queue
                  </ActionButton>
                </div>
              </div>
            ) : null}
            <p className="text-xs text-gray-700">Open sessions: {(reconciliationSessionsQuery.data?.open_sessions ?? []).length}</p>
            <div className="mt-2 space-y-1">
              {(reconciliationSessionsQuery.data?.open_sessions ?? []).map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className="w-full rounded-sm border border-gray-100 px-2 py-1 text-left text-xs hover:bg-gray-50"
                  onClick={() => navigate(`/banking/reconciliation-workspace?session_id=${session.id}&bank_account_hint=${session.bank_account_id}`)}
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
                    className="w-full rounded-sm border border-gray-100 px-2 py-1 text-left text-xs hover:bg-gray-50"
                    onClick={() => navigate(`/banking/reconciliation-workspace?session_id=${session.id}&bank_account_hint=${session.bank_account_id}`)}
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

      {activeTab === "factoring" ? (
        <div className="space-y-3">
          {factoringVirtualQuery.isSuccess &&
          !factoringVirtualSummary.lastAdvanceAt &&
          factoringReserve === 0 &&
          factoringOutstandingLiability === 0 ? (
            <div
              className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700"
              data-testid="banking-factoring-entry-unproven-banner"
            >
              <p className="font-semibold">Factoring Banking entry has no proven Faro advance / reserve / chargeback activity yet.</p>
              <p className="mt-1">
                This tab is a thin entry into `/factoring` — zeros here are not “factoring healthy.” Use Recourse Pipeline /
                Reserve Tracker / Chargebacks for live Faro truth. Do not invent Advances funded MTD from cash posting
                KPIs.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <ActionButton onClick={() => navigate("/factoring/recourse-pipeline")}>Recourse Pipeline</ActionButton>
                <ActionButton onClick={() => navigate("/factoring/reserve-tracker")}>Reserve Tracker</ActionButton>
              </div>
            </div>
          ) : null}
          <div className="rounded-sm border border-slate-300 bg-slate-100">
            <div className="flex items-center justify-between border-b border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
              <span>Factoring (Faro) · Banking entry</span>
              <Link to="/factoring" className="text-xs font-semibold normal-case text-slate-800 hover:underline">
                Open Factoring module →
              </Link>
            </div>
            <div className="space-y-1 px-3 py-2 text-xs">
              <Link to="/factoring/reserve-tracker" className="flex justify-between hover:underline">
                <span>Reserves held</span>
                <span>{money.format(factoringReserve)}</span>
              </Link>
              <div className="flex justify-between">
                <span>Advances funded MTD</span>
                <span title="No advances_funded_mtd on factoring-virtual API — open Factoring module; never invent from cash posting">
                  — (see Factoring module)
                </span>
              </div>
              <Link to="/factoring/chargebacks-fees" className="flex justify-between hover:underline">
                {/* FACTORING-CHARGEBACK-BALANCE-IS-ACTUALLY-OUTSTANDING-LIABILITY: honest label
                    for what this figure actually is (Advance + Reserve owed to the factor). */}
                <span>Outstanding liability</span>
                <span className="text-red-700">{money.format(factoringOutstandingLiability)}</span>
              </Link>
              <Link to="/factoring/chargebacks-fees" className="flex justify-between hover:underline">
                <span>+30 aging fees</span>
                <span className="text-slate-700" title="No aging_fees_30d field on factoring-virtual — open Chargebacks & Fees">
                  — (see Chargebacks & Fees)
                </span>
              </Link>
              <div className="pt-1 text-xs text-gray-500">
                Last advance:{" "}
                {factoringVirtualSummary.lastAdvanceAt
                  ? String(factoringVirtualSummary.lastAdvanceAt).slice(0, 10)
                  : <NotApplicable reason="not_applicable" />}
              </div>
              {factoringTile ? <div className="text-xs text-slate-700">{factoringTile.display_name}</div> : null}
              <div className="flex flex-wrap gap-2 pt-2">
                <ActionButton onClick={() => navigate("/factoring/recourse-pipeline")}>Recourse Pipeline</ActionButton>
                <ActionButton onClick={() => navigate("/factoring/chargebacks-fees")}>Chargebacks & Fees</ActionButton>
                <ActionButton onClick={() => navigate("/factoring/statements-settings")}>Statements & Settings</ActionButton>
              </div>
            </div>
          </div>
          <div
            className="rounded-sm border border-slate-300 bg-white"
            data-testid="banking-factoring-faro-advances-panel"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
              <span>{deepLinkLoadId ? "Faro advances for this load" : "Recent Faro advances"}</span>
              <div className="flex flex-wrap items-center gap-2 normal-case">
                <label className="text-[11px] font-medium text-slate-600">
                  Load
                  <EntityPicker
                    kind="load"
                    operatingCompanyId={companyId}
                    value={deepLinkLoadId || null}
                    onChange={(next) => patchLoadFilter(next ?? "")}
                    allowCreate={false}
                    placeholder="All loads"
                    className="mt-1 min-w-[12rem]"
                    dataTestId="banking-factoring-filter-load"
                  />
                </label>
                <Link to="/accounting/factoring" className="text-xs font-semibold text-slate-800 hover:underline">
                  All advances →
                </Link>
              </div>
            </div>
            {factoringTimelineQuery.isSuccess ? (
              <div className="max-h-[220px] overflow-y-auto">
                {(factoringTimelineQuery.data?.timeline ?? []).length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-500">
                    No non-voided factoring advances recorded for this{" "}
                    {deepLinkLoadId ? "load" : "company"} yet.
                  </p>
                ) : (
                  (factoringTimelineQuery.data?.timeline ?? []).map((row) => {
                    const cents = Number(row.advance_amount_cents ?? 0);
                    return (
                      <div
                        key={row.id}
                        className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-gray-100 px-3 py-1.5 text-xs"
                      >
                        <span className="min-w-0 truncate">
                          <EntityLink
                            kind="factoring_advance"
                            id={row.id}
                            label={entityLabel(row.display_id, row.id, "Factoring advance")}
                            data-testid={`banking-factoring-advance-link-${row.id}`}
                          />
                          <span className="ml-2 text-[11px] uppercase text-gray-500">
                            {FACTORING_STATUS_LABEL[row.status] ?? row.status}
                          </span>
                        </span>
                        <span className="tabular-nums text-xs text-gray-800">
                          {Number.isFinite(cents) ? money.format(cents / 100) : <NotApplicable reason="no_source" />}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            ) : factoringTimelineQuery.isError ? (
              <p className="px-3 py-2 text-xs text-red-700">Could not load Faro advances timeline.</p>
            ) : (
              <p className="px-3 py-2 text-xs text-gray-500">Loading advances…</p>
            )}
          </div>
          <p className="text-xs text-gray-600">
            Design law: Banking Factoring tab is a thin entry summary that deep-links into the standalone{" "}
            <Link to="/factoring" className="underline">
              /factoring
            </Link>{" "}
            module. Accounts home still shows the Factoring virtual-bank card (additive — never removed). Recent advances
            use EntityLink → <code className="text-[11px]">/accounting/factoring/:id</code>.
          </p>
        </div>
      ) : null}

      {activeTab === "relay_card" ? (
        <div className="space-y-3" data-testid="banking-relay-tab">
          {/* BANK-SURF-05: identify wallets via is_relay_wallet / system_purpose — never .find(is_relay). */}
          {relayWalletTiles.length === 0 ? (
            <div
              className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700"
              data-testid="banking-relay-no-wallet-bound-notice"
            >
              <p className="font-semibold">No Relay fuel wallet is bound for this operating company.</p>
              <p className="mt-1">
                Identity is set by flagging a Chart of Accounts entry as the Relay fuel wallet, linked
                through the bank account tile that entry is bound to. An empty
                Relay tab here means no bank account tile carries that CoA bind for the selected company — not missing
                Plaid tags. Fuel lines may still appear on the Transactions register once ingest has rows.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <ActionButton onClick={() => navigate(`${BANKING_TAB_PATH.transactions}?type=uncategorized`)}>
                  Open for-review queue
                </ActionButton>
                <ActionButton onClick={() => navigate(BANKING_TAB_PATH.transactions)}>Open Transactions</ActionButton>
              </div>
            </div>
          ) : (
            <div className="rounded-sm border border-gray-200 bg-white p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Relay Card · Banking</p>
                <ActionButton
                  onClick={() => {
                    const first = relayWalletTiles[0];
                    if (first?.id) navigate(`/banking/accounts/${first.id}`);
                  }}
                >
                  Open wallet register
                </ActionButton>
              </div>
              <AccountTilesRow
                tiles={relayWalletTiles}
                selectedId={selectedAccountId}
                onSelect={(id) => {
                  setSelectedAccountId(id);
                  navigate(`/banking/accounts/${id}`);
                }}
                onView={(id) => navigate(`/banking/accounts/${id}`)}
                onInspect={(id) => setInspectTileId(id)}
                onManageAccounts={() => setManageOpen(true)}
              />
              <p className="mt-2 text-xs text-gray-600">
                Relay fuel-line breakdown stays on the Transactions register when a Relay wallet row is expanded.
              </p>
            </div>
          )}
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

      {activeTab === "statement_import" ? (
        <div className="space-y-3">
          <div
            className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700"
            data-testid="banking-statement-import-not-recon-proof-banner"
          >
            <p className="font-semibold">Statement Import is an input path — not reconciliation proof.</p>
            <p className="mt-1">
              Uploading CSV does not close a period or clear for-review. After import, Match/Categorize on Transactions
              and run Reconciliation sessions. PDF parser remains Phase 6 (honest deferral).
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionButton onClick={() => navigate(`${BANKING_TAB_PATH.transactions}?type=uncategorized`)}>
                Open for-review queue
              </ActionButton>
              <ActionButton onClick={() => navigate(BANKING_TAB_PATH.reconciliation)}>Open Reconciliation</ActionButton>
            </div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Bank Statement Import</p>
            <p className="mb-3 text-xs text-gray-700">
              CSV import for non-feed banks (PDF parser remains Phase 6). Select a bank account, then upload. The same
              uploader remains available inside Reconciliation (additive — not removed).
            </p>
            <label className="mb-2 block text-xs font-semibold text-gray-600">
              Bank account
              <select
                className="mt-1 w-full max-w-md rounded-sm border border-gray-300 px-2 py-1.5 text-xs"
                value={selectedId ?? ""}
                onChange={(e) => setSelectedAccountId(e.target.value || null)}
              >
                <option value="">Select account…</option>
                {bankAccountsPanelRows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.displayName}
                  </option>
                ))}
              </select>
            </label>
            {selectedId ? (
              <StatementUpload
                bankAccountId={selectedId}
                onUploaded={() => {
                  void queryClient.invalidateQueries({ queryKey: ["banking"] });
                }}
              />
            ) : (
              <p className="text-xs text-gray-500">Select a bank account to enable CSV upload.</p>
            )}
            <div className="mt-3">
              <ActionButton onClick={() => navigate(BANKING_TAB_PATH.reconciliation)}>Open Reconciliation</ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "plaid_connections" ? (
        <div className="space-y-3" data-testid="banking-plaid-connections-tab">
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Plaid Connections</p>
            <p className="mb-3 text-xs text-gray-700">
              Live bank feed config — connect, reconnect, and inspect items. Same panel remains on Accounts and Settings
              (additive; never removed).
            </p>
            <div className="flex flex-wrap gap-2">
              <ActionButton onClick={() => navigate(BANKING_TAB_PATH.settings)}>Open Banking Settings</ActionButton>
              <ActionButton onClick={() => navigate("/banking/cash-gl-setup")}>Cash GL setup</ActionButton>
            </div>
          </div>
          <BankingPlaidConnectionsPanel companyId={companyId} />
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <div className="space-y-3">
          <div
            className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700"
            data-testid="banking-settings-not-ops-complete-banner"
          >
            <p className="font-semibold">Settings links configure Banking — they do not complete Match/Categorize or reconcile.</p>
            <p className="mt-1">
              Cash GL, rules, queues, and Plaid config are prerequisites. Live feed clearance still happens on Transactions
              → For review and Reconciliation sessions.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionButton onClick={() => navigate(`${BANKING_TAB_PATH.transactions}?type=uncategorized`)}>
                Open for-review queue
              </ActionButton>
              <ActionButton onClick={() => navigate(BANKING_TAB_PATH.plaid_connections)}>Plaid Connections</ActionButton>
            </div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Banking Settings</p>
            <p className="mb-3 text-xs text-gray-700">
              Account map, Cash GL, categorization rules, queues, and visibility — Owner/Administrator surfaces stay
              role-gated on their pages.
            </p>
            <div className="flex flex-wrap gap-2">
              <ActionButton onClick={() => navigate("/banking/cash-gl-setup")}>Cash GL setup</ActionButton>
              <ActionButton onClick={() => navigate("/banking/categorization-rules")}>Categorization rules</ActionButton>
              <ActionButton onClick={() => navigate("/banking/account-visibility")}>Account Visibility</ActionButton>
              {canSeeEmailQueue ? (
                <ActionButton onClick={() => navigate("/banking/email-queue")}>Email Queue</ActionButton>
              ) : null}
              <ActionButton onClick={() => navigate("/banking/qbo-sync-queue")}>QBO Sync Queue</ActionButton>
            </div>
          </div>
          <BankingPlaidConnectionsPanel companyId={companyId} />
        </div>
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
      <RecordTransferModal
        open={recordDepositOpen}
        operatingCompanyId={companyId}
        defaultTransferType="cash_deposit"
        onClose={() => setRecordDepositOpen(false)}
        onSaved={() => {
          setRecordDepositOpen(false);
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
          <div className="w-full max-w-lg rounded-sm bg-white p-4 shadow-lg">
            <h3 className="text-xs font-semibold text-gray-900">Start reconciliation</h3>
            <div className="mt-3 grid grid-cols-1 gap-3">
              <SelectCombobox
                value={reconAccountId}
                onChange={(event) => setReconAccountId(event.target.value)}
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="">Select bank account</option>
                {(plaidAccountsQuery.data?.accounts ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.institution_name || "Bank"} - {account.account_name || "Account"} {account.account_mask ? `••••${account.account_mask}` : ""}
                  </option>
                ))}
              </SelectCombobox>
              <DatePicker
                value={reconPeriodStart}
                onChange={(next) => setReconPeriodStart(next)}
                className=""
              />
              <DatePicker
                value={reconPeriodEnd}
                onChange={(next) => setReconPeriodEnd(next)}
                className=""
              />
              {/* M-1: dollars-mode QBO money entry; bridged so Math.round(*100) seam is byte-for-byte. */}
              <MoneyInput
                valueDollars={reconStatementBalance ? Number(reconStatementBalance) : null}
                onChangeDollars={(d) => setReconStatementBalance(d == null ? "" : String(d))}
                ariaLabel="Statement balance (USD)"
                placeholder="Statement balance (USD)"
                className="text-xs"
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
                      navigate(`/banking/reconciliation-workspace?session_id=${res.session_id}&bank_account_hint=${reconAccountId}`);
                    })
                    .catch((error) => pushToast(userFacingApiError(error, "Failed to start reconciliation"), "error"))
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
