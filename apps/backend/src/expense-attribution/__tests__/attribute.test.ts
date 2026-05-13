import { describe, expect, it, vi } from "vitest";
import { attributeExpenseToLoad } from "../attribute.service.js";

type MockClient = {
  query: ReturnType<typeof vi.fn>;
};

describe("attributeExpenseToLoad", () => {
  it("attributes high confidence to an active movement load", async () => {
    const client: MockClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            load_number: "L-1000",
            status: "in_transit",
            pickup_at: new Date("2026-05-12T10:00:00Z"),
            delivered_at: null,
          },
        ],
      }),
    };

    const result = await attributeExpenseToLoad(client as never, {
      driverId: "00000000-0000-4000-8000-000000000099",
      operatingCompanyId: "00000000-0000-4000-8000-0000000000aa",
      expenseTimestamp: new Date("2026-05-12T15:00:00Z"),
    });

    expect(result?.confidence).toBe("high");
    expect(result?.loadNumber).toBe("L-1000");
  });

  it("falls back to recent delivered load inside buffer window", async () => {
    const client: MockClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            load_number: "L-2000",
            status: "delivered",
            pickup_at: new Date("2026-05-12T08:00:00Z"),
            delivered_at: new Date("2026-05-12T14:50:00Z"),
          },
        ],
      }),
    };

    const result = await attributeExpenseToLoad(client as never, {
      driverId: "00000000-0000-4000-8000-000000000099",
      operatingCompanyId: "00000000-0000-4000-8000-0000000000aa",
      expenseTimestamp: new Date("2026-05-12T15:30:00Z"),
    });

    expect(result?.loadId).toBe("00000000-0000-4000-8000-000000000002");
    expect(result?.confidence === "high" || result?.confidence === "medium").toBe(true);
  });

  it("returns null when no candidates are returned", async () => {
    const client: MockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    const result = await attributeExpenseToLoad(client as never, {
      driverId: "00000000-0000-4000-8000-000000000099",
      operatingCompanyId: "00000000-0000-4000-8000-0000000000aa",
      expenseTimestamp: new Date("2026-05-12T15:30:00Z"),
    });

    expect(result).toBeNull();
  });
});
