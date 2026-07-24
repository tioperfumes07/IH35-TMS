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
