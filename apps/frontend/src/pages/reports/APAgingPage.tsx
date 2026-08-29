import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { exportApAging, getApAgingReport, type APAgingRow } from "../../api/reports";
import { formatDateUS } from "../../lib/formatDate";
import { companyToday } from "../../lib/businessDate";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { ReportsSubNav } from "./ReportsSubNav";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useUrlSort } from "../../hooks/useUrlSort";
import { apAgingBillsListHref, apAgingVendorProfileHref } from "./agingDrillThrough";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";
import { useExportAction } from "../../hooks/useExportAction";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { printLetterHtml } from "../../lib/openPrintableDocument";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function isVendorUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type APAgingRowWithBucket = APAgingRow & { bucket_0_30_cents: number };

type APAgingFilters = {
  asOfDate: string;
  minBal: string;
  bucketFilter: "all" | "61+";
  vendorId: string;
};

export function APAgingPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  // BANK-SORT-ROLLOUT-ACCT (A/P Aging follow-up): every visible column header sorts ASC/DESC;
  // sort persists in the URL (?sort=&dir=) so it survives reload / is shareable.
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  const today = companyToday();
  const deepLinkVendorId = searchParams.get("vendor_id")?.trim() ?? "";
  const emptyFilters: APAgingFilters = { asOfDate: today, minBal: "", bucketFilter: "all", vendorId: "" };
  const [appliedFilters, setAppliedFilters] = useState<APAgingFilters>({ ...emptyFilters, vendorId: deepLinkVendorId });
  const exportAction = useExportAction();
  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, vendorId: deepLinkVendorId }));
  }, [deepLinkVendorId]);
  const staged = useStagedListFilters({
    applied: appliedFilters,
    empty: emptyFilters,
    onApply: (next) => {
      setAppliedFilters(next);
      const p = new URLSearchParams(searchParams);
      if (next.vendorId) p.set("vendor_id", next.vendorId);
      else p.delete("vendor_id");
      setSearchParams(p, { replace: true });
    },
  });

  const query = useQuery({
    queryKey: ["reports", "ap-aging", companyId, appliedFilters.asOfDate],
    queryFn: () => getApAgingReport(companyId, appliedFilters.asOfDate),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];

  const kpis = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.total_open_cents, 0);
    const day0_30 = rows.reduce((s, r) => s + r.current_cents + r.bucket_1_30_cents, 0);
    const day31_60 = rows.reduce((s, r) => s + r.bucket_31_60_cents, 0);
    const day61p = rows.reduce((s, r) => s + r.bucket_61_90_cents + r.bucket_91_plus_cents, 0);
    return { total, day0_30, day31_60, day61p };
  }, [rows]);

  const minCents = appliedFilters.minBal.trim() === "" ? 0 : Math.round(Number(appliedFilters.minBal) * 100) || 0;

  const filtered = useMemo<APAgingRowWithBucket[]>(() => {
    return rows
      .filter((r) => {
        if (appliedFilters.vendorId && r.vendor_id !== appliedFilters.vendorId) return false;
        if (r.total_open_cents < minCents) return false;
        if (appliedFilters.bucketFilter === "61+") {
          const late = r.bucket_61_90_cents + r.bucket_91_plus_cents;
          if (late <= 0) return false;
        }
        return true;
      })
      .map((r) => ({ ...r, bucket_0_30_cents: r.current_cents + r.bucket_1_30_cents }));
  }, [rows, appliedFilters.vendorId, appliedFilters.bucketFilter, minCents]);

  function exportCsv() {
    const header = ["Vendor", "Total", "0-30", "31-60", "61-90", "91+", "Last Pmt"];
    const lines = filtered.map((r) =>
      [
        JSON.stringify(r.vendor_name),
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
    a.download = `ap-aging-${appliedFilters.asOfDate}.csv`;
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
          <td>${esc(r.vendor_name)}</td>
          <td style="text-align:right">${esc(money(r.total_open_cents))}</td>
          <td style="text-align:right">${esc(money(r.bucket_0_30_cents))}</td>
          <td style="text-align:right">${esc(money(r.bucket_31_60_cents))}</td>
          <td style="text-align:right">${esc(money(r.bucket_61_90_cents))}</td>
          <td style="text-align:right">${esc(money(r.bucket_91_plus_cents))}</td>
          <td>${esc(r.last_payment_date ? formatDateUS(r.last_payment_date) : "—")}</td>
        </tr>`,
      )
      .join("");
    printLetterHtml({
      title: `A/P aging as of ${appliedFilters.asOfDate}`,
      bodyHtml: `
        <h1>Accounts payable aging</h1>
        <div class="meta">As of ${esc(formatDateUS(appliedFilters.asOfDate))} · Accrual · printed ${esc(new Date().toLocaleString())}</div>
        <table>
          <tbody>
            <tr><th>Total open</th><td>${esc(money(kpis.total))}</td></tr>
            <tr><th>0-30</th><td>${esc(money(kpis.day0_30))}</td></tr>
            <tr><th>31-60</th><td>${esc(money(kpis.day31_60))}</td></tr>
            <tr><th>61+</th><td>${esc(money(kpis.day61p))}</td></tr>
          </tbody>
        </table>
        <h1 style="margin-top:20px">By vendor</h1>
        <table>
          <thead>
            <tr>
              <th>Vendor</th><th style="text-align:right">Total</th>
              <th style="text-align:right">0-30</th><th style="text-align:right">31-60</th>
              <th style="text-align:right">61-90</th><th style="text-align:right">91+</th>
              <th>Last payment</th>
            </tr>
          </thead>
          <tbody>${rowsHtml || `<tr><td colspan="7">No open A/P</td></tr>`}</tbody>
        </table>
      `,
    });
  }

  const columns = useMemo<ParityColumn<APAgingRowWithBucket>[]>(
    () => [
      { key: "vendor_name", label: "Vendor", sortable: true, render: (r) => <EntityLink kind="vendor" id={r.vendor_id} label={entityLabel(r.vendor_name, r.vendor_id, "Vendor")} className="font-medium text-gray-900" onClick={(event) => event.stopPropagation()} /> },
      { key: "total_open_cents", label: "Total", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.total_open_cents) },
      { key: "bucket_0_30_cents", label: "0–30", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.bucket_0_30_cents) },
      { key: "bucket_31_60_cents", label: "31–60", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.bucket_31_60_cents) },
      { key: "bucket_61_90_cents", label: "61–90", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.bucket_61_90_cents) },
      { key: "bucket_91_plus_cents", label: "91+", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.bucket_91_plus_cents) },
      { key: "last_payment_date", label: "Last Pmt", sortable: true, render: (r) => (r.last_payment_date ? formatDateUS(r.last_payment_date) : "—") },
    ],
    [],
  );

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
        title="A/P aging"
        subtitle={`As of ${formatDateUS(appliedFilters.asOfDate)} · open bills by vendor · Accrual basis`}
        backHref="/reports"
        breadcrumb={["Reports", "A/P Aging"]}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={printLetter} disabled={!query.data}>
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
                    exportApAging({
                      operating_company_id: companyId,
                      as_of_date: appliedFilters.asOfDate,
                      format: "pdf",
                    }),
                  "A/P aging export failed",
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
                    exportApAging({
                      operating_company_id: companyId,
                      as_of_date: appliedFilters.asOfDate,
                      format: "xlsx",
                    }),
                  "A/P aging export failed",
                )
              }
            >
              Export XLSX
            </Button>
          </div>
        }
      />
      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        This report is always accrual basis under the owner-locked reporting policy.
      </p>
      {query.isError ? <ListErrorState title="Couldn't load A/P aging" status={0} message={(query.error as Error)?.message} onRetry={() => void query.refetch()} /> : null}
      {exportAction.error ? (
        <p role="alert" className="text-xs text-red-700">
          {exportAction.error}
        </p>
      ) : null}

      <CollapsedListFilters
        activeFilterCount={JSON.stringify(appliedFilters) !== JSON.stringify(emptyFilters) ? 1 : 0}
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        testIdPrefix="reports-ap-aging"
        className="no-print rounded-sm border border-gray-200 bg-white p-3"
      >
        <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-5">
          <label className="text-xs text-gray-600">
            As-of date
            <DatePicker className="mt-1 h-9 w-full" value={staged.draft.asOfDate} onChange={(next) => staged.setDraft((p) => ({ ...p, asOfDate: next }))} />
          </label>
          <label className="text-xs text-gray-600">
            Vendor
            <EntityPicker
              kind="vendor"
              operatingCompanyId={companyId}
              value={staged.draft.vendorId || null}
              onChange={(next) => staged.setDraft((p) => ({ ...p, vendorId: next ?? "" }))}
              allowCreate={false}
              placeholder="All vendors"
              className="mt-1"
              dataTestId="ap-aging-filter-vendor"
            />
          </label>
          <label className="text-xs text-gray-600">
            Min balance ($)
            <MoneyInput
              valueDollars={staged.draft.minBal ? Number(staged.draft.minBal) : null}
              onChangeDollars={(d) => staged.setDraft((p) => ({ ...p, minBal: d == null ? "" : String(d) }))}
              ariaLabel="Min balance ($)"
              className="mt-1 w-full"
            />
          </label>
          <label className="text-xs text-gray-600">
            Aging bucket
            <SelectCombobox
              className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
              value={staged.draft.bucketFilter}
              onChange={(e) => staged.setDraft((p) => ({ ...p, bucketFilter: e.target.value as APAgingFilters["bucketFilter"] }))}
            >
              <option value="all">All</option>
              <option value="61+">61+ days past due portion</option>
            </SelectCombobox>
          </label>
        </div>
      </CollapsedListFilters>

      <div className="grid gap-2 md:grid-cols-4">
        <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase text-gray-500">Total owed</div>
          <div className="text-lg font-semibold">{money(kpis.total)}</div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase text-gray-500">0–30 days</div>
          <div className="text-lg font-semibold">{money(kpis.day0_30)}</div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase text-gray-500">31–60 days</div>
          <div className="text-lg font-semibold">{money(kpis.day31_60)}</div>
        </div>
        <div
          className={`rounded-sm border bg-white px-3 py-2 ${kpis.day61p > 1_000_000 ? "border-2 border-[#dc2626]" : "border border-gray-200"}`}
        >
          <div className="text-[11px] font-semibold uppercase text-gray-500">61+ days</div>
          <div className="text-lg font-semibold">{money(kpis.day61p)}</div>
        </div>
      </div>

      <ParityTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.vendor_id}
        loading={query.isPending || (query.isFetching && filtered.length === 0)}
        storageKey="ap-aging"
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        emptyText="No rows"
        // RPT-PAR-1: row drill → bills with open balance (has_balance; includes partial).
        // Pay now + Vendor AP profile kept additively (same has_balance list for pay).
        onRowClick={(r) => {
          if (!isVendorUuid(r.vendor_id)) {
            pushToast("This row is not linked to a vendor master record. Resolve vendor UUID on bills first.", "info");
            return;
          }
          navigate(apAgingBillsListHref(r.vendor_id));
        }}
        rowActions={(r) => (
          <div className="flex flex-wrap justify-end gap-1">
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Pay now for ${entityLabel(r.vendor_name, r.vendor_id, "Vendor")}`}
              onClick={() => {
                if (!isVendorUuid(r.vendor_id)) {
                  pushToast("This row is not linked to a vendor master record. Resolve vendor UUID on bills first.", "info");
                  return;
                }
                navigate(apAgingBillsListHref(r.vendor_id));
              }}
            >
              Pay now
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Open vendor profile for ${entityLabel(r.vendor_name, r.vendor_id, "Vendor")}`}
              onClick={() => {
                if (!isVendorUuid(r.vendor_id)) {
                  pushToast("This row is not linked to a vendor master record. Resolve vendor UUID on bills first.", "info");
                  return;
                }
                navigate(apAgingVendorProfileHref(r.vendor_id));
              }}
            >
              Vendor profile
            </Button>
            <Button size="sm" variant="secondary" disabled onClick={() => pushToast("Scheduled payments ship Phase 6+", "info")}>
              Schedule payment
            </Button>
          </div>
        )}
      />
    </div>
  );
}
