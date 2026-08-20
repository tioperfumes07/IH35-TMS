import { describe, expect, it, vi } from "vitest";
import { getArAgingReport } from "../ar-aging.service.js";

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: vi.fn(async (_userId: string, fn: (client: any) => Promise<any>) => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string, _values?: unknown[]) => {
        calls.push(sql);
        return { rows: [] };
      }),
      calls,
    };
    const result = await fn(client);
    return Object.assign(result ?? null, { calls });
  }),
}));

const OCI = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const USER = "22222222-2222-2222-2222-222222222222";

describe("getArAgingReport — credit-memo netting (ACCT-F5612 regression)", () => {
  it("nets applied, non-voided, as-of-dated credit-memo cents off the reconstructed open balance", async () => {
    const result = (await getArAgingReport({ userId: USER, operating_company_id: OCI, as_of_date: "2026-08-09" })) as any;
    const invoiceSql = result?.calls?.find((s: string) => s.includes("FROM accounting.invoices"));
    expect(invoiceSql).toBeDefined();

    // ACCT-F5658 — the netting moved from a LEFT JOIN prejoin off the live generated column into an
    // as-of-dated correlated subquery inside the GREATEST(total − payments − credit-memos, 0)
    // reconstruction. The ACCT-F5612 requirement (applied, non-voided credit-memo cents reduce the
    // reported balance) is unchanged; these assertions target its current, dated form.
    expect(invoiceSql).toMatch(/-\s*COALESCE\(\(\s*SELECT SUM\(cma\.applied_cents\)/i);
    expect(invoiceSql).toMatch(/FROM accounting\.credit_memo_applications cma/i);
    // A voided (reversed) application must not still reduce reported AR.
    expect(invoiceSql).toMatch(/cma\.voided_at\s+IS\s+NULL/i);
    // A credit memo applied AFTER the statement date must not reduce a historical statement.
    expect(invoiceSql).toMatch(/cma\.applied_at AT TIME ZONE 'UTC'\)::date <= \$2::date/i);
  });
});
