import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ROUND 8.20 board30 — Customer report URL SoT + statement ret", () => {
  const board = readFileSync(resolve(__dirname, "./CustomerReportBoard.tsx"), "utf8");
  const statement = readFileSync(resolve(__dirname, "../CounterpartyStatementPage.tsx"), "utf8");

  it("Customer report hydrates view/range/customers from URL and attaches ret to statement", () => {
    expect(board).toMatch(/useSearchParams/);
    expect(board).toMatch(/searchParams\.get\("view"\)/);
    expect(board).toMatch(/searchParams\.get\("range"\)/);
    expect(board).toMatch(/withReturnContext/);
    expect(board).toMatch(/\/statement/);
  });

  it("Counterparty statement Back resolves ?ret=", () => {
    expect(statement).toMatch(/resolveBackHref/);
  });
});
