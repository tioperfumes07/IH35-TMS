import { describe, expect, it } from "vitest";
import { TABS, accountingTabSubtitle } from "./AccountingHubPage";

/**
 * Guard for #3a — the Accounting Hub summary card showed one hardcoded subtitle
 * ("Bills paid MTD · Avg DSO") on every tab while the title changed per tab. The subtitle
 * must now be reactive per active tab. Asserts each tab yields a distinct, non-empty subtitle
 * and that the live AP/AR metrics actually flow through (reactivity, not a constant string).
 */
const metrics = { billsPaidMtdCents: 123_45, avgDsoDays: 42 };

describe("accountingTabSubtitle — reactive per tab (#3a)", () => {
  it("every tab produces a non-empty subtitle", () => {
    for (const tab of TABS) {
      const subtitle = accountingTabSubtitle(tab.id, metrics);
      expect(subtitle.trim().length, `tab ${tab.id} has an empty subtitle`).toBeGreaterThan(0);
    }
  });

  it("subtitles are distinct across tabs (no shared hardcoded line)", () => {
    const subtitles = TABS.map((t) => accountingTabSubtitle(t.id, metrics));
    expect(new Set(subtitles).size).toBe(TABS.length);
  });

  it("AP/AR tabs reflect the live metrics (reactive, not constant)", () => {
    const a = accountingTabSubtitle("bills", { billsPaidMtdCents: 100_00, avgDsoDays: 10 });
    const b = accountingTabSubtitle("bills", { billsPaidMtdCents: 900_00, avgDsoDays: 10 });
    expect(a).not.toBe(b); // bills subtitle changes with billsPaidMtdCents
    const c = accountingTabSubtitle("invoices", { billsPaidMtdCents: 0, avgDsoDays: 15 });
    const d = accountingTabSubtitle("invoices", { billsPaidMtdCents: 0, avgDsoDays: 55 });
    expect(c).not.toBe(d); // invoices subtitle changes with avgDsoDays
  });
});
