import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getArAgingReport, type ARAgingRow } from "../../api/reports";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

type SortKey = keyof ARAgingRow | "bucket_0_30";

export function ARAgingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [minBal, setMinBal] = useState("");
  const [bucketFilter, setBucketFilter] = useState<"all" | "61+">("all");
  const [sortKey, setSortKey] = useState<SortKey>("total_open_cents");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (search.trim() && !r.customer_name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (r.total_open_cents < minCents) return false;
      if (bucketFilter === "61+") {
        const late = r.bucket_61_90_cents + r.bucket_91_plus_cents;
        if (late <= 0) return false;
      }
      return true;
    });
  }, [rows, search, minCents, bucketFilter]);

  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    const copy = [...filtered];
    copy.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      if (sortKey === "bucket_0_30") {
        av = a.current_cents + a.bucket_1_30_cents;
        bv = b.current_cents + b.bucket_1_30_cents;
      } else {
        av = a[sortKey as keyof ARAgingRow] as number | string;
        bv = b[sortKey as keyof ARAgingRow] as number | string;
      }
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function exportCsv() {
    const header = ["Customer", "Total", "0-30", "31-60", "61-90", "91+", "Last Pmt"];
    const lines = sorted.map((r) =>
      [
        JSON.stringify(r.customer_name),
        r.total_open_cents,
        r.current_cents + r.bucket_1_30_cents,
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
      <PageHeader
        title="A/R aging"
        subtitle={`As of ${asOf} · open invoices by customer`}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              Print this page
            </Button>
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
        }
      />
      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {query.isError ? <p className="text-sm text-red-600">Failed to load report.</p> : null}

      <div className="no-print grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-4">
        <label className="text-xs text-gray-600">
          As-of date
          <input type="date" className="mt-1 h-9 w-full rounded border border-gray-300 px-2" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
        <label className="text-xs text-gray-600">
          Customer contains
          <input className="mt-1 h-9 w-full rounded border border-gray-300 px-2" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="text-xs text-gray-600">
          Min balance ($)
          <input type="number" className="mt-1 h-9 w-full rounded border border-gray-300 px-2" value={minBal} onChange={(e) => setMinBal(e.target.value)} />
        </label>
        <label className="text-xs text-gray-600">
          Aging bucket
          <SelectCombobox className="mt-1 h-9 w-full rounded border border-gray-300 px-2" value={bucketFilter} onChange={(e) => setBucketFilter(e.target.value as typeof bucketFilter)}>
            <option value="all">All</option>
            <option value="61+">61+ days past due portion</option>
          </SelectCombobox>
        </label>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <div className="rounded border border-gray-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase text-gray-500">Total open</div>
          <div className="text-lg font-semibold">{money(kpis.total)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase text-gray-500">0–30 days</div>
          <div className="text-lg font-semibold">{money(kpis.day0_30)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase text-gray-500">31–60 days</div>
          <div className="text-lg font-semibold">{money(kpis.day31_60)}</div>
        </div>
        <div
          className={`rounded border bg-white px-3 py-2 ${kpis.day61p > 1_000_000 ? "border-2 border-[#DC3545]" : "border border-gray-200"}`}
        >
          <div className="text-[11px] font-semibold uppercase text-gray-500">61+ days</div>
          <div className="text-lg font-semibold">{money(kpis.day61p)}</div>
        </div>
      </div>

      <div className="overflow-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("customer_name")}>
                Customer
              </th>
              <th className="cursor-pointer px-3 py-2 text-right" onClick={() => toggleSort("total_open_cents")}>
                Total
              </th>
              <th className="cursor-pointer px-3 py-2 text-right" onClick={() => toggleSort("bucket_0_30")}>
                0–30
              </th>
              <th className="cursor-pointer px-3 py-2 text-right" onClick={() => toggleSort("bucket_31_60_cents")}>
                31–60
              </th>
              <th className="cursor-pointer px-3 py-2 text-right" onClick={() => toggleSort("bucket_61_90_cents")}>
                61–90
              </th>
              <th className="cursor-pointer px-3 py-2 text-right" onClick={() => toggleSort("bucket_91_plus_cents")}>
                91+
              </th>
              <th className="px-3 py-2">Last Pmt</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!query.isLoading && sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-gray-500">
                  No rows
                </td>
              </tr>
            ) : null}
            {sorted.map((r) => (
              <tr
                key={r.customer_id}
                className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                onClick={() => navigate(`/customers/${r.customer_id}?tab=billing`)}
              >
                <td className="px-3 py-2 font-medium text-gray-900">{r.customer_name}</td>
                <td className="px-3 py-2 text-right">{money(r.total_open_cents)}</td>
                <td className="px-3 py-2 text-right">{money(r.current_cents + r.bucket_1_30_cents)}</td>
                <td className="px-3 py-2 text-right">{money(r.bucket_31_60_cents)}</td>
                <td className="px-3 py-2 text-right">{money(r.bucket_61_90_cents)}</td>
                <td className="px-3 py-2 text-right">{money(r.bucket_91_plus_cents)}</td>
                <td className="px-3 py-2 text-gray-700">{r.last_payment_date ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
