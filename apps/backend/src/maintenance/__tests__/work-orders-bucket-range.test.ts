import { describe, expect, it, vi } from "vitest";
import { listWorkOrdersByBucket } from "../work-orders.service.js";

describe("listWorkOrdersByBucket exact range", () => {
  it("counts and pages the same company/open-WO scope", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total_count: 137 }] })
      .mockResolvedValueOnce({
        rows: [
          { id: "in-1", normalized_bucket: "in_house" },
          { id: "ext-1", normalized_bucket: "external" },
          { id: "road-1", normalized_bucket: "roadside" },
        ],
      });

    const result = await listWorkOrdersByBucket(
      { query },
      "11111111-1111-4111-8111-111111111111",
      { limit: 50, offset: 100 },
    );

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("COUNT(*)::int AS total_count");
    expect(query.mock.calls[0]?.[0]).toContain("w.operating_company_id = $1::uuid");
    expect(query.mock.calls[1]?.[0]).toContain("LIMIT $2 OFFSET $3");
    expect(query.mock.calls[1]?.[1]).toEqual([
      "11111111-1111-4111-8111-111111111111",
      50,
      100,
    ]);
    expect(result).toMatchObject({ total_count: 137, limit: 50, offset: 100 });
    expect(result.in_house.map((row) => row.id)).toEqual(["in-1"]);
    expect(result.external.map((row) => row.id)).toEqual(["ext-1"]);
    expect(result.roadside.map((row) => row.id)).toEqual(["road-1"]);
  });
});
