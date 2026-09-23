import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SHOW_ACCOUNT_NUMBERS_STORAGE_KEY,
  getShowAccountNumbers,
  setShowAccountNumbers,
  formatAccountDisplayLabel,
} from "./show-account-numbers";

// ROUND 83 RULING 1 (owner, verbatim: "I DO NOT LIKE TO SEE THE ACCOUNT NUMBERS SHOWING
// ANYWHERE. AUTOMATICALLY HAVE THEM OFF, IN FILTERS ADD OPTION TO SHOW") — the "UI check that the
// default render shows name only" the ruling asks for. This is the single shared function every
// account-rendering surface (chart of accounts, registers, reports, pickers, exports, printed
// documents) is expected to go through; testing it here covers the contract every one of those
// surfaces relies on, without re-mounting each page.
describe("show-account-numbers — default OFF, name-only by default", () => {
  beforeEach(() => {
    window.localStorage.removeItem(SHOW_ACCOUNT_NUMBERS_STORAGE_KEY);
  });
  afterEach(() => {
    window.localStorage.removeItem(SHOW_ACCOUNT_NUMBERS_STORAGE_KEY);
  });

  it("getShowAccountNumbers() is false on a fresh load with nothing persisted", () => {
    expect(getShowAccountNumbers()).toBe(false);
  });

  it("formatAccountDisplayLabel() renders NAME ONLY by default, even when a number is present", () => {
    const label = formatAccountDisplayLabel({ account_name: "Fuel Expense", account_number: "5100" });
    expect(label).toBe("Fuel Expense");
    expect(label).not.toContain("5100");
  });

  it("formatAccountDisplayLabel() shows the number only after the toggle is explicitly turned on", () => {
    setShowAccountNumbers(true);
    expect(getShowAccountNumbers()).toBe(true);
    const label = formatAccountDisplayLabel({ account_name: "Fuel Expense", account_number: "5100" });
    expect(label).toBe("5100 · Fuel Expense");
  });

  it("turning the toggle off again reverts to name-only (never a frozen-on state)", () => {
    setShowAccountNumbers(true);
    setShowAccountNumbers(false);
    expect(getShowAccountNumbers()).toBe(false);
    expect(formatAccountDisplayLabel({ account_name: "Fuel Expense", account_number: "5100" })).toBe("Fuel Expense");
  });

  it("an explicit showNumber option overrides the persisted toggle for a single call", () => {
    expect(getShowAccountNumbers()).toBe(false);
    expect(
      formatAccountDisplayLabel({ account_name: "Fuel Expense", account_number: "5100" }, { showNumber: true })
    ).toBe("5100 · Fuel Expense");
  });

  it("a missing account number never renders a stray separator, toggle on or off", () => {
    setShowAccountNumbers(true);
    expect(formatAccountDisplayLabel({ account_name: "Fuel Expense", account_number: null })).toBe("Fuel Expense");
  });

  it("a missing account name renders the em dash placeholder, never blank", () => {
    expect(formatAccountDisplayLabel({ account_name: null, account_number: "5100" })).toBe("—");
  });
});
