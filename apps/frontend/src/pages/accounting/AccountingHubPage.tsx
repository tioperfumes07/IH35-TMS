import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  listBills,
  listBillPayments,
  listInvoices,
  listPayments,
  type VendorBill,
} from "../../api/accounting";
import { getQboSyncQueue, getQboSyncQueueStats } from "../../api/banking";
import { listSettlements } from "../../api/driverFinance";
import { getTrialBalanceReport } from "../../api/reports";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

type AmountRow = { key: string; left: string; right: string; muted?: string };
type TabId =
  | "home"
  | "bills"
  | "expenses"
  | "bill-payment"
  | "invoices"
  | "receive-payment"
  | "settlements"
  | "find-transactions"
  | "unmatched-needs-review"
  | "factoring"
  | "journal-entries"
  | "reports";

const TABS: Array<{ id: TabId; label: string; to?: string }> = [
  { id: "home", label: "Home" },
  { id: "bills", label: "Bills", to: "/accounting/bills" },
  { id: "expenses", label: "Expenses", to: "/accounting/expenses" },
  { id: "bill-payment", label: "Bill Payment", to: "/accounting/bill-payments" },
  { id: "invoices", label: "Invoices", to: "/accounting/invoices" },
  { id: "receive-payment", label: "Receive Payment", to: "/accounting/payments" },
  { id: "settlements", label: "Settlements", to: "/driver-finance/settlements" },
  { id: "find-transactions", label: "Find Transactions" },
  { id: "unmatched-needs-review", label: "Unmatched / Needs Review", to: "/banking/qbo-sync-queue" },
  { id: "factoring", label: "Factoring", to: "/accounting/factoring" },
  { id: "journal-entries", label: "Journal Entries", to: "/accounting/journal-entries" },
  { id: "reports", label: "Reports", to: "/reports" },
];

const CREATE_MENU: Array<{ label: string; to: string }> = [
  { label: "Bill", to: "/accounting/bills/vendor" },
  { label: "Expense", to: "/accounting/expenses" },
  { label: "Invoice", to: "/accounting/invoices" },
  { label: "Receive payment", to: "/accounting/payments" },
  { label: "Journal entry", to: "/accounting/journal-entries" },
];

function monthStartIso(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return d.toISOString().slice(0, 10);
}

function currentQuarterRange(date = new Date()) {
  const q = Math.floor(date.getUTCMonth() / 3);
  const startMonth = q * 3;
  const start = new Date(Date.UTC(date.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), startMonth + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function isIsoOnOrAfter(left: string | null | undefined, right: string) {
  if (!left) return false;
  return left >= right;
}

function sumCents(rows: Array<{ amount_cents?: number | null }>) {
  return rows.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);
}

function amountOrBalanceCents(row: VendorBill) {
  const balance = row.balance_cents;
  if (balance != null) return Number(balance);
  return Number(row.amount_cents) - Number(row.paid_cents ?? 0);
}

function relativeRetry(nextAttemptAt: string | null | undefined) {
  if (!nextAttemptAt) return "—";
  const deltaMs = new Date(nextAttemptAt).getTime() - Date.now();
  const minutes = Math.max(1, Math.round(Math.abs(deltaMs) / 60000));
  return `retry ${minutes}m`;
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function kpiCard(label: string, value: string, sublabel: string, tone: "neutral" | "warn" | "danger" = "neutral") {
  const toneClass =
    tone === "danger"
      ? "border-l-4 border-l-red-500"
      : tone === "warn"
        ? "border-l-4 border-l-amber-500"
        : "border-l-4 border-l-slate-300";
  return (
    <div className={`rounded border border-gray-200 bg-white px-3 py-2 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{sublabel}</p>
    </div>
  );
}

function homePanel(title: string, rows: AmountRow[], empty: string, actionHref?: string, actionLabel?: string) {
  return (
    <section className="rounded border border-gray-200 bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-3 py-1.5">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-700">{title}</h3>
        {actionHref && actionLabel ? (
          <Link to={actionHref} className="text-xs font-semibold text-sky-700 hover:underline">
            {actionLabel}
          </Link>
        ) : null}
      </header>
      {rows.length ? (
        <ul>
          {rows.map((row) => (
            <li key={row.key} className="flex items-start justify-between border-b border-gray-100 px-3 py-1.5 text-sm last:border-b-0">
              <span className="truncate text-gray-800">{row.left}</span>
              <span className="text-right">
                <span className={`tabular-nums ${row.muted ? "text-gray-500" : "text-gray-900"}`}>{row.right}</span>
                {row.muted ? <span className="ml-2 text-xs text-gray-500">{row.muted}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-4 text-sm text-gray-500">{empty}</p>
      )}
    </section>
  );
}

export function AccountingHubPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement | null>(null);
  const mtdStart = monthStartIso();
  const quarterRange = useMemo(() => currentQuarterRange(), []);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!createMenuRef.current) return;
      if (!createMenuRef.current.contains(event.target as Node)) {
        setCreateMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const [billsQ, billPaymentsQ, paymentsQ, settlementsQ, invoicesQ, qboStatsQ, qboQueueQ, trialBalanceQ] = useQueries({
    queries: [
      {
        queryKey: ["accounting-proto", "bills", companyId],
        queryFn: () => listBills(companyId, { include_balance: true, limit: 500 }),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-proto", "bill-payments", companyId],
        queryFn: () => listBillPayments(companyId, { limit: 500 }),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-proto", "payments", companyId],
        queryFn: () => listPayments(companyId, { limit: 500 }),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-proto", "settlements", companyId],
        queryFn: () => listSettlements(companyId),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-proto", "invoices", companyId],
        queryFn: () => listInvoices(companyId),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-proto", "qbo-sync-stats", companyId],
        queryFn: () => getQboSyncQueueStats(companyId),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-proto", "qbo-sync-queue", companyId],
        queryFn: () => getQboSyncQueue(companyId, { limit: 50 }),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-hub", "trial-balance", companyId, quarterRange.start, quarterRange.end],
        queryFn: () =>
          getTrialBalanceReport({
            operating_company_id: companyId,
            from_date: quarterRange.start,
            to_date: quarterRange.end,
            basis: "accrual",
          }),
        enabled: Boolean(companyId),
        retry: false,
      },
    ],
  });

  const bills = billsQ.data?.rows ?? [];
  const billPayments = billPaymentsQ.data?.rows ?? [];
  const receivePayments = paymentsQ.data?.rows ?? [];
  const settlements = settlementsQ.data?.settlements ?? [];
  const invoices = invoicesQ.data?.invoices ?? [];
  const qboItems = qboQueueQ.data?.items ?? [];

  const openBills = useMemo(
    () =>
      bills
        .filter((bill) => (bill.status === "open" || bill.status === "partial") && amountOrBalanceCents(bill) > 0)
        .sort((a, b) => amountOrBalanceCents(b) - amountOrBalanceCents(a)),
    [bills]
  );

  const billsMtd = useMemo(() => bills.filter((bill) => isIsoOnOrAfter(bill.bill_date, mtdStart)), [bills, mtdStart]);
  const billPaymentsMtd = useMemo(
    () => billPayments.filter((p) => !p.revoked_at && isIsoOnOrAfter(p.payment_date, mtdStart)),
    [billPayments, mtdStart]
  );

  const avgDsoDays = useMemo(() => {
    const paidDurations = invoices.flatMap((invoice) => {
      if (Number(invoice.amount_open_cents ?? 0) > 0) return [];
      const paidDates = (invoice.payment_applications ?? [])
        .map((app) => app.payment_date)
        .filter((date): date is string => typeof date === "string");
      if (!paidDates.length) return [];
      const latestPayment = paidDates.reduce((max, date) => (date > max ? date : max), paidDates[0]);
      const start = new Date(invoice.issue_date).getTime();
      const end = new Date(latestPayment).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
      return [(end - start) / 86400000];
    });
    return average(paidDurations);
  }, [invoices]);

  const openBillsAmountCents = openBills.reduce((sum, bill) => sum + amountOrBalanceCents(bill), 0);
  const expensesMtdCents = billsMtd.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);
  const billsPaidMtdCents = sumCents(billPaymentsMtd);
  const openInvoices = invoices.filter((invoice) => Number(invoice.amount_open_cents ?? 0) > 0);
  const openInvoicesCents = openInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_open_cents ?? 0), 0);
  const overdueInvoices = openInvoices.filter((invoice) => invoice.due_date < new Date().toISOString().slice(0, 10));
  const overdueInvoiceCents = overdueInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_open_cents ?? 0), 0);
  const unmatchedItems = qboItems.filter((item) => item.sync_status === "failed" || item.sync_status === "blocked");
  const qboPending = Number(qboStatsQ.data?.pending ?? 0);
  const qboFailed = Number(qboStatsQ.data?.failed ?? 0);

  const settlementsRows: AmountRow[] = settlements
    .slice(0, 5)
    .map((row) => ({
      key: row.id,
      left: row.driver_full_name || row.driver_display_id || "Settlement",
      right: money.format(Number(row.net_pay ?? 0) / 100),
      muted: row.status,
    }));

  const findTransactionsRows: AmountRow[] = useMemo(() => {
    const items: Array<{ key: string; label: string; date: string; amountCents: number; type: string }> = [];
    for (const row of billPayments.slice(0, 12)) {
      items.push({
        key: `bp-${row.id}`,
        label: row.reference_number || row.check_number || row.memo || "Bill payment",
        date: row.payment_date,
        amountCents: Number(row.amount_cents ?? 0),
        type: "Bill payment",
      });
    }
    for (const row of receivePayments.slice(0, 12)) {
      items.push({
        key: `rp-${row.id}`,
        label: row.display_id || row.customer_name || "Receive payment",
        date: row.payment_date,
        amountCents: Number(row.amount_cents ?? 0),
        type: "Receive payment",
      });
    }
    return items
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5)
      .map((item) => ({
        key: item.key,
        left: item.label,
        right: money.format(item.amountCents / 100),
        muted: item.type,
      }));
  }, [billPayments, receivePayments]);

  const unmatchedRows: AmountRow[] = unmatchedItems.slice(0, 5).map((item) => ({
    key: item.id,
    left: `${item.entity_type} · ${item.entity_id}`,
    right: item.sync_status,
    muted: relativeRetry(item.next_attempt_at),
  }));

  const trialBalanceRows: AmountRow[] = useMemo(() => {
    if (trialBalanceQ.isError) {
      return [
        {
          key: "tb-stub",
          left: "Ledger snapshot",
          right: "Contract stub",
          muted: "endpoint pending",
        },
      ];
    }
    if (trialBalanceQ.isLoading || !trialBalanceQ.data) {
      return [{ key: "tb-loading", left: "Ledger snapshot", right: "Loading…" }];
    }
    const { summary, rows } = trialBalanceQ.data;
    return [
      {
        key: "tb-debits",
        left: "Grand debits",
        right: money.format(summary.grand_total_debits / 100),
      },
      {
        key: "tb-credits",
        left: "Grand credits",
        right: money.format(summary.grand_total_credits / 100),
      },
      {
        key: "tb-balanced",
        left: "Balance check",
        right: summary.balanced ? "Balanced" : "Out of balance",
        muted: `${rows.length} accounts`,
      },
    ];
  }, [trialBalanceQ.data, trialBalanceQ.isError, trialBalanceQ.isLoading]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounting"
        subtitle="Bills, expenses, invoices, settlements & transaction review"
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/vendors"
              className="rounded border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              + Vendor
            </Link>
            <div ref={createMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setCreateMenuOpen((v) => !v)}
                className="rounded border border-emerald-700 bg-emerald-700 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                + Create ▾
              </button>
              {createMenuOpen ? (
                <div className="absolute right-0 z-20 mt-1 min-w-[180px] rounded border border-gray-200 bg-white shadow-md">
                  {CREATE_MENU.map((item) => (
                    <Link
                      key={item.label}
                      to={item.to}
                      onClick={() => setCreateMenuOpen(false)}
                      className="block border-b border-gray-100 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 last:border-b-0"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        }
      />
      {!companyId ? <p className="text-sm text-amber-800">Select an operating company.</p> : null}

      <div className="overflow-x-auto rounded border border-gray-200 bg-white px-2 py-1">
        <div className="flex min-w-max gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded px-3 py-1 text-sm ${activeTab === tab.id ? "bg-gray-100 font-semibold text-gray-900" : "text-gray-700 hover:bg-gray-50"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        {kpiCard("Open Bills", money.format(openBillsAmountCents / 100), `${openBills.length} open`, openBills.length ? "danger" : "neutral")}
        {kpiCard("MTD Expenses", money.format(expensesMtdCents / 100), `${billsMtd.length} bills`, "warn")}
        {kpiCard("Open Invoices", money.format(openInvoicesCents / 100), `${openInvoices.length} open`)}
        {kpiCard("Overdue A/R", money.format(overdueInvoiceCents / 100), `${overdueInvoices.length} overdue`, overdueInvoices.length ? "danger" : "neutral")}
        {kpiCard("Unmatched", String(unmatchedItems.length), "failed / blocked queue")}
        {kpiCard("QBO Sync", `${qboPending} pending`, qboFailed ? `${qboFailed} failed` : "queue healthy", qboFailed ? "danger" : qboPending ? "warn" : "neutral")}
      </div>

      {activeTab === "home" ? (
        <div className="grid gap-2 lg:grid-cols-3">
          {homePanel("Settlements", settlementsRows, settlementsQ.isLoading ? "Loading…" : "No settlements found.", "/driver-finance/settlements", "View all")}
          {homePanel(
            "Find Transactions",
            findTransactionsRows,
            billPaymentsQ.isLoading || paymentsQ.isLoading ? "Loading…" : "No transactions found.",
            "/accounting/payments",
            "Open payments"
          )}
          {homePanel(
            "Unmatched / Needs Review",
            unmatchedRows,
            qboQueueQ.isLoading ? "Loading…" : "No unmatched queue items.",
            "/banking/qbo-sync-queue",
            "Open queue"
          )}
          {homePanel(
            "Bill form (Block 05 foundation)",
            [
              { key: "billform-layout", left: "12x6 + cost breakdown", right: "UI ready", muted: "locked layout" },
              { key: "billform-lines", left: "Line persistence", right: "Contract stub", muted: "until multi-line API" },
            ],
            "Vendor bill create uses the locked bill form shell.",
            "/accounting/bills/vendor",
            "Create bill"
          )}
          {homePanel(
            "Bill allocation (Block 06 foundation)",
            [
              { key: "alloc-preview", left: "Allocation panel", right: "UI ready", muted: "contract stub allowed" },
              { key: "alloc-next", left: "Next integration", right: "Live allocate endpoint", muted: "after Block 03 merge" },
            ],
            "Bill allocation UI is not configured yet.",
            "/accounting/bills",
            "Open bills"
          )}
          {homePanel(
            "Trial balance (Block 10 foundation)",
            trialBalanceRows,
            trialBalanceQ.isError
              ? "Trial balance snapshot uses contract stub until ledger endpoint is reachable."
              : `Quarter-to-date ${quarterRange.start} → ${quarterRange.end}.`,
            "/reports/trial-balance",
            "Open trial balance"
          )}
          {homePanel(
            "Assets (Block 04 foundation)",
            [
              { key: "assets-preview", left: "Asset workspace", right: "UI ready", muted: "contract stub allowed" },
              { key: "assets-next", left: "Next integration", right: "Live endpoint", muted: "after Block 01 merge" },
            ],
            "Asset workspace is not configured yet.",
            "/maintenance/vehicles",
            "Open vehicles"
          )}
        </div>
      ) : (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">
          {TABS.find((t) => t.id === activeTab)?.to ? (
            <Link className="font-semibold text-sky-700 hover:underline" to={TABS.find((t) => t.id === activeTab)!.to!}>
              Open {TABS.find((t) => t.id === activeTab)?.label}
            </Link>
          ) : (
            <p>No dedicated route is currently registered for this tab.</p>
          )}
          <p className="mt-2 text-xs text-gray-500">
            Bills paid MTD: {money.format(billsPaidMtdCents / 100)} · Avg DSO: {avgDsoDays == null ? "—" : `${Math.round(avgDsoDays)}d`}
          </p>
        </div>
      )}
    </div>
  );
}
