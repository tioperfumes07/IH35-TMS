import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { chartOfAccountsCatalogClient } from "../../../api/catalogs-accounting";
import type { AccountingCatalogRow } from "../../../api/catalogs-accounting";
import type { CatalogAccount } from "../../../api/catalog-accounts";
import { fetchAccountBalances, fetchAccountTypeCatalog } from "../../../api/coa-list";
import { getPlaidBankAccounts } from "../../../api/banking";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ListView } from "../../../components/lists/ListView";
import type { ActiveFilter, ListViewColumn, ListViewFilter, SortConfig } from "../../../components/lists/ListView/types";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { AccountDrawer } from "./AccountDrawer";
import { CoaBatchActions } from "./CoaBatchActions";
import {
  applyCollapsedVisibility,
  buildCoaListRows,
  orderCoaHierarchy,
  statementTag,
  type CoaListRow,
} from "./coa-list-utils";

const PAGE_SIZE_DEFAULT = 50;

const FILTERS: ListViewFilter[] = [
  {
    id: "statement",
    label: "View",
    type: "multiselect",
    options: [
      { value: "BS", label: "Balance sheet" },
      { value: "P&L", label: "Profit & loss" },
    ],
  },
];

function catalogRowToCatalogAccount(row: AccountingCatalogRow): CatalogAccount {
  const meta = row.metadata;
  return {
    id: row.id,
    account_number: row.code || null,
    account_name: row.display_name,
    account_type: String(meta.account_type ?? "Expense"),
    account_subtype: meta.account_subtype != null ? String(meta.account_subtype) : null,
    parent_account_id: meta.parent_account_id != null ? String(meta.parent_account_id) : null,
    qbo_account_id: meta.qbo_account_id != null ? String(meta.qbo_account_id) : null,
    qbo_account_qrn: meta.qbo_account_qrn != null ? String(meta.qbo_account_qrn) : null,
    is_postable: meta.is_postable !== false,
    currency_code: String(meta.currency_code ?? "USD"),
    opening_balance_cents: meta.opening_balance_cents != null ? Number(meta.opening_balance_cents) : null,
    opening_balance_as_of: meta.opening_balance_as_of != null ? String(meta.opening_balance_as_of) : null,
    is_locked: meta.is_locked === true,
    notes: row.description ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deactivated_at: row.is_active ? null : row.updated_at,
    created_by_user_id: null,
    updated_by_user_id: null,
  };
}

async function fetchAllCatalogRows(operatingCompanyId: string, includeInactive: boolean) {
  const limit = 200;
  let offset = 0;
  let rows: AccountingCatalogRow[] = [];
  let total = 0;
  do {
    const page = await chartOfAccountsCatalogClient.list({
      operating_company_id: operatingCompanyId,
      is_active: includeInactive ? "all" : "true",
      limit,
      offset,
    });
    rows = rows.concat(page.rows);
    total = page.total;
    offset += limit;
  } while (rows.length < total);
  return rows;
}

function statusPillClass(isActive: boolean) {
  return isActive
    ? "rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700"
    : "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600";
}

function syncBadgeClasses(badge: CoaListRow["syncBadge"]) {
  if (badge === "synced") return "bg-emerald-100 text-emerald-700";
  if (badge === "qbo-only") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

function buildColumns(
  collapsedParentIds: Set<string>,
  onToggleCollapse: (parentId: string) => void,
  onEditRow: (row: CoaListRow) => void
): ListViewColumn<CoaListRow>[] {
  return [
    {
      id: "number",
      label: "NUMBER",
      width: 110,
      sortType: "text",
      pinned: true,
      render: (row) => <span className="font-medium tracking-normal [font-variant-ligatures:none]">{row.number}</span>,
    },
    {
      id: "name",
      label: "NAME",
      width: 260,
      sortType: "text",
      render: (row) => (
        <div className="flex items-center gap-1 min-w-0" style={{ paddingLeft: `${row.depth * 16}px` }}>
          {row.hasChildren ? (
            <button
              type="button"
              className="shrink-0 text-[10px] text-gray-500 hover:text-gray-800"
              aria-label={collapsedParentIds.has(row.id) ? "Expand subaccounts" : "Collapse subaccounts"}
              onClick={(event) => {
                event.stopPropagation();
                onToggleCollapse(row.id);
              }}
            >
              {collapsedParentIds.has(row.id) ? "▸" : "▾"}
            </button>
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <span className="truncate">{row.name}</span>
        </div>
      ),
    },
    {
      id: "acct_type",
      label: "ACCOUNT TYPE",
      width: 140,
      sortType: "text",
    },
    {
      id: "detail_type",
      label: "DETAIL TYPE",
      width: 180,
      sortType: "text",
    },
    {
      id: "details",
      label: "DETAILS",
      width: 220,
      sortType: "text",
      visible: false,
    },
    {
      id: "qb_balance",
      label: "QUICKBOOKS BALANCE",
      width: 160,
      sortType: "currency",
      render: (row) => <span className="block text-right tabular-nums">{row.qb_balance}</span>,
    },
    {
      id: "bank_balance",
      label: "BANK BALANCE",
      width: 140,
      sortType: "currency",
      render: (row) => <span className="block text-right tabular-nums">{row.bank_balance}</span>,
    },
    {
      id: "status",
      label: "STATUS",
      width: 100,
      sortType: "text",
      render: (row) => <span className={statusPillClass(row.is_active)}>{row.status}</span>,
    },
    {
      id: "action",
      label: "ACTION",
      width: 180,
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.defaultAction === "view_register" ? (
            <Link
              to={`/accounting/chart-of-accounts/register/${row.id}`}
              className="text-blue-600 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              View register
            </Link>
          ) : (
            <Link
              to="/reports/profit-loss"
              className="text-blue-600 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              Run report
            </Link>
          )}
          <button
            type="button"
            className="text-gray-500 hover:text-gray-800 hover:underline text-xs"
            onClick={(event) => {
              event.stopPropagation();
              onEditRow(row);
            }}
          >
            Edit
          </button>
        </div>
      ),
    },
  ];
}

export function ChartOfAccountsListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [sortKey, setSortKey] = useState("number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [collapsedParentIds, setCollapsedParentIds] = useState<Set<string>>(() => new Set());
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [drawerAccount, setDrawerAccount] = useState<CatalogAccount | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const asOfDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const catalogQuery = useQuery({
    queryKey: ["coa-list", "catalog", companyId, statusFilter],
    queryFn: () => fetchAllCatalogRows(companyId, statusFilter !== "active"),
    enabled: Boolean(companyId),
  });

  const typeCatalogQuery = useQuery({
    queryKey: ["coa-list", "account-type-catalog"],
    queryFn: fetchAccountTypeCatalog,
    enabled: Boolean(companyId),
  });

  const balancesQuery = useQuery({
    queryKey: ["coa-list", "balances", companyId, asOfDate],
    queryFn: () => fetchAccountBalances(companyId, asOfDate),
    enabled: Boolean(companyId),
  });

  const plaidQuery = useQuery({
    queryKey: ["coa-list", "plaid-accounts", companyId],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });

  const baseRows = useMemo(() => {
    if (!catalogQuery.data) return [];
    return buildCoaListRows(
      catalogQuery.data,
      balancesQuery.data?.accounts ?? [],
      typeCatalogQuery.data ?? [],
      plaidQuery.data?.accounts ?? []
    );
  }, [balancesQuery.data, catalogQuery.data, plaidQuery.data, typeCatalogQuery.data]);

  const filteredRows = useMemo(() => {
    let rows = orderCoaHierarchy(baseRows);
    rows = applyCollapsedVisibility(rows, collapsedParentIds);

    const statementFilter = activeFilters.find((filter) => filter.filterId === "statement");
    if (statementFilter && statementFilter.values.length > 0) {
      rows = rows.filter((row) => statementFilter.values.includes(row.statement));
    }

    if (statusFilter === "active") rows = rows.filter((row) => row.is_active);
    if (statusFilter === "inactive") rows = rows.filter((row) => !row.is_active);

    if (sortKey) {
      const currencyColumns = new Set(["qb_balance", "bank_balance"]);
      const sorted = [...rows].sort((a, b) => {
        const av = String((a as Record<string, unknown>)[sortKey] ?? "");
        const bv = String((b as Record<string, unknown>)[sortKey] ?? "");
        const cmp = currencyColumns.has(sortKey)
          ? (parseFloat(av.replace(/[$,]/g, "")) || 0) - (parseFloat(bv.replace(/[$,]/g, "")) || 0)
          : av.localeCompare(bv, undefined, { sensitivity: "base", numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
      rows = sorted;
    }

    return rows;
  }, [activeFilters, baseRows, collapsedParentIds, sortDir, sortKey, statusFilter]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const columns = useMemo(
    () =>
      buildColumns(
        collapsedParentIds,
        (parentId) => {
          setCollapsedParentIds((prev) => {
            const next = new Set(prev);
            if (next.has(parentId)) next.delete(parentId);
            else next.add(parentId);
            return next;
          });
        },
        (coaRow) => {
          const raw = catalogQuery.data?.find((r) => r.id === coaRow.id);
          if (!raw) return;
          setDrawerMode("edit");
          setDrawerAccount(catalogRowToCatalogAccount(raw));
          setDrawerOpen(true);
        }
      ),
    [collapsedParentIds, catalogQuery.data]
  );

  const sort: SortConfig = {
    key: sortKey,
    dir: sortDir,
    onChange: (key, dir) => {
      setSortKey(key);
      setSortDir(dir);
      setPage(1);
    },
  };

  const pagination = {
    page,
    pageSize,
    total: filteredRows.length,
    onPageChange: setPage,
    onPageSizeChange: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
  };

  const isLoading = catalogQuery.isLoading || balancesQuery.isLoading;
  const isError = catalogQuery.isError || balancesQuery.isError;

  const refetchAll = () => {
    void catalogQuery.refetch();
    void balancesQuery.refetch();
    void plaidQuery.refetch();
  };

  return (
    <div className="flex h-full min-h-[640px] flex-col gap-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Accounting", "Chart of Accounts"]}
        title="Chart of Accounts"
        countBadge={filteredRows.length}
        actions={
          <Button
            onClick={() => {
              setDrawerMode("create");
              setDrawerAccount(null);
              setDrawerOpen(true);
            }}
          >
            + Create
          </Button>
        }
      />

      {isError ? <ListErrorBanner onRetry={() => refetchAll()} /> : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-gray-200 bg-white">
        {isLoading ? (
          <div className="px-4 py-8 text-sm text-gray-500">Loading chart of accounts…</div>
        ) : (
          <ListView
            columns={columns}
            rows={pageRows}
            rowKey={(row) => row.id}
            pagination={pagination}
            sort={sort}
            filters={FILTERS}
            onFilterChange={(filters) => {
              setActiveFilters(filters);
              setPage(1);
            }}
            savedViewsKey="coa-list-v1"
            density="cozy"
            badgeSlot={(row) => (
              <>
                <span className="ml-1 rounded bg-indigo-100 px-1 py-0.5 text-[9px] font-semibold text-indigo-700">
                  {statementTag(row.statement as "BS" | "P&L")}
                </span>
                <span className={`ml-1 rounded px-1 py-0.5 text-[9px] font-semibold ${syncBadgeClasses(row.syncBadge)}`}>
                  {row.syncBadge}
                </span>
              </>
            )}
            filterBarSlot={
              <div className="flex items-center gap-1 rounded border border-gray-300 p-0.5 text-xs">
                {(["all", "active", "inactive"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(value);
                      setPage(1);
                    }}
                    className={`rounded px-2 py-1 capitalize ${
                      statusFilter === value ? "bg-blue-500 text-white" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            }
            batchActions={({ selectedIds }) => (
              <CoaBatchActions
                selectedIds={selectedIds}
                rows={filteredRows}
                operatingCompanyId={companyId}
                onComplete={refetchAll}
              />
            )}
          />
        )}
      </div>

      <AccountDrawer
        open={drawerOpen}
        mode={drawerMode}
        account={drawerAccount}
        operatingCompanyId={companyId}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          refetchAll();
        }}
      />
    </div>
  );
}
