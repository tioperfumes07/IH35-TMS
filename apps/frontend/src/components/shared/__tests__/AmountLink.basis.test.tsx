import { describe, expect, it } from "vitest";
import { resolveAmountRoute, type AmountFilter } from "../AmountLink";

/**
 * ACCT-F410-A — THE BASIS RULE.
 *
 * The account register is accrual-only: AccountRegisterPage reads accountId / from_date / to_date
 * and nothing else, and account-register.service.ts has no basis concept at all. The cash-basis
 * reports run through accounting/cash-basis/engine.ts applyCashBasisSuppression, which zeroes
 * AR/AP control rows (@decision Q3) and zeroes invoice_revenue / bill_expense /
 * driver_settlement not settled by the as-of date (@decision Q5, VQ5). So a cash-basis figure and
 * the accrual register cannot tie. A link that navigates to a different number than the one you
 * clicked is worse than no link, so a cash-basis figure resolves to null and renders plain text.
 */
describe("resolveAmountRoute — THE BASIS RULE", () => {
  const base = { target: "register" as const, accountId: "acct-1", from: "2026-01-01", to: "2026-03-31" };

  it("drills on accrual", () => {
    expect(resolveAmountRoute({ ...base, basis: "accrual" })).toBe(
      "/accounting/chart-of-accounts/register/acct-1?from_date=2026-01-01&to_date=2026-03-31"
    );
  });

  it("drills when no basis is supplied — a page with no basis concept is unaffected", () => {
    expect(resolveAmountRoute(base)).toBe(
      "/accounting/chart-of-accounts/register/acct-1?from_date=2026-01-01&to_date=2026-03-31"
    );
  });

  it("refuses to drill on cash, so the figure renders as plain text", () => {
    expect(resolveAmountRoute({ ...base, basis: "cash" })).toBeNull();
  });

  it("never emits basis in the query string — the register does not read it", () => {
    const route = resolveAmountRoute({ ...base, basis: "accrual" });
    expect(route).not.toContain("basis");
  });

  it("refuses cash even with every other field present", () => {
    const filter: AmountFilter = { ...base, basis: "cash" };
    expect(resolveAmountRoute(filter)).toBeNull();
  });

  it("still refuses a register filter with no accountId", () => {
    expect(resolveAmountRoute({ target: "register", accountId: "", basis: "accrual" })).toBeNull();
  });

  it("leaves the non-register targets alone — basis does not apply to them", () => {
    expect(resolveAmountRoute({ target: "bills", vendorId: "v1", hasBalance: true })).toBe(
      "/accounting/bills?vendor_id=v1&has_balance=true"
    );
    expect(resolveAmountRoute({ target: "invoices", customerId: "c1", notSent: true })).toBe(
      "/accounting/invoices?customer_id=c1&not_sent=true"
    );
  });
});
