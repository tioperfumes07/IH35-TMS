import { describe, expect, it, vi } from "vitest";
import { createDriverBillArtifacts, type BookLoadInput, type BookLoadStop } from "../book-load.service.js";
import { milesTimesRateCents } from "../../driver-finance/deadhead-rule.js";

// ROUND 443.33 (Lead, measured on CC-3's fork rehearsal): booking priced a load 1 cent off the settlement — 586.39 vs 586.40
// on 5778 / 5779 — because book-load rounded the raw float product (1303.1 x 45 = 58639.4999…) instead of the ONE money rule
// the settlement uses (milesTimesRateCents: integer cents, half-up, float noise removed).

vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

function fakeClient(rate: Record<string, unknown>) {
  const inserted: unknown[][] = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (/to_regclass/.test(sql)) return { rows: [{ exists: true }] };
    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
    if (/SELECT id::text/.test(sql) && /FROM driver_finance\.driver_bills/.test(sql)) return { rows: [] };
    if (/FROM mdata\.load_stops/.test(sql)) return { rows: [{ d: "2026-09-20" }] };
    if (/FROM driver_finance\.driver_pay_rates/.test(sql)) return { rows: [rate] };
    if (/INSERT INTO driver_finance\.driver_bills/.test(sql)) { inserted.push(values); return { rows: [{ id: "bill-1" }] }; }
    if (/audit\.audit_events/.test(sql)) return { rows: [{ exists: false }] };
    // 443.110 G9 — the mint stamps the bill's truck / trailer from the load (restampDriverBillUnitAndTrailer); no-op here.
    if (/UPDATE driver_finance\.driver_bills b\s+SET unit_id/.test(sql)) return { rows: [], rowCount: 0 } as never;
    throw new Error(`unhandled: ${sql}`);
  });
  return { query, inserted };
}
const input = { requestingUserUuid: "u", requestingUserRole: "Dispatcher", operating_company_id: "co", customer_id: "c", status: "booked", charges: [], stops: [], save_mode: "book_dispatch", assigned_primary_driver_id: "d" } as unknown as BookLoadInput;
const stops = [{ stop_type: "pickup", sequence_number: 1 }, { stop_type: "delivery", sequence_number: 2 }] as BookLoadStop[];
const card45 = { basis_type: "per_mile_pay", rate_per_mile_cents: "45", flat_per_load_cents: null, miles_basis: "shortest_miles", is_test_data: false, rate_empty_per_mile_cents: null };
const TOTAL_COL = 6; // driver_bills total_amount_cents position in the INSERT values

describe("driver pay rounding — one rule (443.33)", () => {
  it("the shared rule: 1303.1 x 45 = 58640 and 1122.1 x 45 = 50495 (half-up), where the raw float rounds down", () => {
    expect(Math.round(1303.1 * 45)).toBe(58639);
    expect(milesTimesRateCents(1303.1, 45)).toBe(58640);
    expect(Math.round(1122.1 * 45)).toBe(50494);
    expect(milesTimesRateCents(1122.1, 45)).toBe(50495);
  });

  for (const [settlement, load, miles, expected] of [["5778", "13525", 1303.1, 58640], ["5779", "13526", 1122.1, 50495]] as const) {
    it(`booking ${settlement} load ${load}: ${miles} mi x 45c -> ${expected} cents, the same as the settlement`, async () => {
      const c = fakeClient(card45);
      await createDriverBillArtifacts(c, input, { id: `l-${load}`, miles_shortest: miles, miles_practical: miles + 40 }, load, stops);
      const bill = c.inserted[0]!;
      expect(bill).toContain(expected);
      expect(bill).not.toContain(expected - 1);
    });
  }

  it("a reason-carrying override prices through the same rule (0.45 $/mi x 1303.1 -> 58640)", async () => {
    const c = fakeClient(card45);
    await createDriverBillArtifacts(c, input, { id: "l-o", miles_shortest: 1303.1, driver_pay_rate_per_mile: 0.45, driver_pay_rate_override_reason: "signed settlement rate 45c" }, "o", stops);
    expect(c.inserted[0]!).toContain(58640);
  });
});
