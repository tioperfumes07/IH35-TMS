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

/**
 * ACCT-F411 — the aging bucket drill. The URL must carry the bucket NAME(s) and the as-of date,
 * both or neither, and a merged column's two ids must both survive into the query string.
 */
describe("resolveAmountRoute — aging buckets", () => {
  it("carries one bucket and the as-of date", () => {
    expect(
      resolveAmountRoute({
        target: "bills",
        vendorId: "v1",
        hasBalance: true,
        agingBucket: "d31_60",
        agingAsOf: "2026-10-05",
      })
    ).toBe("/accounting/bills?vendor_id=v1&has_balance=true&aging_bucket=d31_60&as_of=2026-10-05");
  });

  it("APPENDS both ids for a merged column, so the drill is not half the cell", () => {
    // The A/P aging table's "0–30" is current + 1-30. set() would have kept only the last id.
    const route = resolveAmountRoute({
      target: "bills",
      vendorId: "v1",
      hasBalance: true,
      agingBucket: ["current", "d1_30"],
      agingAsOf: "2026-10-05",
    });
    expect(route).toContain("aging_bucket=current");
    expect(route).toContain("aging_bucket=d1_30");
    const params = new URLSearchParams(route!.split("?")[1]);
    expect(params.getAll("aging_bucket")).toEqual(["current", "d1_30"]);
  });

  it("works the same on the invoices target", () => {
    const route = resolveAmountRoute({
      target: "invoices",
      customerId: "c1",
      hasBalance: true,
      agingBucket: ["current", "d1_30"],
      agingAsOf: "2026-10-05",
    });
    const params = new URLSearchParams(route!.split("?")[1]);
    expect(params.getAll("aging_bucket")).toEqual(["current", "d1_30"]);
    expect(params.get("as_of")).toBe("2026-10-05");
  });

  it("refuses HALF the pair — a bucket with no as-of, or an as-of with no bucket", () => {
    // Either half alone would filter off the server's today instead of the report's as-of: a
    // different number, with nothing on screen to say so. Plain text is the honest answer.
    expect(
      resolveAmountRoute({ target: "bills", vendorId: "v1", agingBucket: "d31_60" })
    ).toBeNull();
    expect(
      resolveAmountRoute({ target: "bills", vendorId: "v1", agingAsOf: "2026-10-05" })
    ).toBeNull();
    expect(
      resolveAmountRoute({ target: "invoices", customerId: "c1", agingBucket: ["current"] })
    ).toBeNull();
    expect(
      resolveAmountRoute({ target: "invoices", customerId: "c1", agingAsOf: "2026-10-05" })
    ).toBeNull();
  });

  it("an EMPTY bucket array is not half a pair — it is no bucket at all, and still drills", () => {
    expect(
      resolveAmountRoute({ target: "bills", vendorId: "v1", hasBalance: true, agingBucket: [] })
    ).toBe("/accounting/bills?vendor_id=v1&has_balance=true");
  });

  it("still emits no basis param — the register rule is untouched by any of this", () => {
    const route = resolveAmountRoute({
      target: "bills",
      vendorId: "v1",
      agingBucket: "d1_30",
      agingAsOf: "2026-10-05",
    });
    expect(route).not.toContain("basis");
  });
});
