import { describe, expect, it, vi } from "vitest";
import { getCurrentClocks } from "../hos-clocks.service.js";

describe("HOS clocks tenant isolation", () => {
  it("queries duty events by operating company and driver", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await getCurrentClocks(
      { query },
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      new Date("2026-05-23T12:00:00.000Z")
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, string[]];
    expect(sql).toContain("FROM hos.duty_status_events e");
    expect(sql).toContain("e.operating_company_id = $1::uuid");
    expect(sql).toContain("e.driver_id = $2::uuid");
    expect(params).toEqual(["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]);
  });
});
