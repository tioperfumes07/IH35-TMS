import { describe, expect, it, vi } from "vitest";
import { listAccountingAuditTrail } from "../service.js";

describe("accounting audit trail tenant scope", () => {
  it("filters journal entry postings by operating company id", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await listAccountingAuditTrail(
      { query },
      {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        limit: 25,
      },
    );

    const sql = String(query.mock.calls[0]?.[0] ?? "");
    const params = query.mock.calls[0]?.[1] as unknown[] | undefined;
    expect(sql).toContain("jp.operating_company_id = $1::uuid");
    expect(params?.[0]).toBe("11111111-1111-4111-8111-111111111111");
  });
});
