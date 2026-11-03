import { describe, expect, it } from "vitest";
import { matchCandidatePayeeLabel } from "./MatchDrawer";

// D071 (register row 247): people in proper case, organisation names exactly as stored, never blank.
describe("matchCandidatePayeeLabel (D071)", () => {
  it("proper-cases a person payee", () => {
    expect(matchCandidatePayeeLabel({ counterparty_name: "ALFONSO HIDALGO CHAVEZ", counterparty_is_person: true })).toBe(
      "Alfonso Hidalgo Chavez",
    );
  });
  it("keeps an organisation name exactly as stored (no person re-casing of LLC / acronyms)", () => {
    expect(matchCandidatePayeeLabel({ counterparty_name: "XYZ TRUCKING LLC", counterparty_is_person: false })).toBe("XYZ TRUCKING LLC");
    expect(matchCandidatePayeeLabel({ counterparty_name: "Faro Capital LLC" })).toBe("Faro Capital LLC");
  });
  it("renders an em dash for a missing payee", () => {
    expect(matchCandidatePayeeLabel({ counterparty_name: "  " })).toBe("—");
    expect(matchCandidatePayeeLabel({ counterparty_name: null })).toBe("—");
  });
});
