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

// Partial-mock so other exports (luciaPool, etc.) stay real for the module graph — auth/lucia.ts
// constructs its adapter from luciaPool at import time, so a bare replacement mock breaks the whole
// import chain (same fix shape as posting-kill-switch-gated.test.ts / posting-engine-driver-advance.test.ts).
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

describe("fuel-posting poster.service driver-advance path", () => {
  // ROUND 365.1 — this path used to credit ANY liability matching a NAME ('%fuel%advance%' …) or, failing that, ANY
  // current liability by `updated_at DESC`. No role names its account and the owner has not designated one, so it
  // FAILS CLOSED and writes nothing — even when a liability with a matching name exists.
  it("refuses — never resolves its credit account by name or latest update — and posts nothing", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({
      account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      posting_side: "debit",
    });
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM accounting.posting_batches")) return { rows: [] };
      if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
      // A liability that the old name guess WOULD have picked.
      if (sql.includes("FROM catalogs.accounts") && sql.includes("account_type = 'Liability'")) {
        return { rows: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] };
      }
      return { rows: [] };
    });

    await expect(
      postFuelExpenseFromEvent({
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        actor_user_id: "22222222-2222-4222-8222-222222222222",
        fuel_event_id: "evt-fuel-123",
        fuel_kind: "diesel",
        posted_at: "2026-05-23T10:15:00.000Z",
        amount_cents: 42567,
        posting_path: "driver_advance",
        driver_id: "33333333-3333-4333-8333-333333333333",
        ifta_state: "TX",
        ifta_gallons: 78.4,
      })
    ).rejects.toThrow(/driver_advance path has no designated credit account/);

    const sqls = mockQuery.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((q) => q.includes("account_name ILIKE"))).toBe(false);
    expect(sqls.some((q) => q.includes("INSERT INTO accounting.journal_entry_postings"))).toBe(false);
    expect(sqls.some((q) => q.includes("INSERT INTO accounting.journal_entries"))).toBe(false);
  });
});
