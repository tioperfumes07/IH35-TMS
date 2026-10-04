import { describe, it, expect } from "vitest";
import {
  canVoid,
  canDelete,
  resolveReversalDate,
  isClosedPeriodReversal,
  flipPostingsForReversal,
  assertBalanced,
  reversalLineSource,
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
    { id: "line-a1", account_id: "a1", class_id: null, entity_uuid: null, debit_or_credit: "debit" as const, amount_cents: 10000, description: "AR", line_sequence: 1 },
    { id: "line-a2", account_id: "a2", class_id: "c1", entity_uuid: "e1", debit_or_credit: "credit" as const, amount_cents: 10000, description: "Revenue", line_sequence: 2 },
  ];

  it("flips every line to the opposite side, preserving account/class/entity/amount", () => {
    const reversed = flipPostingsForReversal(original);
    expect(reversed[0]).toMatchObject({ account_id: "a1", debit_or_credit: "credit", amount_cents: 10000 });
    expect(reversed[1]).toMatchObject({ account_id: "a2", class_id: "c1", entity_uuid: "e1", debit_or_credit: "debit", amount_cents: 10000 });
    expect(reversed[0].description).toContain("Void reversal");
  });

  // ROUND 86 (Lead, 2026-09-23) — "invoice 13572's stranded posting": postVoidReversal's own
  // GlPostingRow type had no `id` field at all, so the reversal could never be linked back to the
  // original at the LINE level (reversal_of_line_id / reversed_by_line_id) — only the JE-level FK
  // was ever written. flipPostingsForReversal is the one place that shape decision gets made;
  // this is the regression lock for it.
  it("carries the ORIGINAL line's own id through as original_line_id, one per flipped row (the fix for the 'stranded posting' — a reversal that can't be traced back at the LINE level)", () => {
    const reversed = flipPostingsForReversal(original);
    expect(reversed[0]?.original_line_id).toBe("line-a1");
    expect(reversed[1]?.original_line_id).toBe("line-a2");
    // Never the reversal's own (not-yet-existing) id, and never dropped/undefined.
    expect(reversed.every((r) => typeof r.original_line_id === "string" && r.original_line_id.length > 0)).toBe(true);
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

describe("VOID-EVERYWHERE PR-2 — bill void reverses AP correctly (same engine as invoices/JEs)", () => {
  // A typical posted bill: DR Expense, CR Accounts Payable.
  const billPosting = [
    { id: "line-expense", account_id: "expense", class_id: "drv1", entity_uuid: "vendor1", debit_or_credit: "debit" as const, amount_cents: 45000, description: "Fuel bill", line_sequence: 1 },
    { id: "line-ap", account_id: "accounts_payable", class_id: null, entity_uuid: "vendor1", debit_or_credit: "credit" as const, amount_cents: 45000, description: "AP", line_sequence: 2 },
  ];

  it("voiding a bill credits the expense and debits AP back out (net zero)", () => {
    const reversed = flipPostingsForReversal(billPosting);
    // Expense was debited on the bill -> reversal credits it back.
    expect(reversed[0]).toMatchObject({ account_id: "expense", debit_or_credit: "credit", amount_cents: 45000 });
    // AP was credited on the bill -> reversal debits it back (clears the payable).
    expect(reversed[1]).toMatchObject({ account_id: "accounts_payable", debit_or_credit: "debit", amount_cents: 45000 });
    // Class/vendor linkage is preserved so the reversal nets against the same dimensions.
    expect(reversed[0].class_id).toBe("drv1");
    expect(reversed[0].entity_uuid).toBe("vendor1");
    expect(() => assertBalanced(reversed)).not.toThrow();
  });
});

// AUTH-400 writer fix — a reversal leg carries ITS original's source. Planted: the live Revrec Event 2 shape (load 13539,
// invoice 317da69a): ONE entry, Cr 1150 sourced `load`, Dr 1100 sourced `invoice`, voided through the invoice.
describe("AUTH-400 — every reversal leg keeps its own original's source (two-sided, MIXED sources)", () => {
  const event2 = [
    { id: "fd4a39e1", account_id: "1150", class_id: null, entity_uuid: null, debit_or_credit: "credit" as const, amount_cents: 486000, description: "Unbilled", line_sequence: 1, source_transaction_type: "load", source_transaction_id: "load-13539" },
    { id: "06956b71", account_id: "1100", class_id: null, entity_uuid: null, debit_or_credit: "debit" as const, amount_cents: 486000, description: "A/R", line_sequence: 2, source_transaction_type: "invoice", source_transaction_id: "inv-317da69a" },
  ];

  it("reverses BOTH legs, each with its own source — the 1150 leg stays `load`, never relabelled `invoice`", () => {
    const rev = flipPostingsForReversal(event2);
    expect(rev).toHaveLength(2);
    const src = rev.map((l) => ({ line: l.original_line_id, side: l.debit_or_credit, ...reversalLineSource(l, "invoice", "inv-317da69a") }));
    expect(src).toEqual([
      { line: "fd4a39e1", side: "debit", source_transaction_type: "load", source_transaction_id: "load-13539" },
      { line: "06956b71", side: "credit", source_transaction_type: "invoice", source_transaction_id: "inv-317da69a" },
    ]);
    // Per source, original + reversal net to zero — the property the load / invoice drill-downs read.
    const all = [...event2.map((l) => ({ ...l })), ...rev.map((l) => ({ ...l, ...reversalLineSource(l, "invoice", "inv-317da69a") }))];
    for (const t of ["load", "invoice"]) {
      const net = all.filter((l) => l.source_transaction_type === t).reduce((n, l) => n + (l.debit_or_credit === "debit" ? l.amount_cents : -l.amount_cents), 0);
      expect(net).toBe(0);
    }
  });

  it("a sourceless line or a journal_entry hop takes the voided document's resolved source (reinstate rule unchanged)", () => {
    expect(reversalLineSource({ source_transaction_type: null, source_transaction_id: null }, "bill", "b1")).toEqual({ source_transaction_type: "bill", source_transaction_id: "b1" });
    expect(reversalLineSource({ source_transaction_type: "journal_entry", source_transaction_id: "je1" }, "expense", "e1")).toEqual({ source_transaction_type: "expense", source_transaction_id: "e1" });
  });

  it("refuses when neither the line nor the voided document resolves a source", () => {
    expect(() => reversalLineSource({ source_transaction_type: null, source_transaction_id: null }, null, null)).toThrow("void_reversal_line_source_unresolved");
  });
});
