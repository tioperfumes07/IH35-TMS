import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getNamesMasterCounts, searchNamesMaster, type NamesEntityType } from "../../../api/namesMaster";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ListsSubNav } from "../ListsSubNav";

const TYPE_FILTERS: Array<{ key: "all" | NamesEntityType; label: string }> = [
  { key: "all", label: "All" },
  { key: "customer", label: "Customers" },
  { key: "vendor", label: "Vendors" },
  { key: "driver", label: "Drivers" },
  { key: "contact", label: "Contacts" },
  { key: "company", label: "Companies" },
];

export function NamesMasterHub() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | NamesEntityType>("all");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const countsQuery = useQuery({
    queryKey: ["names-master", "counts", companyId],
    queryFn: () => getNamesMasterCounts(companyId),
    enabled: Boolean(companyId),
  });

  const searchQuery = useQuery({
    queryKey: ["names-master", "search", companyId, q, type, page],
    queryFn: () =>
      searchNamesMaster({
        operatingCompanyId: companyId,
        q,
        type,
        limit: pageSize,
        offset: page * pageSize,
      }),
    enabled: Boolean(companyId),
  });

  const rows = searchQuery.data?.rows ?? [];
  const total = searchQuery.data?.total ?? 0;
  const counts = countsQuery.data;

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setPage(0);
    setQ(qInput.trim());
  }

  return (
    <div className="space-y-4">
      <ListsSubNav />
      <PageHeader
        title="Names Master"
        subtitle="Cross-module search across customers, vendors, drivers, and contacts (read-only navigator)"
      />

      <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-white p-3">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          Search
          <input
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Name, email, phone, CDL…"
          />
        </label>
        <button type="submit" className="rounded bg-[#1F2A44] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1F2A44]">
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              type === chip.key ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-700"
            }`}
            onClick={() => {
              setType(chip.key);
              setPage(0);
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {counts ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className="rounded border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Customers</div><div className="text-xl font-semibold">{counts.customers}</div></div>
          <div className="rounded border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Vendors</div><div className="text-xl font-semibold">{counts.vendors}</div></div>
          <div className="rounded border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Drivers</div><div className="text-xl font-semibold">{counts.drivers}</div></div>
          <div className="rounded border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Contacts</div><div className="text-xl font-semibold">{counts.contacts}</div></div>
          <div className="rounded border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Total</div><div className="text-xl font-semibold">{counts.total}</div></div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">QBO ID</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {searchQuery.isLoading ? (
              <tr><td className="px-3 py-3 text-slate-500" colSpan={6}>Searching…</td></tr>
            ) : null}
            {!searchQuery.isLoading && rows.length === 0 ? (
              <tr><td className="px-3 py-3 text-slate-500" colSpan={6}>No results. Try a search term.</td></tr>
            ) : null}
            {rows.map((row) => (
              <tr key={`${row.entity_type}-${row.entity_id}`} className="border-t border-slate-100">
                <td className="px-3 py-2 capitalize">{row.entity_type}</td>
                <td className="px-3 py-2 font-medium">{row.display_name}</td>
                <td className="px-3 py-2">{row.primary_email ?? "—"}</td>
                <td className="px-3 py-2">{row.primary_phone ?? "—"}</td>
                <td className="px-3 py-2">{row.qbo_id ?? "—"}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50"
                    onClick={() => navigate(row.link_to_module_page)}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          Page {page + 1} of {pageCount} · {total} result{total === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1 disabled:opacity-40"
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
