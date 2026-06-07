import { describe, expect, it, vi } from "vitest";
import { universalSearch } from "../query.service.js";

describe("universalSearch", () => {
  it("returns ranked results scoped to company", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          uuid: "idx-1",
          entity_type: "load",
          entity_uuid: "load-1",
          display_text: "LD-100",
          secondary_text: "Acme",
          url_path: "/dispatch/loads/load-1",
          icon: "truck",
          rank: 0.9,
        },
      ],
    });

    const results = await universalSearch(
      { query },
      "11111111-1111-1111-1111-111111111111",
      "LD-100",
      { limit: 10 }
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.display_text).toBe("LD-100");
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("operating_company_id = $1::uuid");
    expect(sql).toContain("plainto_tsquery");
  });

  it("returns empty array for blank query", async () => {
    const query = vi.fn();
    const results = await universalSearch({ query }, "11111111-1111-1111-1111-111111111111", "   ");
    expect(results).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("filters by entity types when provided", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await universalSearch({ query }, "11111111-1111-1111-1111-111111111111", "ada", {
      entity_types: ["driver"],
    });
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("entity_type = ANY");
  });
});
