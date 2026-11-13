import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "src/pages");

describe("ROUND 8.20 hub Backs honor ?ret=", () => {
  it("Load History board resolves Back via resolveBackHref", () => {
    const source = readFileSync(join(root, "dispatch/LoadHistoryBoardPage.tsx"), "utf8");
    expect(source).toMatch(/resolveBackHref/);
    expect(source).toMatch(/loadHistoryBackHref/);
    expect(source).not.toMatch(/backHref="\/dispatch"/);
  });

  it("Dispatch Planners layout resolves Back via resolveBackHref", () => {
    const source = readFileSync(join(root, "dispatch/planners/DispatchPlannersLayout.tsx"), "utf8");
    expect(source).toMatch(/resolveBackHref/);
    expect(source).toMatch(/plannerBackHref/);
    expect(source).not.toMatch(/PageHeader backHref="\/dispatch"/);
  });

  it("Cash Flow page resolves Back via resolveBackHref", () => {
    const source = readFileSync(join(root, "cash-flow/CashFlowPage.tsx"), "utf8");
    expect(source).toMatch(/resolveBackHref/);
    expect(source).toMatch(/cashFlowBackHref/);
    expect(source).not.toMatch(/backHref="\/cash-flow"/);
  });
});
