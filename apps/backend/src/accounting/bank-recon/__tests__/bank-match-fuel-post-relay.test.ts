// CC-2 2026-10-04 — a Relay fill posts one leg per product on its own item's account (never the whole fill as diesel);
// IFTA gallons are road diesel only; a fill with no fuel line, an unknown product, or lines that do not foot is refused.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn(async () => ({ result: "posted", journal_entry_id: "je-1" })) }));
vi.mock("../../fuel-posting/poster.service.js", () => ({ postFuelExpenseOnClient: mockPost }));

import { FuelMatchPostError, postFuelFillOnBankMatch } from "../bank-match-fuel-post.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const input = { operating_company_id: OPCO, actor_user_uuid: "actor", kind: "relay_fuel" as const, fill_id: "fill-1" };

function client(
  paid: number,
  lines: Array<{ fuel_type: string; cents: number; fee_cents?: number }>,
  fees: unknown[] = [],
) {
  const calls: string[] = [];
  return {
    calls,
    c: {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        if (sql.includes("FROM integrations.relay_fuel_transactions r")) {
          return {
            rows: [
              {
                transaction_at: "2026-09-10T12:00:00Z",
                amount_cents: String(paid),
                transaction_id: "txn_4ypX8FQCRzHr5n",
                fees_json: fees,
                driver_id: "d1",
                unit_id: "u1",
                unit_number: "T169",
                location_state: "TX",
                gallons: "100",
                merchant_name: "Love's",
              },
            ],
          };
        }
        if (sql.includes("JOIN mdata.loads l ON l.id = lat.load_id")) return { rows: [{ load_id: "load-1", load_number: "13558" }] };
        if (sql.includes("FROM integrations.relay_fuel_transaction_lines l") && sql.includes("AS fuel_type")) {
          return {
            rows: lines.map((l) => ({
              fuel_type: l.fuel_type,
              cents: String(l.cents),
              fee_cents: String(l.fee_cents ?? 0),
            })),
          };
        }
        return { rows: [] };
      }),
    } as never,
  };
}

describe("Relay fill posting — one leg per product", () => {
  beforeEach(() => mockPost.mockClear());

  it("posts diesel, DEF and reefer as three cost lines that foot to the wallet credit (used to be one diesel leg)", async () => {
    const { c } = client(60000, [{ fuel_type: "diesel", cents: 50000 }, { fuel_type: "def", cents: 3000 }, { fuel_type: "reefer", cents: 7000 }]);
    await postFuelFillOnBankMatch(c, input);
    const arg = mockPost.mock.calls[0]![1] as {
      fuel_kind: string;
      cost_lines: unknown;
      amount_cents: number;
      fee_amount_cents: number | null;
      company_direct_credit: string;
    };
    expect(arg.amount_cents).toBe(60000);
    expect(arg.fee_amount_cents).toBeNull();
    expect(arg.fuel_kind).toBe("diesel");
    expect(arg.company_direct_credit).toBe("relay_fuel_wallet");
    expect(arg.cost_lines).toEqual([
      { fuel_kind: "diesel", amount_cents: 50000 },
      { fuel_kind: "def", amount_cents: 3000 },
      { fuel_kind: "reefer", amount_cents: 7000 },
    ]);
  });

  it("RELAY-F442 — sender_fee is its own fee_amount_cents; wallet amount = paid + fee", async () => {
    // txn_4ypX8FQCRzHr5n: DEF 69.41 + reefer 524.92 = 594.33 paid; fees[] sender_fee $2.00 → wallet 596.33
    const { c } = client(
      59433,
      [
        { fuel_type: "def", cents: 6941, fee_cents: 200 },
        { fuel_type: "reefer", cents: 52492, fee_cents: 0 },
      ],
      [{ type: "sender_fee", amount: "2.00" }],
    );
    await postFuelFillOnBankMatch(c, input);
    const arg = mockPost.mock.calls[0]![1] as {
      amount_cents: number;
      fee_amount_cents: number | null;
      cost_lines: Array<{ fuel_kind: string; amount_cents: number }>;
    };
    expect(arg.fee_amount_cents).toBe(200);
    expect(arg.amount_cents).toBe(59633);
    expect(arg.cost_lines.reduce((t, l) => t + l.amount_cents, 0)).toBe(59433);
  });

  it("IFTA gallons are road diesel only (reefer and DEF are not motor fuel)", async () => {
    const { c, calls } = client(5000, [{ fuel_type: "diesel", cents: 5000 }]);
    await postFuelFillOnBankMatch(c, input);
    const rowSql = calls.find((s) => s.includes("FROM integrations.relay_fuel_transactions r"))!;
    // ROUND 391.2 — the product comes from the one classifier (relay-product-kind.ts), still diesel only.
    expect(rowSql).toMatch(/END\) = 'diesel'\) AS gallons/);
    expect(rowSql).toMatch(/fuel_product_code/);
    expect(rowSql).not.toMatch(/IN \('diesel', 'reefer', 'def'\)/);
  });

  it("refuses by name: no fuel line (a scale ticket), an unknown product, lines that do not foot — never posts", async () => {
    for (const [paid, lines, code] of [
      [1475, [], "relay_fill_has_no_fuel_lines"],
      [1475, [{ fuel_type: "scales", cents: 1475 }], "relay_fill_unknown_product"],
      [60000, [{ fuel_type: "diesel", cents: 50000 }], "relay_fill_lines_do_not_foot"],
    ] as const) {
      const { c } = client(paid, [...lines]);
      await expect(postFuelFillOnBankMatch(c, input)).rejects.toMatchObject({ code });
      await expect(postFuelFillOnBankMatch(c, input)).rejects.toBeInstanceOf(FuelMatchPostError);
    }
    expect(mockPost).not.toHaveBeenCalled();
  });
});
