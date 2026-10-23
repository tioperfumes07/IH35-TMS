import { describe, expect, it } from "vitest";
import { plannerBarLane, plannerBarMoneyDetail } from "./planner-bars";

describe("443.280-C — Truck Planner bar text", () => {
  it("lane + $ · mi · $/mi from the load (board: $3,000 · 1,075 mi · $2.79/mi)", () => {
    expect(plannerBarLane({ first_pickup_city: "Fort Morgan", first_delivery_city: "Laredo" })).toBe("Fort Morgan → Laredo");
    expect(plannerBarMoneyDetail({ rate_total_cents: 300000, currency_code: "USD", miles_practical: 1075 })).toBe("$3,000 · 1,075 mi · $2.79/mi");
  });
  it("cents stay visible; no practical miles = no $/mi", () => {
    expect(plannerBarMoneyDetail({ rate_total_cents: 123456, currency_code: "USD", miles_practical: null })).toBe("$1,234.56 · — mi");
  });
});
