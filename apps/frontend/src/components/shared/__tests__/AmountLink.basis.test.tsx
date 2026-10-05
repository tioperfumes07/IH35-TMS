import { describe, expect, it } from "vitest";
import { resolveAmountRoute, type AmountFilter } from "../AmountLink";

/**
 * ACCT-F410 — THE BASIS RULE, now that the register answers in the basis asked for.
 *
 * It used to be: a cash-basis figure got NO drill, because the register was accrual-only on both
 * sides and the two could not tie. ACCT-F410 made the register accept `basis` and run the account
 * through the same accounting/cash-basis/engine.ts `applyCashBasisSuppression` the Trial Balance
 * and Balance Sheet run, classified by the same COA roles. So the drill is back, and what these
 * tests pin is that the basis TRAVELS — because the failure mode of dropping it is invisible: the
 * link still works, the register still renders a number, and the number is the wrong basis. That
 * is exactly the defect ACCT-F410-A found across five report pages.
 */
describe("resolveAmountRoute — the basis travels to the register", () => {
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

  it("CARRIES basis=cash into the register URL, so the register answers in cash basis", () => {
    const route = resolveAmountRoute({ ...base, basis: "cash" });
    expect(route).toBe(
      "/accounting/chart-of-accounts/register/acct-1?from_date=2026-01-01&to_date=2026-03-31&basis=cash"
    );
  });

  it("does NOT emit basis for accrual — it is the default on both sides, so every existing URL is unchanged", () => {
    expect(resolveAmountRoute({ ...base, basis: "accrual" })).not.toContain("basis");
    expect(resolveAmountRoute(base)).not.toContain("basis");
  });

  it("drills on cash even when the account is the A/R control — the register will zero it, not the link", () => {
    // The honesty now lives in the REGISTER, not in a refused link: it zeroes a suppressed account
    // and says so on screen. A link that silently answers in the wrong basis is the thing to stop.
    const filter: AmountFilter = { ...base, basis: "cash" };
    expect(resolveAmountRoute(filter)).toContain("basis=cash");
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

  it("the bills and invoices targets carry no basis — only the register has one", () => {
    const route = resolveAmountRoute({
      target: "bills",
      vendorId: "v1",
      agingBucket: "d1_30",
      agingAsOf: "2026-10-05",
    });
    expect(route).not.toContain("basis");
  });
});
