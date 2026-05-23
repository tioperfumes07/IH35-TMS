import { describe, expect, it, vi } from "vitest";
import { resolveRoleAccountOptional } from "../resolver.service.js";

describe("coa-roles resolver tenant isolation", () => {
  it("queries by operating_company_id for mapped role lookup", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounting.chart_of_accounts_roles")) {
        return { rows: [{ account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] };
      }
      return { rows: [] };
    });

    const accountId = await resolveRoleAccountOptional(
      { query },
      "11111111-1111-4111-8111-111111111111",
      "ar_control"
    );

    expect(accountId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const mappedCall = query.mock.calls.find(([sql]) => String(sql).includes("FROM accounting.chart_of_accounts_roles"));
    expect(String(mappedCall?.[0] ?? "")).toContain("car.operating_company_id = $1::uuid");
    expect(mappedCall?.[1]).toEqual(["11111111-1111-4111-8111-111111111111", "ar_control"]);
  });
});
