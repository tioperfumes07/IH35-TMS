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

describe("getArAgingReport — proforma exclusion (ACCT-F223 regression)", () => {
  it("excludes draft and proforma invoices from A/R aging, and does NOT exclude 'paid' by current-state status", async () => {
    const result = (await getArAgingReport({ userId: USER, operating_company_id: OCI, as_of_date: "2026-08-09" })) as any;
    const invoiceSql = result?.calls?.find((s: string) => s.includes("FROM accounting.invoices"));
    expect(invoiceSql).toBeDefined();
    // ACCT-F5658 — 'paid' was deliberately REMOVED from this tuple: the service now reconstructs
    // paid-as-of from dated payment applications, so an invoice paid AFTER the as_of date still
    // (correctly) appears on a historical statement. The never-a-receivable statuses remain.
    expect(invoiceSql).toMatch(/i\.status\s+NOT\s+IN\s*\(\s*['"]void['"]\s*,\s*['"]voided['"]\s*,\s*['"]draft['"]\s*,\s*['"]proforma['"]\s*\)/i);
    const tuple = /i\.status NOT IN \(([^)]*)\)/.exec(invoiceSql)?.[1] ?? "";
    expect(tuple).not.toMatch(/'paid'/);
  });
});
