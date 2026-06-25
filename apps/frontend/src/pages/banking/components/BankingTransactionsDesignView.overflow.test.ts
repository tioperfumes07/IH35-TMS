import { describe, expect, it } from "vitest";
import source from "./BankingTransactionsDesignView.tsx?raw";

/**
 * Guard for #3b — the Banking Transactions register table wrapper must allow horizontal
 * scroll (overflow-x: auto), NOT clip wide content (overflow-hidden). Regression #3b: with
 * optional columns (Check No / Payee / Class / Location) toggled on, the table-fixed layout
 * exceeds the container and overflow-hidden clipped the trailing columns. The fix mirrors the
 * already-correct sibling RegisterTable.tsx (overflow-x-auto wrapper + min-w-[1150px] table).
 * Static source-contract (?raw) so it can't regress regardless of render-time mocking.
 */
describe("BankingTransactionsDesignView — table overflow contract (#3b)", () => {
  // isolate the wrapper div immediately preceding the main <table ... table-fixed ...>
  const wrapperMatch = source.match(
    /<div className="([^"]*)"\s*>\s*\n\s*<table className="([^"]*table-fixed[^"]*)"/
  );

  it("locates the table-fixed register table and its wrapper", () => {
    expect(wrapperMatch, "could not find the table-fixed register table wrapper").not.toBeNull();
  });

  it("wrapper is horizontally scrollable, not clipping (overflow-x-auto, never overflow-hidden)", () => {
    const wrapperClasses = wrapperMatch![1];
    expect(wrapperClasses).toContain("overflow-x-auto");
    expect(wrapperClasses).not.toContain("overflow-hidden");
  });

  it("table carries a min width so scroll engages instead of compressing columns", () => {
    const tableClasses = wrapperMatch![2];
    expect(tableClasses).toMatch(/min-w-\[\d+px\]/);
  });
});
