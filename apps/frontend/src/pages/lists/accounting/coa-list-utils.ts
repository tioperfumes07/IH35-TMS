import type { AccountingCatalogRow } from "../../../api/catalogs-accounting";
import type { AccountBalanceRow, AccountTypeCatalogEntry } from "../../../api/coa-list";
import { naturalCents } from "../../../lib/naturalBalance";
import type { PlaidBankAccount } from "../../../api/banking";
import { formatUsdCents } from "../../../lib/money";

const PL_ACCOUNT_TYPES = new Set(["Income", "Expense", "CostOfGoodsSold", "OtherIncome", "OtherExpense"]);

export type CoaSyncBadge = "synced" | "local-only" | "qbo-only";

export type CoaListRow = {
  id: string;
  number: string;
  name: string;
  details: string;
  /** B-1 / ORDERS — catalog description (QBO Description column). */
  description: string;
  acct_type: string;
  detail_type: string;
  qb_balance: string;
  bank_balance: string;
  /** The feed account behind this GL account (ledger_account_id), for the bank-balance drill. */
  bank_account_id?: string | null;
  /** B-1 / ORDERS — true when this CoA row is matched to a live bank feed (Plaid). */
  feed_connected: boolean;
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

/**
 * The bank / card feed account behind a GL account. ROUND 433.2: matched by banking.bank_accounts.ledger_account_id — the
 * canonical link — instead of a fuzzy name match restricted to Asset accounts. The old rule could never show a credit
 * card's balance (a card's GL account is a Liability: Amex-Scentsx, Dreamline Diesel Card) and could pin one account's
 * feed on another whose name merely contained it. The name match survives only for a feed account with no ledger link.
 */
export function resolveBankAccount(
  accountId: string,
  accountName: string,
  accountType: string,
  plaidAccounts: PlaidBankAccount[]
): PlaidBankAccount | null {
  const linked = plaidAccounts.find((account) => account.ledger_account_id && account.ledger_account_id === accountId);
  if (linked) return linked;
  if (accountType !== "Asset" && accountType !== "Bank") return null;
  const normalized = normalizeName(accountName);
  return (
    plaidAccounts.find((account) => {
      if (account.ledger_account_id) return false; // linked elsewhere: never borrowed by name
      const plaidName = normalizeName(account.account_name ?? "");
      return plaidName.length > 0 && (plaidName === normalized || normalized.includes(plaidName) || plaidName.includes(normalized));
    }) ?? null
  );
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

    const bankAccount = resolveBankAccount(row.id, row.display_name, accountType, plaidAccounts);
    const bankBalance = bankAccount ? formatCurrencyFromCents(bankAccount.current_balance_cents) : "—";

    return {
      id: row.id,
      number: row.code || "—",
      name: row.display_name,
      details: `Type: ${accountType}${detailType !== "—" ? ` · ${detailType}` : ""}`,
      description: (row.description ?? "").trim() || "—",
      acct_type: accountType,
      detail_type: detailType,
      // U27 — natural sign (income / liabilities positive), not the raw debit − credit the ledger function returns.
      qb_balance: formatCurrencyFromCents(balance ? naturalCents(balance.closing_balance_cents, balance.normal_balance) : undefined),
      bank_balance: bankBalance,
      bank_account_id: bankAccount?.id ?? null,
      feed_connected: bankBalance !== "—",
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

export function orderCoaHierarchy(rows: CoaListRow[]): CoaListRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const roots = rows
    .filter((row) => !row.parent_account_id || !byId.has(row.parent_account_id))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

  const ordered: CoaListRow[] = [];
  const visit = (row: CoaListRow, depth: number) => {
    ordered.push({ ...row, depth });
    const children = row.childIds
      .map((id) => byId.get(id))
      .filter((child): child is CoaListRow => Boolean(child))
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    for (const child of children) visit(child, depth + 1);
  };

  for (const root of roots) visit(root, 0);
  const visited = new Set(ordered.map((row) => row.id));
  for (const row of rows) {
    if (!visited.has(row.id)) ordered.push({ ...row, depth: 0 });
  }
  return ordered;
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
