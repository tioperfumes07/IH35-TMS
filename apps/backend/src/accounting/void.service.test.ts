import { describe, it, expect } from "vitest";
import {
  canVoid,
  canDelete,
  resolveReversalDate,
  isClosedPeriodReversal,
  flipPostingsForReversal,
  assertBalanced,
} from "./void.service.js";

describe("VOID-EVERYWHERE — permissions (locked: VOID = Owner + Accountant only)", () => {
  it("VOID allows Owner and Accountant only", () => {
    expect(canVoid("Owner")).toBe(true);
    expect(canVoid("Accountant")).toBe(true);
    // Administrator is explicitly EXCLUDED from void.
    expect(canVoid("Administrator")).toBe(false);
    expect(canVoid("Manager")).toBe(false);
    expect(canVoid("Bookkeeper")).toBe(false);
    expect(canVoid(null)).toBe(false);
    expect(canVoid(undefined)).toBe(false);
  });

  it("DELETE allows Owner only", () => {
    expect(canDelete("Owner")).toBe(true);
    expect(canDelete("Accountant")).toBe(false);
    expect(canDelete("Administrator")).toBe(false);
  });
});

describe("VOID-EVERYWHERE — reversal-date rule (QuickBooks-grounded, the logic GUARD verifies)", () => {
  it("OPEN period (nothing closed): reverse at the original date", () => {
    expect(resolveReversalDate("2026-06-10", null, "2026-06-14")).toBe("2026-06-10");
  });

  it("OPEN period (original after the closed cutoff): reverse at the original date", () => {
    // Periods closed through 2026-05-31; original is in June (open) -> reverse at original date.
    expect(resolveReversalDate("2026-06-10", "2026-05-31", "2026-06-14")).toBe("2026-06-10");
  });

  it("CLOSED period (original on/before the cutoff): reverse in the CURRENT open period", () => {
    // Periods closed through 2026-05-31; original is in May (closed) -> reverse at current date.
    expect(resolveReversalDate("2026-05-15", "2026-05-31", "2026-06-14")).toBe("2026-06-14");
    // Boundary: original exactly on the cutoff is still closed.
    expect(resolveReversalDate("2026-05-31", "2026-05-31", "2026-06-14")).toBe("2026-06-14");
  });

  it("flags closed-period reversals (reversal date differs from original)", () => {
    expect(isClosedPeriodReversal("2026-05-15", "2026-06-14")).toBe(true);
    expect(isClosedPeriodReversal("2026-06-10", "2026-06-10")).toBe(false);
  });
});

describe("VOID-EVERYWHERE — reversing postings (equal & opposite, net zero)", () => {
  const original = [
    { account_id: "a1", class_id: null, entity_uuid: null, debit_or_credit: "debit" as const, amount_cents: 10000, description: "AR", line_sequence: 1 },
    { account_id: "a2", class_id: "c1", entity_uuid: "e1", debit_or_credit: "credit" as const, amount_cents: 10000, description: "Revenue", line_sequence: 2 },
  ];

  it("flips every line to the opposite side, preserving account/class/entity/amount", () => {
    const reversed = flipPostingsForReversal(original);
    expect(reversed[0]).toMatchObject({ account_id: "a1", debit_or_credit: "credit", amount_cents: 10000 });
    expect(reversed[1]).toMatchObject({ account_id: "a2", class_id: "c1", entity_uuid: "e1", debit_or_credit: "debit", amount_cents: 10000 });
    expect(reversed[0].description).toContain("Void reversal");
  });

  it("a balanced original yields a balanced reversal (net GL effect zero)", () => {
    const reversed = flipPostingsForReversal(original);
    expect(() => assertBalanced(reversed)).not.toThrow();
    const debits = reversed.filter((r) => r.debit_or_credit === "debit").reduce((s, r) => s + r.amount_cents, 0);
    const credits = reversed.filter((r) => r.debit_or_credit === "credit").reduce((s, r) => s + r.amount_cents, 0);
    expect(debits).toBe(credits);
  });

  it("assertBalanced throws on an unbalanced set", () => {
    expect(() =>
      assertBalanced([
        { debit_or_credit: "debit", amount_cents: 100 },
        { debit_or_credit: "credit", amount_cents: 90 },
      ])
    ).toThrow("void_reversal_not_balanced");
  });

  it("assertBalanced throws when a side is missing", () => {
    expect(() => assertBalanced([{ debit_or_credit: "debit", amount_cents: 100 }])).toThrow(
      "void_reversal_requires_debit_and_credit"
    );
  });
});
