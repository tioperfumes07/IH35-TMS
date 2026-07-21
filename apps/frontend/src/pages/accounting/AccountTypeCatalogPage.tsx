import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { getAccountTypeCatalog, type AccountTypeCatalogEntry } from "../../api/account-type-catalog";
import { ApiError } from "../../api/client";
import { ListErrorState } from "../../components/ListErrorState";
import { useListState } from "../../components/list-state";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

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

// Column order preserved 1:1 from the former hand-rolled table markup (display-only migration).
const COLUMNS: Array<ParityColumn<AccountTypeCatalogEntry>> = [
  {
    key: "accountType",
    label: "Account Type",
    sortable: true,
    render: (e) => <span className="font-medium text-gray-900 whitespace-nowrap">{e.accountType}</span>,
  },
  {
    key: "detailTypes",
    label: "Detail Types",
    render: (e) => (
      <div className="flex flex-wrap gap-1">
        {e.detailTypes.length === 0 ? (
          <span className="text-xs text-gray-400">—</span>
        ) : (
          e.detailTypes.map((d) => (
            <span key={d.id} className="inline-block rounded-sm bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
              {d.name}
            </span>
          ))
        )}
      </div>
    ),
  },
  {
    key: "statement",
    label: "Statement",
    sortable: true,
    render: (e) => (
      <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${STATEMENT_COLOR[e.statement] ?? "bg-gray-100 text-gray-600"}`}>
        {e.statement}
      </span>
    ),
  },
  {
    key: "normalBalance",
    label: "Normal Balance",
    sortable: true,
    render: (e) => <span className="text-gray-600 whitespace-nowrap capitalize">{e.normalBalance}</span>,
  },
];

export function AccountTypeCatalogPage() {
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["account-type-catalog"],
    queryFn: getAccountTypeCatalog,
  });
  const { data, isLoading, isError } = query;
  const listState = useListState(query, (data ?? []).length === 0);

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
          className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-slate-400"
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
        <ListErrorState
          title="Couldn't load account type catalog"
          status={query.error instanceof ApiError ? query.error.status : 0}
          message={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
          className="rounded-sm border border-gray-200 bg-white"
        />
      ) : listState.isEmpty ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">No account types found.</p>
          <p className="mt-1 text-xs text-gray-400">The account-type taxonomy has not been seeded yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([groupName, entries]) => (
            <section key={groupName}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{groupName}</h2>
              <ParityTable
                columns={COLUMNS}
                rows={entries}
                rowKey={(e) => e.id}
                loading={isLoading}
                emptyText="No account types found."
                storageKey="account-type-catalog"
                tableTestId="account-type-catalog-table"
              />
            </section>
          ))}
        </div>
      )}
    </AccountingSubNavWrapper>
  );
}

export default AccountTypeCatalogPage;
