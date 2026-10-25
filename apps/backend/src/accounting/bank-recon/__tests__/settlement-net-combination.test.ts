import { describe, expect, it, vi } from "vitest";

/**
 * LEAD 443.345 — a money-out line that pays ONE driver settlement's open A/P net is offered as that settlement, labeled.
 * Live case 10-24: Check Image 1052 $1,721.45 = P-0053's 3 open bills; the engine returned it only as one of 6 anonymous sums.
 */
const { settlementNetCombinations } = await import("../match.service.js");

const pool = [
  { ledger_entry_kind: "bill", ledger_entry_id: "b1", amount_cents: 80980, date_gap_days: 2, reference: "13613" },
  { ledger_entry_kind: "bill", ledger_entry_id: "b2", amount_cents: 70345, date_gap_days: 2, reference: "13614" },
  { ledger_entry_kind: "bill", ledger_entry_id: "b3", amount_cents: 20820, date_gap_days: 2, reference: "13615" },
  { ledger_entry_kind: "bill", ledger_entry_id: "x9", amount_cents: 5000, date_gap_days: 1, reference: "other" },
] as never[];

function client(rows: Array<{ settlement_id: string; display_id: string; driver: string; bill_id: string; open_cents: string }>) {
  return { query: vi.fn(async () => ({ rows })) };
}
const P0053 = [
  { settlement_id: "s53", display_id: "P-0053", driver: "Angel Sosa", bill_id: "b1", open_cents: "80980" },
  { settlement_id: "s53", display_id: "P-0053", driver: "Angel Sosa", bill_id: "b2", open_cents: "70345" },
  { settlement_id: "s53", display_id: "P-0053", driver: "Angel Sosa", bill_id: "b3", open_cents: "20820" },
];

describe("settlementNetCombinations", () => {
  it("names the settlement whose open bills equal the check", async () => {
    const out = await settlementNetCombinations(client(P0053) as never, "co", 172145, 100, pool);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: "settlement_net", exact: true, variance_cents: 0, sum_cents: 172145 });
    expect(out[0]!.label).toBe("Settlement P-0053 — Angel Sosa — net pay (3 bills)");
    expect(out[0]!.members.map((m) => m.ledger_entry_id)).toEqual(["b1", "b2", "b3"]);
  });
  it("offers nothing when one of the settlement's open bills is outside the pool (the locked 3/7-day cascade decides)", async () => {
    const rows = [...P0053, { settlement_id: "s53", display_id: "P-0053", driver: "Angel Sosa", bill_id: "b4", open_cents: "100" }];
    expect(await settlementNetCombinations(client(rows) as never, "co", 172245, 100, pool)).toEqual([]);
  });
  it("offers nothing when the open total does not equal the bank amount", async () => {
    expect(await settlementNetCombinations(client(P0053) as never, "co", 180000, 100, pool)).toEqual([]);
  });
  it("never queries when the pool has no bills", async () => {
    const c = client(P0053);
    expect(await settlementNetCombinations(c as never, "co", 172145, 100, [] as never)).toEqual([]);
    expect(c.query).not.toHaveBeenCalled();
  });
});
