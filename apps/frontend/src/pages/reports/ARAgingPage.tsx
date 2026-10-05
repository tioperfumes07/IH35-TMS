import { useEffect, useMemo, useState } from "react";
import { EntityLink } from "../../components/shared/EntityLink";
import { AmountLink } from "../../components/shared/AmountLink";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { exportArAging, getArAgingReport, type ARAgingRow } from "../../api/reports";
import { mmmDd, mmmDdTime } from "../../lib/formatDate";
import { companyToday } from "../../lib/businessDate";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/Combobox";
import { ReportsSubNav } from "./ReportsSubNav";
import { ReportFilterBar } from "../../components/reports/ReportFilterBar";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useStagedListFilters } from "../../components/table";
// ACCT-F411 — AR_BUCKET_0_30 is named in agingDrillThrough, not spelled out here: the "0–30"
// column is current + 1-30 and guessing one of the two would drill to half the money it shows.
import {
  AR_BUCKET_0_30,
  arAgingBucketFilter,
  arAgingCustomerProfileHref,
  arAgingInvoiceFilter,
  arAgingInvoiceListHref,
} from "./agingDrillThrough";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorState } from "../../components/ListErrorState";
import { useExportAction } from "../../hooks/useExportAction";
import { EntityPicker } from "../../components/EntityPicker";
import { printLetterHtml } from "../../lib/openPrintableDocument";

import { formatUsdCents } from "../../lib/money";
import { UnclearedDocumentsNote } from "../../components/accounting/UnclearedDocumentsNote";

// GLB-05 -- delegates to the canonical formatter instead of reimplementing an identical
// local currency formatter (same shape lib/money.ts already covers).
function money(cents: number) {
  if (!cents) return "—";
  return formatUsdCents(cents);
}

type ARAgingRowWithBucket = ARAgingRow & { bucket_0_30_cents: number };

type ARAgingFilters = {
  asOfDate: string;
  minBal: string;
  bucketFilter: "all" | "61+";
  customerId: string;
};

export function ARAgingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const today = companyToday();
  const deepLinkCustomerId = searchParams.get("customer_id")?.trim() ?? "";
  const emptyFilters: ARAgingFilters = { asOfDate: today, minBal: "", bucketFilter: "all", customerId: "" };
  const [appliedFilters, setAppliedFilters] = useState<ARAgingFilters>({ ...emptyFilters, customerId: deepLinkCustomerId });
  const staged = useStagedListFilters({
    applied: appliedFilters,
    empty: emptyFilters,
    onApply: setAppliedFilters,
  });
  const [reportSearch, setReportSearch] = useState("");
  const exportAction = useExportAction();
  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, customerId: deepLinkCustomerId }));
  }, [deepLinkCustomerId]);

  const query = useQuery({
    queryKey: ["reports", "ar-aging", companyId, appliedFilters.asOfDate],
    queryFn: () => getArAgingReport(companyId, appliedFilters.asOfDate),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];

  const kpis = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.total_open_cents, 0);
    const day0_30 = rows.reduce((s, r) => s + r.current_cents + r.bucket_1_30_cents, 0);
    const day31_60 = rows.reduce((s, r) => s + r.bucket_31_60_cents, 0);
    const day61p = rows.reduce((s, r) => s + r.bucket_61_90_cents + r.bucket_91_plus_cents, 0);
    const cleared = rows.reduce((s, r) => s + r.cleared_open_cents, 0);
    const uncleared = rows.reduce((s, r) => s + r.uncleared_cents, 0);
    return { total, day0_30, day31_60, day61p, cleared, uncleared };
  }, [rows]);

  const minCents = appliedFilters.minBal.trim() === "" ? 0 : Math.round(Number(appliedFilters.minBal) * 100) || 0;

  const filtered = useMemo<ARAgingRowWithBucket[]>(() => {
    const q = reportSearch.toLowerCase();
    return rows
      .filter((r) => {
        if (appliedFilters.customerId && r.customer_id !== appliedFilters.customerId) return false;
        if (r.total_open_cents < minCents) return false;
        if (appliedFilters.bucketFilter === "61+") {
          const late = r.bucket_61_90_cents + r.bucket_91_plus_cents;
          if (late <= 0) return false;
        }
        if (q && !String(r.customer_name ?? "").toLowerCase().includes(q)) return false;
        return true;
      })
      .map((r) => ({ ...r, bucket_0_30_cents: r.current_cents + r.bucket_1_30_cents }));
  }, [rows, appliedFilters.customerId, appliedFilters.bucketFilter, minCents, reportSearch]);

  const columns = useMemo<ParityColumn<ARAgingRowWithBucket>[]>(
    () => [
      // ACCT-F410-C — the REAL A/R defect, fixed the right way this time. This cell was an
      // EntityLink to the customer with NO stopPropagation, so clicking the name fired the name's
      // navigation AND the row's onRowClick: two navigations racing on one click. ACCT-F410-B
      // "fixed" it by replacing the entity link with an AmountLink to the invoice list, which CC-2
      // correctly measured as duplicating the Total cell's destination and losing the entity link.
      // The fix is the missing stopPropagation, matching A/P: name -> customer, amounts ->
      // transactions, row -> open invoices. Three destinations, no race, no duplication.
      {
        key: "customer_name",
        label: "Customer",
        sortable: true,
        render: (r) => (
          <EntityLink
            kind="customer"
            id={r.customer_id}
            label={entityLabel(r.customer_name, r.customer_id, "Customer")}
            className="font-medium text-gray-900"
            onClick={(event) => event.stopPropagation()}
          />
        ),
      },
      // ACCT-F411 — the Total is every open invoice for this customer, which the has_balance list
      // already reproduces, so no bucket rides along.
      {
        key: "total_open_cents",
        label: "Total",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (r) => (
          <AmountLink
            filter={arAgingInvoiceFilter(r.customer_id)}
            data-testid={`ar-aging-total-${r.customer_id}`}
          >
            {money(r.total_open_cents)}
          </AmountLink>
        ),
      },
      { key: "cleared_open_cents", label: "Cleared", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.cleared_open_cents) },
      { key: "uncleared_cents", label: "Not cleared", sortable: true, render: (r) => <UnclearedDocumentsNote docs={r.uncleared_documents} /> },
      {
        key: "bucket_0_30_cents",
        label: "0–30",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (r) => (
          <AmountLink
            filter={arAgingBucketFilter(r.customer_id, AR_BUCKET_0_30, appliedFilters.asOfDate)}
            data-testid={`ar-aging-bucket-0-30-${r.customer_id}`}
          >
            {money(r.bucket_0_30_cents)}
          </AmountLink>
        ),
      },
      {
        key: "bucket_31_60_cents",
        label: "31–60",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (r) => (
          <AmountLink
            filter={arAgingBucketFilter(r.customer_id, "d31_60", appliedFilters.asOfDate)}
            data-testid={`ar-aging-bucket-31-60-${r.customer_id}`}
          >
            {money(r.bucket_31_60_cents)}
          </AmountLink>
        ),
      },
      {
        key: "bucket_61_90_cents",
        label: "61–90",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (r) => (
          <AmountLink
            filter={arAgingBucketFilter(r.customer_id, "d61_90", appliedFilters.asOfDate)}
            data-testid={`ar-aging-bucket-61-90-${r.customer_id}`}
          >
            {money(r.bucket_61_90_cents)}
          </AmountLink>
        ),
      },
      {
        key: "bucket_91_plus_cents",
        label: "91+",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (r) => (
          <AmountLink
            filter={arAgingBucketFilter(r.customer_id, "d90_plus", appliedFilters.asOfDate)}
            data-testid={`ar-aging-bucket-91-plus-${r.customer_id}`}
          >
            {money(r.bucket_91_plus_cents)}
          </AmountLink>
        ),
      },
      { key: "last_payment_date", label: "Last Pmt", sortable: true, render: (r) => (r.last_payment_date ? mmmDd(r.last_payment_date) : "—") },
    ],
    // ACCT-F411 — asOfDate is now IN the cells (a bucket means nothing without it), so it must be
    // a dependency or every drill would keep carrying the as-of from first render after the filter
    // changes: the figures would update and the links would not.
    [appliedFilters.asOfDate],
  );

  function exportCsv() {
    const header = ["Customer", "Total", "0-30", "31-60", "61-90", "91+", "Last Pmt"];
    const lines = filtered.map((r) =>
      [
        JSON.stringify(r.customer_name),
        r.total_open_cents,
        r.bucket_0_30_cents,
        r.bucket_31_60_cents,
        r.bucket_61_90_cents,
        r.bucket_91_plus_cents,
        r.last_payment_date ?? "",
      ].join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const ur = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = ur;
    a.download = `ar-aging-${appliedFilters.asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(ur);
  }

  function printLetter() {
    const esc = (v: unknown) =>
      String(v ?? "—")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const rowsHtml = filtered
      .map(
        (r) => `<tr>
          <td>${esc(r.customer_name)}</td>
          <td className="text-right tabular-nums" style="text-align:right">${esc(money(r.total_open_cents))}</td>
          <td className="text-right tabular-nums" style="text-align:right">${esc(money(r.bucket_0_30_cents))}</td>
          <td className="text-right tabular-nums" style="text-align:right">${esc(money(r.bucket_31_60_cents))}</td>
          <td className="text-right tabular-nums" style="text-align:right">${esc(money(r.bucket_61_90_cents))}</td>
          <td className="text-right tabular-nums" style="text-align:right">${esc(money(r.bucket_91_plus_cents))}</td>
          <td>${esc(r.last_payment_date ? mmmDd(r.last_payment_date) : "—")}</td>
        </tr>`,
      )
      .join("");
    printLetterHtml({
      title: `A/R aging as of ${appliedFilters.asOfDate}`,
      bodyHtml: `
        <h1>Accounts receivable aging</h1>
        <div class="meta">As of ${esc(mmmDd(appliedFilters.asOfDate))} · Accrual · printed ${esc(mmmDdTime(new Date()))}</div>
        <table>
          <tbody>
            <tr><th>Total open</th><td className="text-right tabular-nums">${esc(money(kpis.total))}</td></tr>
            <tr><th>0-30</th><td className="text-right tabular-nums">${esc(money(kpis.day0_30))}</td></tr>
            <tr><th>31-60</th><td className="text-right tabular-nums">${esc(money(kpis.day31_60))}</td></tr>
            <tr><th>61+</th><td className="text-right tabular-nums">${esc(money(kpis.day61p))}</td></tr>
          </tbody>
        </table>
        <h1 style="margin-top:20px">By customer</h1>
        <table>
          <thead>
            <tr>
              <th>Customer</th><th style="text-align:right">Total</th>
              <th style="text-align:right">0-30</th><th style="text-align:right">31-60</th>
              <th style="text-align:right">61-90</th><th style="text-align:right">91+</th>
              <th>Last payment</th>
            </tr>
          </thead>
          <tbody>${rowsHtml || `<tr><td colspan="7">No open A/R</td></tr>`}</tbody>
        </table>
      `,
    });
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>
      <ReportsSubNav />
      <PageHeader
        title="A/R aging"
        subtitle={`As of ${mmmDd(appliedFilters.asOfDate)} · open invoices by customer · Accrual basis`}
        backHref="/reports"
        breadcrumb={["Reports", "A/R Aging"]}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={printLetter}>
              Print this page
            </Button>
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!companyId || exportAction.pending}
              onClick={() =>
                void exportAction.run(
                  () =>
                    exportArAging({
                      operating_company_id: companyId,
                      as_of_date: appliedFilters.asOfDate,
                      format: "pdf",
                    }),
                  "A/R aging export failed",
                )
              }
            >
              Export PDF
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!companyId || exportAction.pending}
              onClick={() =>
                void exportAction.run(
                  () =>
                    exportArAging({
                      operating_company_id: companyId,
                      as_of_date: appliedFilters.asOfDate,
                      format: "xlsx",
                    }),
                  "A/R aging export failed",
                )
              }
            >
              Export XLSX
            </Button>
          </div>
        }
      />
      {!companyId ? <p className="text-xs text-red-600">Select an operating company.</p> : null}
      <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        This report is always accrual basis under the owner-locked reporting policy.
      </p>
      {query.isError ? <ListErrorState title="Couldn't load A/R aging" status={0} message={(query.error as Error)?.message} onRetry={() => void query.refetch()} /> : null}
      {exportAction.error ? (
        <p role="alert" className="text-xs text-red-700">
          {exportAction.error}
        </p>
      ) : null}

      <ReportFilterBar
        testIdPrefix="reports-ar-aging"
        fromDate={staged.draft.asOfDate}
        toDate={null}
        onFromDateChange={(d) => staged.setDraft((p) => ({ ...p, asOfDate: d ?? today }))}
        onToDateChange={() => {}}
        onPresetSelect={(preset) => {
          const next = new URLSearchParams(searchParams);
          next.set("preset", preset);
          setSearchParams(next, { replace: true });
        }}
        search={reportSearch}
        onSearchChange={setReportSearch}
        onApply={staged.apply}
        onCancel={staged.cancel}
        onReset={staged.reset}
        applyDisabled={!staged.dirty}
      >
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-600">Customer</span>
          <EntityPicker
            kind="customer"
            operatingCompanyId={companyId}
            value={staged.draft.customerId || null}
            onChange={(next) => {
              const updated = next ?? "";
              staged.setDraft((p) => ({ ...p, customerId: updated }));
              const params = new URLSearchParams(searchParams);
              if (updated) params.set("customer_id", updated);
              else params.delete("customer_id");
              setSearchParams(params, { replace: true });
            }}
            allowCreate={false}
            placeholder="All customers"
            dataTestId="ar-aging-filter-customer"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-600">Min bal ($)</span>
          <MoneyInput
            valueDollars={staged.draft.minBal ? Number(staged.draft.minBal) : null}
            onChangeDollars={(d) => staged.setDraft((p) => ({ ...p, minBal: d == null ? "" : String(d) }))}
            ariaLabel="Min balance ($)"
            className="w-24"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-600">Bucket</span>
          <SelectCombobox
            className="h-7 rounded-sm border border-slate-300 px-2 text-xs"
            value={staged.draft.bucketFilter}
            onChange={(e) => staged.setDraft((p) => ({ ...p, bucketFilter: e.target.value as ARAgingFilters["bucketFilter"] }))}
          >
            <option value="all">All</option>
            <option value="61+">61+ days</option>
          </SelectCombobox>
        </label>
      </ReportFilterBar>

      {kpis.uncleared > 0 ? (
        <p className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700">
          Cleared {money(kpis.cleared)}. Applied payments that have not been matched or categorized in Banking are named not cleared beside each customer.
        </p>
      ) : null}

      <div className="grid gap-2 md:grid-cols-5">
        <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
          <div className="text-section-header font-semibold uppercase text-gray-500">Total open</div>
          <div className="text-page-title font-semibold">{money(kpis.total)}</div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
          <div className="text-section-header font-semibold uppercase text-gray-500">Cleared</div>
          <div className="text-page-title font-semibold">{money(kpis.cleared)}</div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
          <div className="text-section-header font-semibold uppercase text-gray-500">0–30 days</div>
          <div className="text-page-title font-semibold">{money(kpis.day0_30)}</div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
          <div className="text-section-header font-semibold uppercase text-gray-500">31–60 days</div>
          <div className="text-page-title font-semibold">{money(kpis.day31_60)}</div>
        </div>
        <div
          className={`rounded-sm border bg-white px-3 py-2 ${kpis.day61p > 1_000_000 ? "border-2 border-[#dc2626]" : "border border-gray-200"}`}
        >
          <div className="text-section-header font-semibold uppercase text-gray-500">61+ days</div>
          <div className="text-page-title font-semibold">{money(kpis.day61p)}</div>
        </div>
      </div>

      <ParityTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.customer_id}
        loading={query.isPending || (query.isFetching && filtered.length === 0)}
        storageKey="ar-aging"
        emptyText="No rows"
        // RPT-PAR-1: row drill → open invoices for this customer (server has_balance).
        // Open invoices + Customer profile kept as keyboard-reachable additive row actions.
        onRowClick={(r) => navigate(arAgingInvoiceListHref(r.customer_id))}
        rowActions={(r) => (
          <div className="flex flex-wrap justify-end gap-1">
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Open invoices for ${entityLabel(r.customer_name, r.customer_id, "Customer")}`}
              onClick={() => navigate(arAgingInvoiceListHref(r.customer_id))}
            >
              Open invoices
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Open customer profile for ${entityLabel(r.customer_name, r.customer_id, "Customer")}`}
              onClick={() => navigate(arAgingCustomerProfileHref(r.customer_id))}
            >
              Customer profile
            </Button>
          </div>
        )}
      />
    </div>
  );
}
