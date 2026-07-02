import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { getAccountTypeCatalog, type AccountTypeCatalogEntry } from "../../api/account-type-catalog";

const STATEMENT_COLOR: Record<string, string> = {
  "Balance Sheet": "bg-slate-100 text-slate-700",
  "Profit and Loss": "bg-slate-200 text-slate-800",
  "Profit & Loss": "bg-slate-200 text-slate-800",
};

function groupBy(entries: AccountTypeCatalogEntry[]): [string, AccountTypeCatalogEntry[]][] {
  const map = new Map<string, AccountTypeCatalogEntry[]>();
  for (const e of entries) {
    const key = e.group || e.statement || "Other";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries());
}

export function AccountTypeCatalogPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["account-type-catalog"],
    queryFn: getAccountTypeCatalog,
  });

  const filtered = useMemo(() => {
    const entries = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries
      .map((e) => ({
        ...e,
        detailTypes: e.detailTypes.filter(
          (d) => d.name.toLowerCase().includes(q) || e.accountType.toLowerCase().includes(q),
        ),
      }))
      .filter((e) => e.accountType.toLowerCase().includes(q) || e.detailTypes.length > 0);
  }, [data, search]);

  const groups = useMemo(() => groupBy(filtered), [filtered]);

  return (
    <AccountingSubNavWrapper
      title="Account Type Catalog"
      subtitle="QBO-parity account type → detail-type taxonomy (read-only). Account types are universal; account instances are per-entity (see Chart of Accounts)."
    >
      <Link
        to="/lists"
        aria-label="Back to Lists & Catalogs"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:underline"
      >
        ← Lists &amp; Catalogs / Accounting
      </Link>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search type or detail type…"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
        {!isLoading && !isError && (
          <span className="text-xs text-gray-500">
            {(data ?? []).length} account type{(data ?? []).length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-red-600">Failed to load account type catalog.</p>
      ) : (data ?? []).length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">No account types found.</p>
          <p className="mt-1 text-xs text-gray-400">The account-type taxonomy has not been seeded yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([groupName, entries]) => (
            <section key={groupName}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{groupName}</h2>
              <div className="overflow-x-auto rounded border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Account Type", "Detail Types", "Statement", "Normal Balance"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {entries.map((e) => (
                      <tr key={e.id} className="align-top hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{e.accountType}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {e.detailTypes.length === 0 ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : (
                              e.detailTypes.map((d) => (
                                <span key={d.id} className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                                  {d.name}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATEMENT_COLOR[e.statement] ?? "bg-gray-100 text-gray-600"}`}>
                            {e.statement}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap capitalize">{e.normalBalance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </AccountingSubNavWrapper>
  );
}

export default AccountTypeCatalogPage;
