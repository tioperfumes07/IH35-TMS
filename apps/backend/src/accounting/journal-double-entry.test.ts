import { describe, expect, it } from "vitest";

/** Mirrors JE posting balance invariant enforced by DB trigger (unit-level guard). */
function journalEntryBalanced(lines: Array<{ side: "debit" | "credit"; amount_cents: number }>): boolean {
  let d = 0;
  let c = 0;
  for (const l of lines) {
    if (l.side === "debit") d += l.amount_cents;
    else c += l.amount_cents;
  }
  return d === c;
}

describe("double-entry invariant", () => {
  it("balanced postings pass", () => {
    expect(
      journalEntryBalanced([
        { side: "debit", amount_cents: 100 },
        { side: "credit", amount_cents: 40 },
        { side: "credit", amount_cents: 60 },
      ])
    ).toBe(true);
  });

  it("unbalanced postings fail", () => {
    expect(
      journalEntryBalanced([
        { side: "debit", amount_cents: 100 },
        { side: "credit", amount_cents: 50 },
      ])
    ).toBe(false);
  });
});
