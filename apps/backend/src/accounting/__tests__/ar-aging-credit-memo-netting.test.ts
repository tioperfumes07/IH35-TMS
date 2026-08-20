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
  it("nets applied, non-voided credit-memo cents off amount_open_cents via a LEFT JOIN subquery", async () => {
    const result = (await getArAgingReport({ userId: USER, operating_company_id: OCI, as_of_date: "2026-08-09" })) as any;
    const invoiceSql = result?.calls?.find((s: string) => s.includes("FROM accounting.invoices"));
    expect(invoiceSql).toBeDefined();

    // amount_open_cents is a GENERATED column with no knowledge of credit_memo_applications
    // (ACCT-F5606) -- the report must subtract already-applied, non-voided credit-memo cents.
    expect(invoiceSql).toMatch(/\(i\.amount_open_cents\s*-\s*COALESCE\(cma\.applied_cents,\s*0\)\)::bigint/i);
    expect(invoiceSql).toMatch(/LEFT JOIN\s*\(\s*SELECT\s+invoice_id,\s*SUM\(applied_cents\)/i);
    expect(invoiceSql).toMatch(/FROM accounting\.credit_memo_applications/i);
    // A voided (reversed) application must not still reduce reported AR.
    expect(invoiceSql).toMatch(/credit_memo_applications[\s\S]{0,200}voided_at\s+IS\s+NULL/i);
  });
});
