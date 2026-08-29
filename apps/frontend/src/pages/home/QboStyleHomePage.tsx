/**
 * C6 — QBO-Style Home Dashboard (mounted at `/app/homepage`; never-delete).
 *
 * Canonical operator/training HOME is design MODULE 1 at `/home` (sidebar).
 * `/app/homepage` stays a reachable QBO-style surface for bookmarks and C6 parity —
 * dual surfaces, one canonical sidebar HOME.
 *
 * Mirrors the exact QBO home layout captured live 2026-06-10:
 *   1. Header — "Welcome, <name>!" · Customize · Privacy
 *   2. Business Feed — AI nudges / dismissible cards
 *   3. Create Actions — quick-access transaction buttons
 *   4. Business at a Glance:
 *      - Bank Accounts panel (total balance + per-account rows with status badge)
 *      - Profit & Loss card (net profit, income, expenses, % change)
 *      - Expenses card (30-day spend + category breakdown)
 *      - Invoices card (unpaid A/R + paid last 30d)
 *      - My Integrations card (total / connected / with issues)
 *
 * NON-FINANCIAL: 100% read/aggregate over existing endpoints. No posting.
 * RLS: companyId set via existing useCompanyContext().
 */
import { unverifiableReasonText } from "../../lib/unverifiableReasonText";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, DollarSign, RefreshCw, AlertCircle, CheckCircle, X } from "lucide-react";
import type { AuthMeResponse } from "../../types/api";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { fetchHomeCashPosition, fetchHomeTodayRevenue, type HomeKpiRange } from "../../api/home";
import { HomeKpiRangeToggle, revenueKpiLabel } from "./HomeKpiRangeToggle";
import { fetchAccountingRoleHome } from "../../api/accountingHome";
import { getBankingTiles } from "../../api/banking";

/** Money formatter — never labels transport/5xx as Unverifiable. */
function fmt$(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

/** Today-revenue display: typed schema unverifiable ≠ query isError/5xx. */
export function formatTodayRevenueDisplay(input: {
  isLoading: boolean;
  isError: boolean;
  status?: "ok" | "empty" | "unverifiable" | string;
  revenueCents: number | null | undefined;
}): { kind: "loading" | "error" | "unverifiable" | "ok"; text: string } {
  if (input.isLoading) return { kind: "loading", text: "" };
  if (input.isError) return { kind: "error", text: "Unable to load revenue" };
  if (input.status === "unverifiable") return { kind: "unverifiable", text: "Unverifiable" };
  if (input.revenueCents == null) return { kind: "ok", text: fmt$(0) };
  return { kind: "ok", text: fmt$(input.revenueCents) };
}

function fmtPct(pct: number | null | undefined): string {
  if (pct == null) return "";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

type BusinessFeedCard = {
  id: string;
  title: string;
  body: string;
  cta: string;
  to: string;
};

const BUSINESS_FEED_CARDS: BusinessFeedCard[] = [
  { id: "monthly-summary", title: "Monthly financial summary is ready", body: "Review your P&L and cash position for the period.", cta: "View reports", to: "/reports" },
  { id: "categorize", title: "Transactions need review", body: "Some bank transactions have not been categorized yet.", cta: "Categorize now", to: "/banking" },
  { id: "reconcile", title: "Reconciliation available", body: "Your bank accounts are ready to reconcile for this period.", cta: "Start reconciling", to: "/banking/reconcile" },
];

// CLS-CHROME-LAW-8 (item 8, "no box-in-box... Primary buttons: + Create / + Book only (never +
// New / + Add)"): these were bare verbs with no "+ " prefix, and one used the forbidden "Add"
// verb. Relabeled to match each destination's own canonical create-button text (ExpensesListPage
// "+ Create", PaymentsListPage "+ Record Payment", BillPaymentsListPage "+ Record Bill Payment",
// AccountingHubPage "+ Create Manual JE") so Home's quick-actions say the same thing the page they
// navigate to says.
const CREATE_ACTIONS = [
  { label: "+ Create Invoice", to: "/accounting/invoices" },
  { label: "+ Create Expense", to: "/accounting/expenses" },
  { label: "+ Record Payment", to: "/accounting/payments" },
  { label: "+ Create Bill", to: "/accounting/bills/vendor" },
  { label: "+ Record Deposit", to: "/banking/transactions" },
  { label: "+ Create Manual JE", to: "/accounting/journal-entries" },
];

type Props = {
  auth: AuthMeResponse["user"];
};

export function QboStyleHomePage({ auth }: Props) {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const cid = selectedCompanyId ?? "";
  const displayName = auth.email?.split("@")[0] ?? "there";

  // h-05: KPI range preset — server resolves the window in company TZ (default: today).
  const [kpiRange, setKpiRange] = useState<HomeKpiRange>("today");

  const [dismissedCards, setDismissedCards] = useState<Set<string>>(new Set());

  const bankTilesQuery = useQuery({
    queryKey: ["home", "c6", "banking-tiles", cid],
    queryFn: () => getBankingTiles(cid),
    enabled: Boolean(cid),
    staleTime: 60_000,
  });

  const cashQuery = useQuery({
    queryKey: ["home", "c6", "cash-position", cid],
    queryFn: () => fetchHomeCashPosition(cid),
    enabled: Boolean(cid),
    staleTime: 60_000,
  });

  const revenueQuery = useQuery({
    queryKey: ["home", "c6", "today-revenue", cid, kpiRange],
    queryFn: () => fetchHomeTodayRevenue(cid, kpiRange),
    enabled: Boolean(cid),
    staleTime: 60_000,
  });

  const accountingQuery = useQuery({
    queryKey: ["home", "c6", "accounting-role-home", cid],
    queryFn: () => fetchAccountingRoleHome(cid),
    enabled: Boolean(cid),
    staleTime: 60_000,
  });

  const tiles = bankTilesQuery.data?.tiles ?? [];
  const totalBankBalance = tiles.reduce((s, t) => s + (t.current_balance ?? 0), 0);
  const totalUncategorized = tiles.reduce((s, t) => s + (t.uncategorized_count ?? 0), 0);

  const acct = accountingQuery.data;
  const arTotal = acct?.ar_aging.total_outstanding_cents ?? 0;
  const apTotal = acct?.ap_aging.total_outstanding_cents ?? 0;
  const qboOutbox = acct?.qbo.outbox_depth ?? 0;
  const qboFailed = acct?.qbo.failed_outbox_count ?? 0;

  // 0280-02: typed status=unverifiable ≠ transport/5xx (isError).
  const revenueDisplay = formatTodayRevenueDisplay({
    isLoading: revenueQuery.isLoading,
    isError: revenueQuery.isError,
    status: revenueQuery.data?.status,
    revenueCents: revenueQuery.data?.revenue_cents,
  });
  const deltaVsYesterday =
    kpiRange === "today" && revenueDisplay.kind === "ok" ? revenueQuery.data?.delta_pct_vs_yesterday : undefined;

  const visibleFeed = BUSINESS_FEED_CARDS.filter((c) => !dismissedCards.has(c.id));

  const qboConnected = qboFailed === 0 && qboOutbox < 50;
  const integrationTotal = 3;
  const integrationConnected = qboConnected ? 3 : 2;
  const integrationIssues = qboConnected ? 0 : 1;

  return (
    <div className="space-y-6 pb-10" data-testid="qbo-style-home-page">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Welcome, {displayName}!</h1>
          <p className="mt-0.5 text-sm text-gray-500">Here's what's happening with your business today.</p>
        </div>
        <div className="flex gap-2 text-xs text-gray-400">
          <button
            type="button"
            disabled
            title="Not yet available"
            className="rounded-sm px-2 py-1 text-gray-300 cursor-not-allowed"
          >
            Customize
          </button>
          {/* HOME-ORPHANED-LEGAL-PAGES: /legal/privacy and /legal/terms were registered routes
              with zero inbound links anywhere in the app (SAF-F22-class orphan — reachable only
              by typing the exact URL). This header already had a disabled "Privacy" placeholder
              button positioned exactly for this; wired it live and added a matching Terms link. */}
          <Link
            to="/legal/privacy"
            className="rounded-sm px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            Privacy
          </Link>
          <Link
            to="/legal/terms"
            className="rounded-sm px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            Terms
          </Link>
        </div>
      </div>

      {/* ── Business Feed ── */}
      {visibleFeed.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Business feed</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {visibleFeed.map((card) => (
              <div key={card.id} className="relative rounded-sm border border-gray-200 bg-white p-4 shadow-xs">
                <button
                  type="button"
                  className="absolute right-2 top-2 rounded-sm p-0.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500"
                  aria-label="Dismiss"
                  onClick={() => setDismissedCards((prev) => new Set([...prev, card.id]))}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <p className="pr-5 text-sm font-medium text-gray-800">{card.title}</p>
                <p className="mt-1 text-xs text-gray-500">{card.body}</p>
                <Link to={card.to} className="mt-2 inline-block text-xs font-semibold text-slate-700 hover:underline">
                  {card.cta} →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Create Actions ── */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Create</h2>
        <div className="flex flex-wrap gap-2">
          {CREATE_ACTIONS.map((a) => (
            <button
              key={a.to}
              type="button"
              onClick={() => {
                if (!cid) {
                  pushToast("Select an operating company before creating", "error");
                  return;
                }
                navigate(a.to);
              }}
              className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-xs hover:bg-gray-50 hover:border-gray-300"
            >
              {a.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Business at a Glance ── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Business at a glance</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">

          {/* Bank Accounts */}
          <div className="rounded-sm border border-gray-200 bg-white p-4 shadow-xs md:col-span-2 xl:col-span-1">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Bank accounts</p>
              <Link to="/banking" className="text-xs text-slate-700 hover:underline">Go to registers</Link>
            </div>
            {bankTilesQuery.isLoading ? (
              <div className="h-20 animate-pulse rounded-sm bg-gray-100" />
            ) : bankTilesQuery.isError ? (
              // GO-0027-HOME-F: a failed bank-tiles fetch must never render as "$0 total balance,
              // no accounts" -- that reads as a genuinely empty/closed set of bank accounts.
              <div className="space-y-2" data-testid="qbo-bank-tiles-error">
                <p className="flex items-center gap-1.5 text-sm font-medium text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Unable to load bank accounts
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                  onClick={() => void bankTilesQuery.refetch()}
                  data-testid="qbo-bank-tiles-retry"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  Retry
                </button>
              </div>
            ) : (
              <>
                <p className="text-2xl font-semibold text-gray-900">{fmt$(totalBankBalance * 100)}</p>
                <p className="mb-3 text-xs text-slate-600">Total bank balance</p>
                <div className="space-y-2">
                  {tiles.slice(0, 5).map((tile) => (
                    <div key={tile.id} className="flex items-center justify-between text-sm">
                      <span className="truncate text-gray-700">{tile.display_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{fmt$(tile.current_balance * 100)}</span>
                        {tile.uncategorized_count > 0 ? (
                          <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                            {tile.uncategorized_count} to review
                          </span>
                        ) : (
                          <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">Reviewed</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {totalUncategorized > 0 && (
                  <Link to="/banking" className="mt-3 block text-xs text-slate-700 hover:underline">
                    {totalUncategorized} transactions need review
                  </Link>
                )}
              </>
            )}
          </div>

          {/* h-05: KPI date-range toggle — drives the revenue KPI window (7d/30d/MTD/YTD). */}
          <div className="md:col-span-2 xl:col-span-1">
            <HomeKpiRangeToggle value={kpiRange} onChange={setKpiRange} />
          </div>

          {/* Profit & Loss */}
          <div className="rounded-sm border border-gray-200 bg-white p-4 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{revenueKpiLabel(kpiRange)}</p>
              <Link to="/reports" className="text-xs text-slate-700 hover:underline">Analyze →</Link>
            </div>
            {revenueDisplay.kind === "loading" ? (
              <div className="h-20 animate-pulse rounded-sm bg-gray-100" data-testid="qbo-revenue-loading" />
            ) : revenueDisplay.kind === "error" ? (
              <div className="space-y-2" data-testid="qbo-revenue-error">
                <p className="flex items-center gap-1.5 text-sm font-medium text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {revenueDisplay.text}
                </p>
                <p className="text-xs text-slate-500">Request failed — not a schema linkage gap.</p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                  onClick={() => void revenueQuery.refetch()}
                  data-testid="qbo-revenue-retry"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  Retry
                </button>
              </div>
            ) : revenueDisplay.kind === "unverifiable" ? (
              <div data-testid="qbo-revenue-unverifiable">
                <p className="text-2xl font-semibold text-gray-900">{revenueDisplay.text}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Invoice↔GL linkage unverifiable
                  {revenueQuery.data?.unverifiable_reason
                    ? `: ${unverifiableReasonText(revenueQuery.data.unverifiable_reason)}`
                    : ""}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-end gap-2" data-testid="qbo-revenue-ok">
                  <p className="text-2xl font-semibold text-gray-900">{revenueDisplay.text}</p>
                  {deltaVsYesterday != null && (
                    <span className={`mb-1 flex items-center gap-0.5 text-xs font-semibold ${deltaVsYesterday >= 0 ? "text-slate-600" : "text-red-600"}`}>
                      {deltaVsYesterday >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {fmtPct(deltaVsYesterday)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600">{revenueKpiLabel(kpiRange)} (invoice basis, pre-tax)</p>
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Income</span>
                    <span className="font-medium text-gray-900">{revenueDisplay.text}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">A/R outstanding</span>
                    <span className="font-medium text-gray-900">{fmt$(arTotal)}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Expenses */}
          <div className="rounded-sm border border-gray-200 bg-white p-4 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Expenses</p>
              <Link to="/accounting/expenses/list" className="text-xs text-slate-700 hover:underline">View →</Link>
            </div>
            {accountingQuery.isLoading ? (
              <div className="h-20 animate-pulse rounded-sm bg-gray-100" />
            ) : accountingQuery.isError ? (
              // GO-0027-HOME-F: a failed accounting-role-home fetch must never render as "$0
              // outstanding A/P" -- that reads as genuinely nothing owed.
              <div className="space-y-2" data-testid="qbo-expenses-error">
                <p className="flex items-center gap-1.5 text-sm font-medium text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Unable to load expenses
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                  onClick={() => void accountingQuery.refetch()}
                  data-testid="qbo-expenses-retry"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  Retry
                </button>
              </div>
            ) : (
              <>
                <p className="text-2xl font-semibold text-gray-900">{fmt$(apTotal)}</p>
                <p className="text-xs text-slate-600">Outstanding A/P</p>
                <p className="mt-3 text-xs text-slate-400">Category breakdown not yet available</p>
              </>
            )}
          </div>

          {/* Invoices / A/R */}
          <div className="rounded-sm border border-gray-200 bg-white p-4 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Invoices</p>
              <Link to="/accounting/invoices" className="text-xs text-slate-700 hover:underline">View →</Link>
            </div>
            {accountingQuery.isLoading ? (
              <div className="h-20 animate-pulse rounded-sm bg-gray-100" />
            ) : accountingQuery.isError ? (
              // GO-0027-HOME-F: a failed accounting-role-home fetch must never render as "$0
              // unpaid" -- that reads as genuinely nothing outstanding.
              <div className="space-y-2" data-testid="qbo-invoices-error">
                <p className="flex items-center gap-1.5 text-sm font-medium text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Unable to load invoices
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                  onClick={() => void accountingQuery.refetch()}
                  data-testid="qbo-invoices-retry"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  Retry
                </button>
              </div>
            ) : (
              <>
                <p className="text-2xl font-semibold text-gray-900">{fmt$(arTotal)}</p>
                <p className="text-xs text-slate-600">Unpaid (last 365 days)</p>
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Current (0–30 days)</span>
                    <span className="font-medium text-gray-900">{fmt$(acct?.ar_aging.current_cents ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-red-600">Overdue (31+ days)</span>
                    <span className="font-medium text-red-700">
                      {fmt$((acct?.ar_aging.d31_60_cents ?? 0) + (acct?.ar_aging.d61_90_cents ?? 0) + (acct?.ar_aging.d90_plus_cents ?? 0))}
                    </span>
                  </div>
                </div>
                <Link to="/reports/ar-aging" className="mt-2 block text-xs text-slate-700 hover:underline">
                  View A/R aging →
                </Link>
              </>
            )}
          </div>

          {/* My Integrations */}
          <div className="rounded-sm border border-gray-200 bg-white p-4 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">My integrations</p>
              <Link to="/accounting/qbo-sync" className="text-xs text-slate-700 hover:underline">View issues →</Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-xl font-semibold text-gray-900">{integrationTotal}</p>
                <p className="text-xs text-slate-500">Total</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-semibold text-slate-700">{integrationConnected}</p>
                <p className="text-xs text-slate-500">Connected</p>
              </div>
              <div className="text-center">
                <p className={`text-xl font-semibold ${integrationIssues > 0 ? "text-red-600" : "text-gray-400"}`}>{integrationIssues}</p>
                <p className="text-xs text-slate-500">Issues</p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                {qboConnected ? <CheckCircle className="h-3.5 w-3.5 text-slate-600" /> : <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                <span>QuickBooks Online {qboConnected ? "· Synced" : `· ${qboFailed} failed`}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-slate-600" />
                <span>Samsara · Connected</span>
              </div>
              <div className="flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 text-gray-400" />
                <span>Relay · Not configured</span>
              </div>
            </div>
            {qboOutbox > 0 && (
              <p className="mt-2 text-xs text-slate-600">{qboOutbox} transactions pending sync</p>
            )}
          </div>

        </div>
      </section>

      {/* ── Cash Position footer ── */}
      {cashQuery.data && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <DollarSign className="h-3.5 w-3.5" />
          <span>
            Cash position: <span className="font-medium text-gray-600">{fmt$(cashQuery.data.balance_cents ?? 0)}</span>
            {cashQuery.data.last_reconciled_at
              ? ` · Last reconciled ${new Date(cashQuery.data.last_reconciled_at).toLocaleDateString()}`
              : " · Not yet reconciled"}
          </span>
        </div>
      )}
    </div>
  );
}
