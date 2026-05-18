import { useMemo } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  listBills,
  listBillPayments,
  listInvoices,
  listVendorBalances,
  type VendorBill,
} from "../../api/accounting";
import { getQboSyncQueue, getQboSyncQueueStats } from "../../api/banking";
import { listPendingEscrowDeductions } from "../../api/driverFinance";
import { listVendors, type VendorOption } from "../../api/mdata";
import { HoverDropdownNav, type NavItem } from "../../components/forms/shared/HoverDropdownNav";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const ACCOUNTING_DROPDOWN_ITEMS: NavItem[] = [
  { label: "Accounting", href: "/accounting" },
  {
    label: "Bills",
    children: [
      { label: "Bill", href: "/accounting/bills" },
      { label: "Maintenance bill", href: "/accounting/bills/maintenance" },
      { label: "Repair bill", href: "/accounting/bills/repair" },
      { label: "Fuel bill", href: "/accounting/bills/fuel" },
      { label: "Driver bill", href: "/accounting/bills/driver" },
      { label: "Vendor bill", href: "/accounting/bills/vendor" },
      { label: "Multiple bills", href: "/accounting/bills/multiple" },
    ],
  },
  { label: "Expenses", children: [{ label: "Expenses", href: "/accounting/expenses" }] },
  { label: "Bill payment", children: [{ label: "Bill payment", href: "/accounting/bill-payments" }] },
  { label: "Maintenance & shop", children: [{ label: "Maintenance & shop", href: "/accounting/maintenance-shop" }] },
  { label: "Vendors", href: "/accounting/vendors" },
  { label: "Customers", href: "/accounting/customers" },
  { label: "Reports", href: "/accounting/reports" },
];

type AmountRow = { label: string; amountCents: number | null; note?: string };

function monthStartIso(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return d.toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
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

function formatSignedDollars(cents: number) {
  const abs = money.format(Math.abs(cents) / 100);
  return cents < 0 ? `-${abs}` : abs;
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

function panel(
  title: string,
  rows: AmountRow[],
  opts?: {
    totalLabel?: string;
    totalCents?: number;
    actionHref?: string;
    actionLabel?: string;
    empty?: string;
    negativeAmount?: boolean;
  }
) {
  return (
    <section className="rounded border border-gray-200 bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-3 py-1.5">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-700">{title}</h3>
        {opts?.actionHref && opts.actionLabel ? (
          <Link to={opts.actionHref} className="text-xs font-semibold text-sky-700 hover:underline">
            {opts.actionLabel}
          </Link>
        ) : null}
      </header>
      {rows.length ? (
        <ul>
          {rows.map((row) => (
            <li key={`${title}-${row.label}`} className="flex items-center justify-between border-b border-gray-100 px-3 py-1.5 text-sm last:border-b-0">
              <span className="truncate text-gray-800">{row.label}</span>
              <span className={`tabular-nums ${opts?.negativeAmount ? "text-red-600" : "text-gray-900"}`}>
                {row.amountCents == null
                  ? row.note ?? "—"
                  : opts?.negativeAmount
                    ? formatSignedDollars(-Math.abs(row.amountCents))
                    : money.format(row.amountCents / 100)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-4 text-sm text-gray-500">{opts?.empty ?? "No data for this company."}</p>
      )}
      {opts?.totalLabel ? (
        <footer className="border-t border-gray-200 px-3 py-1.5 text-xs text-gray-600">
          {opts.totalLabel}{" "}
          <span className={`font-semibold ${opts?.negativeAmount ? "text-red-600" : "text-gray-900"}`}>
            {opts.totalCents == null ? "—" : opts?.negativeAmount ? formatSignedDollars(-Math.abs(opts.totalCents)) : money.format(opts.totalCents / 100)}
          </span>
        </footer>
      ) : null}
    </section>
  );
}

export function AccountingHubPage() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const mtdStart = monthStartIso();
  const last3dStart = daysAgoIso(3);

  const [billsQ, billPaymentsQ, vendorBalancesQ, vendorsQ, invoicesQ, qboStatsQ, qboQueueQ, escrowPendingQ] = useQueries({
    queries: [
      {
        queryKey: ["accounting-hub-v2", "bills", companyId],
        queryFn: () => listBills(companyId, { include_balance: true, limit: 500 }),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-hub-v2", "bill-payments", companyId],
        queryFn: () => listBillPayments(companyId, { limit: 500 }),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-hub-v2", "vendor-balances", companyId],
        queryFn: () => listVendorBalances(companyId, { all: false, sort: "balance_desc" }),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-hub-v2", "vendors", companyId],
        queryFn: () => listVendors({ operating_company_id: companyId, status: "active" }),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-hub-v2", "invoices", companyId],
        queryFn: () => listInvoices(companyId),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-hub-v2", "qbo-sync-stats", companyId],
        queryFn: () => getQboSyncQueueStats(companyId),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-hub-v2", "qbo-sync-queue", companyId],
        queryFn: () => getQboSyncQueue(companyId, { limit: 50 }),
        enabled: Boolean(companyId),
      },
      {
        queryKey: ["accounting-hub-v2", "escrow-pending", companyId],
        queryFn: () => listPendingEscrowDeductions(companyId),
        enabled: Boolean(companyId),
      },
    ],
  });

  const vendorById = useMemo(() => {
    const map = new Map<string, VendorOption>();
    for (const vendor of vendorsQ.data?.vendors ?? []) map.set(vendor.id, vendor);
    return map;
  }, [vendorsQ.data?.vendors]);

  const bills = billsQ.data?.rows ?? [];
  const billPayments = billPaymentsQ.data?.rows ?? [];
  const vendorBalances = vendorBalancesQ.data?.rows ?? [];
  const invoices = invoicesQ.data?.invoices ?? [];
  const qboItems = qboQueueQ.data?.items ?? [];
  const pendingEscrow = escrowPendingQ.data?.data ?? [];

  const recentCount = useMemo(() => {
    const recentBills = bills.filter((row) => isIsoOnOrAfter(row.created_at, last3dStart)).length;
    const recentBillPayments = billPayments.filter((row) => isIsoOnOrAfter(row.created_at, last3dStart)).length;
    const recentInvoices = invoices.filter((row) => isIsoOnOrAfter(row.created_at, last3dStart)).length;
    return recentBills + recentBillPayments + recentInvoices;
  }, [bills, billPayments, invoices, last3dStart]);

  const openBills = useMemo(() => {
    return bills
      .filter((bill) => (bill.status === "open" || bill.status === "partial") && amountOrBalanceCents(bill) > 0)
      .sort((a, b) => amountOrBalanceCents(b) - amountOrBalanceCents(a));
  }, [bills]);

  const pastDueBills = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return openBills
      .filter((bill) => bill.due_date != null && bill.due_date < today)
      .sort((a, b) => amountOrBalanceCents(b) - amountOrBalanceCents(a));
  }, [openBills]);

  const billsMtd = useMemo(() => bills.filter((bill) => isIsoOnOrAfter(bill.bill_date, mtdStart)), [bills, mtdStart]);
  const billPaymentsMtd = useMemo(() => billPayments.filter((p) => !p.revoked_at && isIsoOnOrAfter(p.payment_date, mtdStart)), [billPayments, mtdStart]);

  const spendByCategory = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const bill of billsMtd) {
      const vendor = bill.vendor_id ? vendorById.get(bill.vendor_id) : null;
      const key = vendor?.vendor_category || vendor?.vendor_type || "Uncategorized";
      grouped.set(key, (grouped.get(key) ?? 0) + Number(bill.amount_cents ?? 0));
    }
    return Array.from(grouped.entries())
      .map(([label, amountCents]) => ({ label, amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents);
  }, [billsMtd, vendorById]);

  const qboQueueRows = useMemo(
    () =>
      qboItems
        .filter((item) => item.sync_status !== "synced")
        .slice(0, 3)
        .map((item) => ({
          label: `${item.entity_type} · ${item.entity_id}`,
          amountCents: 0,
          note: relativeRetry(item.next_attempt_at),
        })),
    [qboItems]
  );

  const driverBalancesOwed = useMemo(() => {
    const byDriver = new Map<string, { label: string; amountCents: number; note?: string }>();
    for (const item of pendingEscrow) {
      if (item.status !== "pending") continue;
      const id = item.driver_id;
      const prev = byDriver.get(id) ?? {
        label: item.driver_name ?? "Unknown driver",
        amountCents: 0,
        note: item.proposed_reason,
      };
      prev.amountCents += Number(item.proposed_amount_cents ?? 0);
      if (!prev.note && item.proposed_reason) prev.note = item.proposed_reason;
      byDriver.set(id, prev);
    }
    return Array.from(byDriver.values()).sort((a, b) => b.amountCents - a.amountCents);
  }, [pendingEscrow]);

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
  const expensesMtdCents = sumCents(billsMtd);
  const billsPaidMtdCents = sumCents(billPaymentsMtd);
  const outstandingVendors = vendorBalances.filter((row) => Number(row.balance_cents ?? 0) > 0);
  const qboPending = Number(qboStatsQ.data?.pending ?? 0);
  const qboFailed = Number(qboStatsQ.data?.failed ?? 0);
  const pastDuePanelRows: AmountRow[] = pastDueBills.slice(0, 4).map((bill) => ({
    label: bill.bill_number || bill.vendor_name || "Bill",
    amountCents: amountOrBalanceCents(bill),
    note: bill.due_date ?? undefined,
  }));
  const spendPanelRows: AmountRow[] = spendByCategory.slice(0, 4).map((row) => ({ label: row.label, amountCents: row.amountCents }));
  const qboPanelRows: AmountRow[] = qboQueueRows.map((row) => ({
    label: row.label,
    amountCents: null,
    note: row.note ?? "retry pending",
  }));
  const driverPanelRows: AmountRow[] = driverBalancesOwed.slice(0, 5).map((row) => ({
    label: row.note ? `${row.label} · ${row.note}` : row.label,
    amountCents: row.amountCents,
  }));

  async function onRefresh() {
    if (!companyId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["accounting-hub-v2", "bills", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["accounting-hub-v2", "bill-payments", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["accounting-hub-v2", "vendor-balances", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["accounting-hub-v2", "vendors", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["accounting-hub-v2", "invoices", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["accounting-hub-v2", "qbo-sync-stats", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["accounting-hub-v2", "qbo-sync-queue", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["accounting-hub-v2", "escrow-pending", companyId] }),
    ]);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounting"
        subtitle={`${recentCount} new in last 3 days`}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void onRefresh()}
              className="rounded border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Refresh
            </button>
            <Link
              to="/accounting/bills"
              className="rounded border border-emerald-700 bg-emerald-700 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              + Create
            </Link>
          </div>
        }
      />
      {!companyId ? <p className="text-sm text-amber-800">Select an operating company.</p> : null}
      <HoverDropdownNav items={[...ACCOUNTING_DROPDOWN_ITEMS]} activeHref="/accounting" />

      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        {kpiCard("Open Bills", money.format(openBillsAmountCents / 100), `${openBills.length} open`, openBills.length ? "danger" : "neutral")}
        {kpiCard("Expenses MTD", money.format(expensesMtdCents / 100), `${billsMtd.length} bills`, "warn")}
        {kpiCard("Outstanding Vendors", String(outstandingVendors.length), `${money.format(outstandingVendors.reduce((s, v) => s + Number(v.balance_cents ?? 0), 0) / 100)}`)}
        {kpiCard("QBO Sync", `${qboPending} pending`, qboFailed ? `${qboFailed} failed` : "queue healthy", qboFailed ? "danger" : qboPending ? "warn" : "neutral")}
        {kpiCard("Bills Paid MTD", money.format(billsPaidMtdCents / 100), `${billPaymentsMtd.length} payments`)}
        {kpiCard("Avg DSO", avgDsoDays == null ? "—" : `${Math.round(avgDsoDays)}d`, avgDsoDays == null ? "No paid-invoice payment dates in list endpoint" : "Paid invoices only")}
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        {panel("Past-Due Bills", pastDuePanelRows, {
          totalLabel: `+ ${Math.max(0, pastDueBills.length - 4)} more · total past due`,
          totalCents: pastDueBills.reduce((sum, bill) => sum + amountOrBalanceCents(bill), 0),
          actionHref: "/accounting/bills",
          actionLabel: "View all",
          empty: billsQ.isLoading ? "Loading…" : "No past-due bills.",
        })}
        {panel("Spend by Category · MTD", spendPanelRows, {
          totalLabel: "Total",
          totalCents: spendByCategory.reduce((sum, row) => sum + row.amountCents, 0),
          empty: vendorsQ.isLoading || billsQ.isLoading ? "Loading…" : "No MTD spend rows.",
        })}
        {panel(`QBO Sync Queue · ${qboPending} pending`, qboPanelRows, {
          actionHref: "/banking/qbo-sync-queue",
          actionLabel: "Retry all",
          empty: qboQueueQ.isLoading ? "Loading…" : "No queue items.",
        })}
        {panel("Driver Balances Owed · Top 5", driverPanelRows, {
          totalLabel: `+ ${Math.max(0, driverBalancesOwed.length - 5)} more · total owed company`,
          totalCents: driverBalancesOwed.reduce((sum, row) => sum + row.amountCents, 0),
          negativeAmount: true,
          empty: escrowPendingQ.isLoading ? "Loading…" : "No pending driver deductions.",
        })}
      </div>
    </div>
  );
}
