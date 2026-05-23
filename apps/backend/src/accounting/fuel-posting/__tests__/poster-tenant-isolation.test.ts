import { describe, expect, it, vi } from "vitest";
import { getFuelAdvancesOutstandingForDriver, postFuelExpenseFromEvent } from "../poster.service.js";

const { mockQuery, mockWithLuciaBypass, mockResolveAccountForCategory } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  const resolveAccount = vi.fn();
  return {
    mockQuery: query,
    mockWithLuciaBypass: withLuciaBypass,
    mockResolveAccountForCategory: resolveAccount,
  };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

vi.mock("../../expense-category-map/resolver.service.js", () => ({
  resolveAccountForCategory: mockResolveAccountForCategory,
}));

describe("fuel-posting tenant isolation", () => {
  it("pins app.operating_company_id and enforces operating_company_id filters", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({
      account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      posting_side: "debit",
    });

    let postingLineIdx = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM accounting.posting_batches")) return { rows: [] };
      if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
      if (sql.includes("role_key = $1")) return { rows: [{ account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] };
      if (sql.includes("INSERT INTO accounting.posting_batches")) return { rows: [{ id: "batch-3" }] };
      if (sql.includes("INSERT INTO accounting.journal_entries")) return { rows: [{ id: "je-3" }] };
      if (sql.includes("INSERT INTO accounting.journal_entry_postings")) {
        postingLineIdx += 1;
        return { rows: [{ id: `jep-ti-${postingLineIdx}` }] };
      }
      if (sql.includes("FROM driver_finance.driver_advances")) {
        return {
          rows: [
            {
              advance_id: "adv-1",
              liability_id: "liab-1",
              display_id: "CA-1001",
              created_at: "2026-05-20T00:00:00.000Z",
              original_amount: "200.00",
              current_balance: "80.50",
            },
          ],
        };
      }
      return { rows: [] };
    });

    await postFuelExpenseFromEvent({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      actor_user_id: "22222222-2222-4222-8222-222222222222",
      fuel_event_id: "evt-fuel-789",
      fuel_kind: "misc",
      posted_at: "2026-05-23T13:00:00.000Z",
      amount_cents: 9900,
      posting_path: "company_direct",
      company_direct_credit: "cash",
    });

    const outstanding = await getFuelAdvancesOutstandingForDriver(
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333"
    );

    expect(outstanding.total_outstanding_cents).toBe(8050);

    const setConfigCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("set_config('app.operating_company_id'")
    );
    expect(setConfigCall?.[1]).toEqual(["11111111-1111-4111-8111-111111111111"]);

    const idempotencyLookupSql = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("FROM accounting.posting_batches")
    )?.[0];
    expect(String(idempotencyLookupSql)).toContain("WHERE operating_company_id = $1::uuid");

    const outstandingSql = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("FROM driver_finance.driver_advances")
    )?.[0];
    expect(String(outstandingSql)).toContain("a.operating_company_id = $1::uuid");
    expect(String(outstandingSql)).toContain("a.driver_id = $2::uuid");
  });
});
