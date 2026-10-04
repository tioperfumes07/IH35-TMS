import { describe, expect, it, vi } from "vitest";
import { postFuelExpenseFromEvent } from "../poster.service.js";

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

vi.mock("../../../auth/db.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, withLuciaBypass: mockWithLuciaBypass };
});

// The poster resolves its cost account through the fuel-type ITEM (fuel-item-account.ts, CC-2 2026-10-04); the hoisted
// mock keeps its name and is called as resolveFuelItem(client, operating_company_id, fuel_type).
vi.mock("../fuel-item-account.js", async (orig) => {
  const actual = await orig<typeof import("../fuel-item-account.js")>();
  return {
    ...actual,
    resolveFuelItem: async (client: unknown, oc: string, fuelType: string | null) => {
      const r = await mockResolveAccountForCategory(client, oc, fuelType);
      return { itemId: "item-fuel", expenseAccountId: r.account_id, itemName: `item:${fuelType}` };
    },
  };
});

describe("fuel-posting poster.service company-direct path", () => {
  it("posts Dr fuel expense / Cr the operating bank (operating_bank role, ROUND 377)", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({
      account_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      posting_side: "debit",
    });

    let postingLineIdx = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM accounting.posting_batches")) return { rows: [] };
      if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
      // ROUND 377: cash fuel credits the bound operating_bank role (accounting.chart_of_accounts_roles), never a guess.
      if (sql.includes("FROM accounting.chart_of_accounts_roles")) return { rows: [{ account_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }] };
      if (sql.includes("role_key = $1")) return { rows: [{ account_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }] };
      if (sql.includes("INSERT INTO accounting.posting_batches")) return { rows: [{ id: "batch-2" }] };
      if (sql.includes("INSERT INTO accounting.journal_entries")) return { rows: [{ id: "je-2" }] };
      if (sql.includes("INSERT INTO accounting.journal_entry_postings")) {
        postingLineIdx += 1;
        return { rows: [{ id: `jep-cd-${postingLineIdx}` }] };
      }
      return { rows: [] };
    });

    const result = await postFuelExpenseFromEvent({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      actor_user_id: "22222222-2222-4222-8222-222222222222",
      fuel_event_id: "evt-fuel-456",
      fuel_kind: "def",
      posted_at: "2026-05-23T12:00:00.000Z",
      amount_cents: 1899,
      posting_path: "company_direct",
      company_direct_credit: "cash",
      ifta_state: "OK",
      ifta_gallons: 12.5,
    });

    expect(result.result).toBe("posted");
    expect(mockResolveAccountForCategory).toHaveBeenCalledWith(
      expect.anything(),
      "11111111-1111-4111-8111-111111111111",
      "def"
    );

    const postingLineCalls = mockQuery.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO accounting.journal_entry_postings")
    );
    expect(postingLineCalls).toHaveLength(2);
    expect(postingLineCalls[0]?.[1]).toEqual(
      expect.arrayContaining(["cccccccc-cccc-4ccc-8ccc-cccccccccccc", "debit", 1899])
    );
    expect(postingLineCalls[1]?.[1]).toEqual(
      expect.arrayContaining(["dddddddd-dddd-4ddd-8ddd-dddddddddddd", "credit", 1899])
    );
  });

  it("FAILS CLOSED when the operating_bank role is not bound — never a guessed cash-like account, never 1090 (ROUND 377)", async () => {
    mockQuery.mockReset();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", posting_side: "debit" });
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM accounting.posting_batches")) return { rows: [] };
      if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
      return { rows: [] };
    });
    await expect(
      postFuelExpenseFromEvent({
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        actor_user_id: "22222222-2222-4222-8222-222222222222",
        fuel_event_id: "evt-fuel-789",
        fuel_kind: "def",
        posted_at: "2026-05-23T12:00:00.000Z",
        amount_cents: 1899,
        posting_path: "company_direct",
        company_direct_credit: "cash",
        ifta_state: "OK",
        ifta_gallons: 12.5,
      })
    ).rejects.toThrow(/operating_bank/);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO accounting.journal_entry_postings"))).toBe(false);
  });

  it("itemised purchase: one debit leg per product on its own item's account, one credit for the total (CC-2 2026-10-04)", async () => {
    mockQuery.mockReset();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockImplementation(async (_c: unknown, _oc: string, fuelType: string | null) => ({
      account_id: fuelType === "def" ? "acct-5010" : fuelType === "reefer_diesel" ? "acct-5015" : "acct-5000",
      posting_side: "debit",
    }));
    let n = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM accounting.posting_batches")) return { rows: [] };
      if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
      if (sql.includes("FROM accounting.chart_of_accounts_roles")) return { rows: [{ account_id: "acct-1295" }] };
      if (sql.includes("role_key = $1")) return { rows: [{ account_id: "acct-1295" }] };
      if (sql.includes("INSERT INTO accounting.posting_batches")) return { rows: [{ id: "batch-m" }] };
      if (sql.includes("INSERT INTO accounting.journal_entries")) return { rows: [{ id: "je-m" }] };
      if (sql.includes("INSERT INTO accounting.journal_entry_postings")) { n += 1; return { rows: [{ id: `jep-m-${n}` }] }; }
      return { rows: [] };
    });
    const result = await postFuelExpenseFromEvent({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      actor_user_id: "22222222-2222-4222-8222-222222222222",
      fuel_event_id: "relay-fill-1",
      fuel_kind: "diesel",
      posted_at: "2026-09-10T12:00:00.000Z",
      amount_cents: 60000,
      posting_path: "company_direct",
      company_direct_credit: "cash",
      cost_lines: [
        { fuel_kind: "diesel", amount_cents: 50000 },
        { fuel_kind: "def", amount_cents: 3000 },
        { fuel_kind: "reefer", amount_cents: 7000 },
      ],
    } as never);
    expect(result.result).toBe("posted");
    const legs = mockQuery.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO accounting.journal_entry_postings")).map(([, v]) => v as unknown[]);
    expect(legs).toHaveLength(4);
    expect(legs[0]).toEqual(expect.arrayContaining(["acct-5000", "debit", 50000]));
    expect(legs[1]).toEqual(expect.arrayContaining(["acct-5010", "debit", 3000]));
    expect(legs[2]).toEqual(expect.arrayContaining(["acct-5015", "debit", 7000]));
    expect(legs[3]).toEqual(expect.arrayContaining(["credit", 60000]));
  });

  it("itemised purchase whose lines do not foot to the total is refused — never a plug", async () => {
    mockQuery.mockReset();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: "acct-5000", posting_side: "debit" });
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM accounting.posting_batches")) return { rows: [] };
      if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
      return { rows: [] };
    });
    await expect(postFuelExpenseFromEvent({
      operating_company_id: "11111111-1111-4111-8111-111111111111", actor_user_id: "22222222-2222-4222-8222-222222222222",
      fuel_event_id: "relay-fill-2", fuel_kind: "diesel", posted_at: "2026-09-10T12:00:00.000Z", amount_cents: 60000,
      posting_path: "company_direct", company_direct_credit: "cash", cost_lines: [{ fuel_kind: "diesel", amount_cents: 50000 }],
    } as never)).rejects.toThrow(/fuel_posting_cost_lines_do_not_foot/);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO accounting.journal_entry_postings"))).toBe(false);
  });
});
