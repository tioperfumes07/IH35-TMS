import { describe, expect, it } from "vitest";
import view from "./BankingTransactionsDesignView.tsx?raw";
import parityTable from "../../../components/parity/ParityTable.tsx?raw";

/**
 * Guard for #3b — the Banking Transactions register must allow horizontal scroll (overflow-x: auto), NOT
 * clip wide content. Regression #3b: with the optional columns (Check No / Payee / Class / Location)
 * toggled on, a table-fixed layout exceeds its container and overflow-hidden clipped the trailing columns.
 *
 * WHERE THE CONTRACT LIVES MOVED. This file used to regex the VIEW's own markup for a wrapper div
 * immediately preceding a `table-fixed` table. That table no longer exists in the view — the register
 * migrated to the shared `ParityTable` (the view references it 10x and contains no <table> at all), so the
 * old regex could only ever return null. The invariant is unchanged and still worth guarding; it is now
 * owned by ParityTable, so this asserts it THERE and asserts the view still delegates to it.
 *
 * The old `min-w-[1150px]` assertion is deliberately NOT carried over: ParityTable sizes columns explicitly
 * (table-fixed + persisted, resizable widths), so a hardcoded min-width is not how it engages scroll. Kept
 * only the property that actually protects the user — scroll, never clip.
 * Static source-contract (?raw) so it cannot regress regardless of render-time mocking.
 */
describe("BankingTransactionsDesignView — table overflow contract (#3b)", () => {
  // The register table lives in ParityTable now: isolate ITS wrapper div + table-fixed table.
  const wrapperMatch = parityTable.match(
    /<div className="([^"]*)"\s*>\s*\n\s*<table className="([^"]*table-fixed[^"]*)"/
  );

  it("the register delegates to the shared ParityTable", () => {
    expect(view).toContain("ParityTable");
  });

  it("locates the table-fixed register table and its wrapper", () => {
    expect(wrapperMatch, "could not find the table-fixed register table wrapper in ParityTable").not.toBeNull();
  });

  it("wrapper is horizontally scrollable, not clipping (overflow-x-auto, never overflow-hidden)", () => {
    const wrapperClasses = wrapperMatch![1];
    expect(wrapperClasses).toContain("overflow-x-auto");
    expect(wrapperClasses).not.toContain("overflow-hidden");
  });

  it("the table is table-fixed so persisted column widths drive layout", () => {
    // Replaces the old min-w-[1150px] check — see the header note.
    expect(wrapperMatch![2]).toContain("table-fixed");
});
});
