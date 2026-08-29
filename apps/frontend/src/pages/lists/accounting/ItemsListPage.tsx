/**
 * ITEM1 / AF-2c (PS-B) — Products & Services list.
 * ParityTable (sortable + resizable) with a Category column and a QBO-style "Group by category"
 * toggle (default ON, collapsible groups + an "Uncategorized" bucket). Income/Expense/Category are
 * stored on the item as REAL ids (default_income_account_id / default_expense_account_id / category_id);
 * we resolve them to names here for display.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { itemsCatalogClient, qboCategoriesCatalogClient } from "../../../api/catalogs-accounting";
import type { AccountingCatalogRow } from "../../../api/catalogs-accounting";
import { getCoaAccounts } from "../../../api/banking";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { Button } from "../../../components/Button";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { CollapsedListFilters, useStagedListFilters } from "../../../components/table";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useUrlSort } from "../../../hooks/useUrlSort";
import { ItemEditorModal } from "./ItemEditorModal";
import { ItemsCatalog } from "../../accounting/ItemsCatalog";

const UNCATEGORIZED = "Uncategorized";

function itemSummary(row: AccountingCatalogRow): string {
  const m = row.metadata;
  const type = String(m.item_type ?? "Service");
  const sell = m.default_income_account_id ? "Sell" : null;
  const buy = m.default_expense_account_id ? "Buy" : null;
  const sides = [sell, buy].filter(Boolean).join(" + ");
  return `${type}${sides ? " · " + sides : ""}`;
}

export function ItemsListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // BANK-SORT-ROLLOUT-ACCT: every visible column header sorts ASC/DESC; sort persists in the URL
  // (?sort=&dir=) so it survives reload / is shareable, same as ExpensesListPage.
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  const [search, setSearch] = useState("");
  const [groupByCategory, setGroupByCategory] = useState(true);
  const staged = useStagedListFilters({
    applied: { groupByCategory },
    empty: { groupByCategory: true },
    onApply: (next) => setGroupByCategory(next.groupByCategory),
  });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedRow, setSelectedRow] = useState<AccountingCatalogRow | null>(null);
  const deepLinkItemId = searchParams.get("item_id");
  const deepLinkItemQuery = useQuery({
    queryKey: ["catalogs", "accounting", "items", "detail", companyId, deepLinkItemId],
    queryFn: () => itemsCatalogClient.get(String(deepLinkItemId), companyId),
    enabled: Boolean(companyId && deepLinkItemId),
  });

  useEffect(() => {
    if (!deepLinkItemId || !deepLinkItemQuery.data) return;
    setModalMode("edit");
    setSelectedRow(deepLinkItemQuery.data);
    setModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("item_id");
    setSearchParams(next, { replace: true });
  }, [deepLinkItemId, deepLinkItemQuery.data, searchParams, setSearchParams]);

  // LST-F5213 — Live Chrome deep-link: Lists ?create=1 must open item create (posting-templates / void-cancel parity).
  useEffect(() => {
    if (searchParams.get("create") !== "1" || !companyId) return;
    setModalMode("create");
    setSelectedRow(null);
    setModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    setSearchParams(next, { replace: true });
  }, [searchParams, companyId, setSearchParams]);

  const query = useQuery({
    queryKey: ["catalogs", "accounting", "items", companyId, search],
    queryFn: () => itemsCatalogClient.list({ operating_company_id: companyId, search: search || undefined, is_active: "all", limit: 200, offset: 0 }),
    enabled: Boolean(companyId),
  });
  const accountsQuery = useQuery({
    queryKey: ["catalogs", "accounts", "for-items", companyId],
    queryFn: () => getCoaAccounts(companyId),
    enabled: Boolean(companyId),
  });
  const categoriesQuery = useQuery({
    queryKey: ["catalogs", "accounting", "qbo-categories", companyId],
    queryFn: () => qboCategoriesCatalogClient.list({ operating_company_id: companyId, is_active: "all", limit: 200 }),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];
  const accountName = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accountsQuery.data?.accounts ?? []) map.set(a.id, a.account_name);
    return map;
  }, [accountsQuery.data]);
  const categoryName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categoriesQuery.data?.rows ?? []) map.set(c.id, c.display_name);
    return map;
  }, [categoriesQuery.data]);

  const resolveAccount = (id: unknown) => (typeof id === "string" && accountName.get(id)) || "—";
  const resolveCategory = (row: AccountingCatalogRow) => {
    const id = row.metadata.category_id;
    return (typeof id === "string" && categoryName.get(id)) || (id ? "—" : UNCATEGORIZED);
  };

  const columns: Array<ParityColumn<AccountingCatalogRow>> = [
    { key: "display_name", label: "Name", sortable: true, render: (r) => <span className="font-medium text-gray-900">{r.display_name}</span> },
    // LISTS-ITEMS-CATALOG-SORT-NO-OP (GO-0027, CC-1): these 5 columns render derived/resolved
    // values, not real fields on AccountingCatalogRow (type/category/income/expense/status all
    // live inside `metadata` or require an id→name lookup) — without an explicit sortValue,
    // ParityTable's default `row[key]` fallback is always undefined and the sort is a no-op.
    { key: "type", label: "Type / Sides", sortable: true, sortValue: (r) => itemSummary(r), render: (r) => <span className="text-gray-600">{itemSummary(r)}</span> },
    { key: "category", label: "Category", sortable: true, sortValue: (r) => resolveCategory(r), render: (r) => <span className="text-gray-600">{resolveCategory(r)}</span> },
    { key: "income", label: "Income account", sortable: true, sortValue: (r) => resolveAccount(r.metadata.default_income_account_id), render: (r) => <span className="text-gray-500">{resolveAccount(r.metadata.default_income_account_id)}</span> },
    { key: "expense", label: "Expense account", sortable: true, sortValue: (r) => resolveAccount(r.metadata.default_expense_account_id), render: (r) => <span className="text-gray-500">{resolveAccount(r.metadata.default_expense_account_id)}</span> },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortValue: (r) => (r.is_active ? 1 : 0),
      render: (r) => (
        <span className={r.is_active
          ? "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
          : "rounded-sm bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500"}>
          {r.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
  ];

  const grouped = useMemo(() => {
    const map = new Map<string, AccountingCatalogRow[]>();
    for (const r of rows) {
      const name = resolveCategory(r);
      const arr = map.get(name) ?? [];
      arr.push(r);
      map.set(name, arr);
    }
    // Uncategorized last, others alphabetical
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === UNCATEGORIZED) return 1;
      if (b[0] === UNCATEGORIZED) return -1;
      return a[0].localeCompare(b[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, categoryName]);

  function openCreate() {
    setModalMode("create");
    setSelectedRow(null);
    setModalOpen(true);
  }
  function openEdit(row: AccountingCatalogRow) {
    setModalMode("edit");
    setSelectedRow(row);
    setModalOpen(true);
  }

  const rowActions = (row: AccountingCatalogRow) => (
    <button type="button" className="text-xs text-slate-700 hover:underline" onClick={() => openEdit(row)}>
      Edit
    </button>
  );

  const filterBar = (
    <CollapsedListFilters
      activeFilterCount={groupByCategory ? 0 : 1}
      onApply={staged.apply}
      onReset={staged.reset}
      onCancel={staged.cancel}
      applyDisabled={!staged.dirty}
      testIdPrefix="items"
      dataAttributes={{ "data-items-filter-toolbar": "collapsed" }}
      searchSlot={
        <input
          className="min-h-12 h-12 w-56 rounded-sm border border-gray-300 px-2 text-sm"
          placeholder="Search items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search items"
        />
      }
    >
      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={staged.draft.groupByCategory}
          onChange={(e) => staged.setDraft({ groupByCategory: e.target.checked })}
          className="h-4 w-4 rounded-sm border-gray-300"
        />
        Group by category
      </label>
    </CollapsedListFilters>
  );

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Accounting", "Items"]}
        title="Products & Services"
        countBadge={query.data?.total}
        actions={
          <Button onClick={openCreate} data-testid="items-create-btn">
            + Create
          </Button>
        }
      />

      {companyId ? (
        <ItemsCatalog
          onSynced={() => void qc.invalidateQueries({ queryKey: ["catalogs", "accounting", "items"] })}
        />
      ) : null}

      {!companyId ? (
        <div className="rounded-sm border border-gray-200 bg-white px-3 py-6 text-sm text-slate-600">Select a company to view products &amp; services.</div>
      ) : query.isError ? (
        <ListErrorBanner
          message="Failed to load products & services."
          onRetry={() => void query.refetch()}
        />
      ) : groupByCategory ? (
        <div className="space-y-3">
          <div>{filterBar}</div>
          {grouped.length === 0 && !query.isLoading ? (
            <div className="rounded-sm border border-gray-200 bg-white px-3 py-6 text-center text-xs text-gray-400">No items found.</div>
          ) : (
            grouped.map(([name, groupRows]) => {
              const isCollapsed = collapsed[name] ?? false;
              return (
                <div key={name} className="rounded-sm border border-gray-200 bg-white">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-gray-50"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [name]: !isCollapsed }))}
                    aria-expanded={!isCollapsed}
                  >
                    <span>{isCollapsed ? "▸" : "▾"} {name}</span>
                    <span className="text-xs font-normal text-gray-400">{groupRows.length}</span>
                  </button>
                  {!isCollapsed ? (
                    <ParityTable
                      columns={columns}
                      rows={groupRows}
                      rowKey={(r) => r.id}
                      loading={query.isLoading}
                      rowActions={rowActions}
                      storageKey="items-list"
                      emptyText="No items."
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      onSortChange={onSortChange}
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <ParityTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={query.isLoading}
          rowActions={rowActions}
          filterBar={filterBar}
          suppressToolbarSearch
          storageKey="items-list"
          emptyText="No items found."
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={onSortChange}
        />
      )}

      <ItemEditorModal
        open={modalOpen}
        mode={modalMode}
        row={selectedRow}
        operatingCompanyId={companyId}
        client={itemsCatalogClient}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ["catalogs", "accounting", "items"] });
          setModalOpen(false);
        }}
      />
    </div>
  );
}
