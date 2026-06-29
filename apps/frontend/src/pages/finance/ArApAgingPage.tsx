import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { FinanceModuleTabs } from "./FinanceModuleTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import {
  AR_AP_AGING_UI_FLAG,
  getArAging,
  getApAging,
  getArAgingInvoices,
  getApAgingBills,
  type AgingBuckets,
  type ArAgingCustomerRow,
  type ApAgingVendorRow,
} from "../../api/arApAging";

const fmtCents = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((c || 0) / 100);
const fmtDate = (s: string | null) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString("en-US") : "—");
const todayIso = () => new Date().toISOString().slice(0, 10);

type Mode = "ar" | "ap";

const BUCKET_COLS: { key: keyof AgingBuckets; label: string }[] = [
  { key: "current_cents", label: "Current" },
  { key: "bucket_1_30_cents", label: "1–30" },
  { key: "bucket_31_60_cents", label: "31–60" },
  { key: "bucket_61_90_cents", label: "61–90" },
  { key: "bucket_91_plus_cents", label: "91+" },
  { key: "total_open_cents", label: "Total open" },
];

const TH = "px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap";
const TD_NUM = "px-3 py-1.5 text-right tabular-nums whitespace-nowrap";

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Drill panels (read-only) ---------------------------------------------------------------

function ArInvoicesDrill({ operatingCompanyId, customer }: { operatingCompanyId: string; customer: ArAgingCustomerRow }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["fin20-ar-invoices", operatingCompanyId, customer.customer_id],
    queryFn: () => getArAgingInvoices(operatingCompanyId, customer.customer_id),
  });
  const invoices = data?.invoices ?? [];
  return (
    <tr className="bg-gray-50">
      <td colSpan={BUCKET_COLS.length + 2} className="px-3 py-2">
        <div className="rounded border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
            Open invoices — {customer.customer_name}
          </div>
          {isLoading ? (
            <div className="px-3 py-3 text-xs text-gray-400">Loading…</div>
          ) : isError ? (
            <div className="px-3 py-3 text-xs text-red-600">Failed to load invoices.</div>
          ) : invoices.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-400">No open invoices.</div>
          ) : (
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-1.5 text-left font-semibold text-gray-600 uppercase tracking-wide">Invoice</th>
                  <th className="px-3 py-1.5 text-left font-semibold text-gray-600 uppercase tracking-wide">Status</th>
                  <th className="px-3 py-1.5 text-left font-semibold text-gray-600 uppercase tracking-wide">Issued</th>
                  <th className="px-3 py-1.5 text-left font-semibold text-gray-600 uppercase tracking-wide">Due</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-gray-600 uppercase tracking-wide">Days past due</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-gray-600 uppercase tracking-wide">Total</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-gray-600 uppercase tracking-wide">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => (
                  <tr key={inv.invoice_id}>
                    <td className="px-3 py-1.5 whitespace-nowrap">{inv.display_id}</td>
                    <td className="px-3 py-1.5 capitalize">{inv.status}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(inv.issue_date)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(inv.due_date)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{inv.days_overdue > 0 ? inv.days_overdue : "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtCents(inv.total_cents)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtCents(inv.amount_open_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  );
}

function ApBillsDrill({ operatingCompanyId, vendor }: { operatingCompanyId: string; vendor: ApAgingVendorRow }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["fin20-ap-bills", operatingCompanyId, vendor.vendor_id],
    queryFn: () => getApAgingBills(operatingCompanyId, vendor.vendor_id),
  });
  const bills = data?.bills ?? [];
  return (
    <tr className="bg-gray-50">
      <td colSpan={BUCKET_COLS.length + 2} className="px-3 py-2">
        <div className="rounded border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
            Open bills — {vendor.vendor_name}
          </div>
          {isLoading ? (
            <div className="px-3 py-3 text-xs text-gray-400">Loading…</div>
          ) : isError ? (
            <div className="px-3 py-3 text-xs text-red-600">Failed to load bills.</div>
          ) : bills.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-400">No open bills.</div>
          ) : (
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-1.5 text-left font-semibold text-gray-600 uppercase tracking-wide">Bill #</th>
                  <th className="px-3 py-1.5 text-left font-semibold text-gray-600 uppercase tracking-wide">Status</th>
                  <th className="px-3 py-1.5 text-left font-semibold text-gray-600 uppercase tracking-wide">Bill date</th>
                  <th className="px-3 py-1.5 text-left font-semibold text-gray-600 uppercase tracking-wide">Due</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-gray-600 uppercase tracking-wide">Days past due</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-gray-600 uppercase tracking-wide">Amount</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-gray-600 uppercase tracking-wide">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bills.map((b) => (
                  <tr key={b.bill_id}>
                    <td className="px-3 py-1.5 whitespace-nowrap">{b.bill_number ?? "—"}</td>
                    <td className="px-3 py-1.5 capitalize">{b.status}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(b.bill_date)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(b.due_date)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{b.days_overdue > 0 ? b.days_overdue : "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtCents(b.amount_cents)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtCents(b.open_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---- Page -----------------------------------------------------------------------------------

export function ArApAgingPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(AR_AP_AGING_UI_FLAG, operatingCompanyId || undefined);

  const [mode, setMode] = useState<Mode>("ar");
  // Aging is ALWAYS as-of today: views.ar_aging/ap_aging and the drill queries compute buckets at
  // CURRENT_DATE, so there is no historical snapshot to select. No backdated as-of input is exposed
  // (a past date would mislead at close by stamping today's aging with an old date).
  const asOfDate = todayIso();
  const [expanded, setExpanded] = useState<string | null>(null);

  const queryReady = Boolean(operatingCompanyId) && enabled;

  const arQuery = useQuery({
    queryKey: ["fin20-ar-aging", operatingCompanyId, asOfDate],
    queryFn: () => getArAging(operatingCompanyId, asOfDate),
    enabled: queryReady && mode === "ar",
  });

  const apQuery = useQuery({
    queryKey: ["fin20-ap-aging", operatingCompanyId, asOfDate],
    queryFn: () => getApAging(operatingCompanyId, asOfDate),
    enabled: queryReady && mode === "ap",
  });

  const arRows = arQuery.data?.customers ?? [];
  const apRows = apQuery.data?.vendors ?? [];
  const totals: AgingBuckets | undefined = mode === "ar" ? arQuery.data?.totals : apQuery.data?.totals;
  const isLoading = mode === "ar" ? arQuery.isLoading : apQuery.isLoading;
  const isError = mode === "ar" ? arQuery.isError : apQuery.isError;

  const rowCount = mode === "ar" ? arRows.length : apRows.length;

  const handleExport = useMemo(
    () => () => {
      const head = [mode === "ar" ? "Customer" : "Vendor", "Open count", ...BUCKET_COLS.map((c) => c.label)];
      const lines: (string | number)[][] = [head];
      if (mode === "ar") {
        for (const r of arRows) {
          lines.push([
            r.customer_name,
            r.open_invoice_count,
            ...BUCKET_COLS.map((c) => (r[c.key] / 100).toFixed(2)),
          ]);
        }
      } else {
        for (const r of apRows) {
          lines.push([
            r.vendor_name,
            r.open_bill_count,
            ...BUCKET_COLS.map((c) => (r[c.key] / 100).toFixed(2)),
          ]);
        }
      }
      if (totals) {
        lines.push(["TOTAL", "", ...BUCKET_COLS.map((c) => (totals[c.key] / 100).toFixed(2))]);
      }
      downloadCsv(`${mode}-aging-${asOfDate}.csv`, lines);
    },
    [mode, arRows, apRows, totals, asOfDate]
  );

  if (!flagLoading && !enabled) {
    return (
      <div className="space-y-4">
        <PageHeader title="AR / AP Aging" subtitle="Accounts receivable & payable aging (read-only)" />
        <FinanceModuleTabs />
        <div className="rounded border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
          AR / AP aging is not yet enabled for this account.
          <p className="mt-1 text-xs text-gray-400">Enable the AR_AP_AGING_UI_ENABLED feature flag to use this report.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="AR / AP Aging"
        subtitle="Accounts receivable & payable aging as of today (read-only, per entity)"
        actions={
          <div className="flex flex-wrap items-end gap-2 print:hidden">
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-gray-500">As of</span>
              <span className="h-9 px-2 inline-flex items-center text-[13px] rounded border border-gray-200 bg-gray-50 text-gray-700 tabular-nums">
                {fmtDate(asOfDate)} (today)
              </span>
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={rowCount === 0}
              className="h-9 px-3 text-[13px] rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="h-9 px-3 text-[13px] rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            >
              Print
            </button>
          </div>
        }
      />
      <FinanceModuleTabs />

      <div className="flex items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={() => { setMode("ar"); setExpanded(null); }}
          className={[
            "h-9 px-4 text-[13px] rounded border font-medium",
            mode === "ar" ? "border-slate-700 bg-slate-700 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
          ].join(" ")}
        >
          A/R — by Customer
        </button>
        <button
          type="button"
          onClick={() => { setMode("ap"); setExpanded(null); }}
          className={[
            "h-9 px-4 text-[13px] rounded border font-medium",
            mode === "ap" ? "border-slate-700 bg-slate-700 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
          ].join(" ")}
        >
          A/P — by Vendor
        </button>
      </div>

      <p className="text-xs text-gray-400">
        Aging as of today ({fmtDate(asOfDate)}), computed live from the canonical ledger views. Click a row to drill
        into open {mode === "ar" ? "invoices" : "bills"}.
      </p>

      {!operatingCompanyId ? (
        <div className="rounded border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
          Select an operating company to view aging.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                  {mode === "ar" ? "Customer" : "Vendor"}
                </th>
                <th className={TH}>Open</th>
                {BUCKET_COLS.map((c) => (
                  <th key={c.key} className={TH}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={BUCKET_COLS.length + 2} className="px-3 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : isError ? (
                <tr><td colSpan={BUCKET_COLS.length + 2} className="px-3 py-8 text-center text-red-600">Failed to load aging.</td></tr>
              ) : rowCount === 0 ? (
                <tr><td colSpan={BUCKET_COLS.length + 2} className="px-3 py-8 text-center text-gray-400">No open balances.</td></tr>
              ) : mode === "ar" ? (
                arRows.map((r) => (
                  <Fragment key={r.customer_id}>
                    <tr
                      onClick={() => setExpanded(expanded === r.customer_id ? null : r.customer_id)}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <td className="px-3 py-1.5 whitespace-nowrap text-gray-900">{r.customer_name || "—"}</td>
                      <td className={TD_NUM}>{r.open_invoice_count}</td>
                      {BUCKET_COLS.map((c) => (
                        <td key={c.key} className={`${TD_NUM} ${c.key === "total_open_cents" ? "font-semibold" : ""}`}>
                          {fmtCents(r[c.key])}
                        </td>
                      ))}
                    </tr>
                    {expanded === r.customer_id && (
                      <ArInvoicesDrill operatingCompanyId={operatingCompanyId} customer={r} />
                    )}
                  </Fragment>
                ))
              ) : (
                apRows.map((r) => (
                  <Fragment key={r.vendor_id}>
                    <tr
                      onClick={() => setExpanded(expanded === r.vendor_id ? null : r.vendor_id)}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <td className="px-3 py-1.5 whitespace-nowrap text-gray-900">{r.vendor_name || "—"}</td>
                      <td className={TD_NUM}>{r.open_bill_count}</td>
                      {BUCKET_COLS.map((c) => (
                        <td key={c.key} className={`${TD_NUM} ${c.key === "total_open_cents" ? "font-semibold" : ""}`}>
                          {fmtCents(r[c.key])}
                        </td>
                      ))}
                    </tr>
                    {expanded === r.vendor_id && (
                      <ApBillsDrill operatingCompanyId={operatingCompanyId} vendor={r} />
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
            {totals && rowCount > 0 && (
              <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                <tr>
                  <td className="px-3 py-2 text-left font-semibold text-gray-900">Grand total</td>
                  <td className={TD_NUM} />
                  {BUCKET_COLS.map((c) => (
                    <td key={c.key} className={`${TD_NUM} font-semibold text-gray-900`}>{fmtCents(totals[c.key])}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

export default ArApAgingPage;
