import { describe, expect, it, vi } from "vitest";
vi.mock("../accounting/coa-roles/resolver.service.js", () => ({ resolveRoleAccountOptional: async (_client: unknown, _company: string, role: string) => role }));
vi.mock("../observability/structured-logger.js", () => ({ logger: { warn: vi.fn() } }));
import { readCardPayableBalances } from "./card-payables.js";
import { ledgerPostingCountsSql } from "../accounting/ledger-membership.js";

describe("card payable canonical book population", () => {
  it("rejects a partial read instead of presenting a missing account as zero", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ account_id: "first", account_name: "First", balance_cents: 100 }] }).mockRejectedValueOnce(new Error("second account unavailable"));
    await expect(readCardPayableBalances({ query }, "company-a", "2026-11-12")).rejects.toThrow("second account unavailable");
  });

  it("composes canonical book membership with company and as-of bounds", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await readCardPayableBalances({ query }, "company-a", "2026-11-12");
    for (const [sql, values] of query.mock.calls) {
      expect(sql).toContain(ledgerPostingCountsSql({ p: "jep", je: "je", pb: "pb" }));
      expect(sql).toContain("pb.operating_company_id = jep.operating_company_id");
      expect(sql).toContain("je.entry_date <= $3::date");
      expect(values).toEqual(["company-a", expect.stringMatching(/^fuel_card_payable_/), "2026-11-12"]);
    }
    expect(query).toHaveBeenCalledTimes(2);
  });
});
