import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { exportApAging, getApAgingReport, type APAgingRow } from "../../api/reports";
import { formatDateUS } from "../../lib/formatDate";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { ReportsSubNav } from "./ReportsSubNav";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useUrlSort } from "../../hooks/useUrlSort";
import { apAgingBillsListHref, apAgingVendorProfileHref } from "./agingDrillThrough";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityPicker } from "../../components/parity/EntityPicker";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function isVendorUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type APAgingRowWithBucket = APAgingRow & { bucket_0_30_cents: number };

export function APAgingPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  // BANK-SORT-ROLLOUT-ACCT (A/P Aging follow-up): every visible column header sorts ASC/DESC;
  // sort persists in the URL (?sort=&dir=) so it survives reload / is shareable.
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  // CLS-FILTER-GEAR-APPLY — DatePicker drafts; query only after Apply (BalanceSheet pattern).
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [appliedAsOf, setAppliedAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [minBal, setMinBal] = useState("");
  const [bucketFilter, setBucketFilter] = useState<"all" | "61+">("all");

  // LST-F5179 — visible EntityPicker (URL-only name seed is not reverse chrome).
  const deepLinkVendorId = searchParams.get("vendor_id")?.trim() ?? "";
  const [vendorFilter, setVendorFilterState] = useState(deepLinkVendorId);
  useEffect(() => {
    setVendorFilterState(deepLinkVendorId);
  }, [deepLinkVendorId]);
  const effectiveVendorId = vendorFilter || deepLinkVendorId;
  function setVendorFilter(next: string) {
    setVendorFilterState(next);
    const p = new URLSearchParams(searchParams);
    if (next) p.set("vendor_id", next);
    else p.delete("vendor_id");
    setSearchParams(p, { replace: true });
  }

  const query = useQuery({
    queryKey: ["reports", "ap-aging", companyId, appliedAsOf],
    queryFn: () => getApAgingReport(companyId, appliedAsOf),
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

  const minCents = minBal.trim() === "" ? 0 : Math.round(Number(minBal) * 100) || 0;

  const filtered = useMemo<APAgingRowWithBucket[]>(() => {
    return rows
      .filter((r) => {
        if (effectiveVendorId && r.vendor_id !== effectiveVendorId) return false;
        if (r.total_open_cents < minCents) return false;
        if (bucketFilter === "61+") {
          const late = r.bucket_61_90_cents + r.bucket_91_plus_cents;
          if (late <= 0) return false;
        }
        return true;
      })
      .map((r) => ({ ...r, bucket_0_30_cents: r.current_cents + r.bucket_1_30_cents }));
  }, [rows, effectiveVendorId, minCents, bucketFilter]);

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
    a.download = `ap-aging-${appliedAsOf}.csv`;
    a.click();
    URL.revokeObjectURL(ur);
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
        subtitle={`As of ${formatDateUS(appliedAsOf)} · open bills by vendor · Accrual basis`}
        backHref="/reports"
        breadcrumb={["Reports", "A/P Aging"]}
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
                exportApAging({
                  operating_company_id: companyId,
                  as_of_date: appliedAsOf,
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
                exportApAging({
                  operating_company_id: companyId,
                  as_of_date: appliedAsOf,
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
        This report is always accrual basis under the owner-locked reporting policy.
      </p>
      {query.isError ? <ListErrorState title="Couldn't load A/P aging" status={0} message={(query.error as Error)?.message} onRetry={() => void query.refetch()} /> : null}

      <div className="no-print grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-4 lg:grid-cols-5">
        <label className="text-xs text-gray-600">
          As-of date
          <DatePicker className="mt-1 h-9 w-full" value={asOf} onChange={(next) => setAsOf(next)} />
        </label>
        <label className="text-xs text-gray-600">
          Vendor
          <EntityPicker
            kind="vendor"
            operatingCompanyId={companyId}
            value={effectiveVendorId || null}
            onChange={(next) => setVendorFilter(next ?? "")}
            allowCreate={false}
            placeholder="All vendors"
            className="mt-1"
            dataTestId="ap-aging-filter-vendor"
          />
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
        <div className="flex items-end">
          <Button size="sm" className="h-9 w-full" onClick={() => setAppliedAsOf(asOf)} disabled={asOf === appliedAsOf}>
            Apply
          </Button>
        </div>
      </div>

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
