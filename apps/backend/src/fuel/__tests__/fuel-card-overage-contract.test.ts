import { describe, expect, it, vi } from "vitest";
import { resolveFuelOverageContractAuthority } from "../fuel-card-overage-contract.service.js";

describe("FUEL-03 resolveFuelOverageContractAuthority", () => {
  it("denies recovery when no signed contract row exists", async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [{ has_signed: false }] })),
    };
    const result = await resolveFuelOverageContractAuthority(client as never, {
      driverId: "driver-1",
      operatingCompanyId: "opco-1",
    });
    expect(result.hasContractAuthority).toBe(false);
    expect(result.denialReason).toMatch(/signed driver contract/i);
  });

  it("allows recovery when signed contract exists", async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [{ has_signed: true }] })),
    };
    const result = await resolveFuelOverageContractAuthority(client as never, {
      driverId: "driver-1",
      operatingCompanyId: "opco-1",
    });
    expect(result.hasContractAuthority).toBe(true);
    expect(result.denialReason).toBeNull();
  });
});
