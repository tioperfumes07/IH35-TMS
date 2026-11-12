import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), active: vi.fn(), postings: vi.fn(), book: vi.fn() }));
vi.mock("../home/factoring-balance-invoice-linkage.service.js", () => ({ resolveCanonicalActiveFactor: mocks.identity }));
vi.mock("./factoring-kpi.service.js", () => ({
  activeFactorId: mocks.active, factoringReservePostings: mocks.postings, factoringBookReserveCents: mocks.book,
}));
import { getReserveBalanceHistory, forecastReserveReleases } from "./reserve.service.js";
const client = { query: vi.fn(async () => ({ rows: [] })) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.active.mockResolvedValue("profile");
  mocks.identity.mockResolvedValue({ ok: true, vendorId: "vendor", factorProfileId: "profile" });
  mocks.postings.mockResolvedValue([{ id: "posting", entry_date: "2026-11-01", signed_cents: 1500, pool: "escrow", memo: "Fixture" }]);
  mocks.book.mockResolvedValue({ total: 1500 });
});
describe("reserve read identity is scoped to the canonical factor binding", () => {
  it("keeps the established profile request and does not resolve a vendor unnecessarily", async () => {
    expect((await getReserveBalanceHistory("company", "profile", undefined, undefined, { client })).total).toBe(1);
    expect(mocks.identity).not.toHaveBeenCalled();
  });
  it("does not invent a factor when no active profile exists", async () => {
    mocks.active.mockResolvedValue(null);
    expect((await getReserveBalanceHistory("company", "vendor", undefined, undefined, { client })).total).toBe(0);
    expect(mocks.identity).not.toHaveBeenCalled();
    expect(mocks.postings).not.toHaveBeenCalled();
  });
  it("propagates binding lookup failures instead of reporting false empty history", async () => {
    mocks.identity.mockRejectedValueOnce(new Error("binding lookup failed"));
    await expect(getReserveBalanceHistory("company", "vendor", undefined, undefined, { client }))
      .rejects.toThrow("binding lookup failed");
    expect(mocks.postings).not.toHaveBeenCalled();
  });
  it("vendor and profile identities read the same actual postings, not false empty history", async () => {
    const profile = await getReserveBalanceHistory("company", "profile", undefined, undefined, { client });
    const vendor = await getReserveBalanceHistory("company", "vendor", undefined, undefined, { client });
    expect(vendor.total).toBe(1);
    expect(vendor.movements.map(r => [r.id, r.signed_amount_cents, r.running_balance_cents]))
      .toEqual(profile.movements.map(r => [r.id, r.signed_amount_cents, r.running_balance_cents]));
    expect(mocks.identity).toHaveBeenCalledWith(client, "company");
  });
  it("vendor forecast reads the same canonical book balance", async () => {
    expect((await forecastReserveReleases("company", "vendor", 30, { client })).starting_balance_cents).toBe(1500);
  });
  it("does not accept unrelated vendors, failed bindings or mismatched profiles", async () => {
    for (const identity of [
      { ok: true, vendorId: "another-vendor", factorProfileId: "profile" },
      { ok: false, vendorId: "vendor", factorProfileId: "profile" },
      { ok: true, vendorId: "vendor", factorProfileId: "other-profile" },
    ]) {
      mocks.identity.mockResolvedValue(identity);
      expect((await getReserveBalanceHistory("company", "vendor", undefined, undefined, { client })).total).toBe(0);
      expect((await forecastReserveReleases("company", "vendor", 30, { client })).starting_balance_cents).toBe(0);
    }
    expect(mocks.postings).not.toHaveBeenCalled();
    expect(mocks.book).not.toHaveBeenCalled();
  });
});
