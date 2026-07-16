/**
 * Bank Transactions DesignView — QBO-parity sort → group → page pipeline.
 *
 * Audit gap #5 residual (04-BANKING.md):
 * - Month bands must follow date ASC/DESC (not always newest-first).
 * - Money in / Money out grouping + flat (none) list.
 * - Group the FULL sorted set, then page — never page-then-group.
 * - Non-date sorts with month mode auto-flatten (group-off when sorting).
 */

export type BankTxnGroupMode = "month" | "money" | "none";

export type BankTxnSortKey = "date" | "description" | "spent" | "received" | "amount";

export type BankTxnSort = { key: BankTxnSortKey; dir: "asc" | "desc" };

export type BankTxnGroupable = {
  id: string;
  transaction_date: string;
  amount_cents?: number | null;
  is_credit?: boolean | null;
};

export type BankTxnGroup<T extends BankTxnGroupable = BankTxnGroupable> = {
  key: string;
  title: string;
  rows: T[];
};

/** QBO-style money-in: credit flag OR negative signed amount_cents (Plaid convention). */
export function isMoneyInTxn(tx: Pick<BankTxnGroupable, "amount_cents" | "is_credit">): boolean {
  const cents = Number(tx.amount_cents ?? 0);
  return Boolean(tx.is_credit) || cents < 0;
}

export function monthKeyFromDate(rawDate: string): string {
  const dt = new Date(rawDate);
  if (Number.isNaN(dt.getTime())) return "Unknown";
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthTitleFromKey(monthKey: string): string {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "Unknown";
  const dt = new Date(Date.UTC(year, month - 1, 1));
  return dt.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Effective grouping: month + non-date sort → flatten (group-off when sorting).
 * Money / none modes always honor the explicit mode.
 */
export function resolveBankTxnGroupMode(mode: BankTxnGroupMode, sort: BankTxnSort): BankTxnGroupMode {
  if (mode === "month" && sort.key !== "date") return "none";
  return mode;
}

/**
 * Group an already-sorted FULL row set. Callers MUST sort before calling.
 * Month band order follows date ASC/DESC; money bands are Money in then Money out.
 */
export function groupBankTransactions<T extends BankTxnGroupable>(
  sortedRows: T[],
  mode: BankTxnGroupMode,
  sort: BankTxnSort
): BankTxnGroup<T>[] {
  const effective = resolveBankTxnGroupMode(mode, sort);
  if (effective === "none") {
    return [{ key: "all", title: "All transactions", rows: sortedRows }];
  }

  if (effective === "money") {
    const moneyIn: T[] = [];
    const moneyOut: T[] = [];
    for (const tx of sortedRows) {
      if (isMoneyInTxn(tx)) moneyIn.push(tx);
      else moneyOut.push(tx);
    }
    const bands: BankTxnGroup<T>[] = [];
    if (moneyIn.length) bands.push({ key: "money_in", title: "Money in", rows: moneyIn });
    if (moneyOut.length) bands.push({ key: "money_out", title: "Money out", rows: moneyOut });
    return bands;
  }

  // month
  const bucket = new Map<string, T[]>();
  for (const tx of sortedRows) {
    const key = monthKeyFromDate(tx.transaction_date);
    const arr = bucket.get(key) ?? [];
    arr.push(tx);
    bucket.set(key, arr);
  }
  // Date ASC → oldest month first; otherwise newest-first (QBO default).
  const monthDir = sort.key === "date" && sort.dir === "asc" ? 1 : -1;
  return [...bucket.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0) * monthDir)
    .map(([key, rows]) => ({ key, title: monthTitleFromKey(key), rows }));
}

/**
 * Flatten groups → slice page → re-bucket so headers only cover rows on this page.
 * Pagination walks the full sorted+grouped sequence (not a pre-page slice).
 */
export function pageBankTxnGroups<T extends BankTxnGroupable>(
  groups: BankTxnGroup<T>[],
  page: number,
  pageSize: number
): { groups: BankTxnGroup<T>[]; totalRows: number; pageStartIndex: number } {
  const flat: Array<{ key: string; title: string; row: T }> = [];
  for (const g of groups) {
    for (const row of g.rows) {
      flat.push({ key: g.key, title: g.title, row });
    }
  }
  const totalRows = flat.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageStartIndex = (safePage - 1) * pageSize;
  const slice = flat.slice(pageStartIndex, pageStartIndex + pageSize);

  const out: BankTxnGroup<T>[] = [];
  for (const item of slice) {
    const last = out[out.length - 1];
    if (last && last.key === item.key) {
      last.rows.push(item.row);
    } else {
      out.push({ key: item.key, title: item.title, rows: [item.row] });
    }
  }
  return { groups: out, totalRows, pageStartIndex };
}

/** One-shot: sort is assumed done; group full set then page. */
export function buildPagedBankTxnGroups<T extends BankTxnGroupable>(
  sortedRows: T[],
  mode: BankTxnGroupMode,
  sort: BankTxnSort,
  page: number,
  pageSize: number
): { groups: BankTxnGroup<T>[]; totalRows: number; pageStartIndex: number; effectiveMode: BankTxnGroupMode } {
  const effectiveMode = resolveBankTxnGroupMode(mode, sort);
  const groups = groupBankTransactions(sortedRows, mode, sort);
  const paged = pageBankTxnGroups(groups, page, pageSize);
  return { ...paged, effectiveMode };
}
