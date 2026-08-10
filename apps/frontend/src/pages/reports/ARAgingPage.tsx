import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { exportArAging, getArAgingReport, type ARAgingRow } from "../../api/reports";
import { formatDateUS } from "../../lib/formatDate";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { ReportsSubNav } from "./ReportsSubNav";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { arAgingCustomerProfileHref, arAgingInvoiceListHref } from "./agingDrillThrough";
import { entityLabel } from "../../lib/entity-label";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

type ARAgingRowWithBucket = ARAgingRow & { bucket_0_30_cents: number };

export function ARAgingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [minBal, setMinBal] = useState("");
  const [bucketFilter, setBucketFilter] = useState<"all" | "61+">("all");

  const query = useQuery({
    queryKey: ["reports", "ar-aging", companyId, asOf],
    queryFn: () => getArAgingReport(companyId, asOf),
    enabled: Boolean(companyId),
  });

  const focusCustomerId = searchParams.get("customer_id");

  useEffect(() => {
    if (!focusCustomerId || !query.data) return;
    const row = query.data.rows.find((r) => r.customer_id === focusCustomerId);
    if (row) setSearch(row.customer_name);
  }, [focusCustomerId, query.data]);

  const rows = query.data?.rows ?? [];

  const kpis = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.total_open_cents, 0);
    const day0_30 = rows.reduce((s, r) => s + r.current_cents + r.bucket_1_30_cents, 0);
    const day31_60 = rows.reduce((s, r) => s + r.bucket_31_60_cents, 0);
    const day61p = rows.reduce((s, r) => s + r.bucket_61_90_cents + r.bucket_91_plus_cents, 0);
    return { total, day0_30, day31_60, day61p };
  }, [rows]);

  const minCents = minBal.trim() === "" ? 0 : Math.round(Number(minBal) * 100) || 0;

  const filtered = useMemo<ARAgingRowWithBucket[]>(() => {
    return rows
      .filter((r) => {
        if (search.trim() && !r.customer_name.toLowerCase().includes(search.trim().toLowerCase())) return false;
        if (r.total_open_cents < minCents) return false;
        if (bucketFilter === "61+") {
          const late = r.bucket_61_90_cents + r.bucket_91_plus_cents;
          if (late <= 0) return false;
        }
        return true;
      })
      .map((r) => ({ ...r, bucket_0_30_cents: r.current_cents + r.bucket_1_30_cents }));
  }, [rows, search, minCents, bucketFilter]);

  const columns = useMemo<ParityColumn<ARAgingRowWithBucket>[]>(
    () => [
      { key: "customer_name", label: "Customer", sortable: true, render: (r) => <span className="font-medium text-gray-900">{entityLabel(r.customer_name, r.customer_id, "Customer")}</span> },
      { key: "total_open_cents", label: "Total", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.total_open_cents) },
      { key: "bucket_0_30_cents", label: "0–30", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.bucket_0_30_cents) },
      { key: "bucket_31_60_cents", label: "31–60", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.bucket_31_60_cents) },
      { key: "bucket_61_90_cents", label: "61–90", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.bucket_61_90_cents) },
      { key: "bucket_91_plus_cents", label: "91+", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.bucket_91_plus_cents) },
      { key: "last_payment_date", label: "Last Pmt", sortable: true, render: (r) => (r.last_payment_date ? formatDateUS(r.last_payment_date) : "—") },
    ],
    [],
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
    a.download = `ar-aging-${asOf}.csv`;
    a.click();
    URL.revokeObjectURL(ur);
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
        subtitle={`As of ${formatDateUS(asOf)} · open invoices by customer · Accrual basis`}
        backHref="/reports"
        breadcrumb={["Reports", "A/R Aging"]}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              Print this page
            </Button>
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!companyId}
              onClick={() =>
                exportArAging({
                  operating_company_id: companyId,
                  as_of_date: asOf,
                  format: "pdf",
                })
              }
            >
              Export PDF
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!companyId}
              onClick={() =>
                exportArAging({
                  operating_company_id: companyId,
                  as_of_date: asOf,
                  format: "xlsx",
                })
              }
            >
              Export XLSX
            </Button>
          </div>
        }
      />
      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        This report is always accrual basis per CPA sign-off.
      </p>
      {query.isError ? <p className="text-sm text-red-600">Failed to load report.</p> : null}

      <div className="no-print grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-4">
        <label className="text-xs text-gray-600">
          As-of date
          <DatePicker className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2" value={asOf} onChange={(next) => setAsOf(next)} />
        </label>
        <label className="text-xs text-gray-600">
          Customer contains
          <input className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="text-xs text-gray-600">
          Min balance ($)
          {/* M-1: dollars-mode filter; Math.round(minBal*100) byte-for-byte. */}
          <MoneyInput valueDollars={minBal ? Number(minBal) : null} onChangeDollars={(d) => setMinBal(d == null ? "" : String(d))} ariaLabel="Min balance ($)" className="mt-1 w-full" />
        </label>
        <label className="text-xs text-gray-600">
          Aging bucket
          <SelectCombobox className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2" value={bucketFilter} onChange={(e) => setBucketFilter(e.target.value as typeof bucketFilter)}>
            <option value="all">All</option>
            <option value="61+">61+ days past due portion</option>
          </SelectCombobox>
        </label>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase text-gray-500">Total open</div>
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
