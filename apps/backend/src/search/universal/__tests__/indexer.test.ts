import { describe, expect, it, vi } from "vitest";
import { indexEntity, indexLoadsForCompany } from "../indexer.service.js";

describe("indexEntity", () => {
  it("upserts search index rows idempotently", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await indexEntity({ query }, {
      operating_company_id: "11111111-1111-1111-1111-111111111111",
      entity_type: "load",
      entity_uuid: "22222222-2222-2222-2222-222222222222",
      display: "LD-1001",
      search_terms: "LD-1001 Acme",
      url: "/dispatch/loads/22222222-2222-2222-2222-222222222222",
      icon: "truck",
      secondary_text: "Acme Freight",
    });

    expect(query).toHaveBeenCalledOnce();
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("INSERT INTO search.universal_index");
    expect(sql).toContain("ON CONFLICT (entity_type, entity_uuid) DO UPDATE");
  });
});

describe("indexLoadsForCompany", () => {
  it("indexes each load row returned by the query", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            entity_uuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            display_text: "LD-42",
            secondary_text: "Customer A",
          },
        ],
      })
      .mockResolvedValue({ rows: [] });

    const count = await indexLoadsForCompany({ query }, "11111111-1111-1111-1111-111111111111");
    expect(count).toBe(1);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
