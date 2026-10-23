/**
 * ROUND 443.267 board 2 — Accounting home.
 * Board: 10-22-2026-LEAD-MOD-DESIGN-V3-Accounting.dc.html
 * Sections (order): KPI strip → 2026 close calendar → Receivables aging · Cash pulse · Settlements open.
 * Engines only — no mock/sample rows. Find Tx / TB / P&L panels removed (not on board).
 */
import { useMemo, useState, type CSSProperties } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { invoiceOpenCentsForDisplay, isVoidInvoice } from "./InvoicesListPage";
import { ManualJEModal } from "./ManualJEModal";
import {
  getMonthCloseStatus,
  listBills,
  listExpenses,
  listInvoices,
  type MonthCloseStatus,
  type VendorBill,
} from "../../api/accounting";
import { getQboSyncQueue, getQboSyncQueueStats } from "../../api/banking";
import { getActualVsProjected, getRollingLedger } from "../../api/cashFlow";
import { getQboConnectionStatus } from "../../api/forensic";
import { getAccountingPeriods } from "../../api/my-accountant";
import { getArAgingReport } from "../../api/reports";
import { listTours } from "../../api/tourReadout";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { V3Panel } from "../../components/v3/V3Panel";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { V3, V3_TABLE } from "../../design/v3-tokens";
import { addDaysIso, companyToday, monthBoundsIso } from "../../lib/businessDate";
import { describeQboSyncStatus } from "../../lib/qbo-sync-status";
import { entityLabel } from "../../lib/entity-label";
import { QBO_MONEY_CELL_CLASS } from "../../lib/money";
import { formatUsdCents } from "../../utils/qboFormat";

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
  | "reclassify"
  | "reports";

export const TABS: Array<{ id: TabId; label: string; to?: string }> = [
  { id: "home", label: "Home" },
  { id: "bills", label: "Bills", to: "/accounting/bills" },
  { id: "expenses", label: "Expenses", to: "/accounting/expenses/list" },
  { id: "bill-payment", label: "Bill Payment", to: "/accounting/bill-payments" },
  { id: "invoices", label: "Invoices", to: "/accounting/invoices" },
  { id: "receive-payment", label: "Receive Payment", to: "/accounting/payments" },
  { id: "settlements", label: "Settlements", to: "/driver-finance/settlements" },
  { id: "find-transactions", label: "Find Transactions" },
  { id: "unmatched-needs-review", label: "Unmatched / Needs Review", to: "/banking/qbo-sync-queue" },
  { id: "factoring", label: "Factoring", to: "/accounting/factoring" },
  { id: "journal-entries", label: "Journal Entries", to: "/accounting/journal-entries" },
  { id: "reclassify", label: "Reclassify", to: "/accounting/reclassify" },
  { id: "reports", label: "Reports", to: "/reports" },
];

/**
 * #3a — per-tab summary-card subtitle (kept for AccountingHubPage.subtitle.test.ts).
 */
export function accountingTabSubtitle(
  tabId: TabId,
  metrics: { billsPaidMtdCents: number; avgDsoDays: number | null }
): string {
  const billsPaid = formatUsdCents(metrics.billsPaidMtdCents);
  const dso = metrics.avgDsoDays == null ? "—" : `${Math.round(metrics.avgDsoDays)}d`;
  switch (tabId) {
    case "home":
      return `Bills paid MTD: ${billsPaid}. Avg DSO: ${dso}.`;
    case "bills":
      return `Open bills awaiting payment. Bills paid MTD: ${billsPaid}.`;
    case "expenses":
      return "Direct expenses and category mapping.";
    case "bill-payment":
      return `Bill payments recorded this month: ${billsPaid}.`;
    case "invoices":
      return `Customer invoices outstanding. Avg DSO: ${dso}.`;
    case "receive-payment":
      return "Record customer payments and deposits.";
    case "settlements":
      return "Driver settlements and pay runs.";
    case "find-transactions":
      return "Search across all accounting transactions.";
    case "unmatched-needs-review":
      return "QBO sync items that need review.";
    case "factoring":
      return "Faro factoring advances and reserve releases.";
    case "journal-entries":
      return "Manual journal entries and GL adjustments.";
    case "reclassify":
      return "Move posted transactions to a different account or class.";
    case "reports":
      return "Financial statements and account registers.";
  }
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTH_UPPER = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: V3_TABLE.headerPx,
  fontWeight: 600,
  color: V3.muted,
  padding: `${V3_TABLE.rowPadY}px 12px`,
  borderBottom: `1px solid ${V3.border}`,
  background: V3.headerBg,
  whiteSpace: "nowrap",
  fontFamily: V3.font,
};

const tdStyle: CSSProperties = {
  textAlign: "left",
  padding: `${V3_TABLE.rowPadY}px 12px`,
  borderBottom: `1px solid ${V3.borderSoft}`,
  fontSize: V3_TABLE.fontPx,
  whiteSpace: "nowrap",
  color: V3.ink,
  fontFamily: V3.font,
  fontVariantNumeric: "tabular-nums",
};

function monthStartIso() {
  return monthBoundsIso(companyToday()).start;
}

function isIsoOnOrAfter(left: string | null | undefined, right: string) {
  if (!left) return false;
  return left >= right;
}

function amountOrBalanceCents(row: VendorBill) {
  const balance = row.balance_cents;
  if (balance != null) return Number(balance);
  return Number(row.amount_cents) - Number(row.paid_cents ?? 0);
}

function formatPlainAmount(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function sharePct(part: number, total: number): string {
  if (total <= 0 || part <= 0) return "—";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function periodKey(year: number, month1: number): string {
  return `${year}-${String(month1).padStart(2, "0")}`;
}

/** Four board marks: bank rec · AR tie-out · AP tie-out · TB = 0 & lock. */
function monthMarks(status: MonthCloseStatus | undefined, periodClosed: boolean): boolean[] {
  if (periodClosed) return [true, true, true, true];
  if (!status) return [false, false, false, false];
  return [
    Boolean(status.bank_recon?.complete),
    Boolean(status.ar_aging_review?.complete),
    Boolean(status.ap_aging_review?.complete),
    Boolean(status.can_lock),
  ];
}

function WeeklySpark({ points }: { points: number[] }) {
  if (points.length === 0) {
    return <svg width={200} height={40} viewBox="0 0 200 40" aria-hidden />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 200;
  const h = 40;
  const pad = 2;
  const coords = points
    .map((v, i) => {
      const x = points.length === 1 ? w / 2 : (i / (points.length - 1)) * w;
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={200} height={40} viewBox="0 0 200 40" aria-hidden>
      <polyline
        points={coords}
        fill="none"
        stroke={V3.data}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AccountingHubPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [manualJeOpen, setManualJeOpen] = useState(false);

  const today = companyToday();
  const mtdStart = monthStartIso();
  const [yearStr, monthStr] = today.split("-");
  const year = Number(yearStr);
  const monthNow = Number(monthStr);
  const dayNow = Number(today.slice(8, 10));

  const pastMonthKeys = useMemo(() => {
    const keys: string[] = [];
    for (let m = 1; m <= monthNow; m++) keys.push(periodKey(year, m));
    return keys;
  }, [year, monthNow]);

  const sparkFrom = addDaysIso(today, -83);

  const [billsQ, invoicesQ, qboStatsQ, qboConnectionQ, qboQueueQ, expensesQ] = useQueries({
    queries: [
      {
        queryKey: ["accounting-proto", "bills", companyId],
        queryFn: () => listBills(companyId, { include_balance: true, limit: 500 }),
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
        queryKey: ["accounting-proto", "qbo-connection", companyId],
        queryFn: () => getQboConnectionStatus(companyId),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-proto", "qbo-sync-queue", companyId],
        queryFn: () => getQboSyncQueue(companyId, { limit: 50 }),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-proto", "expenses-mtd", companyId, mtdStart],
        queryFn: async () => {
          const rows: Awaited<ReturnType<typeof listExpenses>>["rows"] = [];
          for (let offset = 0; offset < 5000; offset += 200) {
            const page = await listExpenses(companyId, { limit: 200, offset, date_from: mtdStart });
            const got = page.rows ?? [];
            rows.push(...got);
            if (got.length < 200) break;
          }
          return rows;
        },
        enabled: Boolean(companyId),
        retry: false,
      },
    ],
  });

  const periodsQ = useQuery({
    queryKey: ["accounting-hub", "periods", companyId],
    queryFn: () => getAccountingPeriods(companyId),
    enabled: Boolean(companyId),
  });

  const arAgingQ = useQuery({
    queryKey: ["accounting-hub", "ar-aging", companyId, today],
    queryFn: () => getArAgingReport(companyId, today),
    enabled: Boolean(companyId),
  });

  const avpQ = useQuery({
    queryKey: ["accounting-hub", "avp-mtd", companyId, mtdStart, today],
    queryFn: () => getActualVsProjected(companyId, mtdStart, today),
    enabled: Boolean(companyId),
  });

  const rollingQ = useQuery({
    queryKey: ["accounting-hub", "rolling-spark", companyId, sparkFrom, today],
    queryFn: () => getRollingLedger(companyId, sparkFrom, today),
    enabled: Boolean(companyId),
  });

  const toursOpenQ = useQuery({
    queryKey: ["accounting-hub", "tours-open", companyId],
    queryFn: () => listTours(companyId, "open"),
    enabled: Boolean(companyId),
  });

  const monthCloseQueries = useQueries({
    queries: pastMonthKeys.map((period) => ({
      queryKey: ["accounting-hub", "month-close", companyId, period],
      queryFn: () => getMonthCloseStatus(companyId, period),
      enabled: Boolean(companyId),
      retry: false,
      staleTime: 60_000,
    })),
  });

  const bills = billsQ.data?.rows ?? [];
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
  const openBillsAmountCents = openBills.reduce((sum, bill) => sum + amountOrBalanceCents(bill), 0);
  const directExpensesMtd = useMemo(
    () =>
      (expensesQ.data ?? []).filter(
        (x) => x.status !== "void" && x.status !== "draft" && isIsoOnOrAfter(x.transaction_date, mtdStart)
      ),
    [expensesQ.data, mtdStart]
  );
  const expensesMtdCents =
    billsMtd.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0) +
    directExpensesMtd.reduce((sum, x) => sum + Number(x.total_amount_cents ?? 0), 0);

  const invoiceServerKpi = invoicesQ.data?.kpi;
  const openInvoices = invoices.filter((invoice) => !isVoidInvoice(invoice) && invoiceOpenCentsForDisplay(invoice) > 0);
  const openInvoicesCents =
    invoiceServerKpi != null
      ? invoiceServerKpi.open_amount_cents
      : openInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_open_cents ?? 0), 0);
  const overdueInvoices = openInvoices.filter((invoice) => invoice.due_date < today);
  const overdueInvoiceCents =
    invoiceServerKpi != null
      ? invoiceServerKpi.overdue_amount_cents
      : overdueInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_open_cents ?? 0), 0);
  const openInvoicesCount = invoiceServerKpi?.open_count ?? openInvoices.length;
  const overdueInvoicesCount = invoiceServerKpi?.overdue_count ?? overdueInvoices.length;

  const unmatchedItems = qboItems.filter((item) => item.sync_status === "failed" || item.sync_status === "blocked");
  const qboPending = Number(qboStatsQ.data?.pending ?? 0);
  const qboFailed = Number(qboStatsQ.data?.failed ?? 0);
  const qboSyncSummary = describeQboSyncStatus({
    connected: qboConnectionQ.data?.connected ?? false,
    pending: qboPending,
    failed: qboFailed,
  });
  const qboTone =
    qboSyncSummary.tone === "bad" ? "red" : qboSyncSummary.tone === "warn" ? "amber" : ("ink" as const);

  const closedByPeriod = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of periodsQ.data?.periods ?? []) {
      const start = p.period_start?.slice(0, 7);
      if (!start) continue;
      const closed = String(p.status ?? "").toLowerCase() === "closed" || Boolean(p.closed_at);
      map.set(start, closed);
    }
    return map;
  }, [periodsQ.data]);

  const pastMonthsInYear = monthNow - 1; // Jan..(monthNow-1) are "past" for the board count
  const closedPastCount = useMemo(() => {
    let n = 0;
    for (let m = 1; m < monthNow; m++) {
      if (closedByPeriod.get(periodKey(year, m))) n += 1;
    }
    return n;
  }, [closedByPeriod, year, monthNow]);

  const closeCells = useMemo(() => {
    return MONTH_SHORT.map((label, idx) => {
      const m = idx + 1;
      const key = periodKey(year, m);
      const isFuture = m > monthNow;
      const isClosed = closedByPeriod.get(key) === true;
      const statusIdx = pastMonthKeys.indexOf(key);
      const status = statusIdx >= 0 ? monthCloseQueries[statusIdx]?.data : undefined;
      const marks = isFuture ? [false, false, false, false] : monthMarks(status, isClosed);
      let statusLabel: string;
      let statusColor: string;
      if (isFuture) {
        statusLabel = "—";
        statusColor = V3.muted;
      } else if (isClosed) {
        statusLabel = "closed";
        statusColor = V3.green;
      } else {
        statusLabel = "open";
        statusColor = m < monthNow ? V3.amber : V3.muted;
      }
      return { label, key, statusLabel, statusColor, marks, isFuture };
    });
  }, [year, monthNow, closedByPeriod, pastMonthKeys, monthCloseQueries]);

  /** Aging buckets from AR engine row cents. Invoice counts: dominant-bucket attribution (engine has no per-bucket invoice count). */
  const agingBuckets = useMemo(() => {
    const rows = arAgingQ.data?.rows ?? [];
    let notDue = 0;
    let d1 = 0;
    let d31 = 0;
    let d61 = 0;
    let invNotDue = 0;
    let inv1 = 0;
    let inv31 = 0;
    let inv61 = 0;
    for (const row of rows) {
      const a0 = Number(row.current_cents ?? 0);
      const a1 = Number(row.bucket_1_30_cents ?? 0);
      const a31 = Number(row.bucket_31_60_cents ?? 0);
      const a61 = Number(row.bucket_61_90_cents ?? 0) + Number(row.bucket_91_plus_cents ?? 0);
      notDue += a0;
      d1 += a1;
      d31 += a31;
      d61 += a61;
      const inv = Number(row.open_invoice_count ?? 0);
      const max = Math.max(a0, a1, a31, a61);
      if (max <= 0 || inv <= 0) continue;
      if (a0 === max) invNotDue += inv;
      else if (a1 === max) inv1 += inv;
      else if (a31 === max) inv31 += inv;
      else inv61 += inv;
    }
    const totalAmt = notDue + d1 + d31 + d61;
    const totalInv = arAgingQ.data?.total_open_invoices ?? invNotDue + inv1 + inv31 + inv61;
    return {
      rows: [
        { key: "not-due", label: "Not due", invoices: invNotDue, amountCents: notDue, color: V3.data },
        { key: "1-30", label: "1–30", invoices: inv1, amountCents: d1, color: V3.slate },
        { key: "31-60", label: "31–60", invoices: inv31, amountCents: d31, color: V3.red },
        { key: "61+", label: "61+", invoices: inv61, amountCents: d61, color: V3.amber },
      ],
      totalAmt,
      totalInv,
    };
  }, [arAgingQ.data]);

  const cashIn = Number(avpQ.data?.accuracy_summary?.total_actual_income_cents ?? 0);
  const cashOut = Number(avpQ.data?.accuracy_summary?.total_actual_expense_cents ?? 0);
  const cashNet = cashIn - cashOut;
  const avpUnavailable = Boolean(
    avpQ.data?.lines?.some((l) => l.category === "income" && l.actual_unavailable)
  );

  const weeklyNets = useMemo(() => {
    const days = rollingQ.data?.days ?? [];
    if (days.length === 0) return [] as number[];
    // 12 week buckets ending at `today`, oldest → newest.
    const buckets: number[] = Array.from({ length: 12 }, () => 0);
    for (const day of days) {
      const daysAgo = Math.max(0, Math.floor((Date.parse(`${today}T12:00:00`) - Date.parse(`${day.date}T12:00:00`)) / 86_400_000));
      const weekIdxFromEnd = Math.min(11, Math.floor(daysAgo / 7));
      const idx = 11 - weekIdxFromEnd;
      buckets[idx] += Number(day.net_cents ?? 0);
    }
    return buckets;
  }, [rollingQ.data, today]);

  const settlementsOpen = useMemo(() => {
    const rows = toursOpenQ.data?.rows ?? [];
    const byDriver = new Map<string, { driverId: string | null; name: string; cents: number }>();
    for (const row of rows) {
      const key = row.driver_id ?? row.driver_name ?? row.settlement_id;
      const prev = byDriver.get(key);
      const add = Number(row.driver_net_cents ?? 0);
      if (prev) {
        prev.cents += add;
      } else {
        byDriver.set(key, {
          driverId: row.driver_id,
          // Lead 443.278 (2): a uuid-shaped / blank driver_name never renders as the label.
          name: entityLabel(row.driver_name, row.driver_id ?? row.settlement_id, "Driver"),
          cents: add,
        });
      }
    }
    return [...byDriver.values()].sort((a, b) => b.cents - a.cents).slice(0, 12);
  }, [toursOpenQ.data]);

  const inLabel = `IN · ${MONTH_UPPER[monthNow - 1]} 1–${dayNow}`;

  const kpiStrip = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 8,
      }}
      data-testid="accounting-hub-kpi-strip"
      className="text-section-header"
    >
      {billsQ.isError ? (
        <V3KpiTile label="Open bills" value="—" sub="Error loading" />
      ) : (
        <V3KpiTile
          label="Open bills"
          value={formatUsdCents(openBillsAmountCents)}
          sub={`${openBills.length} unpaid`}
          tone={openBills.length ? "red" : "ink"}
          testId="acct-hub-kpi-open-bills"
        />
      )}
      {billsQ.isError || expensesQ.isError ? (
        <V3KpiTile label="MTD expenses" value="—" sub="Error loading" />
      ) : (
        <V3KpiTile
          label="MTD expenses"
          value={formatUsdCents(expensesMtdCents)}
          sub="bills + expenses"
          testId="acct-hub-kpi-mtd-expenses"
        />
      )}
      {invoicesQ.isError ? (
        <V3KpiTile label="Open invoices" value="—" sub="Error loading" />
      ) : (
        <V3KpiTile
          label="Open invoices"
          value={formatUsdCents(openInvoicesCents)}
          sub={`${openInvoicesCount} open`}
          testId="acct-hub-kpi-open-invoices"
        />
      )}
      {invoicesQ.isError ? (
        <V3KpiTile label="Overdue A/R" value="—" sub="Error loading" />
      ) : (
        <V3KpiTile
          label="Overdue A/R"
          value={formatUsdCents(overdueInvoiceCents)}
          sub={`${overdueInvoicesCount} overdue`}
          tone={overdueInvoicesCount > 0 ? "amber" : "ink"}
          testId="acct-hub-kpi-overdue"
        />
      )}
      {qboQueueQ.isError ? (
        <V3KpiTile label="Unmatched" value="—" sub="Error loading" />
      ) : (
        <V3KpiTile
          label="Unmatched"
          value={String(unmatchedItems.length)}
          sub="failed / blocked queue"
          testId="acct-hub-kpi-unmatched"
        />
      )}
      {qboStatsQ.isError || qboConnectionQ.isError ? (
        <V3KpiTile label="QBO sync" value="—" sub="Error loading" />
      ) : (
        <V3KpiTile
          label="QBO sync"
          value={qboSyncSummary.label}
          sub={qboSyncSummary.sub}
          tone={qboTone}
          testId="acct-hub-kpi-qbo"
        />
      )}
    </div>
  );

  return (
    <AccountingSubNavWrapper
      title="Accounting"
      subtitle="Bills, expenses, invoices, settlements & transaction review"
      kpiStrip={kpiStrip}
      createControl={
        <Button size="sm" onClick={() => setManualJeOpen(true)} disabled={!companyId}>
          + Create Manual JE
        </Button>
      }
    >
      {!companyId ? <p style={{ fontSize: 12, color: V3.ink }}>Select an operating company.</p> : null}

      <div
        style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: V3.font }}
        data-testid="accounting-hub-board"
      >
        <V3Panel
          title={`${year} close — ${closedPastCount} of ${Math.max(0, pastMonthsInYear)} past months closed`}
          onViewAll={() => navigate("/accounting/month-close")}
          testId="accounting-hub-close-calendar"
        >
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(12, 1fr)",
                gap: 4,
              }}
            >
              {closeCells.map((cell) => (
                <div
                  key={cell.key}
                  style={{
                    border: `1px solid ${V3.border}`,
                    borderRadius: 2,
                    padding: 6,
                    background: V3.surface,
                  }}
                  data-testid={`acct-hub-month-${cell.key}`}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: V3.ink }}>{cell.label}</div>
                  <div style={{ fontSize: 10, color: cell.statusColor }}>{cell.statusLabel}</div>
                  <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
                    {cell.marks.map((on, i) => (
                      <span
                        key={i}
                        style={{
                          flex: 1,
                          height: 3,
                          background: on ? V3.green : V3.chartGrid,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: V3.muted, margin: 0 }}>
              4 marks per month: bank rec · AR tie-out · AP tie-out · TB = 0 & lock.
            </p>
          </div>
        </V3Panel>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1.2fr 1fr",
            gap: 12,
            alignItems: "start",
          }}
        >
          <V3Panel
            title="Receivables aging"
            onViewAll={() => navigate("/reports/ar-aging")}
            testId="accounting-hub-receivables-aging"
          >
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {arAgingQ.isError ? (
                <p style={{ fontSize: 12, color: V3.red, margin: 0 }}>Could not load A/R aging.</p>
              ) : (
                <>
                  <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden" }}>
                    {agingBuckets.rows.map((b) =>
                      b.amountCents > 0 ? (
                        <div key={b.key} style={{ flex: b.amountCents, background: b.color }} title={b.label} />
                      ) : null
                    )}
                    {agingBuckets.totalAmt <= 0 ? (
                      <div style={{ flex: 1, background: V3.chartGrid }} />
                    ) : null}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Bucket</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Invoices</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agingBuckets.rows.map((b) => (
                          <tr key={b.key}>
                            <td style={tdStyle}>{b.label}</td>
                            <td style={{ ...tdStyle, textAlign: "right" }}>
                              {arAgingQ.isLoading ? "…" : b.invoices || ""}
                            </td>
                            <td style={{ ...tdStyle, textAlign: "right" }}>
                              {arAgingQ.isLoading ? "…" : formatPlainAmount(b.amountCents)}
                            </td>
                            <td style={{ ...tdStyle, textAlign: "right" }}>
                              {arAgingQ.isLoading ? "…" : sharePct(b.amountCents, agingBuckets.totalAmt)}
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td style={{ ...tdStyle, fontWeight: 700, borderBottom: "none" }}>Total</td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, borderBottom: "none" }}>
                            {arAgingQ.isLoading ? "…" : agingBuckets.totalInv}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, borderBottom: "none" }}>
                            {arAgingQ.isLoading ? "…" : formatPlainAmount(agingBuckets.totalAmt)}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", borderBottom: "none" }}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </V3Panel>

          <V3Panel
            title="Cash pulse · operating account"
            onViewAll={() => navigate("/cash-flow")}
            testId="accounting-hub-cash-pulse"
          >
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {avpQ.isError ? (
                <p style={{ fontSize: 12, color: V3.red, margin: 0 }}>Could not load cash pulse.</p>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 18, alignItems: "flex-end" }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: V3.muted }}>{inLabel}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: V3.ink, fontVariantNumeric: "tabular-nums" }}>
                        {avpQ.isLoading || avpUnavailable ? "—" : formatUsdCents(cashIn)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: V3.muted }}>OUT</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: V3.ink, fontVariantNumeric: "tabular-nums" }}>
                        {avpQ.isLoading || avpUnavailable ? "—" : formatUsdCents(cashOut)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: V3.muted }}>NET</div>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: cashNet < 0 ? V3.red : V3.ink,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {avpQ.isLoading || avpUnavailable
                          ? "—"
                          : `${cashNet < 0 ? "−" : ""}${formatUsdCents(Math.abs(cashNet))}`}
                      </div>
                    </div>
                    <div style={{ flex: 1 }} />
                    <WeeklySpark points={weeklyNets} />
                  </div>
                  <div style={{ fontSize: 11, color: V3.muted }}>Weekly net, 12 weeks — opens Cash flow.</div>
                </>
              )}
            </div>
          </V3Panel>

          <V3Panel
            title="Settlements open"
            onViewAll={() => navigate("/driver-finance/settlements?state=open")}
            testId="accounting-hub-settlements-open"
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Driver</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {toursOpenQ.isLoading ? (
                    <tr>
                      <td colSpan={2} style={{ ...tdStyle, color: V3.muted }}>
                        Loading…
                      </td>
                    </tr>
                  ) : toursOpenQ.isError ? (
                    <tr>
                      <td colSpan={2} style={{ ...tdStyle, color: V3.red }}>
                        Could not load open settlements.
                      </td>
                    </tr>
                  ) : settlementsOpen.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ ...tdStyle, color: V3.muted }}>
                        No open settlements.
                      </td>
                    </tr>
                  ) : (
                    settlementsOpen.map((row) => (
                      <tr key={`${row.driverId ?? "x"}-${row.name}`}>
                        <td style={tdStyle}>
                          {row.driverId ? (
                            <EntityLinkOrTombstone
                              kind="driver"
                              id={row.driverId}
                              name={row.name}
                              noun="Driver"
                              className="truncate"
                            />
                          ) : (
                            <span>{row.name}</span>
                          )}
                        </td>
                        <td className={QBO_MONEY_CELL_CLASS} style={tdStyle}>
                          {formatUsdCents(row.cents)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </V3Panel>
        </div>
      </div>

      {companyId && user?.role === "Owner" ? (
        <ManualJEModal
          open={manualJeOpen}
          operatingCompanyId={companyId}
          onClose={() => setManualJeOpen(false)}
          onSaved={() => {
            setManualJeOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["journal-entries", companyId] });
            void queryClient.invalidateQueries({ queryKey: ["accounting-hub", companyId] });
          }}
        />
      ) : null}
    </AccountingSubNavWrapper>
  );
}
