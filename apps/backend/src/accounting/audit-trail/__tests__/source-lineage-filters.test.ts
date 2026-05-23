import { describe, expect, it, vi } from "vitest";
import { listAccountingSourceLineage } from "../service.js";

describe("accounting source lineage filters", () => {
  it("requires source transaction type and id in SQL filters", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await listAccountingSourceLineage(
      { query },
      {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        source_transaction_type: "invoice",
        source_transaction_id: "inv_1001",
        limit: 100,
      },
    );

    const sql = String(query.mock.calls[0]?.[0] ?? "");
    const params = query.mock.calls[0]?.[1] as unknown[] | undefined;
    expect(sql).toContain("jp.source_transaction_type = $2::text");
    expect(sql).toContain("jp.source_transaction_id = $3::text");
    expect(sql).toContain("jp.operating_company_id = $1::uuid");
    expect(params?.slice(0, 3)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "invoice",
      "inv_1001",
    ]);
  });
});
