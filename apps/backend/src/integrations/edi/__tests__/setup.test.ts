import { describe, expect, it, vi } from "vitest";
import { addEdiPartner, listPartners, testConnection } from "../setup.service.js";

function mockClient(rows: Record<string, unknown>[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  };
}

describe("EDI setup service (GAP-70)", () => {
  it("addEdiPartner inserts partner and returns uuid", async () => {
    const client = mockClient([{ uuid: "p1" }]);
    const uuid = await addEdiPartner(client as never, {
      operating_company_id: "co-1",
      partner_name: "CHRW",
      isa_qualifier: "ZZ",
      isa_id: "CHR",
      gs_qualifier: "ZZ",
      gs_id: "CHR",
      connection_type: "api",
      connection_config: { endpoint: "https://edi.example.com" },
    });
    expect(uuid).toBe("p1");
    expect(client.query).toHaveBeenCalled();
  });

  it("listPartners scopes by operating company", async () => {
    const client = mockClient([{ uuid: "p1", partner_name: "CHRW" }]);
    const partners = await listPartners(client as never, "co-1");
    expect(partners).toHaveLength(1);
    expect(client.query.mock.calls[0]?.[1]).toEqual(["co-1"]);
  });

  it("testConnection validates API endpoint config", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              uuid: "p1",
              operating_company_id: "co-1",
              partner_name: "CHRW",
              isa_qualifier: "ZZ",
              isa_id: "CHR",
              gs_qualifier: "ZZ",
              gs_id: "CHR",
              connection_type: "api",
              connection_config: { endpoint: "https://edi.example.com" },
              supported_transactions: ["204"],
              is_active: true,
              created_at: "2026-01-01",
            },
          ],
        }),
    };
    const result = await testConnection(client as never, "co-1", "p1");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("API endpoint");
  });
});
