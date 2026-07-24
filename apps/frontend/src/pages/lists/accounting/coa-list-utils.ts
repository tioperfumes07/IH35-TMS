import type { AccountingCatalogRow } from "../../../api/catalogs-accounting";
import type { AccountBalanceRow, AccountTypeCatalogEntry } from "../../../api/coa-list";
import type { PlaidBankAccount } from "../../../api/banking";
import { formatUsdCents } from "../../../lib/money";

const PL_ACCOUNT_TYPES = new Set(["Income", "Expense", "CostOfGoodsSold", "OtherIncome", "OtherExpense"]);

export type CoaSyncBadge = "synced" | "local-only" | "qbo-only";

export type CoaListRow = {
  id: string;
  number: string;
  name: string;
  details: string;
  acct_type: string;
  detail_type: string;
  qb_balance: string;
  bank_balance: string;
  status: string;
  is_active: boolean;
  statement: string;
  action: string;
  syncBadge: CoaSyncBadge;
  parent_account_id: string | null;
  depth: number;
  hasChildren: boolean;
  childIds: string[];
  defaultAction: "view_register" | "run_report";
};

export function statementFromAccountType(accountType: string): "BS" | "P&L" {
  return PL_ACCOUNT_TYPES.has(accountType) ? "P&L" : "BS";
}

export function statementTag(statement: "BS" | "P&L"): "BAL" | "P&L" {
  return statement === "BS" ? "BAL" : "P&L";
}

export function formatCurrencyFromCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return formatUsdCents(cents);
}

export function resolveSyncBadge(metadata: Record<string, unknown>): CoaSyncBadge {
  const explicit = metadata.qbo_sync_status;
  if (explicit === "synced" || explicit === "local-only" || explicit === "qbo-only") {
    return explicit;
  }
  if (metadata.qbo_account_id) return "synced";
  return "local-only";
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveBankBalance(
  accountName: string,
  accountType: string,
  plaidAccounts: PlaidBankAccount[]
): string {
  if (accountType !== "Asset" && accountType !== "Bank") return "—";
  const normalized = normalizeName(accountName);
  const match = plaidAccounts.find((account) => {
    const plaidName = normalizeName(account.account_name ?? "");
    return plaidName.length > 0 && (plaidName === normalized || normalized.includes(plaidName) || plaidName.includes(normalized));
  });
  if (!match) return "—";
  return formatCurrencyFromCents(match.current_balance_cents);
}

export function buildCoaListRows(
  catalogRows: AccountingCatalogRow[],
  balanceRows: AccountBalanceRow[],
  _typeCatalog: AccountTypeCatalogEntry[],
  plaidAccounts: PlaidBankAccount[]
): CoaListRow[] {
  const balanceByCode = new Map(balanceRows.map((row) => [row.account_code, row]));
  const childrenByParent = new Map<string, string[]>();

  for (const row of catalogRows) {
    const parentId = row.metadata.parent_account_id ? String(row.metadata.parent_account_id) : null;
    if (!parentId) continue;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(row.id);
    childrenByParent.set(parentId, siblings);
  }

  return catalogRows.map((row) => {
    const accountType = String(row.metadata.account_type ?? "—");
    const detailType = String(row.metadata.account_subtype ?? row.metadata.detail_type ?? "—");
    const statement = statementFromAccountType(accountType);
    const defaultAction = statement === "BS" ? "view_register" : "run_report";
    const balance = balanceByCode.get(row.code);
    const childIds = childrenByParent.get(row.id) ?? [];

    return {
      id: row.id,
      number: row.code || "—",
      name: row.display_name,
      details: `Type: ${accountType}${detailType !== "—" ? ` · ${detailType}` : ""}`,
      acct_type: accountType,
      detail_type: detailType,
      qb_balance: formatCurrencyFromCents(balance?.closing_balance_cents),
      bank_balance: resolveBankBalance(row.display_name, accountType, plaidAccounts),
      status: row.is_active ? "Active" : "Inactive",
      is_active: row.is_active,
      statement,
      action: defaultAction === "view_register" ? "View register" : "Run report",
      syncBadge: resolveSyncBadge(row.metadata),
      parent_account_id: row.metadata.parent_account_id ? String(row.metadata.parent_account_id) : null,
      depth: 0,
      hasChildren: childIds.length > 0,
      childIds,
      defaultAction,
    };
  });
}

/** Sibling keys that re-order WITHIN a parent without flattening the tree (QBO CoA behavior). */
export type CoaSiblingSortKey = "number" | "name" | "acct_type" | "detail_type" | "status";

export type OrderCoaHierarchyOpts = {
  siblingSort?: CoaSiblingSortKey;
  siblingDir?: "asc" | "desc";
};

function compareCoaSiblings(a: CoaListRow, b: CoaListRow, key: CoaSiblingSortKey, dir: "asc" | "desc"): number {
  const av = String((a as Record<string, unknown>)[key] ?? "");
  const bv = String((b as Record<string, unknown>)[key] ?? "");
  const cmp = av.localeCompare(bv, undefined, { sensitivity: "base", numeric: true });
  return dir === "asc" ? cmp : -cmp;
}

/**
 * Depth-first CoA order: each parent followed by its children.
 * Column sorts must call this with siblingSort — NEVER flat-sort the whole list by name
 * (that destroys parent→subaccount nesting; owner 2026-07-23 / QBO parity).
 */
export function orderCoaHierarchy(rows: CoaListRow[], opts?: OrderCoaHierarchyOpts): CoaListRow[] {
  const siblingSort = opts?.siblingSort ?? "name";
  const siblingDir = opts?.siblingDir ?? "asc";
  const byId = new Map(rows.map((row) => [row.id, row]));
  const roots = rows
    .filter((row) => !row.parent_account_id || !byId.has(row.parent_account_id))
    .sort((a, b) => compareCoaSiblings(a, b, siblingSort, siblingDir));

  const ordered: CoaListRow[] = [];
  const visit = (row: CoaListRow, depth: number) => {
    ordered.push({ ...row, depth });
    const children = row.childIds
      .map((id) => byId.get(id))
      .filter((child): child is CoaListRow => Boolean(child))
      .sort((a, b) => compareCoaSiblings(a, b, siblingSort, siblingDir));
    for (const child of children) visit(child, depth + 1);
  };

  for (const root of roots) visit(root, 0);
  const visited = new Set(ordered.map((row) => row.id));
  for (const row of rows) {
    if (!visited.has(row.id)) ordered.push({ ...row, depth: 0 });
  }
  return ordered;
}

/**
 * Search keeps matching rows and every ancestor so subaccounts stay under their parent.
 */
export function filterCoaHierarchySearch(rows: CoaListRow[], query: string): CoaListRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const keep = new Set<string>();
  for (const row of rows) {
    const hay = `${row.name} ${row.number} ${row.acct_type} ${row.detail_type}`.toLowerCase();
    if (!hay.includes(q)) continue;
    keep.add(row.id);
    let parentId = row.parent_account_id;
    while (parentId) {
      keep.add(parentId);
      parentId = byId.get(parentId)?.parent_account_id ?? null;
    }
  }
  return rows.filter((row) => keep.has(row.id));
}

export function applyCollapsedVisibility(rows: CoaListRow[], collapsedParentIds: Set<string>): CoaListRow[] {
  const hidden = new Set<string>();
  const hideDescendants = (parentId: string) => {
    for (const row of rows) {
      if (row.parent_account_id === parentId) {
        hidden.add(row.id);
        hideDescendants(row.id);
      }
    }
  };
  for (const parentId of collapsedParentIds) hideDescendants(parentId);
  return rows.filter((row) => !hidden.has(row.id));
}
