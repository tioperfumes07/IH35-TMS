import { describe, expect, it } from "vitest";
import { isAuthorizedZeroRevenueLoad } from "../settlement-creator-zero-revenue.js";
import { authorizedZeroRevenueInvoiceSql } from "../feed-gate/feed-gate.checks.js";

describe("ROUND 443.3 b/d — the owner-authorized $0 invoice", () => {
  it("only a faro_transportation load with no customer revenue is authorized", () => {
    expect(isAuthorizedZeroRevenueLoad({ factoring: "faro_transportation", line_haul_amount_cents: 0 })).toBe(true);
    expect(isAuthorizedZeroRevenueLoad({ factoring: "faro_transportation", line_haul_amount_cents: null })).toBe(true);
    expect(isAuthorizedZeroRevenueLoad({ factoring: "faro_transportation", line_haul_amount_cents: 0, accessorials: [{ amount_cents: 0 }] })).toBe(true);
  });
  it("a direct or USMCA-factored $0 load is NOT authorized (it keeps refusing)", () => {
    expect(isAuthorizedZeroRevenueLoad({ factoring: "direct", line_haul_amount_cents: 0 })).toBe(false);
    expect(isAuthorizedZeroRevenueLoad({ factoring: "faro_usmca", line_haul_amount_cents: 0 })).toBe(false);
  });
  it("a Transportation load that carries revenue is not the $0 case", () => {
    expect(isAuthorizedZeroRevenueLoad({ factoring: "faro_transportation", line_haul_amount_cents: 150000 })).toBe(false);
    expect(isAuthorizedZeroRevenueLoad({ factoring: "faro_transportation", line_haul_amount_cents: 0, accessorials: [{ amount_cents: 7500 }] })).toBe(false);
  });
  it("the feed gate recognises only the exact shape: total 0, one line qty 1 unit 0, no journal posting", () => {
    const sql = authorizedZeroRevenueInvoiceSql("i");
    expect(sql).toMatch(/coalesce\(i\.total_cents, 0\) = 0/);
    expect(sql).toMatch(/count\(\*\) FROM accounting\.invoice_lines zl WHERE zl\.invoice_id = i\.id AND zl\.soft_deleted_at IS NULL\) = 1/);
    expect(sql).toMatch(/zl\.quantity = 1 AND coalesce\(zl\.unit_amount_cents, 0\) = 0 AND zl\.line_total_cents = 0/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM accounting\.journal_entry_postings zp/);
  });
});

import { buildCharges } from "../settlement-creator-seed-loads.js";
describe("seeder charges bookLoad accepts (ROUND 443.3, measured on a prod fork)", () => {
  const catalog = [{ id: "c-det", code: "DETENTION", display_name: "Detention" }];
  const base = { load_number: "13508", factoring: "faro_usmca" as const, line_haul_amount_cents: 150000 };
  it("line haul is the system code 'linehaul' (bookLoad refused 'LH' with additional_charge_id_required)", () => {
    expect(buildCharges(base as never, catalog)[0]).toMatchObject({ code: "linehaul", amount_cents: 150000 });
  });
  it("an accessorial carries its catalog charge id", () => {
    const c = buildCharges({ ...base, accessorials: [{ item_name: "Detention", amount_cents: 7500 }] } as never, catalog);
    expect(c[1]).toMatchObject({ code: "DETENTION", additional_charge_id: "c-det", amount_cents: 7500 });
  });
  it("an accessorial with no catalog charge refuses — never a MISC default", () => {
    expect(() => buildCharges({ ...base, accessorials: [{ item_name: "Scale ticket", amount_cents: 1200 }] } as never, catalog)).toThrow(/Scale ticket/);
  });
  it("a Transportation load books a $0 line haul and never falls back to a computed rate", () => {
    const c = buildCharges({ ...base, factoring: "faro_transportation", line_haul_amount_cents: null, line_haul_rate_cents: 45, loaded_miles: 1263.9 } as never, catalog);
    expect(c).toEqual([expect.objectContaining({ code: "linehaul", amount_cents: 0 })]);
  });
});
