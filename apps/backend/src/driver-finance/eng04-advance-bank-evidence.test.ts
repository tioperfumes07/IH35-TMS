import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs shared with the ops dry-run and its guard
import { classifyAdvanceBankEvidence } from "../../../../scripts/lib/eng04-advance-bank-evidence.mjs";
// @ts-expect-error — plain .mjs guard module
import { FIXTURE_ADVANCES, FIXTURE_LINES, EXPECTED } from "../../../../scripts/verify-eng04-advance-bank-evidence.mjs";

type Row = { display_id: string; evidence: string; candidate_line_ids: string[]; bank_match_id: string | null; action: string };

describe("ACCT-F11091 ENG-04 advance bank evidence", () => {
  it("measured 2026-11-03: the $705.97 trio is not unique; CA-0005 is", () => {
    const rows = classifyAdvanceBankEvidence(FIXTURE_ADVANCES, FIXTURE_LINES, { windowDays: 21 }) as Row[];
    const got = Object.fromEntries(rows.map((r) => [r.display_id, r.evidence]));
    expect(got).toEqual(EXPECTED);
    const r4 = rows.find((r) => r.display_id === "CA-2026-0004")!;
    expect(r4.candidate_line_ids.sort()).toEqual(["6198ea2f", "80c36ce2"]);
    expect(rows.find((r) => r.display_id === "CA-2026-0005")!.bank_match_id).toBe("762a285b");
    expect(rows.filter((r) => r.action === "PROPOSE_RECLASS").map((r) => r.display_id)).toEqual(["CA-2026-0005"]);
  });

  it("one bank line is never unique evidence for two advances", () => {
    const advs = [
      { advance_id: "a", display_id: "A", amount_cents: 100, book_date: "2026-10-11" },
      { advance_id: "b", display_id: "B", amount_cents: 100, book_date: "2026-10-11" },
    ];
    const line = { id: "x", amount_cents: -100, posted_date: "2026-10-11", transaction_date: null, voided_at: null, merged_into_bank_transaction_id: null, already_matched: false };
    const rows = classifyAdvanceBankEvidence(advs, [line]) as Row[];
    expect(rows.map((r) => r.evidence)).toEqual(["BANK_CONTESTED", "BANK_CONTESTED"]);
  });
});
