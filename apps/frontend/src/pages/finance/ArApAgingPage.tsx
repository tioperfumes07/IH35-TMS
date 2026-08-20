import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { entityLabel } from "../../lib/entity-label";
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
  type ArAgingInvoiceRow,
  type ApAgingBillRow,
} from "../../api/arApAging";
import { printLetterHtml } from "../../lib/openPrintableDocument";

const fmtCents = (c: number) => formatUsdCents(c);
const fmtDate = (s: string | null) => formatDateUS(s) || "—";
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

const NUM_CELL = "text-right tabular-nums whitespace-nowrap";

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

// Aging bucket columns shared by both main tables — same order, labels, and cents formatting as the
// pre-migration hand-rolled table (Total open stays bold).
function bucketColumns<T extends AgingBuckets>(): ParityColumn<T>[] {
  return BUCKET_COLS.map((c) => ({
    key: c.key,
    label: c.label,
    sortable: true,
    className: "text-right",
    cellClass: `${NUM_CELL}${c.key === "total_open_cents" ? " font-semibold" : ""}`,
    sortValue: (row: T) => row[c.key],
    render: (row: T) => fmtCents(row[c.key]),
  }));
}

const AR_COLUMNS: ParityColumn<ArAgingCustomerRow>[] = [
  {
    key: "customer_name",
    label: "Customer",
    sortable: true,
    cellClass: "whitespace-nowrap text-gray-900",
    render: (r) => <EntityLink kind="customer" id={r.customer_id} label={entityLabel(r.customer_name, r.customer_id, "Customer")} />,
  },
  {
    key: "open_invoice_count",
    label: "Open",
    sortable: true,
    className: "text-right",
    cellClass: NUM_CELL,
    sortValue: (r) => r.open_invoice_count,
  },
  ...bucketColumns<ArAgingCustomerRow>(),
];

const AP_COLUMNS: ParityColumn<ApAgingVendorRow>[] = [
  {
    key: "vendor_name",
    label: "Vendor",
    sortable: true,
    cellClass: "whitespace-nowrap text-gray-900",
    render: (r) => <EntityLink kind="vendor" id={r.vendor_id} label={entityLabel(r.vendor_name, r.vendor_id, "Vendor")} />,
  },
  {
    key: "open_bill_count",
    label: "Open",
    sortable: true,
    className: "text-right",
    cellClass: NUM_CELL,
    sortValue: (r) => r.open_bill_count,
  },
  ...bucketColumns<ApAgingVendorRow>(),
];

const AR_DRILL_COLUMNS: ParityColumn<ArAgingInvoiceRow>[] = [
  {
    key: "display_id",
    label: "Invoice",
    sortable: true,
    cellClass: "whitespace-nowrap",
    render: (inv) => (
      <EntityLink kind="invoice" id={inv.invoice_id} label={entityLabel(inv.display_id, inv.invoice_id, "Invoice")} />
    ),
  },
  { key: "status", label: "Status", sortable: true, cellClass: "capitalize" },
  { key: "issue_date", label: "Issued", sortable: true, cellClass: "whitespace-nowrap", render: (inv) => fmtDate(inv.issue_date) },
  { key: "due_date", label: "Due", sortable: true, cellClass: "whitespace-nowrap", render: (inv) => fmtDate(inv.due_date) },
  {
    key: "days_overdue",
    label: "Days past due",
    sortable: true,
    className: "text-right",
    cellClass: NUM_CELL,
    sortValue: (inv) => inv.days_overdue,
    render: (inv) => (inv.days_overdue > 0 ? inv.days_overdue : "—"),
  },
  {
    key: "total_cents",
    label: "Total",
    sortable: true,
    className: "text-right",
    cellClass: NUM_CELL,
    sortValue: (inv) => inv.total_cents,
    render: (inv) => fmtCents(inv.total_cents),
  },
  {
    key: "amount_open_cents",
    label: "Open",
    sortable: true,
    className: "text-right",
    cellClass: `${NUM_CELL} font-medium`,
    sortValue: (inv) => inv.amount_open_cents,
    render: (inv) => fmtCents(inv.amount_open_cents),
  },
];

const AP_DRILL_COLUMNS: ParityColumn<ApAgingBillRow>[] = [
  {
    key: "bill_number",
    label: "Bill #",
    sortable: true,
    cellClass: "whitespace-nowrap",
    render: (b) => <EntityLink kind="bill" id={b.bill_id} label={entityLabel(b.bill_number, b.bill_id, "Bill")} />,
  },
  {
    // VENDOR-PROFILE-AP-AGING-NO-GL-JE-LINK — drill to the bill's posted JE (nullable: an
    // open/unpaid bill may not be posted yet). Same response field the vendor-profile section renders.
    key: "journal_entry_id",
    label: "GL JE",
    cellClass: "whitespace-nowrap",
    render: (b) =>
      b.journal_entry_id ? (
        <EntityLink
          kind="journal_entry"
          id={b.journal_entry_id}
          label={entityLabel(b.journal_entry_memo, b.journal_entry_id, "Journal entry")}
        />
      ) : (
        "—"
      ),
  },
  { key: "status", label: "Status", sortable: true, cellClass: "capitalize" },
  { key: "bill_date", label: "Bill date", sortable: true, cellClass: "whitespace-nowrap", render: (b) => fmtDate(b.bill_date) },
  { key: "due_date", label: "Due", sortable: true, cellClass: "whitespace-nowrap", render: (b) => fmtDate(b.due_date) },
  {
    key: "days_overdue",
    label: "Days past due",
    sortable: true,
    className: "text-right",
    cellClass: NUM_CELL,
    sortValue: (b) => b.days_overdue,
    render: (b) => (b.days_overdue > 0 ? b.days_overdue : "—"),
  },
  {
    key: "amount_cents",
    label: "Amount",
    sortable: true,
    className: "text-right",
    cellClass: NUM_CELL,
    sortValue: (b) => b.amount_cents,
    render: (b) => fmtCents(b.amount_cents),
  },
  {
    key: "open_cents",
    label: "Open",
    sortable: true,
    className: "text-right",
    cellClass: `${NUM_CELL} font-medium`,
    sortValue: (b) => b.open_cents,
    render: (b) => fmtCents(b.open_cents),
  },
];

// ---- Drill panels (read-only) ---------------------------------------------------------------

function ArInvoicesDrill({ operatingCompanyId, customer, asOfDate }: { operatingCompanyId: string; customer: ArAgingCustomerRow; asOfDate: string }) {
  const query = useQuery({
    queryKey: ["fin20-ar-invoices", operatingCompanyId, customer.customer_id, asOfDate],
    queryFn: () => getArAgingInvoices(operatingCompanyId, customer.customer_id, asOfDate),
  });
  const invoices = query.data?.invoices ?? [];
  return (
    <div className="rounded-sm border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
        Open invoices — <EntityLink kind="customer" id={customer.customer_id} label={entityLabel(customer.customer_name, customer.customer_id, "Customer")} />
      </div>
      {query.isError ? (
        <ListErrorState
          title="Couldn't load invoices"
          status={0}
          message={(query.error as Error)?.message ?? "Failed to load invoices."}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable
          columns={AR_DRILL_COLUMNS}
          rows={invoices}
          rowKey={(inv) => inv.invoice_id}
          loading={query.isLoading}
          emptyText="No open invoices."
          storageKey="ar-aging-invoices-drill"
        />
      )}
    </div>
  );
}

function ApBillsDrill({ operatingCompanyId, vendor, asOfDate }: { operatingCompanyId: string; vendor: ApAgingVendorRow; asOfDate: string }) {
  const query = useQuery({
    queryKey: ["fin20-ap-bills", operatingCompanyId, vendor.vendor_id, asOfDate],
    queryFn: () => getApAgingBills(operatingCompanyId, vendor.vendor_id, asOfDate),
  });
  const bills = query.data?.bills ?? [];
  return (
    <div className="rounded-sm border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
        Open bills — <EntityLink kind="vendor" id={vendor.vendor_id} label={entityLabel(vendor.vendor_name, vendor.vendor_id, "Vendor")} />
      </div>
      {query.isError ? (
        <ListErrorState
          title="Couldn't load bills"
          status={0}
          message={(query.error as Error)?.message ?? "Failed to load bills."}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable
          columns={AP_DRILL_COLUMNS}
          rows={bills}
          rowKey={(b) => b.bill_id}
          loading={query.isLoading}
          emptyText="No open bills."
          storageKey="ap-aging-bills-drill"
        />
      )}
    </div>
  );
}

// ---- Page -----------------------------------------------------------------------------------

export function ArApAgingPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(AR_AP_AGING_UI_FLAG, operatingCompanyId || undefined);

  const [mode, setMode] = useState<Mode>("ar");
  // TRUE historical as-of: today reads the live canonical views; a PAST date reconstructs each
  // invoice/bill's open balance AS OF that date via accounting.ar_aging_as_of / ap_aging_as_of
  // (migration 202606290040). Future dates are clamped to today.
  const today = todayIso();
  // CLS-FINANCE-READONLY-FILTER-APPLY-CANCEL-RESET — As-of staged Filters with Cancel/Reset.
  const [appliedAsOf, setAppliedAsOf] = useState<string>(today);
  const staged = useStagedListFilters({
    applied: { asOfDate: appliedAsOf },
    empty: { asOfDate: today },
    onApply: (next) => {
      const clamped = next.asOfDate && next.asOfDate <= today ? next.asOfDate : today;
      setAppliedAsOf(clamped);
    },
  });
  const isHistorical = appliedAsOf < today;

  const queryReady = Boolean(operatingCompanyId) && enabled;

  const arQuery = useQuery({
    queryKey: ["fin20-ar-aging", operatingCompanyId, appliedAsOf],
    queryFn: () => getArAging(operatingCompanyId, appliedAsOf),
    enabled: queryReady && mode === "ar",
  });

  const apQuery = useQuery({
    queryKey: ["fin20-ap-aging", operatingCompanyId, appliedAsOf],
    queryFn: () => getApAging(operatingCompanyId, appliedAsOf),
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
      downloadCsv(`${mode}-aging-${appliedAsOf}.csv`, lines);
    },
    [mode, arRows, apRows, totals, appliedAsOf]
  );

  function printLetter() {
    if (rowCount === 0) return;
    const esc = (v: unknown) =>
      String(v ?? "—")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const partyLabel = mode === "ar" ? "Customer" : "Vendor";
    const titleKind = mode === "ar" ? "Accounts receivable aging" : "Accounts payable aging";
    const bucketHead = BUCKET_COLS.map((c) => `<th style="text-align:right">${esc(c.label)}</th>`).join("");
    const rowsHtml =
      mode === "ar"
        ? arRows
            .map(
              (r) => `<tr>
          <td>${esc(r.customer_name)}</td>
          <td style="text-align:right">${esc(r.open_invoice_count)}</td>
          ${BUCKET_COLS.map((c) => `<td style="text-align:right">${esc(fmtCents(r[c.key]))}</td>`).join("")}
        </tr>`,
            )
            .join("")
        : apRows
            .map(
              (r) => `<tr>
          <td>${esc(r.vendor_name)}</td>
          <td style="text-align:right">${esc(r.open_bill_count)}</td>
          ${BUCKET_COLS.map((c) => `<td style="text-align:right">${esc(fmtCents(r[c.key]))}</td>`).join("")}
        </tr>`,
            )
            .join("");
    const totalsHtml = totals
      ? `<tr>
          <th>${esc("TOTAL")}</th>
          <th></th>
          ${BUCKET_COLS.map((c) => `<th style="text-align:right">${esc(fmtCents(totals[c.key]))}</th>`).join("")}
        </tr>`
      : "";
    printLetterHtml({
      title: `${mode === "ar" ? "A/R" : "A/P"} aging as of ${appliedAsOf}`,
      bodyHtml: `
        <h1>${esc(titleKind)}</h1>
        <div class="meta">As of ${esc(fmtDate(appliedAsOf))} · printed ${esc(new Date().toLocaleString())}</div>
        <table>
          <tbody>
            ${BUCKET_COLS.map(
              (c) =>
                `<tr><th>${esc(c.label)}</th><td>${esc(fmtCents(totals?.[c.key] ?? 0))}</td></tr>`,
            ).join("")}
          </tbody>
        </table>
        <h1 style="margin-top:20px">By ${esc(partyLabel.toLowerCase())}</h1>
        <table>
          <thead>
            <tr>
              <th>${esc(partyLabel)}</th>
              <th style="text-align:right">Open</th>
              ${bucketHead}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="${2 + BUCKET_COLS.length}">No rows</td></tr>`}
            ${totalsHtml}
          </tbody>
        </table>
      `,
    });
  }

  if (!flagLoading && !enabled) {
    return (
      <div className="space-y-4">
        <PageHeader title="AR / AP Aging" subtitle="Accounts receivable & payable aging (read-only)" />
        <FinanceModuleTabs />
        <div className="rounded-sm border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
          AR / AP aging is not yet enabled for this account.
          <p className="mt-1 text-xs text-gray-400">This report is turned on per operating company and isn’t active for the company you have selected — this is expected, not an error. Contact the owner or an administrator to enable it, or switch to a company where it’s already on.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="AR / AP Aging"
        subtitle="Accounts receivable & payable aging, as of any date (read-only, per entity)"
        actions={
          <div className="flex flex-wrap items-end gap-2 print:hidden">
            <CollapsedListFilters
              activeFilterCount={appliedAsOf !== today ? 1 : 0}
              onApply={staged.apply}
              onReset={staged.reset}
              onCancel={staged.cancel}
              applyDisabled={!staged.dirty}
              testIdPrefix="finance-ar-ap-aging"
              className="rounded-sm border border-gray-200 bg-white p-2"
            >
              <label className="text-[11px] font-medium text-gray-500">
                As of
                <DatePicker
                  value={staged.draft.asOfDate}
                  max={today}
                  onChange={(next) => {
                    staged.setDraft({
                      asOfDate: next && next <= today ? next : today,
                    });
                  }}
                  className="mt-1 h-9 bg-white tabular-nums"
                />
              </label>
            </CollapsedListFilters>
            <button
              type="button"
              onClick={handleExport}
              disabled={rowCount === 0}
              className="h-9 px-3 text-[13px] rounded-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={printLetter}
              disabled={rowCount === 0}
              className="h-9 px-3 text-[13px] rounded-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
          onClick={() => setMode("ar")}
          className={[
            "h-9 px-4 text-[13px] rounded-sm border font-medium",
            mode === "ar" ? "border-slate-700 bg-slate-700 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
          ].join(" ")}
        >
          A/R — by Customer
        </button>
        <button
          type="button"
          onClick={() => setMode("ap")}
          className={[
            "h-9 px-4 text-[13px] rounded-sm border font-medium",
            mode === "ap" ? "border-slate-700 bg-slate-700 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
          ].join(" ")}
        >
          A/P — by Vendor
        </button>
      </div>

      <p className="text-xs text-gray-400">
        {isHistorical
          ? `Historical aging as of ${fmtDate(appliedAsOf)} — each ${mode === "ar" ? "invoice" : "bill"}'s open balance reconstructed from payments dated on or before that date.`
          : `Aging as of today (${fmtDate(appliedAsOf)}), computed live from the canonical ledger views.`}{" "}
        Expand a row (▸) to drill into open {mode === "ar" ? "invoices" : "bills"}.
      </p>

      {!operatingCompanyId ? (
        <div className="rounded-sm border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
          Select an operating company to view aging.
        </div>
      ) : isError ? (
        <ListErrorState
          title="Couldn't load aging"
          status={0}
          message={((mode === "ar" ? arQuery.error : apQuery.error) as Error)?.message ?? "Failed to load aging."}
          onRetry={() => void (mode === "ar" ? arQuery.refetch() : apQuery.refetch())}
        />
      ) : (
        <div className="space-y-2">
          {mode === "ar" ? (
            <ParityTable
              key={appliedAsOf}
              columns={AR_COLUMNS}
              rows={arRows}
              rowKey={(r) => r.customer_id}
              loading={isLoading}
              emptyText="No open balances."
              storageKey="ar-aging-by-customer"
              tableTestId="ar-aging-table"
              renderExpanded={(r) => (
                <ArInvoicesDrill operatingCompanyId={operatingCompanyId} customer={r} asOfDate={appliedAsOf} />
              )}
            />
          ) : (
            <ParityTable
              key={appliedAsOf}
              columns={AP_COLUMNS}
              rows={apRows}
              rowKey={(r) => r.vendor_id}
              loading={isLoading}
              emptyText="No open balances."
              storageKey="ap-aging-by-vendor"
              tableTestId="ap-aging-table"
              renderExpanded={(r) => (
                <ApBillsDrill operatingCompanyId={operatingCompanyId} vendor={r} asOfDate={appliedAsOf} />
              )}
            />
          )}
          {totals && rowCount > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 rounded-sm border-t-2 border-gray-300 bg-gray-50 px-3 py-2 text-sm">
              <span className="mr-auto font-semibold text-gray-900">Grand total</span>
              {BUCKET_COLS.map((c) => (
                <span key={c.key} className="whitespace-nowrap">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{c.label}</span>{" "}
                  <span className="tabular-nums font-semibold text-gray-900">{fmtCents(totals[c.key])}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ArApAgingPage;
