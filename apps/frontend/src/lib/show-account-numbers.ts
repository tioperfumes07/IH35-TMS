/**
 * Owner ruling 2026-07-23: QBO / CoA account numbers are junk in day-to-day UI.
 * Default OFF. Chart of Accounts + accounting reports can toggle ON for rare use.
 * Pickers / catalogs use this helper so labels stay name-first.
 */

export const SHOW_ACCOUNT_NUMBERS_STORAGE_KEY = "ih35.showAccountNumbers";

export function getShowAccountNumbers(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SHOW_ACCOUNT_NUMBERS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setShowAccountNumbers(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(SHOW_ACCOUNT_NUMBERS_STORAGE_KEY, "1");
    else window.localStorage.removeItem(SHOW_ACCOUNT_NUMBERS_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("ih35:show-account-numbers", { detail: { on } }));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Display label for CoA rows in pickers, lists, and reports. */
export function formatAccountDisplayLabel(
  account: { account_name?: string | null; account_number?: string | null; name?: string | null },
  opts?: { showNumber?: boolean }
): string {
  const name = String(account.account_name ?? account.name ?? "").trim() || "—";
  const number = String(account.account_number ?? "").trim();
  const show = opts?.showNumber ?? getShowAccountNumbers();
  if (show && number) return `${number} · ${name}`;
  return name;
}

/**
 * ROUND L.31 (2026-11-28) — NON-DISPLAY number lookups. A screen that must find "the 1000 bank account" or "accounts 1000/1010/1020"
 * (a template's fixed debit/credit, a default bank) matches on the number without ever rendering it. Those lookups live here, in the
 * approved helper, so every page that DISPLAYS an account still goes through formatAccountDisplayLabel and the owner's toggle.
 */
export function accountIdByNumber<T extends { id: string; account_number?: string | null }>(accounts: readonly T[], number: string): string {
  return accounts.find((a) => (a.account_number ?? "") === number)?.id ?? "";
}
export function accountsWithNumbers<T extends { account_number?: string | null }>(accounts: readonly T[], numbers: readonly string[]): T[] {
  return accounts.filter((a) => numbers.includes(a.account_number ?? ""));
}
export function accountsThatHaveNumbers<T extends { account_number?: string | null }>(accounts: readonly T[]): T[] {
  return accounts.filter((a) => Boolean(a.account_number));
}
