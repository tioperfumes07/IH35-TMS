import { describe, expect, it } from "vitest";
import { closeSettlementHref, lastDeliveredLoadId } from "./closeSettlementHref";

describe("closeSettlementHref", () => {
  it("opens the one settlement-close wizard for that driver and tour", () => {
    expect(closeSettlementHref("driver-1", "settlement-9")).toBe(
      "/driver-finance/settlement-close?driver_id=driver-1&settlement_id=settlement-9",
    );
  });

  it("omits an empty settlement id and trims the driver id", () => {
    expect(closeSettlementHref("  driver-2  ", "  ")).toBe(
      "/driver-finance/settlement-close?driver_id=driver-2",
    );
  });
});

describe("lastDeliveredLoadId", () => {
  it("returns the last delivered leg in tour order and skips a later in-transit leg", () => {
    expect(
      lastDeliveredLoadId([
        { load_id: "nb", status: "delivered" },
        { load_id: "tr", status: "in_transit" },
        { load_id: "sb", status: "booked" },
      ]),
    ).toBe("nb");
  });

  it("uses the later delivered leg when several have delivered", () => {
    expect(
      lastDeliveredLoadId([
        { load_id: "nb", status: "invoiced" },
        { load_id: "sb", is_delivered: true, status: "delivered" },
      ]),
    ).toBe("sb");
  });

  it("skips a cancelled delivered leg", () => {
    expect(
      lastDeliveredLoadId([
        { load_id: "nb", status: "delivered" },
        { load_id: "voided", status: "delivered", is_cancelled: true },
      ]),
    ).toBe("nb");
  });

  it("returns null when nothing has delivered", () => {
    expect(lastDeliveredLoadId([{ load_id: "nb", status: "booked" }])).toBeNull();
  });
});
