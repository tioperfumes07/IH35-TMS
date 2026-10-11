import { describe, expect, it } from "vitest";
import { flipPostingsForReversal } from "../void.service.js";

// ACCT-F2026100686: a reversal leg kept entity_uuid but dropped entity_type, and
// journal_entry_postings_entity_pair_check refused it — no posting with an entity could be voided.
describe("flipPostingsForReversal", () => {
  it("carries entity_type with entity_uuid", () => {
    const [leg] = flipPostingsForReversal([
      { id: "l1", account_id: "a1", class_id: null, entity_uuid: "v1", entity_type: "vendor", debit_or_credit: "debit", amount_cents: 59385, description: "fuel", line_sequence: 1 } as never,
    ]);
    expect(leg).toMatchObject({ entity_uuid: "v1", entity_type: "vendor", debit_or_credit: "credit", amount_cents: 59385 });
  });
  it("keeps both null when the original has no entity", () => {
    const [leg] = flipPostingsForReversal([
      { id: "l1", account_id: "a1", class_id: null, entity_uuid: null, debit_or_credit: "credit", amount_cents: 1, description: null, line_sequence: 1 } as never,
    ]);
    expect(leg).toMatchObject({ entity_uuid: null, entity_type: null });
  });
});
