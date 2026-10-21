import { describe, expect, it } from "vitest";
import { creatorAdditionalOnlyPay } from "../settlement-creator-pay-mode.js";
import type { SettlementCreatorDraft } from "../settlement-creator.types.js";

const draft = { settlement_no: "synthetic", loads: [{ load_number: "A", driver_pay_mode: "additional_pay_only", loaded_miles: 482.5 },
  { load_number: "B", miles_shortest: 100, line_haul_rate_cents: 45 }],
  additional_pay: [{ load_number: "A", item_id: "layover", description: "Layover", pay_kind: "layover", amount_cents: 10000 }] } as SettlementCreatorDraft;
describe("explicit per-load additional-only wages", () => {
  it("keeps the other load mileage-priced and uses only assigned itemized layover", () => {
    expect(creatorAdditionalOnlyPay(draft, draft.loads[0]!)).toMatchObject({ amount_cents: 10000, lines: [{ item_id: "layover", amount_cents: 10000 }] });
    expect(creatorAdditionalOnlyPay(draft, draft.loads[1]!)).toBeNull();
  });
  it("never infers pay mode from zero short miles", () => {
    expect(creatorAdditionalOnlyPay(draft, { load_number: "A", miles_shortest: 0 })).toBeNull();
  });
  it("refuses absent, cross-load, non-itemized and nonpositive wages", () => {
    for (const additional_pay of [[], [{ ...draft.additional_pay![0]!, load_number: "B" }], [{ ...draft.additional_pay![0]!, item_id: null }], [{ ...draft.additional_pay![0]!, amount_cents: 0 }]]) {
      expect(() => creatorAdditionalOnlyPay({ ...draft, additional_pay }, draft.loads[0]!)).toThrow(/requires positive, itemized pay/);
    }
  });
  it("refuses simultaneous mileage rates or weekly salary", () => {
    expect(() => creatorAdditionalOnlyPay(draft, { ...draft.loads[0]!, line_haul_rate_cents: 45 })).toThrow(/cannot also carry/);
    expect(() => creatorAdditionalOnlyPay({ ...draft, salaried: true }, draft.loads[0]!)).toThrow(/cannot also carry/);
  });
});
